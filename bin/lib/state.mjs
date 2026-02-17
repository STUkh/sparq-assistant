// bin/lib/state.mjs — Shared state + styled output

import { styleText } from 'node:util'

// ---------------------------------------------------------------------------
// Mutable State (singleton)
// ---------------------------------------------------------------------------

let _verbosity = 'normal' // 'quiet' | 'normal' | 'verbose'
let _dryRun = false
let _interrupted = false

export const setVerbosity = (v) => {
  _verbosity = v
}
export const getVerbosity = () => _verbosity
export const setDryRun = (v) => {
  _dryRun = v
}
export const isDryRun = () => _dryRun
export const setInterrupted = (v) => {
  _interrupted = v
}
export const isInterrupted = () => _interrupted

/**
 * Reset all mutable state to defaults.
 * Intended for test teardown — ensures no state leaks between tests.
 */
export function resetState() {
  _verbosity = 'normal'
  _dryRun = false
  _interrupted = false
}

// ---------------------------------------------------------------------------
// Style Helpers
// ---------------------------------------------------------------------------

export const useColor = process.stdout.isTTY && !process.env.NO_COLOR

export const SYM_OK = useColor ? '\u2713' : '[OK]'
export const SYM_WARN = useColor ? '\u26A0' : '[WARN]'
export const SYM_FAIL = useColor ? '\u2717' : '[FAIL]'
export const SYM_INFO = useColor ? '\u2139' : '[INFO]'

// ---------------------------------------------------------------------------
// Emoji Icons (suppressed in non-TTY / NO_COLOR environments)
// ---------------------------------------------------------------------------

export const emoji = useColor
  ? Object.freeze({
      // Command headings
      init: '\u{1F680} ',
      update: '\u{1F504} ',
      uninstall: '\u{1F5D1}\uFE0F  ',
      clean: '\u{1F9F9} ',
      doctor: '\u{1FA7A} ',
      audit: '\u{1F50E} ',
      eval: '\u{1F9EA} ',
      improve: '\u{1F6E0}\uFE0F  ',
      baseline: '\u{1F3C1} ',
      help: '\u{1F4D6} ',
      // Step/phase icons
      agents: '\u{1F916} ',
      skills: '\u26A1 ',
      templates: '\u{1F4C4} ',
      config: '\u2699\uFE0F  ',
      directories: '\u{1F4C1} ',
      mcp: '\u{1F50C} ',
      detectE2e: '\u{1F50D} ',
      detectStack: '\u{1F527} ',
      permissions: '\u{1F510} ',
      claudeMd: '\u{1F4DD} ',
      manifest: '\u{1F4CB} ',
      gitignore: '\u{1F4CE} ',
      // Status
      complete: '\u{1F389} ',
      rollback: '\u23EA ',
      dryRun: '\u{1F3D7}\uFE0F  ',
      interrupted: '\u26D4 ',
      doctorPass: '\u2705 ',
      doctorWarn: '\u26A0\uFE0F  ',
      doctorFail: '\u274C ',
    })
  : Object.freeze({
      init: '',
      update: '',
      uninstall: '',
      clean: '',
      doctor: '',
      audit: '',
      eval: '',
      improve: '',
      baseline: '',
      help: '',
      agents: '',
      skills: '',
      templates: '',
      config: '',
      directories: '',
      mcp: '',
      detectE2e: '',
      detectStack: '',
      permissions: '',
      claudeMd: '',
      manifest: '',
      gitignore: '',
      complete: '',
      rollback: '',
      dryRun: '',
      interrupted: '',
      doctorPass: '',
      doctorWarn: '',
      doctorFail: '',
    })

export const style = {
  bold: (t) => styleText('bold', t),
  dim: (t) => styleText('dim', t),
  red: (t) => styleText('red', t),
  green: (t) => styleText('green', t),
  yellow: (t) => styleText('yellow', t),
  blue: (t) => styleText('blue', t),
  cyan: (t) => styleText('cyan', t),
  magenta: (t) => styleText('magenta', t),
  boldBlue: (t) => styleText(['bold', 'blue'], t),
  boldCyan: (t) => styleText(['bold', 'cyan'], t),
  boldYellow: (t) => styleText(['bold', 'yellow'], t),
  colored: (formats, t) => styleText(formats, t),
}

// ---------------------------------------------------------------------------
// Output Functions
// ---------------------------------------------------------------------------

export const ok = (msg) => {
  if (_verbosity !== 'quiet') console.log(`  ${style.green(SYM_OK)} ${msg}`)
}
export const warn = (msg) => console.log(`  ${style.yellow(SYM_WARN)} ${msg}`)
export const fail = (msg) => console.log(`  ${style.red(SYM_FAIL)} ${msg}`)
export const info = (msg) => {
  if (_verbosity !== 'quiet') console.log(`  ${style.cyan(SYM_INFO)} ${msg}`)
}
export const heading = (msg) => {
  if (_verbosity !== 'quiet') console.log(`\n${style.boldBlue(msg)}\n`)
}

// ---------------------------------------------------------------------------
// Dry-Run Helper
// ---------------------------------------------------------------------------

/**
 * Execute an action or print what would happen in dry-run mode.
 */
export function dryRun(action, description) {
  if (_dryRun) {
    console.log(`  ${style.dim(`[dry-run] ${description}`)}`)
    return
  }
  action()
}

// ---------------------------------------------------------------------------
// Interrupt Check
// ---------------------------------------------------------------------------

export function checkInterrupted() {
  if (_interrupted) {
    console.log(`  ${style.yellow('Interrupted. Cleaning up...')}`)
    process.exit(1)
  }
}
