// bin/lib/commands/init.mjs — Init command

import {
  copyFileSync,
  existsSync,
  readdirSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { basename, join, relative } from 'node:path'
import { createInterface } from 'node:readline'
import { createInterface as createAsyncInterface } from 'node:readline/promises'
import { generateCiTemplate } from '../ci.mjs'
import { generateConfig } from '../config.mjs'
import {
  AGENT_NAMES,
  EXIT_FILESYSTEM,
  EXIT_GENERAL,
  PKG_AGENTS_DIR,
  PKG_SKILLS_DIR,
  PKG_TEMPLATES_DIR,
  SPARQ_OUTPUT_DIRS,
} from '../constants.mjs'
import { detectE2ESetup, detectTechStack, displayTechStack } from '../detect.mjs'
import {
  ALL_FEATURE_NAMES,
  getAgentsForFeatures,
  getMcpServersForFeatures,
  getSkillsForFeatures,
  getTemplatesForFeatures,
  resolveFeatures,
} from '../features.mjs'
import {
  checkNodeVersion,
  confirm,
  ensureDir,
  listDirs,
  listFiles,
  prompt,
  toForwardSlash,
} from '../files.mjs'
import { installHooks } from '../hooks.mjs'
import { ensureGitignore, installAndReport, installRuleFile, mergeMcpConfigs } from '../install.mjs'
import { acquireLock, releaseLock } from '../lock.mjs'
import { buildManifest, writeManifest } from '../manifest.mjs'
import { generatePermissions } from '../permissions.mjs'
import {
  detectPlatforms,
  generateAgentsMd,
  installPlatformExtras,
  removeAgentsMd,
  removePlatformExtras,
} from '../platform.mjs'
import {
  checkInterrupted,
  dryRun,
  emoji,
  fail,
  getVerbosity,
  heading,
  info,
  isDryRun,
  ok,
  style,
  warn,
} from '../state.mjs'
import {
  isValidConfluenceKey,
  isValidJiraKey,
  isValidQaseProjectCode,
  parseTestRailId,
  sanitizeProjectName,
  validateTargetDir,
} from '../validate.mjs'
import { cmdDoctor } from './doctor.mjs'

// ---------------------------------------------------------------------------
// Command: init — sub-functions (#28)
// ---------------------------------------------------------------------------

const MAX_PROMPT_ATTEMPTS = 3

/**
 * Derive feature names from gathered config answers.
 * Used when no explicit --features flag is provided.
 */
function deriveFeatures(gathered, e2eFramework) {
  const names = ['core', 'e2e', 'manual-tests']
  if (e2eFramework === 'cypress') {
    names.push('cypress-best-practices')
  } else {
    names.push('playwright-mcp', 'playwright-best-practices')
  }
  if (gathered.jiraEnabled) names.push('jira')
  if (gathered.confluenceEnabled) names.push('confluence')
  if (gathered.figmaEnabled) names.push('figma')
  if (gathered.tmsProvider === 'testrail') names.push('testrail')
  if (gathered.tmsProvider === 'qase') names.push('qase')
  if (gathered.tmsProvider === 'zephyr') names.push('zephyr')
  if (gathered.tmsProvider === 'local') names.push('tms-local')
  names.push('export')
  return resolveFeatures(names)
}

/**
 * Prompt with retry loop — re-prompts on invalid input up to maxAttempts.
 * On final failed attempt, warns and returns defaultVal.
 */
async function promptWithRetry(
  rl,
  label,
  defaultVal,
  validator,
  formatHint,
  maxAttempts = MAX_PROMPT_ATTEMPTS,
) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let raw = await prompt(rl, label, defaultVal)
    raw = raw.toUpperCase()
    if (validator(raw)) return raw
    if (attempt < maxAttempts) {
      warn(`Invalid input "${raw}". ${formatHint} (attempt ${attempt}/${maxAttempts})`)
    } else {
      warn(`Invalid input "${raw}" after ${maxAttempts} attempts. Using "${defaultVal}".`)
      return defaultVal
    }
  }
  return defaultVal
}

/**
 * Prompt for a validated key (Jira or Confluence).
 */
async function promptValidatedKey(rl, label, defaultVal, validator) {
  return promptWithRetry(
    rl,
    label,
    defaultVal,
    validator,
    'Expected format: uppercase letters, e.g., EP, PROJ.',
  )
}

