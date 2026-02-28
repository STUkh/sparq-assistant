// bin/lib/args.mjs — Argument parsing

import { resolve } from 'node:path'
import { parseArgs as nodeParseArgs } from 'node:util'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseOlderThan(raw) {
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) {
    if (raw != null)
      console.error(
        `Warning: Invalid --older-than value '${raw}' (must be a positive number), ignoring`,
      )
    return null
  }
  return n
}

function parseCsvList(raw) {
  if (!raw) return null
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

const COMMANDS_WITH_TARGET_DIR = new Set([
  'init',
  'update',
  'uninstall',
  'clean',
  'doctor',
  'audit',
  'lint',
  'coverage',
])

function resolveTargetDir(command, positionals) {
  const targetArg = COMMANDS_WITH_TARGET_DIR.has(command) ? positionals[1] : null
  return targetArg ? resolve(targetArg) : process.cwd()
}

function deriveCommandContext(command, positionals) {
  const context = { subcommand: null }

  if (command === 'help') {
    context.subcommand = positionals[1]?.toLowerCase()
  }

  return context
}

// ---------------------------------------------------------------------------
// Known Options
// ---------------------------------------------------------------------------

const KNOWN_OPTIONS = {
  'non-interactive': { type: 'boolean', default: false },
  ci: { type: 'boolean', default: false },
  'dry-run': { type: 'boolean', default: false },
  force: { type: 'boolean', default: false },
  quiet: { type: 'boolean', short: 'q', default: false },
  verbose: { type: 'boolean', default: false },
  version: { type: 'boolean', short: 'v', default: false },
  help: { type: 'boolean', short: 'h', default: false },
  features: { type: 'string' },
  type: { type: 'string' },
  'older-than': { type: 'string' },
  all: { type: 'boolean', default: false },
  defaults: { type: 'boolean', default: false },
  fix: { type: 'boolean', default: false },
  deep: { type: 'boolean', default: false },
  only: { type: 'string' },
  skip: { type: 'string' },
  'ci-provider': { type: 'string' },
  advanced: { type: 'boolean', default: false },
  strict: { type: 'boolean', default: false },
  threshold: { type: 'string' },
  json: { type: 'boolean', default: false },
  'no-update-check': { type: 'boolean', default: false },
  'no-color': { type: 'boolean', default: false },
  workspace: { type: 'string' },
  'all-workspaces': { type: 'boolean', default: false },
  format: { type: 'string' },
  'coverage-gate': { type: 'string' },
}

// ---------------------------------------------------------------------------
// Per-Command Flag Validation
// ---------------------------------------------------------------------------

const GLOBAL_FLAGS = new Set(['quiet', 'verbose', 'help', 'version', 'no-update-check'])

const COMMAND_FLAGS = Object.freeze({
  init: new Set([
    'non-interactive',
    'ci',
    'dry-run',
    'force',
    'features',
    'ci-provider',
    'defaults',
    'workspace',
    'all-workspaces',
  ]),
  update: new Set(['non-interactive', 'ci', 'dry-run', 'force', 'only', 'skip']),
  uninstall: new Set(['non-interactive', 'ci', 'dry-run', 'force']),
  clean: new Set(['non-interactive', 'ci', 'dry-run', 'force', 'all', 'type', 'older-than']),
  doctor: new Set(['dry-run', 'deep', 'fix', 'workspace', 'all-workspaces']),
  audit: new Set(['dry-run', 'fix', 'json', 'strict']),
  lint: new Set(['strict', 'threshold', 'workspace', 'all-workspaces', 'format', 'coverage-gate']),
  coverage: new Set(['format', 'threshold', 'workspace', 'quiet']),
  help: new Set(['advanced']),
})

/**
 * Levenshtein edit distance between two strings.
 */
function levenshtein(a, b) {
  const m = a.length
  const n = b.length
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1))
  for (let i = 0; i <= m; i++) dp[i][0] = i
  for (let j = 0; j <= n; j++) dp[0][j] = j
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
    }
  }
  return dp[m][n]
}

/**
 * Suggest the closest valid flag for a mistyped one.
 */
function suggestFlag(flag, validFlags) {
  let best = null
  let bestDist = 4
  for (const valid of validFlags) {
    const dist = levenshtein(flag, valid)
    if (dist < bestDist) {
      bestDist = dist
      best = valid
    }
  }
  return best
}

// ---------------------------------------------------------------------------
// CLI Argument Parsing
// ---------------------------------------------------------------------------

/**
 * Classify a single option token as valid or unknown.
 * Returns an unknown-flag descriptor, or null if the flag is valid.
 */
function classifyFlag(name, knownShort, knownLong, commandSet) {
  if (name.length === 1) {
    return knownShort.has(name) ? null : { name, short: true }
  }
  if (GLOBAL_FLAGS.has(name)) return null
  if (commandSet) {
    if (commandSet.has(name)) return null
    const allValid = new Set([...GLOBAL_FLAGS, ...commandSet])
    return { name, short: false, suggestion: suggestFlag(name, allValid) }
  }
  return knownLong.has(name) ? null : { name, short: false }
}

/**
 * Validate flags against per-command allowlists.
 * Returns an array of unknown flag names (empty if all valid).
 */
export function validateCommandFlags(tokens, command) {
  const knownLong = new Set(Object.keys(KNOWN_OPTIONS))
  const knownShort = new Set()
  for (const opts of Object.values(KNOWN_OPTIONS)) {
    if (opts.short) knownShort.add(opts.short)
  }

  const commandSet = COMMAND_FLAGS[command]
  const unknown = []
  const seen = new Set()

  for (const token of tokens) {
    if (token.kind !== 'option') continue
    if (seen.has(token.name)) continue
    seen.add(token.name)

    const result = classifyFlag(token.name, knownShort, knownLong, commandSet)
    if (result) unknown.push(result)
  }

  return unknown
}

/**
 * Parse CLI arguments into { command, targetDir, nonInteractive, dryRun, force, quiet, verbose, showVersion, showHelp }.
 */
export function parseArgs(argv) {
  const { values, positionals, tokens } = nodeParseArgs({
    args: argv.slice(2),
    options: KNOWN_OPTIONS,
    strict: false,
    allowPositionals: true,
    tokens: true,
  })

  const command = positionals[0]?.toLowerCase()
  const unknownFlags = validateCommandFlags(tokens, command)
  const targetDir = resolveTargetDir(command, positionals)
  const { subcommand } = deriveCommandContext(command, positionals)

  return {
    command,
    subcommand,
    targetDir,
    nonInteractive: values['non-interactive'] || values.ci || !!process.env.CI,
    dryRun: values['dry-run'],
    force: values.force,
    quiet: values.quiet,
    verbose: values.verbose,
    showVersion: values.version,
    showHelp: values.help,
    features: parseCsvList(values.features),
    type: values.type || null,
    olderThan: values['older-than'] ? parseOlderThan(values['older-than']) : null,
    all: values.all,
    deep: values.deep,
    only: parseCsvList(values.only),
    skip: parseCsvList(values.skip),
    ciProvider: values['ci-provider'] || null,
    defaults: values.defaults,
    fix: values.fix,
    advanced: values.advanced,
    strict: values.strict,
    threshold: values.threshold ?? null,
    json: values.json,
    noUpdateCheck: values['no-update-check'],
    noColor: values['no-color'],
    workspace: values.workspace || null,
    allWorkspaces: values['all-workspaces'],
    format: values.format || null,
    coverageGate: values['coverage-gate'] ?? null,
    unknownFlags,
  }
}
