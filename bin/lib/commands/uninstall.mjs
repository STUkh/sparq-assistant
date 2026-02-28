// bin/lib/commands/uninstall.mjs — Uninstall command

import { existsSync, readdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { createInterface } from 'node:readline'
import {
  AGENT_NAMES,
  MAX_RECURSION_DEPTH,
  SPARQ_CLAUDE_BLOCK_END,
  SPARQ_CLAUDE_BLOCK_START,
  SPARQ_HEADING,
  SPARQ_RULE_FILE,
} from '../constants.mjs'
import { confirm, listDirs, listFiles, toForwardSlash } from '../files.mjs'
import { acquireLock, releaseLock } from '../lock.mjs'
import { readManifest } from '../manifest.mjs'
import { detectPlatforms, removeAgentsMd, removePlatformExtras } from '../platform.mjs'
import { dryRun, emoji, heading, info, isDryRun, ok, warn } from '../state.mjs'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Safely remove only SparQ-tracked files from the shared/ directory.
 * Uses the manifest to identify which files belong to SparQ, leaving
 * files from other tools untouched (I13 fix).
 */
function removeSharedSafely(sharedDir, targetDir) {
  const manifest = readManifest(targetDir)
  let removed = 0

  if (manifest) {
    // Remove only files tracked in the manifest under .claude/skills/sparq-shared/
    for (const relPath of Object.keys(manifest)) {
      if (!relPath.startsWith('.claude/skills/sparq-shared/')) continue
      const absPath = join(targetDir, relPath)
      if (existsSync(absPath)) {
        dryRun(() => unlinkSync(absPath), `remove ${toForwardSlash(absPath)}`)
        ok(`Removed ${relPath}`)
        removed++
      }
    }
  } else {
    // No manifest — remove all files in sparq-shared/ (intentional: this directory
    // is SparQ-owned, so all files within it are safe to remove during uninstall)
    const refsDir = join(sharedDir, 'references')
    if (existsSync(refsDir)) {
      for (const f of listFiles(refsDir)) {
        const absPath = join(refsDir, f)
        dryRun(() => unlinkSync(absPath), `remove ${toForwardSlash(absPath)}`)
        ok(`Removed shared/references/${f}`)
        removed++
      }
    }
  }

  // Clean up empty directories (bottom-up)
  cleanEmptyDirs(sharedDir)
  return removed
}

/**
 * Recursively remove empty directories starting from the deepest level.
 */
function cleanEmptyDirs(dir, _depth = 0) {
  if (_depth > MAX_RECURSION_DEPTH) return
  if (!existsSync(dir)) return
  for (const sub of listDirs(dir)) {
    cleanEmptyDirs(join(dir, sub), _depth + 1)
  }
  try {
    const entries = readdirSync(dir)
    if (entries.length === 0) {
      dryRun(() => rmSync(dir, { force: true }), `remove empty directory ${toForwardSlash(dir)}`)
    }
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// Command: uninstall
// ---------------------------------------------------------------------------

/**
 * Remove sparq agent files.
 */
function removeAgents(claudeDir) {
  let removed = 0
  const agentsDir = join(claudeDir, 'agents')
  if (!existsSync(agentsDir)) return removed

  for (const name of AGENT_NAMES) {
    const filePath = join(agentsDir, name)
    if (existsSync(filePath)) {
      try {
        dryRun(() => unlinkSync(filePath), `remove ${toForwardSlash(filePath)}`)
        ok(`Removed agents/${name}`)
        removed++
      } catch (err) {
        warn(`Failed to remove agents/${name}: ${err.message}`)
      }
    }
  }
  return removed
}

/**
 * Remove sparq skill and shared directories.
 */
function removeSkills(claudeDir, targetDir) {
  let removed = 0
  const skillsDir = join(claudeDir, 'skills')
  if (!existsSync(skillsDir)) return removed

  // Remove sparq-prefixed skill directories (safe — uniquely ours)
  for (const dir of listDirs(skillsDir).filter(
    (d) => d.startsWith('sparq-') && d !== 'sparq-shared',
  )) {
    dryRun(
      () => rmSync(join(skillsDir, dir), { recursive: true, force: true }),
      `remove directory ${toForwardSlash(join(skillsDir, dir))}`,
    )
    ok(`Removed skills/${dir}/`)
    removed++
  }

  // Safe removal of sparq-shared/ — only remove files tracked in our manifest
  const sharedDir = join(skillsDir, 'sparq-shared')
  if (existsSync(sharedDir)) {
    removed += removeSharedSafely(sharedDir, targetDir)
  }

  return removed
}

/**
 * Remove sparq template files and directories.
 */
function removeTemplates(claudeDir, targetDir) {
  let removed = 0
  const templatesDir = join(claudeDir, 'templates')
  if (!existsSync(templatesDir)) return removed

  const manifest = readManifest(targetDir)
  const filesToRemove = manifest
    ? Object.keys(manifest)
        .filter((p) => p.startsWith('.claude/templates/'))
        .map((p) => join(targetDir, p))
    : listFiles(templatesDir).map((f) => join(templatesDir, f))

  for (const absPath of filesToRemove) {
    if (!existsSync(absPath)) continue
    try {
      dryRun(() => unlinkSync(absPath), `remove ${toForwardSlash(absPath)}`)
      ok(`Removed ${toForwardSlash(relative(claudeDir, absPath))}`)
      removed++
    } catch (err) {
      warn(`Failed to remove ${toForwardSlash(absPath)}: ${err.message}`)
    }
  }

  return removed
}

/**
 * Remove SparQ rule file from .claude/rules/.
 */
function removeRuleFile(claudeDir) {
  const rulePath = join(claudeDir, 'rules', SPARQ_RULE_FILE)
  if (!existsSync(rulePath)) return 0

  try {
    dryRun(() => unlinkSync(rulePath), `remove .claude/rules/${SPARQ_RULE_FILE}`)
    ok(`Removed .claude/rules/${SPARQ_RULE_FILE}`)
    return 1
  } catch (err) {
    warn(`Could not remove rule file: ${err.message}`)
  }
  return 0
}

/**
 * Remove legacy SparQ block from CLAUDE.md (backward-compat migration).
 * New installations use .claude/rules/sparq.md instead.
 */
function removeClaudeMdBlock(targetDir) {
  const claudeMdPath = join(targetDir, 'CLAUDE.md')
  if (!existsSync(claudeMdPath)) return 0

  try {
    const content = readFileSync(claudeMdPath, 'utf-8')
    const startIdx = content.indexOf(SPARQ_CLAUDE_BLOCK_START)
    const endIdx = content.indexOf(SPARQ_CLAUDE_BLOCK_END)

    if (startIdx !== -1 && endIdx !== -1 && startIdx < endIdx) {
      const before = content.substring(0, startIdx).replace(/\n+$/, '')
      const after = content.substring(endIdx + SPARQ_CLAUDE_BLOCK_END.length).replace(/^\n+/, '')
      const newContent = `${before + (after ? `\n${after}` : '')}\n`
      dryRun(
        () => writeFileSync(claudeMdPath, newContent, 'utf-8'),
        'remove SparQ block from CLAUDE.md',
      )
      ok('Removed legacy SparQ block from CLAUDE.md')
      return 1
    }
    if (content.includes(SPARQ_HEADING)) {
      info('CLAUDE.md contains SparQ section without markers — please remove manually')
    }
  } catch (err) {
    warn(`Could not update CLAUDE.md: ${err.message}`)
  }
  return 0
}

/**
 * Remove sparq MCP entries from .mcp.json.
 * Only removes servers that SparQ actually added (tracked in manifest).
 * Pre-existing servers that were preserved during install are left untouched.
 */
function removeMcpEntries(targetDir) {
  const mcpPath = join(targetDir, '.mcp.json')
  if (!existsSync(mcpPath)) return 0

  const manifest = readManifest(targetDir)
  const serversToRemove = manifest?.mcpServersAdded

  if (!serversToRemove || serversToRemove.length === 0) {
    info('No SparQ-added MCP servers tracked in manifest — skipping MCP cleanup')
    return 0
  }

  try {
    const mcpData = JSON.parse(readFileSync(mcpPath, 'utf-8'))
    if (!mcpData.mcpServers) return 0

    let mcpRemoved = 0
    for (const name of serversToRemove) {
      if (name in mcpData.mcpServers) {
        delete mcpData.mcpServers[name]
        mcpRemoved++
      }
    }

    if (mcpRemoved > 0) {
      dryRun(
        () => writeFileSync(mcpPath, `${JSON.stringify(mcpData, null, 2)}\n`, 'utf-8'),
        `remove ${mcpRemoved} sparq MCP entries from .mcp.json`,
      )
      ok(`Removed ${mcpRemoved} MCP server(s) from .mcp.json`)
      return 1
    }
  } catch (err) {
    warn(`Could not update .mcp.json: ${err.message}`)
  }
  return 0
}

/**
 * Remove .sparq/ from .gitignore.
 */
function removeGitignoreEntry(targetDir) {
  const gitignorePath = join(targetDir, '.gitignore')
  if (!existsSync(gitignorePath)) return 0

  try {
    const content = readFileSync(gitignorePath, 'utf-8')
    const lines = content.split('\n')
    const filtered = lines.filter((line) => {
      const trimmed = line.trim()
      return (
        trimmed !== '.sparq/' && trimmed !== '.sparq' && trimmed !== '# SparQ QA Assistant output'
      )
    })

    if (filtered.length !== lines.length) {
      const cleaned = `${filtered
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim()}\n`
      dryRun(() => writeFileSync(gitignorePath, cleaned, 'utf-8'), 'remove .sparq/ from .gitignore')
      ok('Removed .sparq/ from .gitignore')
      return 1
    }
  } catch (err) {
    warn(`Could not update .gitignore: ${err.message}`)
  }
  return 0
}

/**
 * Clean up orphaned backup files.
 */
function cleanupBackupFiles(targetDir) {
  let removed = 0
  for (const bakFile of ['.mcp.json.bak', join('.claude', 'settings.local.json.bak')]) {
    const bakPath = join(targetDir, bakFile)
    if (existsSync(bakPath)) {
      try {
        dryRun(() => unlinkSync(bakPath), `remove ${bakFile}`)
        ok(`Removed ${bakFile}`)
        removed++
      } catch {
        // Non-critical
      }
    }
  }
  return removed
}

/**
 * Acquire the concurrency lock or emit an actionable error and return false.
 * Returns true when in dry-run mode (lock not needed).
 */
function tryAcquireLock(targetDir) {
  if (isDryRun()) return true
  const lockResult = acquireLock(targetDir)
  if (lockResult.acquired) return true
  const age = lockResult.ageMs ? ` (running for ${Math.round(lockResult.ageMs / 1000)}s)` : ''
  fail(`Another SparQ command is already running (PID ${lockResult.pid})${age}.`)
  info('If this is stale, run: sparq clean --type lock')
  return false
}

export async function cmdUninstall(targetDir, { force = false, nonInteractive = false } = {}) {
  heading(`${emoji.uninstall}SparQ QA Assistant — Uninstall`)

  const claudeDir = join(targetDir, '.claude')
  if (!existsSync(claudeDir) && !existsSync(join(targetDir, 'sparq.config.json'))) {
    info('No SparQ installation found in this directory.')
    return
  }

  const stateDir = join(targetDir, '.sparq', 'state')
  if (existsSync(stateDir)) {
    warn('This will delete .sparq/state/ — any in-progress workflow state will be lost.')
  }

  if (!force && !nonInteractive && !isDryRun()) {
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    const proceed = await confirm(rl, 'This will remove all SparQ files. Continue?', false)
    rl.close()
    if (!proceed) {
      info('Uninstall cancelled.')
      return
    }
  }

  if (!tryAcquireLock(targetDir)) return

  try {
    // Read manifest early — needed for selective MCP removal in both .mcp.json and platform configs
    const manifest = readManifest(targetDir)
    const mcpServersAdded = manifest?.mcpServersAdded || []
    if (!manifest) {
      warn('Manifest missing — MCP server cleanup may be incomplete. Check .mcp.json manually.')
    }

    let removed = 0
    removed += removeAgents(claudeDir)
    removed += removeSkills(claudeDir, targetDir)
    removed += removeTemplates(claudeDir, targetDir)
    removed += removeRuleFile(claudeDir)

    const configPath = join(targetDir, 'sparq.config.json')
    if (existsSync(configPath)) {
      dryRun(() => unlinkSync(configPath), `remove ${toForwardSlash(configPath)}`)
      ok('Removed sparq.config.json')
      removed++
    }

    // Legacy CLAUDE.md block migration cleanup
    removed += removeClaudeMdBlock(targetDir)
    // Platform extras cleanup — detect from directory markers (reliable even after config removal)
    removed += removePlatformExtras(targetDir, detectPlatforms(targetDir), mcpServersAdded)
    removeAgentsMd(targetDir)

    // MCP cleanup must happen before .sparq/ removal (reads manifest from .sparq/.manifest.json)
    removed += removeMcpEntries(targetDir)
    removed += removeGitignoreEntry(targetDir)
    removed += cleanupBackupFiles(targetDir)

    // Remove .sparq/ LAST — manifest lives here and is needed by earlier steps
    // Note: this also removes the lock file; releaseLock() in finally handles ENOENT gracefully
    const sparqDir = join(targetDir, '.sparq')
    if (existsSync(sparqDir)) {
      dryRun(
        () => rmSync(sparqDir, { recursive: true, force: true }),
        `remove directory ${toForwardSlash(sparqDir)}`,
      )
      ok('Removed .sparq/ directory')
      removed++
    }

    // Clean up empty directories in .claude/
    cleanEmptyDirs(claudeDir)

    heading(`${emoji.complete}Uninstall complete — ${removed} item(s) removed`)
    console.log()
  } finally {
    releaseLock(targetDir)
  }
}