async function promptTestRailConfig(rl) {
  let testRailProjectId = null
  for (let attempt = 1; attempt <= MAX_PROMPT_ATTEMPTS; attempt++) {
    const pid = await prompt(rl, 'TestRail project ID (e.g., 1 or 42)', '')
    testRailProjectId = parseTestRailId(pid)
    if (!pid || testRailProjectId !== null) break
    if (attempt < MAX_PROMPT_ATTEMPTS) {
      warn(
        `Invalid TestRail project ID "${pid}". ` +
          `Expected: a positive integer, e.g., 1, 42. (attempt ${attempt}/${MAX_PROMPT_ATTEMPTS})`,
      )
    } else {
      warn(`Invalid TestRail project ID "${pid}" after ${MAX_PROMPT_ATTEMPTS} attempts. Skipping.`)
    }
  }

  let testRailSuiteId = null
  for (let attempt = 1; attempt <= MAX_PROMPT_ATTEMPTS; attempt++) {
    const sid = await prompt(rl, 'TestRail suite ID (e.g., 1 or 42)', '')
    testRailSuiteId = parseTestRailId(sid)
    if (!sid || testRailSuiteId !== null) break
    if (attempt < MAX_PROMPT_ATTEMPTS) {
      warn(
        `Invalid TestRail suite ID "${sid}". ` +
          `Expected: a positive integer, e.g., 1, 42. (attempt ${attempt}/${MAX_PROMPT_ATTEMPTS})`,
      )
    } else {
      warn(`Invalid TestRail suite ID "${sid}" after ${MAX_PROMPT_ATTEMPTS} attempts. Skipping.`)
    }
  }

  return { tmsProvider: 'testrail', testRailProjectId, testRailSuiteId }
}

async function promptQaseConfig(rl) {
  let code = ''
  for (let attempt = 1; attempt <= MAX_PROMPT_ATTEMPTS; attempt++) {
    const raw = await prompt(rl, 'Qase project code (e.g., PROJ)', '')
    code = raw.toUpperCase().trim()
    if (!code || isValidQaseProjectCode(code)) break
    if (attempt < MAX_PROMPT_ATTEMPTS) {
      warn(
        `Invalid Qase project code "${code}". ` +
          `Expected: uppercase letters/digits/hyphens starting with a letter, e.g., PROJ. ` +
          `(attempt ${attempt}/${MAX_PROMPT_ATTEMPTS})`,
      )
    } else {
      warn(`Invalid Qase project code "${code}" after ${MAX_PROMPT_ATTEMPTS} attempts. Skipping.`)
      code = ''
    }
  }
  return { tmsProvider: 'qase', qaseProjectCode: code || null }
}

async function promptZephyrConfig(rl) {
  let projectKey = ''
  for (let attempt = 1; attempt <= MAX_PROMPT_ATTEMPTS; attempt++) {
    const raw = await prompt(rl, 'Zephyr Scale project key (e.g., PROJ)', '')
    projectKey = raw.toUpperCase().trim()
    if (!projectKey || /^[A-Z][A-Z0-9_-]*$/.test(projectKey)) break
    if (attempt < MAX_PROMPT_ATTEMPTS) {
      warn(
        `Invalid Zephyr project key "${projectKey}". ` +
          `Expected: uppercase letters/digits/hyphens starting with a letter, e.g., PROJ. ` +
          `(attempt ${attempt}/${MAX_PROMPT_ATTEMPTS})`,
      )
    } else {
      warn(
        `Invalid Zephyr project key "${projectKey}" after ${MAX_PROMPT_ATTEMPTS} attempts. Skipping.`,
      )
      projectKey = ''
    }
  }
  const folderRaw = await prompt(rl, 'Zephyr folder ID (optional, e.g., 123)', '')
  const folderId = folderRaw ? Number.parseInt(folderRaw, 10) || null : null
  return { tmsProvider: 'zephyr', zephyrProjectKey: projectKey || null, zephyrFolderId: folderId }
}

async function promptLocalConfig(rl) {
  const outputDir = await prompt(rl, 'TMS export directory', '.sparq/tms-export')
  const fmt = await prompt(rl, 'Export format (json/markdown)', 'json')
  const format = ['json', 'markdown'].includes(fmt) ? fmt : 'json'
  return { tmsProvider: 'local', tmsLocalOutputDir: outputDir, tmsLocalFormat: format }
}

const TMS_PROMPTERS = {
  testrail: promptTestRailConfig,
  qase: promptQaseConfig,
  zephyr: promptZephyrConfig,
  local: promptLocalConfig,
}

/**
 * Prompt for TMS provider selection and provider-specific config.
 */
async function promptTms(rl) {
  const providerChoice = await prompt(
    rl,
    'Test management system (testrail/qase/zephyr/local/none)',
    'none',
  )
  const provider = providerChoice.toLowerCase().trim()
  const prompter = TMS_PROMPTERS[provider]
  return prompter ? prompter(rl) : { tmsProvider: null }
}

/**
 * Standalone choice prompt — presents a message with valid choices.
 * Returns the lowercase choice, or defaultChoice on empty input.
 */
async function promptChoice(message, validChoices, defaultChoice) {
  const rl = createAsyncInterface({ input: process.stdin, output: process.stdout })
  try {
    const answer = await rl.question(`  ${message} `)
    const lower = answer.toLowerCase().trim()
    if (!lower) return defaultChoice
    if (validChoices.includes(lower)) return lower
    return defaultChoice
  } finally {
    rl.close()
  }
}

/**
 * Display a summary of the resolved configuration before writing.
 */
