#!/usr/bin/env node

// SparQ QA Assistant — CLI Installer
// Usage: npx sparq-assistant <init|update|uninstall|doctor|help> [target-dir] [--non-interactive|--ci|--dry-run|--force|--quiet|--verbose|--version|-v]

import { parseArgs } from './lib/args.mjs'
import { cmdAudit } from './lib/commands/audit.mjs'
import { cmdBaseline } from './lib/commands/baseline.mjs'
import { cmdClean } from './lib/commands/clean.mjs'
import { cmdDoctor } from './lib/commands/doctor.mjs'
import { cmdEval } from './lib/commands/eval.mjs'
import { cmdHelp, cmdHelpCommand } from './lib/commands/help.mjs'
import { cmdImprove } from './lib/commands/improve.mjs'
import { cmdInit } from './lib/commands/init.mjs'
import { cmdTune } from './lib/commands/tune.mjs'
import { cmdUninstall } from './lib/commands/uninstall.mjs'
import { cmdUpdate } from './lib/commands/update.mjs'
import { COMMANDS, EXIT_GENERAL, EXIT_SUCCESS, EXIT_USAGE, VERSION } from './lib/constants.mjs'
import {
  emoji,
  fail,
  getVerbosity,
  setDryRun,
  setInterrupted,
  setVerbosity,
  style,
} from './lib/state.mjs'

// ---------------------------------------------------------------------------
// Signal Handling (#17)
// ---------------------------------------------------------------------------

function shutdown(label) {
  setInterrupted(true)
  console.log(`\n  ${style.yellow(`${emoji.interrupted}${label}. Cleaning up...`)}`)
  process.exit(EXIT_GENERAL)
}

process.on('SIGINT', () => shutdown('Interrupted'))
process.on('SIGTERM', () => shutdown('Terminated'))

// ---------------------------------------------------------------------------
// Flag Validation
// ---------------------------------------------------------------------------

function validateFlags({ quiet, verbose, defaults, nonInteractive, showVersion, showHelp }) {
  if (showVersion) {
    console.log(VERSION)
    process.exit(EXIT_SUCCESS)
  }
  if (showHelp) {
    cmdHelp()
    process.exit(EXIT_SUCCESS)
  }
  if (quiet && verbose) {
    fail('Cannot use --quiet and --verbose together.')
    process.exit(EXIT_USAGE)
  }
  if (defaults && nonInteractive) {
    fail('Cannot use --defaults and --non-interactive together.')
    process.exit(EXIT_USAGE)
  }
}

const COMMAND_HANDLERS = {
  init: async (parsed) =>
    cmdInit(parsed.targetDir, {
      nonInteractive: parsed.nonInteractive,
      defaults: parsed.defaults,
      features: parsed.features,
      ciProvider: parsed.ciProvider,
    }),
  update: async (parsed) =>
    cmdUpdate(parsed.targetDir, {
      nonInteractive: parsed.nonInteractive,
      force: parsed.force,
      only: parsed.only,
      skip: parsed.skip,
    }),
  uninstall: async (parsed) =>
    cmdUninstall(parsed.targetDir, { force: parsed.force, nonInteractive: parsed.nonInteractive }),
  clean: async (parsed) =>
    cmdClean(parsed.targetDir, {
      all: parsed.all,
      olderThan: parsed.olderThan,
      type: parsed.type,
      force: parsed.force,
      nonInteractive: parsed.nonInteractive,
    }),
  doctor: async (parsed) => {
    if (!(await cmdDoctor(parsed.targetDir, { deep: parsed.deep, fix: parsed.fix }))) {
      process.exit(EXIT_GENERAL)
    }
  },
  audit: async (parsed) =>
    cmdAudit(parsed.targetDir, {
      fix: parsed.fix,
      json: parsed.json,
    }),
  eval: async (parsed) =>
    cmdEval({
      caseName: parsed.evalCaseName,
      all: parsed.all,
      model: parsed.model ?? 'mock',
      yes: parsed.yes,
      audit: parsed.audit,
      trends: parsed.trends,
      project: parsed.project ?? undefined,
      strict: parsed.strict,
      allowSkips: parsed.allowSkips,
      noClean: parsed.noClean,
      artifactRoot: parsed.artifactRoot ?? undefined,
    }),
  improve: async (parsed) =>
    cmdImprove({
      caseName: parsed.improveCaseName,
      all: parsed.all,
      model: parsed.model ?? undefined,
      project: parsed.project ?? undefined,
      strict: parsed.strict,
      allowSkips: parsed.allowSkips,
      maxIterations: parsed.maxIterations ?? undefined,
      artifactRoot: parsed.artifactRoot ?? undefined,
    }),
  baseline: async (parsed) =>
    cmdBaseline({
      action: parsed.baselineAction,
      caseName: parsed.baselineCaseName,
      all: parsed.all,
      model: parsed.model ?? undefined,
    }),
  tune: async (parsed) =>
    cmdTune({
      targetDir: parsed.targetDir,
      subcommand: parsed.subcommand,
      tier: parsed.tier,
      force: parsed.force,
      nonInteractive: parsed.nonInteractive,
    }),
  help: async (parsed) => {
    if (parsed.advanced || parsed.subcommand === 'advanced') {
      cmdHelp({ advanced: true })
      return
    }
    if (parsed.subcommand) cmdHelpCommand(parsed.subcommand)
    else cmdHelp()
  },
}

async function runCommand(parsed) {
  const handler = COMMAND_HANDLERS[parsed.command]
  if (handler) {
    await handler(parsed)
    return
  }

  if (parsed.command === undefined) {
    console.log(`\n  ${style.red(`${emoji.interrupted}No command specified.`)}`)
    cmdHelp()
    process.exit(EXIT_USAGE)
    return
  }

  console.log(`\n  ${style.red(`${emoji.interrupted}Unknown command: ${parsed.command}`)}`)
  const known = Object.keys(COMMANDS)
  const suggestion = known.find((key) => key.startsWith(parsed.command.slice(0, 3)))
  if (suggestion) console.log(`  Did you mean ${style.bold(suggestion)}?`)
  cmdHelp()
  process.exit(EXIT_USAGE)
}

// ---------------------------------------------------------------------------
// Main (#3, #6)
// ---------------------------------------------------------------------------

async function main() {
  const parsed = parseArgs(process.argv)
  const { quiet, verbose } = parsed

  validateFlags(parsed)

  // (#31) Set verbosity
  if (quiet) setVerbosity('quiet')
  else if (verbose) setVerbosity('verbose')

  // Set global dry-run flag
  setDryRun(parsed.dryRun)
  if (parsed.dryRun) {
    console.log(`${style.boldYellow(`  ${emoji.dryRun}DRY RUN MODE — no files will be written`)}\n`)
  }

  await runCommand(parsed)
}

main().catch((err) => {
  fail(`Unexpected error: ${err.message}`)
  if (getVerbosity() === 'verbose' && err.stack) {
    console.log(`  ${style.dim(err.stack.split('\n').slice(1).join('\n  '))}`)
  } else if (err.stack) {
    console.log(`  ${style.dim(err.stack.split('\n').slice(1, 3).join('\n  '))}`)
  }
  process.exit(EXIT_GENERAL)
})
