// bin/lib/commands/update.mjs — Update command

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { cleanupBackup, createBackup, restoreBackup } from '../backup.mjs'
import { migrateConfig } from '../config.mjs'
import {
  EXIT_FILESYSTEM,
  EXIT_GENERAL,
  EXIT_USAGE,
  MODEL_TIER_MAP,
  PKG_AGENTS_DIR,
  PKG_SKILLS_DIR,
  PKG_TEMPLATES_DIR,
  VERSION,
} from '../constants.mjs'
import { detectE2ESetup, detectTechStack, displayTechStack } from '../detect.mjs'
import { confirm, toForwardSlash } from '../files.mjs'
import { installAndReport, installRuleFile, mergeMcpConfigs } from '../install.mjs'
import { buildManifest, getModifiedFiles, readManifest, writeManifest } from '../manifest.mjs'
import {
  checkInterrupted,
  dryRun,
  emoji,
  fail,
  heading,
  info,
  isDryRun,
  ok,
  style,
  warn,
} from '../state.mjs'
import {
  applyCachedGuidance,
  applyLayerOne,
  detectCurrentTier,
  updateAgentModels,
} from '../tune-engine.mjs'
import { validateTargetDir } from '../validate.mjs'

// ---------------------------------------------------------------------------
// Command: update (#4 nonInteractive + #16 force)
// ---------------------------------------------------------------------------

/**
 * Check for modified files and confirm overwrite with user.
 * Returns false if update should be aborted.
 */