function displayConfigPreview(gathered, features) {
  const featureNames = features ? [...features] : ALL_FEATURE_NAMES
  const featureSet = features || new Set(ALL_FEATURE_NAMES)
  const agentCount = getAgentsForFeatures(featureSet).length
  const skillCount = getSkillsForFeatures(featureSet).length
  const templateCount = getTemplatesForFeatures(featureSet).length

  const sources = [
    gathered.jiraEnabled && `Jira (${gathered.jiraKey || '—'})`,
    gathered.confluenceEnabled && `Confluence`,
    gathered.figmaEnabled && 'Figma',
    gathered.localEnabled && 'Local',
  ].filter(Boolean)

  console.log()
  console.log(`  ${style.bold('Configuration Summary:')}`)
  console.log(`    Project:        ${style.cyan(gathered.projectName)}`)
  console.log(`    Test directory:  ${style.cyan(`${gathered.testDir}/`)}`)
  console.log(`    Sources:        ${style.cyan(sources.length > 0 ? sources.join(', ') : 'none')}`)
  console.log(`    TMS:            ${style.cyan(gathered.tmsProvider || 'none')}`)
  console.log(`    Checkpoints:    ${style.cyan(gathered.checkpointLevel)}`)
  console.log(`    Features:       ${style.cyan(featureNames.join(', '))}`)
  console.log(
    `    Install:        ${style.dim(`${agentCount} agents, ${skillCount} skills, ${templateCount} templates`)}`,
  )
  console.log()
}

/**
 * Run interactive prompts to gather config from user.
 */
async function gatherInteractiveConfig(targetDir) {
  const rl = createInterface({ input: process.stdin, output: process.stdout })

  try {
    console.log()
    info('Answer the following to configure your project.\n')

    // Step 1/6: Project basics
    info(style.bold('Step 1/6: Project basics'))
    const rawName = await prompt(rl, 'Project name', basename(targetDir))
    const projectName = sanitizeProjectName(rawName)

    // Step 2/6: Integration sources
    console.log()
    info(style.bold('Step 2/6: Integration sources'))
    const figmaEnabled = await confirm(rl, 'Enable Figma integration?', true)
    const jiraEnabled = await confirm(rl, 'Enable Jira integration?', true)
    const jiraKey = jiraEnabled
      ? await promptValidatedKey(rl, 'Jira project key', 'EP', isValidJiraKey)
      : ''
    const confluenceEnabled = await confirm(rl, 'Enable Confluence integration?', true)
    const confluenceSpace = confluenceEnabled
      ? await promptValidatedKey(rl, 'Confluence space key', 'PROJ', isValidConfluenceKey)
      : ''
    const localEnabled = await confirm(rl, 'Enable local requirements (docs/specs)?', true)

    // Step 3/6: Test setup
    console.log()
    info(style.bold('Step 3/6: Test setup'))
    const testDir = await prompt(rl, 'Playwright test directory', 'e2e')

    // Step 4/6: Test management system
    console.log()
    info(style.bold('Step 4/6: Test management system'))
    const tmsConfig = await promptTms(rl)

    // Step 5/6: Export targets
    console.log()
    info(style.bold('Step 5/6: Export targets'))
    const jiraExportEnabled = jiraEnabled
      ? await confirm(rl, 'Link test results back to Jira tickets?', true)
      : false
    const confluenceExportEnabled = confluenceEnabled
      ? await confirm(rl, 'Publish test plans to Confluence?', true)
      : false

    // Step 6/6: Preferences
    console.log()
    info(style.bold('Step 6/6: Preferences'))
    info('Checkpoint levels:')
    info('  full     — pause at every phase for approval')
    info('  standard — auto-approve low-risk phases, pause at outputs')
    info('  fast     — auto-approve all except final output review')
    const validCheckpointLevels = ['full', 'standard', 'fast']
    let checkpointLevel = await prompt(rl, 'Checkpoint verbosity (full/standard/fast)', 'full')
    while (!validCheckpointLevels.includes(checkpointLevel)) {
      warn(`Invalid value '${checkpointLevel}'. Must be one of: full, standard, fast`)
      checkpointLevel = await prompt(rl, 'Checkpoint verbosity (full/standard/fast)', 'full')
    }
    info(
      'Batch approval: plan-once, run-mostly-uninterrupted.' +
        ' Presents a full Phase 0 plan then auto-approves intermediate checkpoints.',
    )
    const batchApproval = await confirm(rl, 'Enable batch approval mode?', false)

    const validViewportPresets = ['desktop', 'laptop', 'tablet', 'mobile', 'mobile-lg']
    const viewportsEnabled = await confirm(
      rl,
      'Enable viewport matrix testing? (Tests run across multiple screen sizes)',
      false,
    )
    let viewportPresets = []
    if (viewportsEnabled) {
      info(`Available presets: ${validViewportPresets.join(' ')}`)
      const presetsInput = await prompt(
        rl,
        'Select viewport presets (space-separated: desktop laptop tablet mobile mobile-lg)',
        'desktop mobile',
      )
      const rawPresets = presetsInput
        .split(' ')
        .map((p) => p.trim().toLowerCase())
        .filter(Boolean)
      const invalid = rawPresets.filter((p) => !validViewportPresets.includes(p))
      viewportPresets = rawPresets.filter((p) => validViewportPresets.includes(p))
      if (invalid.length > 0) {
        warn(`Unknown viewport presets ignored: ${invalid.join(', ')}`)
      }
      if (viewportPresets.length === 0) viewportPresets = ['desktop', 'mobile']
    }

    const separateRegressionStep = await confirm(
      rl,
      'Add separate regression test step to CI?',
      false,
    )

    rl.close()
    return {
      projectName,
      figmaEnabled,
      jiraEnabled,
      jiraKey,
      confluenceEnabled,
      confluenceSpace,
      localEnabled,
      testDir,
      ...tmsConfig,
      jiraExportEnabled,
      confluenceExportEnabled,
      viewportsEnabled,
      viewportPresets,
      checkpointLevel,
      batchApproval,
      separateRegressionStep,
    }
  } catch (err) {
    rl.close()
    fail(`Interactive prompt failed: ${err.message}`)
    process.exit(EXIT_GENERAL)
  }
}

