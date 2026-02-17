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

export const VERSION = JSON.parse(readFileSync(join(PKG_ROOT, 'package.json'), 'utf-8')).version

export const SPARQ_HEADING = '## SparQ QA Assistant'

export const AGENT_NAMES = Object.freeze([
  'sparq-automation-engineer.md',
  'sparq-manual-test-writer.md',
  'sparq-orchestrator.md',
  'sparq-requirements-analyst.md',
  'sparq-test-validator.md',
])

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
 * Build stack description lines from detected tech stack and E2E config.
 */
function buildStackLines(techStack, e2eConfig) {
  const lines = []
  if (techStack?.framework) {
    const ver = techStack.frameworkVersion ? ` ${techStack.frameworkVersion}` : ''
    const exts = techStack.componentFileExtensions?.join(', ') || ''
    lines.push(`- Framework: ${techStack.framework}${ver} | Component files: ${exts}`)
  }
  if (techStack?.sourceRoot || techStack?.routeDiscoveryPattern) {
    const src = techStack.sourceRoot || 'src'
    const route = techStack.routeDiscoveryPattern || '**/route*/**/*.ts'
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
 * Generate context-aware rule file content with detected project stack info.
 * Falls back to SPARQ_RULE_CONTENT if no detection results are provided.
 */
export function generateRuleContent(techStack, e2eConfig) {
  if (!techStack && !e2eConfig) return SPARQ_RULE_CONTENT

  const lines = ['# SparQ QA Assistant', '', 'Config: `sparq.config.json` | Output: `.sparq/`']
  const stackLines = buildStackLines(techStack, e2eConfig)

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
  eval: 'Run prompt evaluation cases — score agent outputs against rubrics',
  improve: 'Run bounded improvement loop: eval strict -> improve status',
  baseline: 'Promote baselines after strict pass streak policy',
  tune: 'Optimize agent prompts for a model tier\n            (premium, balanced, economy)',
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
// Model Tier Optimization
// ---------------------------------------------------------------------------

export const MODEL_TIER_MAP = Object.freeze({
  premium: Object.freeze({
    orchestrator: 'opus',
    'requirements-analyst': 'opus',
    'manual-test-writer': 'sonnet',
    'automation-engineer': 'opus',
    'test-validator': 'sonnet',
  }),
  balanced: Object.freeze({
    orchestrator: 'sonnet',
    'requirements-analyst': 'sonnet',
    'manual-test-writer': 'sonnet',
    'automation-engineer': 'sonnet',
    'test-validator': 'sonnet',
  }),
  economy: Object.freeze({
    orchestrator: 'haiku',
    'requirements-analyst': 'haiku',
    'manual-test-writer': 'haiku',
    'automation-engineer': 'haiku',
    'test-validator': 'haiku',
  }),
})

export const TUNE_BUDGET = Object.freeze({
  layerOneMax: 30,
  layerTwoMax: 80,
  agentTotalMax: 450,
  maxRefineRounds: 3,
})
