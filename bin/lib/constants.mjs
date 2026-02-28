// bin/lib/constants.mjs — Pure constants

import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

// ---------------------------------------------------------------------------
// Exit Codes (#20)
// ---------------------------------------------------------------------------

export const EXIT_SUCCESS = 0
export const EXIT_GENERAL = 1
export const EXIT_USAGE = 2
export const EXIT_FILESYSTEM = 3

// ---------------------------------------------------------------------------
// Constants & Paths
// ---------------------------------------------------------------------------

export const PKG_ROOT = resolve(import.meta.dirname, '..', '..')

export const PKG_AGENTS_DIR = join(PKG_ROOT, 'claude', 'agents')
export const PKG_SKILLS_DIR = join(PKG_ROOT, 'claude', 'skills')
export const PKG_TEMPLATES_DIR = join(PKG_ROOT, 'claude', 'templates')
export const PKG_MCP_DIR = join(PKG_ROOT, 'mcp')
export const PKG_HOOKS_DIR = join(PKG_ROOT, 'claude', 'hooks')

export const VERSION = JSON.parse(readFileSync(join(PKG_ROOT, 'package.json'), 'utf-8')).version

export const SPARQ_HEADING = '## SparQ QA Assistant'

export const SPARQ_LOGO = `   _____                  ____
  / ___/____  ____ ______/ __ \\
  \\__ \\/ __ \\/ __ \`/ ___/ / / /
 ___/ / /_/ / /_/ / /  / /_/ /
/____/ .___/\\__,_/_/   \\___\\_\\
     /_/  Spar[QA]ssistant`

export const AGENT_NAMES = Object.freeze([
  'sparq-automation-engineer.md',
  'sparq-manual-test-writer.md',
  'sparq-orchestrator.md',
  'sparq-requirements-analyst.md',
  'sparq-test-validator.md',
])

export const HOOK_FILES = Object.freeze(['sparq-stop-guard.mjs', 'sparq-pre-compact.mjs'])

export const SPARQ_OUTPUT_DIRS = Object.freeze([
  '.sparq/requirements',
  '.sparq/test-cases',
  '.sparq/parallel',
  '.sparq/coverage',
  '.sparq/validation',
  '.sparq/refresh',
  '.sparq/tracking',
  '.sparq/plans',
  '.sparq/plans/handoffs',
  '.sparq/plans/archive',
  '.sparq/prompts',
])

// Legacy CLAUDE.md block markers — kept for backward-compat uninstall migration
export const SPARQ_CLAUDE_BLOCK_START = '<!-- sparq-start -->'
export const SPARQ_CLAUDE_BLOCK_END = '<!-- sparq-end -->'

// Rule file installed to .claude/rules/ in target projects
export const SPARQ_RULE_FILE = 'sparq.md'
export const SPARQ_RULE_CONTENT = [
  '# SparQ QA Assistant',
  '',
  'Config: `sparq.config.json` | Output: `.sparq/`',
  '',
  'Use `/sparq:start` for guided workflows. Run `/sparq:init` to reconfigure.',
  '',
].join('\n')

/**
 * Build stack description lines from detected project config and E2E config.
 */
function buildStackLines(projectConfig, e2eConfig) {
  const lines = []
  if (projectConfig?.framework) {
    const ver = projectConfig.frameworkVersion ? ` ${projectConfig.frameworkVersion}` : ''
    const exts = projectConfig.componentFileExtensions?.join(', ') || ''
    lines.push(`- Framework: ${projectConfig.framework}${ver} | Component files: ${exts}`)
  }
  if (projectConfig?.sourceRoot || projectConfig?.routeDiscoveryPattern) {
    const src = projectConfig.sourceRoot || 'src'
    const route = projectConfig.routeDiscoveryPattern || '**/route*/**/*.ts'
    lines.push(`- Source root: ${src}/ | Routes: ${route}`)
  }
  if (e2eConfig?.framework) {
    const cfg = e2eConfig.configFile ? ` | Config: ${e2eConfig.configFile}` : ''
    lines.push(`- E2E: ${e2eConfig.framework}${cfg}`)
  }
  if (e2eConfig?.structure) {
    const dirs = Object.entries(e2eConfig.structure)
      .filter(([, v]) => v)
      .map(([k]) => k)
      .join(', ')
    if (dirs) lines.push(`- Structure: ${dirs}`)
  }
  if (e2eConfig?.baseClass) {
    lines.push(`- Base class: ${e2eConfig.baseClass}`)
  }
  return lines
}

/**
 * Generate context-aware rule file content with detected project config.
 * Falls back to SPARQ_RULE_CONTENT if no detection results are provided.
 */
export function generateRuleContent(projectConfig, e2eConfig) {
  if (!projectConfig && !e2eConfig) return SPARQ_RULE_CONTENT

  const lines = ['# SparQ QA Assistant', '', 'Config: `sparq.config.json` | Output: `.sparq/`']
  const stackLines = buildStackLines(projectConfig, e2eConfig)

  if (stackLines.length > 0) {
    lines.push('', '## Project Stack', ...stackLines)
  }

  lines.push(
    '',
    '## Selector Strategy',
    '- Priority: data-testid > role > label > text',
    "- Wrapped inputs: .locator('input') to drill into UI framework wrappers",
    "- Toasts/Dialogs: getByRole('alert'), getByRole('dialog')",
    '',
    'Use `/sparq:start` for guided workflows. Run `/sparq:init` to reconfigure.',
    '',
  )

  return lines.join('\n')
}

export const COMMANDS = Object.freeze({
  init: 'Interactive setup wizard — installs agents, skills,\n            templates, MCP configs, and generates sparq.config.json',
  update:
    'Re-install agent, skill, and template files\n            (overwrites existing, preserves config)',
  uninstall: 'Remove all SparQ files and configuration from a project',
  clean: 'Remove stale artifacts from .sparq/ output directories',
  doctor: 'Verify installation — checks all files and configs',
  audit: 'Assess prompt maturity — check testing architecture\n            in project AI prompts',
  lint: 'Lint generated E2E test files — check for flaky patterns,\n            selector quality, and format compliance',
  coverage: 'Compute requirement coverage from .sparq/ artifacts',
  help: 'Show this help message',
})

// Audit sentinel markers for @path reference block in .claude/rules/sparq.md
export const AUDIT_SENTINEL_START = '<!-- sparq-audit-start -->'
export const AUDIT_SENTINEL_END = '<!-- sparq-audit-end -->'

// Prompt maturity level names (index = level number)
export const MATURITY_LEVELS = Object.freeze([
  'Bare',
  'Scaffolded',
  'Partial',
  'Established',
  'Production-Ready',
])

export const MAX_RECURSION_DEPTH = 20
export const MAX_MIGRATION_ITERATIONS = 100

// ---------------------------------------------------------------------------
// Workspace Support
// ---------------------------------------------------------------------------

/**
 * Workspace config files use the same filename as the root config.
 * Each workspace directory may contain its own sparq.config.json
 * that overrides root-level settings for that package.
 */
export const SPARQ_WORKSPACE_CONFIG_FILE = 'sparq.config.json'

// ---------------------------------------------------------------------------
// Multi-Platform Support
// ---------------------------------------------------------------------------

// AGENTS.md sentinel markers for safe SparQ block update/removal
export const AGENTS_MD_BLOCK_START = '<!-- sparq-agents-start -->'
export const AGENTS_MD_BLOCK_END = '<!-- sparq-agents-end -->'

// Default output path for SARIF lint results (relative to project root)
export const SARIF_OUTPUT_PATH = '.sparq/lint-results.sarif'