/**
 * Gather configuration using smart defaults from project detection.
 * No prompts — detects settings and displays them for review.
 */
async function gatherDefaultsConfig(targetDir) {
  info('Detecting project settings...\n')
  const e2eSetup = detectE2ESetup(targetDir)

  // Derive testDir from detected E2E structure or fall back to 'e2e'
  const detectedTestDir = e2eSetup.structure?.specs ? e2eSetup.structure.specs.split('/')[0] : 'e2e'
  const framework = e2eSetup.framework || 'playwright'
  const frameworkLabel = e2eSetup.detected ? `${framework} (detected)` : framework
  const testDirLabel = e2eSetup.detected ? `${detectedTestDir}/ (detected)` : `${detectedTestDir}/`

  console.log(`  ${style.bold('Detected configuration:')}`)
  console.log(`    Project directory:  ${style.cyan(targetDir)}`)
  console.log(`    Test framework:     ${style.cyan(frameworkLabel)}`)
  console.log(`    Test directory:     ${style.cyan(testDirLabel)}`)
  console.log(`    Checkpoint level:   ${style.cyan('full')}`)
  console.log(`    TMS provider:       ${style.cyan('none')}`)
  console.log()

  return {
    projectName: sanitizeProjectName(basename(targetDir)),
    figmaEnabled: true,
    jiraEnabled: false,
    jiraKey: '',
    confluenceEnabled: false,
    confluenceSpace: '',
    localEnabled: true,
    testDir: detectedTestDir,
    tmsProvider: null,
    jiraExportEnabled: false,
    confluenceExportEnabled: false,
    viewportsEnabled: false,
    viewportPresets: [],
    checkpointLevel: 'full',
    batchApproval: false,
    separateRegressionStep: false,
  }
}

/**
 * Gather configuration from user (interactive, defaults, or non-interactive).
 */
export async function gatherConfig(targetDir, nonInteractive, defaults) {
  if (nonInteractive) {
    info('Running in non-interactive mode with safe local-first defaults.')
    console.log()
    return {
      projectName: sanitizeProjectName(basename(targetDir)),
      figmaEnabled: false,
      jiraEnabled: false,
      jiraKey: '',
      confluenceEnabled: false,
      confluenceSpace: '',
      localEnabled: true,
      testDir: 'e2e',
      tmsProvider: null,
      jiraExportEnabled: false,
      confluenceExportEnabled: false,
      viewportsEnabled: false,
      viewportPresets: [],
      checkpointLevel: 'full',
      batchApproval: false,
      separateRegressionStep: false,
    }
  }
  if (defaults) return gatherDefaultsConfig(targetDir)
  return gatherInteractiveConfig(targetDir)
}

/**
 * Install files with optional name-based filtering.
 * When filterNames is null/undefined, delegates to installAndReport as-is.
 * When filterNames is provided, only installs items whose names match the list.
 * For directories (skills), copies each matching subdir via installAndReport.
 * For files (agents, templates), copies each matching file individually.
 */
function installFiltered(srcDir, destDir, label, installOpts, filterNames, exclude) {
  if (!filterNames) {
    return installAndReport(srcDir, destDir, label, { ...installOpts, exclude })
  }

  ensureDir(destDir)
  let copied = 0
  let errors = 0

  for (const name of filterNames) {
    const src = join(srcDir, name)
    const dest = join(destDir, name)
    if (!existsSync(src)) continue

    try {
      const srcStat = statSync(src)
      if (srcStat.isDirectory()) {
        const result = installAndReport(src, dest, `${label}/${name}`, installOpts)
        copied += result.copied
        errors += result.errors
      } else {
        if (installOpts.merge && existsSync(dest)) {
          warn(`${toForwardSlash(name)} (already exists, skipped)`)
          continue
        }
        ensureDir(destDir)
        dryRun(() => copyFileSync(src, dest), `copy ${toForwardSlash(name)}`)
        ok(toForwardSlash(name))
        copied++
      }
    } catch (err) {
      warn(`Failed to install ${name}: ${err.message}`)
      errors++
    }
  }

  return { copied, errors }
}

/**
 * Detect existing non-SparQ content in .claude/ directory.
 * Returns an array of relative paths for files/dirs that are not SparQ-managed.
 */
