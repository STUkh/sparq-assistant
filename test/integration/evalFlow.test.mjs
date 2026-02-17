import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { cleanTempDir, createTempDir, runCli } from '../helpers/setup.mjs'

describe('lean eval flow', () => {
  let tempDir

  beforeEach(() => {
    tempDir = createTempDir()
  })

  afterEach(() => {
    cleanTempDir(tempDir)
  })

  it('returns exit code 2 for strict policy failures', async () => {
    const { stdout, exitCode } = await runCli(
      ['eval', 's6-bug-regression', '--project', tempDir, '--strict'],
      { cwd: tempDir },
    )
    assert.equal(exitCode, 2)
    assert.ok(stdout.includes('[sparq] EVAL_STATUS=FAIL'))
    assert.ok(stdout.includes('[sparq] NEXT_ACTION=sparq improve s6-bug-regression'))
  })

  it('supports exploratory mode with --allow-skips', async () => {
    const { stdout, exitCode } = await runCli(
      ['eval', 's6-bug-regression', '--project', tempDir, '--allow-skips'],
      { cwd: tempDir },
    )
    assert.equal(exitCode, 0)
    assert.ok(stdout.includes('[sparq] EVAL_STATUS=PASS'))
  })

  it('improve command returns BLOCKED with machine-readable improve metadata', async () => {
    const { stdout, exitCode } = await runCli(
      ['improve', 's6-bug-regression', '--project', tempDir],
      { cwd: tempDir },
    )
    assert.equal(exitCode, 2)
    assert.ok(stdout.includes('[sparq] IMPROVE_STATUS=BLOCKED'))
    assert.ok(stdout.includes('[sparq] IMPROVE_ITERATIONS='))
    assert.ok(stdout.includes('[sparq] IMPROVE_TUNED_FILES='))
    assert.ok(stdout.includes('[sparq] NEXT_ACTION='))
  })
})
