#!/usr/bin/env node

// SparQ QA Assistant — CLI Installer
// Usage: npx sparq-assistant <init|update|uninstall|doctor|help> [target-dir] [--non-interactive|--ci|--dry-run|--force|--quiet|--verbose|--version|-v]

import { parseArgs } from './lib/args.mjs'
import { cmdAudit } from './lib/commands/audit.mjs'
import { cmdClean } from './lib/commands/clean.mjs'
import { cmdCoverage } from './lib/commands/coverage.mjs'
import { cmdDoctor } from './lib/commands/doctor.mjs'
import { cmdHelp, cmdHelpCommand } from './lib/commands/help.mjs'
import { cmdInit } from './lib/commands/init.mjs'
import { cmdLint } from './lib/commands/lint.mjs'
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
import { checkForUpdate, showUpdateNotification } from './lib/update-check.mjs'

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
process.on('unhandledRejection', (reason) => {
  fail(`Unhandled error: ${reason instanceof Error ? reason.message : String(reason)}`)
  info(
    `Run with --verbose for full details, or report at https://github.com/STUkh/sparq-assistant/issues`,
  )
  // Defer exit by one microtask tick so finally blocks (e.g. releaseLock) can complete
  setImmediate(() => process.exit(EXIT_GENERAL))
})
process.on('uncaughtException', (err) => {
  fail(`Uncaught exception: ${err.message}`)
  info(
    `Run with --verbose for full details, or report at https://github.com/STUkh/sparq-assistant/issues`,
  )
  setImmediate(() => process.exit(EXIT_GENERAL))
})

// ---------------------------------------------------------------------------
// Flag Validation
// ---------------------------------------------------------------------------

function validateFlags({
  quiet,
  verbose,
  defaults,
  nonInteractive,
  showVersion,
  showHelp,
  noColor,
}) {
  // Apply --no-color early — styleText checks NO_COLOR at call time
  if (noColor) process.env.NO_COLOR = '1'
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
      workspace: parsed.workspace,
    }),
  update: async (parsed) =>
    cmdUpdate(parsed.targetDir, {
      nonInteractive: parsed.nonInteractive,
      force: parsed.force,
      only: parsed.only,
      skip: parsed.skip,
    }),
  uninstall: async (parsed) =>
    cmdUninstall(parsed.targetDir, {
      force: parsed.force,
      nonInteractive: parsed.nonInteractive,
    }),
  clean: async (parsed) =>
    cmdClean(parsed.targetDir, {
      all: parsed.all,
      olderThan: parsed.olderThan,
      type: parsed.type,
      force: parsed.force,
      nonInteractive: parsed.nonInteractive,
    }),
  doctor: async (parsed) => {
    if (
      !(await cmdDoctor(parsed.targetDir, {
        deep: parsed.deep,
        fix: parsed.fix,
        workspace: parsed.workspace,
      }))
    ) {
      process.exit(EXIT_GENERAL)
    }
  },
  audit: async (parsed) => {
    if (
      !(await cmdAudit(parsed.targetDir, {
        fix: parsed.fix,
        json: parsed.json,
        strict: parsed.strict,
      }))
    ) {
      process.exit(EXIT_GENERAL)
    }
  },
  lint: async (parsed) => {
    if (
      !(await cmdLint(parsed.targetDir, {
        strict: parsed.strict,
        threshold: parsed.threshold,
        format: parsed.format,
        coverageGate: parsed.coverageGate,
        workspace: parsed.workspace,
        allWorkspaces: parsed.allWorkspaces,
      }))
    ) {
      process.exit(EXIT_GENERAL)
    }
  },
  coverage: async (parsed) => {
    if (
      !(await cmdCoverage(parsed.targetDir, {
        format: parsed.format,
        threshold: parsed.threshold,
        workspace: parsed.workspace,
      }))
    ) {
      process.exit(EXIT_GENERAL)
    }
  },
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
// Update Check Guard
// ---------------------------------------------------------------------------

function shouldCheckForUpdate(parsed) {
  return (
    !parsed.noUpdateCheck &&
    !process.env.SPARQ_NO_UPDATE_CHECK &&
    !process.env.CI &&
    !parsed.showVersion &&
    !parsed.showHelp
  )
}

// ---------------------------------------------------------------------------
// Main (#3, #6)
// ---------------------------------------------------------------------------

async function main() {
  const parsed = parseArgs(process.argv)
  const { quiet, verbose } = parsed

  validateFlags(parsed)

  // Per-command unknown flag validation
  if (parsed.unknownFlags.length > 0) {
    for (const flag of parsed.unknownFlags) {
      const prefix = flag.short ? '-' : '--'
      let msg = `Unknown flag for '${parsed.command ?? 'sparq'}': ${prefix}${flag.name}`
      if (flag.suggestion) msg += `. Did you mean --${flag.suggestion}?`
      fail(msg)
    }
    process.exit(EXIT_USAGE)
  }

  // (#31) Set verbosity
  if (quiet) setVerbosity('quiet')
  else if (verbose) setVerbosity('verbose')

  // Set global dry-run flag
  setDryRun(parsed.dryRun)
  if (parsed.dryRun) {
    console.log(`${style.boldYellow(`  ${emoji.dryRun}DRY RUN MODE — no files will be written`)}\n`)
  }

  // Fire-and-forget update check (non-blocking)
  const doCheck = shouldCheckForUpdate(parsed)
  if (doCheck) checkForUpdate().catch(() => {})

  await runCommand(parsed)

  // Show notification after command completes
  if (doCheck) showUpdateNotification(VERSION, { command: parsed.command })
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