function detectExistingContent(claudeDir) {
  if (!existsSync(claudeDir)) return []

  const conflicts = []
  const agentsDir = join(claudeDir, 'agents')
  const skillsDir = join(claudeDir, 'skills')

  if (existsSync(agentsDir)) {
    for (const f of listFiles(agentsDir)) {
      if (!f.startsWith('sparq-')) conflicts.push(`agents/${f}`)
    }
  }

  if (existsSync(skillsDir)) {
    for (const d of listDirs(skillsDir)) {
      if (!d.startsWith('sparq-') && d !== 'sparq-shared') {
        conflicts.push(`skills/${d}/`)
      }
    }
  }

  return conflicts
}

/**
 * Prompt for confirmation when existing non-SparQ content is detected.
 * Returns true to proceed, false to abort.
 */
async function confirmExistingContent(claudeDir, nonInteractive) {
  const existingContent = detectExistingContent(claudeDir)
  if (existingContent.length === 0) return true
  info('Existing non-SparQ content detected in .claude/:')
  for (const item of existingContent) info(`  ${item}`)
  info('These files will not be modified.')
  if (!nonInteractive) {
    const proceed = await promptChoice('Continue with init? (y/N)', ['y', 'n'], 'n')
    if (proceed !== 'y') {
      info('Init cancelled.')
      return false
    }
  }
  return true
}

/**
 * Install all file sets (agents, skills, templates). (#32 progress)
 * When features is provided, only installs files required by those features.
 */
function installFiles(claudeDir, features, excludeSkills) {
  const totalSteps = 3
  let step = 0
  const results = { copied: 0, errors: 0 }

  const agentFilter = features ? getAgentsForFeatures(features) : null
  const skillFilter = features ? getSkillsForFeatures(features) : null
  const templateFilter = features ? getTemplatesForFeatures(features) : null

  heading(`${emoji.agents}[${++step}/${totalSteps}] Installing agent files...`)
  checkInterrupted()
  const a = installFiltered(
    PKG_AGENTS_DIR,
    join(claudeDir, 'agents'),
    'agents',
    { merge: true },
    agentFilter,
  )
  results.copied += a.copied
  results.errors += a.errors

  heading(`${emoji.skills}[${++step}/${totalSteps}] Installing skill files...`)
  checkInterrupted()
  const s = installFiltered(
    PKG_SKILLS_DIR,
    join(claudeDir, 'skills'),
    'skills',
    { merge: true },
    skillFilter,
    excludeSkills,
  )
  results.copied += s.copied
  results.errors += s.errors

  heading(`${emoji.templates}[${++step}/${totalSteps}] Installing template files...`)
  checkInterrupted()
  const t = installFiltered(
    PKG_TEMPLATES_DIR,
    join(claudeDir, 'templates'),
    'templates',
    { merge: true },
    templateFilter,
  )
  results.copied += t.copied
  results.errors += t.errors

  return results
}

/**
 * Create .sparq/ output directories.
 */
function setupOutputDirs(targetDir) {
  for (const dir of SPARQ_OUTPUT_DIRS) {
    const fullPath = join(targetDir, dir)
    if (ensureDir(fullPath)) {
      ok(dir)
    }
  }
}

// ---------------------------------------------------------------------------
// Command: init
// ---------------------------------------------------------------------------

/**
 * Detect and report E2E setup status.
 */
function detectAndReportE2E(targetDir) {
  heading(`${emoji.detectE2e}Detecting E2E setup...`)
  const e2eConfig = detectE2ESetup(targetDir)
  if (!e2eConfig.detected) {
    info('No existing E2E setup detected. You can set one up later.')
    return e2eConfig
  }

  ok(`E2E framework detected: ${e2eConfig.framework || 'unknown'}`)
  if (e2eConfig.configFile) ok(`Config file: ${e2eConfig.configFile}`)
  if (e2eConfig.hasAbstractPage) ok('Abstract page base class found')
  if (e2eConfig.hasFixtureIndex) ok('Fixture index found')
  return e2eConfig
}

/**
 * Detect and report tech stack status.
 */
function detectAndReportTechStack(targetDir) {
  heading(`${emoji.detectStack}Detecting tech stack...`)
  const techStack = detectTechStack(targetDir)
  if (techStack.framework) {
    ok('Tech stack detected from package.json')
    console.log()
    console.log(`  ${style.bold('Tech Stack Detected:')}`)
    displayTechStack(techStack)
  } else if (!existsSync(join(targetDir, 'package.json'))) {
    fail('No package.json found — tech stack detection skipped')
  } else {
    info('No recognized frameworks detected in package.json')
  }
  return techStack
}

// ---------------------------------------------------------------------------
// Init checkpoint — survives SIGINT / mid-install crashes
// ---------------------------------------------------------------------------

const INIT_CHECKPOINT = '.sparq/.init-checkpoint'

/**
 * Write a checkpoint file at the start of the install pipeline.
 * If a subsequent run detects this file it knows a previous install was interrupted.
 */
