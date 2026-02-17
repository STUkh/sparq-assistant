import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createSpinner } from '../../bin/lib/spinner.mjs'

describe('createSpinner', () => {
  it('should return an object with start/stop/succeed/fail/update methods', () => {
    const spinner = createSpinner('test')
    assert.equal(typeof spinner.start, 'function')
    assert.equal(typeof spinner.stop, 'function')
    assert.equal(typeof spinner.succeed, 'function')
    assert.equal(typeof spinner.fail, 'function')
    assert.equal(typeof spinner.update, 'function')
  })

  it('should not throw in non-TTY mode', () => {
    const spinner = createSpinner('test message')
    spinner.start()
    spinner.update('updated')
    spinner.succeed('done')
  })

  it('should not throw when calling fail in non-TTY mode', () => {
    const spinner = createSpinner('test message')
    spinner.start()
    spinner.fail('error occurred')
  })

  it('should not throw when calling stop in non-TTY mode', () => {
    const spinner = createSpinner('test message')
    spinner.start()
    spinner.stop()
  })

  it('should not prevent process exit if stop is never called', () => {
    const spinner = createSpinner('leaked timer test')
    spinner.start()
    // If timer.unref() is missing, this test would hang the process.
    // No assertion needed — test passing without timeout proves unref works.
  })
})