async function confirmModifiedFiles(targetDir, nonInteractive, force) {
  const existingManifest = readManifest(targetDir)
  if (!existingManifest) return true

  const modifiedFiles = getModifiedFiles(targetDir, existingManifest)
  if (modifiedFiles.length === 0) return true

  warn(`${modifiedFiles.length} file(s) have been modified since last install:`)
  for (const f of modifiedFiles) warn(`  ${f}`)

  if (isDryRun()) return true

  if (nonInteractive && !force) {
    info('Non-interactive mode: skipping modified files (use --force to overwrite).')
    return false
  }
  if (force) {
    info('--force: overwriting modified files.')
    return true
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const proceed = await confirm(rl, 'Overwrite modified files?', false)
  rl.close()
  if (!proceed) {
    info('Update cancelled. Modified files will be preserved.')
    info('Use --force to overwrite without prompting.')
  }
  return proceed
}

/**
 * Update sparq.config.json: migrate version, re-detect tech stack, remove deprecations.
 */
function updateConfig(targetDir) {
  const configPath = join(targetDir, 'sparq.config.json')
  if (!existsSync(configPath)) {
    warn('sparq.config.json not found — cannot update config')
    return
  }

  try {
    let configData = JSON.parse(readFileSync(configPath, 'utf-8'))

    if (configData.version !== VERSION) {
      configData = migrateConfig(configData)
      ok(`Config migrated to v${VERSION}`)
    }

    const techStack = detectTechStack(targetDir)
    if (techStack.framework) {
      if (!configData.project) configData.project = {}
      if (techStack.componentFileExtensions) {
        configData.project.componentFileExtensions = techStack.componentFileExtensions
      }
      if (techStack.sourceRoot) configData.project.sourceRoot = techStack.sourceRoot
      if (techStack.routeDiscoveryPattern) {
        configData.project.routeDiscoveryPattern = techStack.routeDiscoveryPattern
      }
      ok('Project settings re-detected and updated')
      displayTechStack(techStack)
    } else if (!existsSync(join(targetDir, 'package.json'))) {
      warn('No package.json found — project settings not updated')
    } else {
      info('No recognized frameworks detected')
    }

    dryRun(
      () => writeFileSync(configPath, `${JSON.stringify(configData, null, 2)}\n`, 'utf-8'),
      `write updated config to ${toForwardSlash(configPath)}`,
    )

    // Regenerate rule file with fresh detection
    const e2eConfig = detectE2ESetup(targetDir)
    installRuleFile(targetDir, techStack, e2eConfig)
  } catch (err) {
    warn(`Could not update config: ${err.message}`)
  }
}

const ALL_CATEGORIES = ['agents', 'skills', 'templates', 'mcp', 'config']

function shouldUpdate(category, only, skip) {
  if (only && only.length > 0) return only.includes(category)
  if (skip && skip.length > 0) return !skip.includes(category)
  return true
}

/**
 * Validate --only and --skip arguments.
 */
function validateFilterArgs(only, skip) {
  if (only) {
    const invalid = only.filter((c) => !ALL_CATEGORIES.includes(c))
    if (invalid.length > 0) {
      fail(`Unknown update categories: ${invalid.join(', ')}. Valid: ${ALL_CATEGORIES.join(', ')}`)
      process.exit(EXIT_USAGE)
    }
  }
  if (skip) {
    const invalid = skip.filter((c) => !ALL_CATEGORIES.includes(c))
    if (invalid.length > 0) {
      fail(`Unknown skip categories: ${invalid.join(', ')}. Valid: ${ALL_CATEGORIES.join(', ')}`)
      process.exit(EXIT_USAGE)
    }
  }
  if (only && skip) {
    fail('Cannot use both --only and --skip together.')
    process.exit(EXIT_USAGE)
  }
}

/**
 * Re-apply model tier enhancements after agents are overwritten by update.
 */
function reapplyTierEnhancements(targetDir) {
  const currentTier = detectCurrentTier(targetDir)
  if (currentTier === 'premium' || !MODEL_TIER_MAP[currentTier]) return

  console.log(`\n${style.bold(`${emoji.config}Re-applying ${currentTier} tier enhancements:`)}`)
  const l1Applied = applyLayerOne(targetDir, currentTier).filter((r) => r.status === 'applied')
  if (l1Applied.length > 0) ok(`Layer 1: ${l1Applied.length} agent(s) enhanced`)

  const modelsChanged = updateAgentModels(targetDir, currentTier).filter((r) => r.changed)
  if (modelsChanged.length > 0) ok(`Model fields: ${modelsChanged.length} agent(s) updated`)

  const l2Applied = applyCachedGuidance(targetDir, currentTier).filter(
    (r) => r.status === 'applied',
  )
  if (l2Applied.length > 0) ok(`Layer 2 cache: ${l2Applied.length} agent(s) restored`)

  if (l1Applied.length === 0 && modelsChanged.length === 0 && l2Applied.length === 0) {
    info('Tier enhancements already current')
  }
}

/**
 * Run the file update steps (agents, skills, templates, mcp, config).
 */
function runUpdateSteps(targetDir, claudeDir, only, skip) {
  const categories = ALL_CATEGORIES.filter((c) => shouldUpdate(c, only, skip))
  const totalSteps = categories.length + 1
  let step = 0

  const fileResults = []

  if (shouldUpdate('agents', only, skip)) {
    console.log(`\n${style.bold(`${emoji.agents}[${++step}/${totalSteps}] Agents:`)}`)
    checkInterrupted()
    fileResults.push(
      installAndReport(PKG_AGENTS_DIR, join(claudeDir, 'agents'), 'agents', { merge: false }),
    )
  }

  if (shouldUpdate('skills', only, skip)) {
    console.log(`\n${style.bold(`${emoji.skills}[${++step}/${totalSteps}] Skills:`)}`)
    checkInterrupted()
    // Only install the matching framework's best-practices skill
    const e2e = detectE2ESetup(targetDir)
    const excludeSkills =
      e2e?.framework === 'cypress'
        ? new Set(['sparq-playwright-best-practices'])
        : new Set(['sparq-cypress-best-practices'])
    fileResults.push(
      installAndReport(PKG_SKILLS_DIR, join(claudeDir, 'skills'), 'skills', {
        merge: false,
        exclude: excludeSkills,
      }),
    )
  }

  if (shouldUpdate('templates', only, skip)) {
    console.log(`\n${style.bold(`${emoji.templates}[${++step}/${totalSteps}] Templates:`)}`)
    checkInterrupted()
    fileResults.push(
      installAndReport(PKG_TEMPLATES_DIR, join(claudeDir, 'templates'), 'templates', {
        merge: false,
      }),
    )
  }

  if (shouldUpdate('mcp', only, skip)) {
    console.log(`\n${style.bold(`${emoji.mcp}[${++step}/${totalSteps}] MCP:`)}`)
    checkInterrupted()
    mergeMcpConfigs(join(targetDir, '.mcp.json'))
  }

  if (shouldUpdate('config', only, skip)) {
    console.log(`\n${style.bold(`${emoji.config}[${++step}/${totalSteps}] Config:`)}`)
    checkInterrupted()
    updateConfig(targetDir)
  }

  // Re-apply model tier enhancements after agent overwrite
  if (shouldUpdate('agents', only, skip)) {
    reapplyTierEnhancements(targetDir)
  }

  console.log(`\n${style.bold(`${emoji.manifest}[${++step}/${totalSteps}] Manifest:`)}`)
  const existingManifest = readManifest(targetDir)
  const manifest = buildManifest(targetDir)
  // Preserve mcpServersAdded from previous manifest (needed for safe uninstall)
  if (existingManifest?.mcpServersAdded) {
    manifest.mcpServersAdded = existingManifest.mcpServersAdded
  }
  writeManifest(targetDir, manifest)
  ok(`.sparq/.manifest.json updated (${Object.keys(manifest).length} files tracked)`)

  return {
    categories,
    totalCopied: fileResults.reduce((sum, r) => sum + r.copied, 0),
    totalErrors: fileResults.reduce((sum, r) => sum + r.errors, 0),
  }
}

export async function cmdUpdate(
  targetDir,
  { nonInteractive = false, force = false, only = null, skip = null } = {},
) {
  heading(`${emoji.update}SparQ QA Assistant — Update`)

  if (!validateTargetDir(targetDir)) process.exit(EXIT_FILESYSTEM)

  const claudeDir = join(targetDir, '.claude')
  if (!existsSync(claudeDir)) {
    fail('.claude/ directory not found. Run `npx sparq-assistant init` first.')
    process.exit(EXIT_GENERAL)
  }

  validateFilterArgs(only, skip)

  const shouldProceed = await confirmModifiedFiles(targetDir, nonInteractive, force)
  if (!shouldProceed) return

  let backupCreated = false
  const backupDir = join(targetDir, '.sparq', '.backup')
  if (!isDryRun()) {
    backupCreated = createBackup(targetDir, backupDir)
  }

  try {
    const { categories, totalCopied, totalErrors } = runUpdateSteps(
      targetDir,
      claudeDir,
      only,
      skip,
    )

    if (backupCreated) cleanupBackup(backupDir)

    if (only) {
      info(`Updated categories: ${categories.join(', ')}`)
    } else if (skip && skip.length > 0) {
      info(`Skipped categories: ${skip.join(', ')}`)
    }

    heading(
      `${emoji.complete}Update complete — ${totalCopied} file(s) updated${totalErrors > 0 ? `, ${totalErrors} error(s)` : ''}`,
    )
    info('sparq.config.json preserved (project settings updated).')
    console.log()
  } catch (err) {
    fail(`Update failed: ${err.message}`)

    if (backupCreated) {
      warn('Rolling back to previous version...')
      try {
        restoreBackup(targetDir, backupDir)
        cleanupBackup(backupDir)
        info('Rollback complete. Files have been restored to their previous state.')
      } catch (restoreErr) {
        warn(`Backup restore failed. Manual restore from: ${backupDir}`)
        warn(`Error: ${restoreErr.message}`)
      }
    }

    process.exit(EXIT_GENERAL)
  }
}