function writeInitCheckpoint(targetDir) {
  try {
    ensureDir(join(targetDir, '.sparq'))
    writeFileSync(
      join(targetDir, INIT_CHECKPOINT),
      JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }),
      'utf-8',
    )
  } catch {
    // Non-fatal — checkpoint is best-effort
  }
}

/**
 * Remove the checkpoint on successful completion.
 */
function deleteInitCheckpoint(targetDir) {
  try {
    unlinkSync(join(targetDir, INIT_CHECKPOINT))
  } catch {
    // Non-fatal — may not exist if .sparq/ was cleaned up already
  }
}

// ---------------------------------------------------------------------------

/**
 * Run the main installation pipeline.
 */
function runInstallPipeline(targetDir, claudeDir, gathered, features, ciProvider) {
  const e2eConfig = detectAndReportE2E(targetDir)
  const techStack = detectAndReportTechStack(targetDir)

  checkInterrupted()
  // Only install the matching framework's best-practices skill
  const excludeSkills =
    e2eConfig?.framework === 'cypress'
      ? new Set(['sparq-playwright-best-practices'])
      : new Set(['sparq-cypress-best-practices'])
  installFiles(claudeDir, features, excludeSkills)

  heading(`${emoji.config}Generating configuration...`)
  checkInterrupted()
  generateConfig(targetDir, gathered, e2eConfig, techStack)

  heading(`${emoji.directories}Creating output directories...`)
  checkInterrupted()
  setupOutputDirs(targetDir)

  // MCP uses deriveFeatures() to respect user's integration selections
  heading(`${emoji.mcp}Configuring MCP servers...`)
  checkInterrupted()
  const resolvedForMcp = features || deriveFeatures(gathered, e2eConfig.framework)
  const mcpServerFilter = getMcpServersForFeatures(resolvedForMcp)
  const mcpPath = join(targetDir, '.mcp.json')
  let addedServers = []
  if (mcpServerFilter.length > 0) {
    addedServers = mergeMcpConfigs(mcpPath, mcpServerFilter)
  } else if (!existsSync(mcpPath)) {
    // Keep a deterministic file contract even when no MCP servers are selected.
    dryRun(
      () => writeFileSync(mcpPath, `${JSON.stringify({ mcpServers: {} }, null, 2)}\n`, 'utf-8'),
      `write .mcp.json to ${toForwardSlash(mcpPath)}`,
    )
    ok('.mcp.json created (no MCP servers selected)')
  } else {
    info('.mcp.json preserved (no MCP servers selected)')
  }

  // Permissions setup (I4)
  heading(`${emoji.permissions}Setting up permissions...`)
  checkInterrupted()
  const resolvedForPerms = features || resolvedForMcp
  const featureNames = [...resolvedForPerms]
  generatePermissions(targetDir, { features: featureNames, framework: e2eConfig.framework })

  // --- Hooks (exit guard + compaction resilience) ---
  installHooks(targetDir)

  // CI template generation (I7)
  if (ciProvider) {
    heading(`${emoji.config}Generating CI workflow...`)
    checkInterrupted()
    const ciResult = generateCiTemplate(targetDir, {
      provider: ciProvider,
      separateRegressionStep: gathered.separateRegressionStep,
    })
    if (!ciResult.created && ciResult.reason) {
      warn(ciResult.reason)
    }
  }

  heading(`${emoji.claudeMd}Installing rule file...`)
  installRuleFile(targetDir, techStack, e2eConfig)

  heading(`${emoji.gitignore}Updating .gitignore...`)
  ensureGitignore(join(targetDir, '.gitignore'))

  // --- Platform extras (Cursor, Codex, etc.) ---
  const detectedPlatforms = detectPlatforms(targetDir)
  if (detectedPlatforms.length > 0) {
    heading(`${emoji.config}Installing platform extras (${detectedPlatforms.join(', ')})...`)
    checkInterrupted()
    installPlatformExtras(targetDir, detectedPlatforms, {
      techStack,
      e2eConfig,
      mcpServersAdded: addedServers,
    })
  }

  // --- AGENTS.md (all platforms) ---
  heading(`${emoji.claudeMd}Generating AGENTS.md...`)
  generateAgentsMd(targetDir)

  heading(`${emoji.manifest}Writing file manifest...`)
  const manifest = buildManifest(targetDir)
  if (addedServers.length > 0) {
    manifest.mcpServersAdded = addedServers
  }
  writeManifest(targetDir, manifest)
  ok(`.sparq/.manifest.json created (${Object.keys(manifest).length} files tracked)`)
  deleteInitCheckpoint(targetDir)
}

// ---------------------------------------------------------------------------
// Rollback — comprehensive cleanup on init failure
// ---------------------------------------------------------------------------

/**
 * Safely remove a single file. Returns 1 on success, 0 on skip/failure.
 */
function safeUnlink(filePath, label) {
  if (!existsSync(filePath)) return 0
  try {
    unlinkSync(filePath)
    ok(`Removed ${label}`)
    return 1
  } catch (e) {
    warn(`Could not remove ${label}: ${e.message}`)
    return 0
  }
}

/**
 * Safely remove a directory tree. Returns 1 on success, 0 on skip/failure.
 */
