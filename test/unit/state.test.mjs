import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import {
  checkInterrupted,
  dryRun,
  fail,
  getVerbosity,
  heading,
  info,
  isDryRun,
  isInterrupted,
  ok,
  resetState,
  SYM_FAIL,
  SYM_INFO,
  SYM_OK,
  SYM_WARN,
  setDryRun,
  setInterrupted,
  setVerbosity,
  style,
  useColor,
  warn,
} from '../../bin/lib/state.mjs'
import { createOutputCapture } from '../helpers/setup.mjs'

// ---------------------------------------------------------------------------
// Console capture helpers
// ---------------------------------------------------------------------------

const capture = createOutputCapture()

beforeEach(() => {
  capture.start()
  resetState()
})

afterEach(() => {
  capture.stop()
})

// ---------------------------------------------------------------------------
// Verbosity
// ---------------------------------------------------------------------------

describe('verbosity', () => {
  it('should default to normal', () => {
    assert.equal(getVerbosity(), 'normal')
  })

  it('should get and set verbose', () => {
    setVerbosity('verbose')
    assert.equal(getVerbosity(), 'verbose')
  })

  it('should get and set quiet', () => {
    setVerbosity('quiet')
    assert.equal(getVerbosity(), 'quiet')
  })

  it('should allow resetting back to normal', () => {
    setVerbosity('quiet')
    setVerbosity('normal')
    assert.equal(getVerbosity(), 'normal')
  })
})

// ---------------------------------------------------------------------------
// DryRun
// ---------------------------------------------------------------------------

describe('dryRun state', () => {
  it('should default to false', () => {
    assert.equal(isDryRun(), false)
  })

  it('should set to true', () => {
    setDryRun(true)
    assert.equal(isDryRun(), true)
  })

  it('should set back to false', () => {
    setDryRun(true)
    setDryRun(false)
    assert.equal(isDryRun(), false)
  })
})

// ---------------------------------------------------------------------------
// Interrupted
// ---------------------------------------------------------------------------

describe('interrupted state', () => {
  it('should default to false', () => {
    assert.equal(isInterrupted(), false)
  })

  it('should set to true', () => {
    setInterrupted(true)
    assert.equal(isInterrupted(), true)
  })

  it('should set back to false', () => {
    setInterrupted(true)
    setInterrupted(false)
    assert.equal(isInterrupted(), false)
  })
})

// ---------------------------------------------------------------------------
// Symbols
// ---------------------------------------------------------------------------

describe('symbols', () => {
  it('SYM_OK should be a non-empty string', () => {
    assert.equal(typeof SYM_OK, 'string')
    assert.ok(SYM_OK.length > 0)
  })

  it('SYM_WARN should be a non-empty string', () => {
    assert.equal(typeof SYM_WARN, 'string')
    assert.ok(SYM_WARN.length > 0)
  })

  it('SYM_FAIL should be a non-empty string', () => {
    assert.equal(typeof SYM_FAIL, 'string')
    assert.ok(SYM_FAIL.length > 0)
  })

  it('SYM_INFO should be a non-empty string', () => {
    assert.equal(typeof SYM_INFO, 'string')
    assert.ok(SYM_INFO.length > 0)
  })
})

// ---------------------------------------------------------------------------
// useColor
// ---------------------------------------------------------------------------

describe('useColor', () => {
  it('should be a falsy or truthy value', () => {
    // In non-TTY environments (CI/test), isTTY is undefined so useColor is undefined (falsy)
    // In TTY environments without NO_COLOR, useColor is true
    assert.equal(typeof useColor === 'boolean' || typeof useColor === 'undefined', true)
  })
})

// ---------------------------------------------------------------------------
// Style helpers
// ---------------------------------------------------------------------------

