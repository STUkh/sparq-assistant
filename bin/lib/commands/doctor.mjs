// bin/lib/commands/doctor.mjs — Doctor command

import { appendFileSync, copyFileSync, cpSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { AGENT_NAMES, PKG_AGENTS_DIR, PKG_SKILLS_DIR, SPARQ_OUTPUT_DIRS } from '../constants.mjs'
import { detectE2ESetup } from '../detect.mjs'
import { listDirs } from '../files.mjs'
import { checkHooks, installHooks } from '../hooks.mjs'
import { checkPlatformExtras, detectPlatforms } from '../platform.mjs'
import { deepValidateConfig } from '../schema.mjs'
import { emoji, fail, heading, info, isDryRun, ok, style, warn } from '../state.mjs'

// ---------------------------------------------------------------------------
// Command: doctor (#3 fix exit code)
// ---------------------------------------------------------------------------

/**
 * Read e2e.framework from sparq.config.json (defaults to 'playwright').
 */
function getConfigFramework(targetDir) {
  const configPath = join(targetDir, 'sparq.config.json')
  if (!existsSync(configPath)) return 'playwright'
  try {
    const config = JSON.parse(readFileSync(configPath, 'utf-8'))
    return config.e2e?.framework || 'playwright'
  } catch {
    return 'playwright'
  }
}

/**
 * Derive required MCP servers from sparq.config.json sources/outputs.
 */
function getRequiredServers(targetDir) {
  const configPath = join(targetDir, 'sparq.config.json')
  if (!existsSync(configPath)) return ['playwright']
  try {
    const config = JSON.parse(readFileSync(configPath, 'utf-8'))
    const framework = config.e2e?.framework || 'playwright'
    const servers = framework === 'cypress' ? [] : ['playwright']
    if (config.sources?.jira?.enabled || config.sources?.confluence?.enabled) {
      servers.push('atlassian')
    }
    if (config.sources?.figma?.enabled) servers.push('figma')
    if (config.outputs?.tms?.provider === 'testrail') servers.push('testrail')
    if (config.outputs?.tms?.provider === 'qase') servers.push('qase')
    if (config.outputs?.tms?.provider === 'zephyr') servers.push('zephyr')
    return servers
  } catch {
    return ['playwright']
  }
}

function checkMcpServers(targetDir, ctx) {
  const mcpPath = join(targetDir, '.mcp.json')
  const requiredServers = getRequiredServers(targetDir)

  if (!existsSync(mcpPath)) {
    for (const srv of requiredServers) {
      ctx.total++
      fail(`MCP server missing: ${srv} (.mcp.json not found)`)
    }
    return
  }

  try {
    const mcpData = JSON.parse(readFileSync(mcpPath, 'utf-8'))
    const servers = mcpData.mcpServers || {}
    for (const srv of requiredServers) {
      ctx.check(srv in servers, `MCP server: ${srv}`, `MCP server missing: ${srv}`)
    }
  } catch {
    ctx.total += requiredServers.length
    fail('.mcp.json is not valid JSON')
  }
}

/**
 * Check sparq.config.json validity, schema, e2e, tech stack, and deprecations.
 */
function checkConfig(targetDir, ctx) {
  const configPath = join(targetDir, 'sparq.config.json')
  if (!existsSync(configPath)) {
    ctx.check(false, '', 'sparq.config.json not found')
    return
  }

  let configData
  try {
    configData = JSON.parse(readFileSync(configPath, 'utf-8'))
    ctx.check(true, 'sparq.config.json valid', '')
  } catch {
    ctx.check(false, '', 'sparq.config.json is not valid JSON')
    return
  }

  const deepResult = deepValidateConfig(configData)
  if (deepResult.valid) {
    ok('Deep schema validation passed')
  } else {
    for (const err of deepResult.errors) {
      fail(`Schema: ${err.path} ${err.message}`)
      if (err.hint) info(`  To fix: ${err.hint}`)
      ctx.total++
    }
  }
  for (const w of deepResult.warnings) {
    warn(`Schema: ${w.path} — ${w.message}`)
    ctx.warnings++
  }

  checkConfigE2E(targetDir, configData, ctx)
  checkConfigViewports(configData, ctx)
}

/**
 * Check e2e section of config.
 */
function checkConfigE2E(targetDir, configData, ctx) {
  ctx.warnCheck(
    configData.e2e !== undefined,
    'sparq.config.json has e2e section',
    'sparq.config.json missing e2e section — run `npx sparq-assistant init` to regenerate',
  )

  if (!configData.e2e?.detected) return

  const currentE2e = detectE2ESetup(targetDir)
  ctx.warnCheck(
    currentE2e.framework === configData.e2e.framework,
    `E2E framework matches config (${configData.e2e.framework})`,
    `E2E framework mismatch: config says ${configData.e2e.framework}, found ${currentE2e.framework || 'none'} — run \`sparq update\` to reconfigure or edit sparq.config.json`,
  )
}

/**
 * Check viewport config section.
 */
function checkConfigViewports(configData, ctx) {
  const viewports = configData.viewports
  if (!viewports) return
  if (viewports.enabled === true) {
    const hasPresets = Array.isArray(viewports.presets) && viewports.presets.length > 0
    const hasCustom = Array.isArray(viewports.custom) && viewports.custom.length > 0
    ctx.warnCheck(
      hasPresets || hasCustom,
      'Viewport presets configured',
      'viewports.enabled is true but no presets or custom viewports defined',
    )
  }
}

/**
 * Check E2E directory structure.
 */
function checkE2ESetup(targetDir, ctx) {
  console.log(`\n${style.bold(`${emoji.detectE2e}E2E Setup:`)}`)

  const framework = getConfigFramework(targetDir)

  if (framework === 'cypress') {
    const cypressConfigExists =
      existsSync(join(targetDir, 'cypress.config.ts')) ||
      existsSync(join(targetDir, 'cypress.config.js')) ||
      existsSync(join(targetDir, 'cypress.config.mjs'))
    ctx.warnCheck(cypressConfigExists, 'Cypress config found', 'No cypress.config.ts/js/mjs found')
    const cypressDir = join(targetDir, 'cypress')
    const cypressDirExists = existsSync(cypressDir)
    ctx.warnCheck(
      cypressDirExists,
      'cypress/ directory exists',
      'cypress/ directory not found — Cypress tests not set up yet',
    )
    if (!cypressDirExists) return
    for (const sub of ['e2e', 'support', 'fixtures']) {
      ctx.warnCheck(
        existsSync(join(cypressDir, sub)),
        `cypress/${sub}/ exists`,
        `cypress/${sub}/ not found`,
      )
    }
  } else {
    const playwrightConfigExists =
      existsSync(join(targetDir, 'playwright.config.ts')) ||
      existsSync(join(targetDir, 'playwright.config.js'))
    ctx.warnCheck(
      playwrightConfigExists,
      'Playwright config found',
      'No playwright.config.ts or playwright.config.js found',
    )
    const e2eDir = join(targetDir, 'e2e')
    const e2eDirExists = existsSync(e2eDir)
    ctx.warnCheck(
      e2eDirExists,
      'e2e/ directory exists',
      'e2e/ directory not found — E2E tests not set up yet',
    )
    if (!e2eDirExists) return
    for (const sub of ['pages', 'components', 'steps', 'fixtures', 'specs']) {
      ctx.warnCheck(existsSync(join(e2eDir, sub)), `e2e/${sub}/ exists`, `e2e/${sub}/ not found`)
    }
  }
}

/**
 * Check .gitignore includes .sparq/.
 */
function checkGitignore(targetDir, ctx) {
  const gitignorePath = join(targetDir, '.gitignore')
  if (!existsSync(gitignorePath)) {
    ctx.check(false, '', '.gitignore not found')
    return
  }
  try {
    const content = readFileSync(gitignorePath, 'utf-8')
    ctx.check(
      content.split('\n').some((line) => line.trim() === '.sparq/' || line.trim() === '.sparq'),
      '.gitignore includes .sparq/',
      '.gitignore missing .sparq/ entry',
      {
        type: 'append-gitignore',
        path: gitignorePath,
        entry: '.sparq/',
        label: 'Add .sparq/ to .gitignore',
      },
    )
  } catch {
    ctx.check(false, '', '.gitignore could not be read')
  }
}

// Server definitions for deep MCP health checks
const MCP_SERVER_CHECKS = {
  atlassian: {
    type: 'url',
  },
  figma: {
    type: 'url',
  },
  playwright: {
    type: 'command',
  },
  testrail: {
    type: 'command',
    requiredEnv: ['TESTRAIL_BASE_URL', 'TESTRAIL_USERNAME', 'TESTRAIL_API_KEY'],
  },
  qase: {
    type: 'command',
    requiredEnv: ['QASE_API_TOKEN'],
  },
  zephyr: {
    type: 'command',
    // ZEPHYR_API_TOKEN + JIRA_PROJECT_KEY are the two env vars mcp-zephyr-scale reads.
    // JIRA_PROJECT_KEY maps from the user's ZEPHYR_PROJECT_KEY at the MCP config boundary.
    // ZEPHYR_BASE_URL is not supported by the MCP package (Cloud URL is hardcoded in the
    // zephyr-api-client dep); it belongs in the shell env only for the L2 REST fallback.
    requiredEnv: ['ZEPHYR_API_TOKEN', 'JIRA_PROJECT_KEY'],
  },
}

/**
 * Validate that a string is a well-formed URL.
 */
function isValidUrl(str) {
  try {
    const url = new URL(str)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * Check a single MCP server's structure (URL or command).
 */
function checkServerStructure(name, server, checks, ctx) {
  if (checks.type === 'url') {
    if (!server.url || typeof server.url !== 'string') {
      ctx.warnCheck(false, '', `${name}: missing URL`)
      return
    }
    if (!isValidUrl(server.url)) {
      ctx.warnCheck(false, '', `${name}: invalid URL format "${server.url}"`)
      return
    }
    ok(`${name}: URL configured (${new URL(server.url).hostname})`)
  }
  if (checks.type === 'command') {
    const hasCommand = server.command && typeof server.command === 'string'
    ctx.warnCheck(hasCommand, `${name}: command configured`, `${name}: missing command`)
    if (hasCommand && server.args && !Array.isArray(server.args)) {
      warn(`${name}: "args" should be an array`)
      ctx.warnings++
    }
  }
}

/**
 * Check a single environment variable for an MCP server.
 */
function checkEnvVar(name, envVar, envSection, ctx) {
  const hasEnv = envVar in envSection
  if (!hasEnv) {
    warn(`${name}: missing env var ${envVar}`)
    info(`  Add ${envVar} to the "${name}" server's "env" section in .mcp.json`)
    ctx.warnings++
    return
  }

  const val = envSection[envVar]
  const isPlaceholder =
    typeof val === 'string' &&
    (val.includes('your-') || val.includes('YOUR_') || val === '' || val === 'placeholder')

  if (isPlaceholder) {
    warn(`${name}: ${envVar} appears to be a placeholder — update with real credentials`)
    info(`  Replace the placeholder value for ${envVar} in .mcp.json with your actual credential`)
    ctx.warnings++
  } else {
    ok(`${name}: ${envVar} configured`)
  }
}

/**
 * Deep MCP health checks — validates server config completeness.
 */
function checkMcpHealth(targetDir, ctx) {
  console.log(`\n${style.bold(`${emoji.mcp}MCP Health (Deep):`)}`)
  const mcpPath = join(targetDir, '.mcp.json')

  if (!existsSync(mcpPath)) {
    warn('Cannot perform deep MCP check — .mcp.json not found')
    ctx.warnings++
    return
  }

  let mcpData
  try {
    mcpData = JSON.parse(readFileSync(mcpPath, 'utf-8'))
  } catch {
    fail('.mcp.json is not valid JSON')
    ctx.total++
    return
  }

  const servers = mcpData.mcpServers || {}

  for (const [name, checks] of Object.entries(MCP_SERVER_CHECKS)) {
    if (!(name in servers)) continue
    checkServerStructure(name, servers[name], checks, ctx)
    if (checks.requiredEnv) {
      const envSection = servers[name].env || {}
      for (const envVar of checks.requiredEnv) {
        checkEnvVar(name, envVar, envSection, ctx)
      }
    }
  }
}

/**
 * Check .claude/settings.local.json permissions.
 */
function checkPermissions(targetDir, ctx) {
  const settingsPath = join(targetDir, '.claude', 'settings.local.json')

  if (!existsSync(settingsPath)) {
    ctx.warnCheck(
      false,
      '',
      '.claude/settings.local.json not found' +
        ' — run `npx sparq-assistant init` for permissions setup',
      {
        type: 'generate-permissions',
        targetDir,
        label: 'Generate permission settings',
      },
    )
    return
  }

  try {
    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'))
    const allowRules = settings?.permissions?.allow
    ctx.warnCheck(
      Array.isArray(allowRules) && allowRules.length > 0,
      'settings.local.json has permission rules',
      'settings.local.json has no permission allow rules',
    )
  } catch {
    warn('.claude/settings.local.json is not valid JSON')
    ctx.warnings++
  }
}

/**
 * Create the doctor context object with check/warnCheck helpers.
 */
function createDoctorContext() {
  const ctx = {
    pass: 0,
    total: 0,
    warnings: 0,
    fixes: [],
    check(condition, passMsg, failMsg, fixAction) {
      ctx.total++
      if (condition) {
        ok(passMsg)
        ctx.pass++
      } else {
        fail(failMsg)
        if (fixAction) {
          ctx.fixes.push(fixAction)
          info('  Auto-fixable with --fix')
        }
      }
    },
    warnCheck(condition, passMsg, warnMsg, fixAction) {
      if (condition) {
        ok(passMsg)
      } else {
        warn(warnMsg)
        ctx.warnings++
        if (fixAction) {
          ctx.fixes.push(fixAction)
          info('  Auto-fixable with --fix')
        }
      }
    },
  }
  return ctx
}

/**
 * Check that all agent files are installed.
 */
function checkAgents(targetDir, ctx) {
  const targetAgentsDir = join(targetDir, '.claude', 'agents')
  for (const agent of AGENT_NAMES) {
    ctx.check(
      existsSync(join(targetAgentsDir, agent)),
      `Agent: ${agent}`,
      `Agent missing: ${agent}`,
      {
        type: 'copy-file',
        src: join(PKG_AGENTS_DIR, agent),
        dest: join(targetAgentsDir, agent),
        label: `Reinstall agent: ${agent}`,
      },
    )
  }
}

/**
 * Check that all skill directories are installed.
 */
function checkSkills(targetDir, ctx) {
  const pkgSkills = listDirs(PKG_SKILLS_DIR)
  const targetSkillsDir = join(targetDir, '.claude', 'skills')
  if (pkgSkills.length === 0) {
    info('No skill directories to check (package has none).')
    return
  }
  // Skip the wrong framework's best-practices skill — only one should be installed
  const framework = getConfigFramework(targetDir)
  const skip =
    framework === 'cypress'
      ? new Set(['sparq-playwright-best-practices'])
      : new Set(['sparq-cypress-best-practices'])
  for (const skill of pkgSkills) {
    if (skip.has(skill)) continue
    ctx.check(
      existsSync(join(targetSkillsDir, skill)),
      `Skill: ${skill}/`,
      `Skill missing: ${skill}/`,
      {
        type: 'copy-dir',
        src: join(PKG_SKILLS_DIR, skill),
        dest: join(targetSkillsDir, skill),
        label: `Reinstall skill: ${skill}`,
      },
    )
  }
}

/**
 * Check that output directories exist.
 */
function checkOutputDirs(targetDir, ctx) {
  console.log(`\n${style.bold(`${emoji.directories}Output Directories:`)}`)
  for (const dir of SPARQ_OUTPUT_DIRS) {
    ctx.warnCheck(
      existsSync(join(targetDir, dir)),
      `${dir} exists`,
      `${dir} not found — run \`npx sparq-assistant init\` to create`,
      {
        type: 'mkdir',
        path: join(targetDir, dir),
        label: `Create directory: ${dir}`,
      },
    )
  }
}

/**
 * Display the doctor summary banner.
 */
function displaySummary(ctx, options) {
  const icon =
    ctx.pass === ctx.total
      ? `${emoji.doctorPass}PASS`
      : ctx.pass > 0
        ? `${emoji.doctorWarn}WARN`
        : `${emoji.doctorFail}FAIL`
  const colorName = ctx.pass === ctx.total ? 'green' : ctx.pass > 0 ? 'yellow' : 'red'
  const passLine = `  ${icon}  ${ctx.pass}/${ctx.total} checks passed`
  const warnText =
    ctx.warnings > 0 ? ` · ${ctx.warnings} warning${ctx.warnings > 1 ? 's' : ''}` : ''
  const fixText = ctx.fixes.length > 0 && !options.fix ? ` · ${ctx.fixes.length} auto-fixable` : ''

  console.log()
  console.log(style.colored(['bold', colorName], `  ${'─'.repeat(50)}`))
  console.log(style.colored(['bold', colorName], `${passLine}${warnText}${fixText}`))
  console.log(style.colored(['bold', colorName], `  ${'─'.repeat(50)}`))
  console.log()

  if (ctx.fixes.length > 0 && !options.fix) {
    info(`${ctx.fixes.length} issue(s) can be auto-fixed. Run: npx sparq-assistant doctor --fix`)
  }
}

/**
 * Apply a single fix action. Returns true if applied successfully.
 */
async function applySingleFix(fix) {
  switch (fix.type) {
    case 'copy-file': {
      const dir = dirname(fix.dest)
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
      copyFileSync(fix.src, fix.dest)
      ok(fix.label)
      return true
    }
    case 'copy-dir': {
      cpSync(fix.src, fix.dest, { recursive: true })
      ok(fix.label)
      return true
    }
    case 'mkdir': {
      mkdirSync(fix.path, { recursive: true })
      ok(fix.label)
      return true
    }
    case 'append-gitignore': {
      const content = existsSync(fix.path) ? readFileSync(fix.path, 'utf-8') : ''
      if (!content.includes(fix.entry)) {
        const newline = content.endsWith('\n') || content === '' ? '' : '\n'
        appendFileSync(fix.path, `${newline}${fix.entry}\n`)
      }
      ok(fix.label)
      return true
    }
    case 'generate-permissions': {
      const { generatePermissions } = await import('../permissions.mjs')
      generatePermissions(fix.targetDir)
      ok(fix.label)
      return true
    }
    case 'install-hooks': {
      installHooks(fix.targetDir, { update: true })
      ok(fix.label)
      return true
    }
    default:
      warn(`Unknown fix type: ${fix.type}`)
      return false
  }
}

/**
 * Apply all queued fixes (or print dry-run summary).
 */
async function applyFixes(ctx) {
  console.log()
  heading(`${emoji.config}Applying fixes...`)
  if (isDryRun()) {
    info(`Would apply ${ctx.fixes.length} fix(es) (dry-run mode)`)
    for (const fix of ctx.fixes) info(`  ${fix.label}`)
    return
  }
  let applied = 0
  for (const fix of ctx.fixes) {
    try {
      const success = await applySingleFix(fix)
      if (success) applied++
    } catch (err) {
      fail(`${fix.label}: ${err.message}`)
    }
  }
  console.log()
  info(`${applied}/${ctx.fixes.length} fix(es) applied. Re-run doctor to verify.`)
}

/**
 * Check hooks health and report issues to doctor context.
 */
function checkHooksHealth(effectiveDir, ctx) {
  const hookResult = checkHooks(effectiveDir)
  if (hookResult.ok) {
    ctx.check(true, 'Hook scripts installed and configured')
    return
  }
  for (const issue of hookResult.issues) {
    ctx.warnCheck(false, '', issue, {
      type: 'install-hooks',
      targetDir: effectiveDir,
      label: 'Install hook scripts',
    })
  }
}

/**
 * Check platform extras health and report issues to doctor context.
 */
function checkPlatformHealth(effectiveDir, ctx) {
  const platforms = detectPlatforms(effectiveDir)
  const label = platforms.length > 0 ? platforms.join(', ') : 'claude'
  console.log(`\n${style.bold(`${emoji.config}Platform (${label}):`)}`)
  const platformResult = checkPlatformExtras(effectiveDir, platforms)
  if (platformResult.ok) {
    ok('Platform extras OK')
    return
  }
  for (const issue of platformResult.issues) {
    ctx.warnCheck(false, '', issue)
  }
}

export async function cmdDoctor(targetDir, options = {}) {
  // When --workspace is given, check the workspace subdirectory but note it
  const workspacePath = options.workspace ? join(targetDir, options.workspace) : null
  const effectiveDir = workspacePath ?? targetDir

  if (workspacePath) {
    heading(`${emoji.doctor}SparQ QA Assistant — Doctor (workspace: ${options.workspace})`)
  } else {
    heading(`${emoji.doctor}SparQ QA Assistant — Doctor`)
  }

  const ctx = createDoctorContext()

  // Node.js version check
  const nodeMajor = parseInt(process.versions.node, 10)
  ctx.check(
    nodeMajor >= 22,
    `Node.js version ${process.versions.node} (>= 22 required)`,
    `Node.js ${process.versions.node} is below minimum v22 — upgrade Node.js`,
  )

  const claudeDir = join(effectiveDir, '.claude')
  ctx.check(
    existsSync(claudeDir),
    '.claude/ directory exists',
    '.claude/ directory not found — run `npx sparq-assistant init`',
  )

  checkAgents(effectiveDir, ctx)
  checkSkills(effectiveDir, ctx)
  checkMcpServers(effectiveDir, ctx)
  checkConfig(effectiveDir, ctx)
  checkE2ESetup(effectiveDir, ctx)
  checkOutputDirs(effectiveDir, ctx)
  checkGitignore(effectiveDir, ctx)
  checkPermissions(effectiveDir, ctx)

  checkHooksHealth(effectiveDir, ctx)
  checkPlatformHealth(effectiveDir, ctx)

  if (options.deep) {
    checkMcpHealth(effectiveDir, ctx)
  }

  displaySummary(ctx, options)

  if (workspacePath) {
    console.log(`  ${style.dim(`Workspace checked: ${options.workspace}`)}`)
  }

  if (ctx.fixes.length > 0 && options.fix) {
    await applyFixes(ctx)
  }

  return ctx.pass === ctx.total
}