function safeRmdir(dirPath, label) {
  if (!existsSync(dirPath)) return 0
  try {
    rmSync(dirPath, { recursive: true, force: true })
    ok(`Removed ${label}`)
    return 1
  } catch (e) {
    warn(`Could not remove ${label}: ${e.message}`)
    return 0
  }
}

/**
 * Remove a directory if it exists and is empty.
 */
function removeIfEmpty(dirPath) {
  if (!existsSync(dirPath)) return
  try {
    const entries = readdirSync(dirPath)
    if (entries.length === 0) rmSync(dirPath, { force: true })
  } catch {
    // Not empty or not accessible — leave it
  }
}

/**
 * Roll back all artifacts created during a failed init.
 *
 * Removes in reverse order of creation:
 *   1. .sparq/ directory (output dirs + manifest)
 *   2. sparq.config.json
 *   3. Installed template files
 *   4. Installed skill directories (sparq-*)
 *   5. Installed agent files (sparq-*)
 *   6. Empty .claude/ subdirectories left behind
 *
 * Does NOT attempt to undo appends to shared files (.mcp.json, CLAUDE.md,
 * .gitignore, settings.local.json) — surgical reversal of partial appends
 * is error-prone.  If those files were modified, the user can run
 * `npx sparq-assistant uninstall --force` for a full cleanup.
 */
function rollbackInit(targetDir, err) {
  fail(`Setup failed: ${err.message}`)
  info(
    `Run with --verbose for full error details, or check file permissions in ${toForwardSlash(targetDir)}`,
  )
  if (getVerbosity() === 'verbose' && err.stack) {
    console.log(`  ${style.dim(err.stack.split('\n').slice(1).join('\n  '))}`)
  } else if (err.stack) {
    console.log(`  ${style.dim(err.stack.split('\n').slice(1, 3).join('\n  '))}`)
  }

  heading(`${emoji.rollback}Rolling back...`)
  const claudeDir = join(targetDir, '.claude')
  let removed = 0

  // 1. Remove .sparq/ directory tree (output dirs, manifest, tracking)
  removed += safeRmdir(join(targetDir, '.sparq'), '.sparq/')

  // 2. Remove generated config
  removed += safeUnlink(join(targetDir, 'sparq.config.json'), 'sparq.config.json')

  // 3. Remove installed template files (all files in .claude/templates/)
  const templatesDir = join(claudeDir, 'templates')
  if (existsSync(templatesDir)) {
    for (const f of listFiles(templatesDir)) {
      removed += safeUnlink(join(templatesDir, f), `templates/${f}`)
    }
  }

  // 4. Remove installed skill directories (only sparq-* prefixed — never touch user dirs)
  const skillsDir = join(claudeDir, 'skills')
  for (const dir of listDirs(skillsDir).filter((d) => d.startsWith('sparq-'))) {
    removed += safeRmdir(join(skillsDir, dir), `skills/${dir}/`)
  }

  // 5. Remove installed agent files (only our named agents)
  const agentsDir = join(claudeDir, 'agents')
  for (const name of AGENT_NAMES) {
    removed += safeUnlink(join(agentsDir, name), `agents/${name}`)
  }

  // 5b. Remove rule file
  removed += safeUnlink(join(claudeDir, 'rules', 'sparq.md'), 'rules/sparq.md')

  // 5c. Remove AGENTS.md SparQ block
  removeAgentsMd(targetDir)

  // 5d. Remove platform extras (.cursor/, .codex/, .agents/ SparQ files)
  removePlatformExtras(targetDir, detectPlatforms(targetDir))

  // 6. Clean up empty .claude/ subdirectories left behind
  for (const sub of ['templates', 'skills', 'agents', 'rules']) {
    removeIfEmpty(join(claudeDir, sub))
  }
  removeIfEmpty(claudeDir)

  // Summary
  console.log()
  if (removed > 0) {
    ok(`Rolled back ${removed} item(s)`)
  }
  info('For complete cleanup, run: npx sparq-assistant uninstall --force')
}

/**
 * Confirm defaults-mode settings with a three-way choice: proceed, edit, cancel.
 * Returns the final gathered config, or null if cancelled.
 */