describe('style', () => {
  it('bold should return a string', () => {
    assert.equal(typeof style.bold('test'), 'string')
  })

  it('dim should return a string', () => {
    assert.equal(typeof style.dim('test'), 'string')
  })

  it('red should return a string', () => {
    assert.equal(typeof style.red('test'), 'string')
  })

  it('green should return a string', () => {
    assert.equal(typeof style.green('test'), 'string')
  })

  it('yellow should return a string', () => {
    assert.equal(typeof style.yellow('test'), 'string')
  })

  it('blue should return a string', () => {
    assert.equal(typeof style.blue('test'), 'string')
  })

  it('cyan should return a string', () => {
    assert.equal(typeof style.cyan('test'), 'string')
  })

  it('magenta should return a string', () => {
    assert.equal(typeof style.magenta('test'), 'string')
  })

  it('boldBlue should return a string', () => {
    assert.equal(typeof style.boldBlue('test'), 'string')
  })

  it('boldCyan should return a string', () => {
    assert.equal(typeof style.boldCyan('test'), 'string')
  })

  it('boldYellow should return a string', () => {
    assert.equal(typeof style.boldYellow('test'), 'string')
  })

  it('colored should accept array format and return a string', () => {
    assert.equal(typeof style.colored(['bold', 'red'], 'test'), 'string')
  })
})

// ---------------------------------------------------------------------------
// Output functions
// ---------------------------------------------------------------------------

describe('ok', () => {
  it('should produce output in normal verbosity', () => {
    ok('success message')
    assert.equal(capture.lines().length, 1)
    assert.ok(capture.lines()[0].includes('success message'))
  })

  it('should be suppressed in quiet verbosity', () => {
    setVerbosity('quiet')
    ok('hidden message')
    assert.equal(capture.lines().length, 0)
  })
})

describe('warn', () => {
  it('should produce output', () => {
    warn('warning message')
    assert.equal(capture.lines().length, 1)
    assert.ok(capture.lines()[0].includes('warning message'))
  })

  it('should produce output even in quiet verbosity', () => {
    setVerbosity('quiet')
    warn('still visible')
    assert.equal(capture.lines().length, 1)
    assert.ok(capture.lines()[0].includes('still visible'))
  })
})

describe('fail', () => {
  it('should produce output', () => {
    fail('error message')
    assert.equal(capture.lines().length, 1)
    assert.ok(capture.lines()[0].includes('error message'))
  })

  it('should produce output even in quiet verbosity', () => {
    setVerbosity('quiet')
    fail('still visible')
    assert.equal(capture.lines().length, 1)
    assert.ok(capture.lines()[0].includes('still visible'))
  })
})

describe('info', () => {
  it('should produce output in normal verbosity', () => {
    info('info message')
    assert.equal(capture.lines().length, 1)
    assert.ok(capture.lines()[0].includes('info message'))
  })

  it('should be suppressed in quiet verbosity', () => {
    setVerbosity('quiet')
    info('hidden info')
    assert.equal(capture.lines().length, 0)
  })
})

describe('heading', () => {
  it('should produce output in normal verbosity', () => {
    heading('Section Title')
    assert.equal(capture.lines().length, 1)
    assert.ok(capture.lines()[0].includes('Section Title'))
  })

  it('should be suppressed in quiet verbosity', () => {
    setVerbosity('quiet')
    heading('Hidden Title')
    assert.equal(capture.lines().length, 0)
  })
})

// ---------------------------------------------------------------------------
// dryRun function
// ---------------------------------------------------------------------------

describe('dryRun function', () => {
  it('should execute action when not in dry-run mode', () => {
    let executed = false
    dryRun(() => {
      executed = true
    }, 'test action')
    assert.equal(executed, true)
  })

  it('should not execute action and log when in dry-run mode', () => {
    setDryRun(true)
    let executed = false
    dryRun(() => {
      executed = true
    }, 'test action')
    assert.equal(executed, false)
    assert.equal(capture.lines().length, 1)
    assert.ok(capture.lines()[0].includes('dry-run'))
    assert.ok(capture.lines()[0].includes('test action'))
  })
})

// ---------------------------------------------------------------------------
// checkInterrupted
// ---------------------------------------------------------------------------

describe('checkInterrupted', () => {
  it('should not throw when not interrupted', () => {
    assert.doesNotThrow(() => checkInterrupted())
  })
})

// ---------------------------------------------------------------------------
// resetState
// ---------------------------------------------------------------------------

describe('resetState', () => {
  it('should reset verbosity to normal', () => {
    setVerbosity('quiet')
    resetState()
    assert.equal(getVerbosity(), 'normal')
  })

  it('should reset dryRun to false', () => {
    setDryRun(true)
    resetState()
    assert.equal(isDryRun(), false)
  })

  it('should reset interrupted to false', () => {
    setInterrupted(true)
    resetState()
    assert.equal(isInterrupted(), false)
  })
})
