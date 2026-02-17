// bin/lib/args.mjs — Argument parsing

import { resolve } from 'node:path'
import { parseArgs as nodeParseArgs } from 'node:util'
import { warn } from './state.mjs'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseOlderThan(raw) {
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return null
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
])

function resolveTargetDir(command, positionals, values) {
  if (command === 'tune' && values?.project) {
    return resolve(values.project)
  }
  const targetArg = COMMANDS_WITH_TARGET_DIR.has(command) ? positionals[1] : null
  return targetArg ? resolve(targetArg) : process.cwd()
}

function deriveCommandContext(command, positionals) {
  const context = {
    subcommand: null,
    evalCaseName: null,
    improveCaseName: null,
    baselineAction: null,
    baselineCaseName: null,
    tier: null,
  }

  if (command === 'help') {
    context.subcommand = positionals[1]?.toLowerCase()
    return context
  }

  if (command === 'eval') {
    context.evalCaseName = positionals[1]
    context.subcommand = context.evalCaseName
    return context
  }

  if (command === 'improve') {
    context.improveCaseName = positionals[1]
    context.subcommand = context.improveCaseName
    return context
  }

  if (command === 'baseline') {
    context.baselineAction = positionals[1]?.toLowerCase()
    context.baselineCaseName = positionals[2]
    context.subcommand = context.baselineAction
    return context
  }

  if (command === 'tune') {
    context.subcommand = positionals[1]?.toLowerCase()
    context.tier = positionals[2]?.toLowerCase()
    return context
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
  model: { type: 'string' },
  yes: { type: 'boolean', default: false },
  audit: { type: 'boolean', default: false },
  trends: { type: 'boolean', default: false },
  project: { type: 'string' },
  advanced: { type: 'boolean', default: false },
  strict: { type: 'boolean', default: true },
  'allow-skips': { type: 'boolean', default: false },
  'no-clean': { type: 'boolean', default: false },
  'artifact-root': { type: 'string' },
  'max-iterations': { type: 'string' },
  json: { type: 'boolean', default: false },
}

// ---------------------------------------------------------------------------
// CLI Argument Parsing
// ---------------------------------------------------------------------------

/**
 * Detect and warn about unknown flags in parsed tokens.
 */
function warnUnknownFlags(tokens) {
  const knownLong = new Set(Object.keys(KNOWN_OPTIONS))
  const knownShort = new Set()
  for (const opts of Object.values(KNOWN_OPTIONS)) {
    if (opts.short) knownShort.add(opts.short)
  }
  const warned = new Set()
  for (const token of tokens) {
    if (token.kind !== 'option') continue
    if (knownLong.has(token.name) || knownShort.has(token.name)) continue
    if (warned.has(token.name)) continue
    warned.add(token.name)
    const prefix = token.name.length === 1 ? '-' : '--'
    warn(`Unknown flag: ${prefix}${token.name} (ignored)`)
  }
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

  warnUnknownFlags(tokens)

  const command = positionals[0]?.toLowerCase()
  const targetDir = resolveTargetDir(command, positionals, values)
  const { subcommand, evalCaseName, improveCaseName, baselineAction, baselineCaseName, tier } =
    deriveCommandContext(command, positionals)

  return {
    command,
    subcommand,
    evalCaseName,
    improveCaseName,
    baselineAction,
    baselineCaseName,
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
    model: values.model || null,
    yes: values.yes,
    audit: values.audit,
    trends: values.trends,
    project: values.project || null,
    advanced: values.advanced,
    strict: values.strict,
    allowSkips: values['allow-skips'],
    noClean: values['no-clean'],
    artifactRoot: values['artifact-root'] || null,
    maxIterations: values['max-iterations'] ? parseOlderThan(values['max-iterations']) : null,
    json: values.json,
    tier,
  }
}