async function confirmDefaultsConfig(gathered, targetDir, resolvedFeatures) {
  const choice = await promptChoice(
    'Proceed with these settings? (p)roceed / (e)dit / (c)ancel [p]',
    ['p', 'e', 'c'],
    'p',
  )
  if (choice === 'c') {
    info('Setup cancelled.')
    return null
  }
  if (choice !== 'e') return gathered

  const edited = await gatherInteractiveConfig(targetDir)
  checkInterrupted()
  displayConfigPreview(edited, resolvedFeatures)
  const confirmed = await promptChoice(
    'Proceed with these settings? (p)roceed / (c)ancel [p]',
    ['p', 'c'],
    'p',
  )
  if (confirmed === 'c') {
    info('Setup cancelled.')
    return null
  }
  return edited
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

/**
 * Clean up any stale checkpoint, write a fresh one, then run the install pipeline.
 * Rolls back and exits on failure.
 */
async function runInstallFlow(targetDir, claudeDir, gathered, features, ciProvider) {
  // If a previous install was interrupted (SIGINT, crash, or rollback failure),
  // a stale checkpoint file remains. Auto-clean before retrying.
  if (!isDryRun() && existsSync(join(targetDir, INIT_CHECKPOINT))) {
    rollbackInit(
      targetDir,
      new Error('previous install was interrupted — cleaning up before retrying'),
    )
  }

  // Write checkpoint immediately after all user confirmations and before any file
  // operations. This closes the window between confirmations and pipeline start —
  // if the process crashes here the next run will detect the checkpoint and rollback.
  if (!isDryRun()) writeInitCheckpoint(targetDir)

  try {
    runInstallPipeline(targetDir, claudeDir, gathered, features, ciProvider)
    await cmdDoctor(targetDir)
    heading(`${emoji.complete}Setup complete!`)
    info(`Run ${style.bold('npx sparq-assistant doctor')} at any time to verify your setup.`)
    info(`Start your workflow with ${style.bold('/sparq:start')}.`)
    console.log()
  } catch (err) {
    rollbackInit(targetDir, err)
    process.exit(EXIT_GENERAL)
  }
}

export async function cmdInit(
  targetDir,
  {
    nonInteractive = false,
    defaults = false,
    features: featureSelection,
    ciProvider,
    workspace = null,
  } = {},
) {
  // --workspace mode: install only workspace-specific E2E config, skip global installs
  if (workspace) {
    return cmdInitWorkspace(targetDir, workspace, { nonInteractive, defaults })
  }

  heading(`${emoji.init}SparQ QA Assistant — Setup Wizard`)

  if (!checkNodeVersion(22)) {
    fail('Node.js >= 22 is required. Please upgrade and try again.')
    process.exit(EXIT_GENERAL)
  }
  ok('Node.js version OK')

  if (!validateTargetDir(targetDir)) process.exit(EXIT_FILESYSTEM)

  const claudeDir = join(targetDir, '.claude')
  if (!ensureDir(claudeDir)) {
    fail(`Cannot create .claude/ directory at ${toForwardSlash(targetDir)}.`)
    info('Ensure you have write permissions and the parent directory exists.')
    process.exit(EXIT_FILESYSTEM)
  }
  ok(
    `.claude/ directory ready at ${toForwardSlash(relative(process.cwd(), claudeDir)) || toForwardSlash(claudeDir)}`,
  )

  if (!tryAcquireLock(targetDir)) process.exit(EXIT_GENERAL)

  try {
    const features = featureSelection ? resolveFeatures(featureSelection) : null
    if (featureSelection) {
      info(`Selected features: ${[...features].join(', ')}`)
    }

    let gathered = await gatherConfig(targetDir, nonInteractive, defaults)
    checkInterrupted()

    const resolvedFeatures = features || new Set(ALL_FEATURE_NAMES)
    displayConfigPreview(gathered, resolvedFeatures)

    if (defaults) {
      gathered = await confirmDefaultsConfig(gathered, targetDir, resolvedFeatures)
      if (!gathered) return
    }

    if (!(await confirmExistingContent(claudeDir, nonInteractive))) return

    await runInstallFlow(targetDir, claudeDir, gathered, features, ciProvider)
  } finally {
    releaseLock(targetDir)
  }
}

/**
 * Workspace-mode init: install only the workspace-specific sparq.config.json.
 * Skips global agent/skill/template installation (those are root-level).
 *
 * @param {string} rootDir - Absolute path to the repo root
 * @param {string} workspacePath - Relative path of the workspace (e.g., "packages/web")
 * @param {object} options
 * @param {boolean} options.nonInteractive
 * @param {boolean} options.defaults
 */
async function cmdInitWorkspace(
  rootDir,
  workspacePath,
  { nonInteractive = false, defaults = false } = {},
) {
  heading(`${emoji.init}SparQ QA Assistant — Workspace Setup`)
  info(
    `Detected workspace mode. Installing E2E configuration for ${style.bold(workspacePath)} only.`,
  )
  console.log()

  if (!checkNodeVersion(22)) {
    fail('Node.js >= 22 is required. Please upgrade and try again.')
    process.exit(EXIT_GENERAL)
  }

  const wsDir = join(rootDir, workspacePath)
  if (!validateTargetDir(wsDir)) process.exit(EXIT_FILESYSTEM)

  const gathered = await gatherConfig(wsDir, nonInteractive, defaults)
  checkInterrupted()

  const e2eConfig = detectAndReportE2E(wsDir)
  const techStack = detectAndReportTechStack(wsDir)

  try {
    generateConfig(wsDir, gathered, e2eConfig, techStack)
    ok(`Workspace config written to ${toForwardSlash(join(workspacePath, 'sparq.config.json'))}`)
    info(
      `To run agents for this workspace, use ${style.bold(`--workspace ${workspacePath}`)} flags.`,
    )
    console.log()
  } catch (err) {
    fail(`Workspace init failed: ${err.message}`)
    process.exit(EXIT_GENERAL)
  }
}
