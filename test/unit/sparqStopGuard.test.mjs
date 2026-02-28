import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { cleanTempDir, createTempDir } from '../helpers/setup.mjs'

const SCRIPT_PATH = join(import.meta.dirname, '..', '..', 'claude', 'hooks', 'sparq-stop-guard.mjs')

/**
 * Run the stop-guard hook as a subprocess with JSON on stdin.
 */
function runStopHook(inputJson, cwd) {
  try {
    const stdout = execFileSync('node', [SCRIPT_PATH], {
      input: JSON.stringify(inputJson),
      cwd: cwd || process.cwd(),
      encoding: 'utf-8',
      timeout: 5000,
    })
    return { exitCode: 0, stdout: stdout.trim() }
  } catch (err) {
    return {
      exitCode: err.status,
      stdout: (err.stdout || '').trim(),
      stderr: (err.stderr || '').trim(),
    }
  }
}

// ---------------------------------------------------------------------------
// sparq-stop-guard.mjs
// ---------------------------------------------------------------------------

describe('sparq-stop-guard', () => {
  let tmpDir

  beforeEach(() => {
    tmpDir = createTempDir()
  })

  afterEach(() => {
    cleanTempDir(tmpDir)
  })

  it('should output nothing (exit 0) when no state file exists', () => {
    const result = runStopHook({ cwd: tmpDir }, tmpDir)
    assert.equal(result.exitCode, 0)
    assert.equal(result.stdout, '', 'Should produce no output')
  })

  it('should output nothing (exit 0) when stop_hook_active is true', () => {
    // Safety valve — prevents infinite loop
    mkdirSync(join(tmpDir, '.sparq', 'state'), { recursive: true })
    writeFileSync(
      join(tmpDir, '.sparq', 'state', 'current-task.json'),
      JSON.stringify({ phaseStatus: 'in_progress', currentPhase: '2' }),
    )

    const result = runStopHook({ cwd: tmpDir, stop_hook_active: true }, tmpDir)
    assert.equal(result.exitCode, 0)
    assert.equal(result.stdout, '', 'Should produce no output when safety valve active')
  })

  it('should output nothing (exit 0) when workflow status is completed', () => {
    mkdirSync(join(tmpDir, '.sparq', 'state'), { recursive: true })
    writeFileSync(
      join(tmpDir, '.sparq', 'state', 'current-task.json'),
      JSON.stringify({ phaseStatus: 'completed', currentPhase: '3', phaseName: 'Done' }),
    )

    const result = runStopHook({ cwd: tmpDir }, tmpDir)
    assert.equal(result.exitCode, 0)
    assert.equal(result.stdout, '', 'Should allow stop for completed workflow')
  })

  it('should output nothing (exit 0) when workflow status is failed', () => {
    mkdirSync(join(tmpDir, '.sparq', 'state'), { recursive: true })
    writeFileSync(
      join(tmpDir, '.sparq', 'state', 'current-task.json'),
      JSON.stringify({ phaseStatus: 'failed', currentPhase: '1' }),
    )

    const result = runStopHook({ cwd: tmpDir }, tmpDir)
    assert.equal(result.exitCode, 0)
    assert.equal(result.stdout, '', 'Should allow stop for failed workflow')
  })

  it('should output block decision JSON when workflow is in progress', () => {
    mkdirSync(join(tmpDir, '.sparq', 'state'), { recursive: true })
    writeFileSync(
      join(tmpDir, '.sparq', 'state', 'current-task.json'),
      JSON.stringify({
        phaseStatus: 'in_progress',
        currentPhase: '2',
        phaseName: 'Test Generation',
        scenario: 'S3',
      }),
    )

    const result = runStopHook({ cwd: tmpDir }, tmpDir)
    assert.equal(result.exitCode, 0, 'Script exits 0 even when blocking (output is the signal)')

    const output = JSON.parse(result.stdout)
    assert.equal(output.decision, 'block', 'Should output block decision')
    assert.ok(output.reason, 'Should include a reason string')
  })

  it('should include phase info in block reason', () => {
    mkdirSync(join(tmpDir, '.sparq', 'state'), { recursive: true })
    writeFileSync(
      join(tmpDir, '.sparq', 'state', 'current-task.json'),
      JSON.stringify({
        phaseStatus: 'in_progress',
        currentPhase: '2',
        phaseName: 'Test Generation',
        scenario: 'S3',
      }),
    )

    const result = runStopHook({ cwd: tmpDir }, tmpDir)
    const output = JSON.parse(result.stdout)
    assert.ok(output.reason.includes('Phase 2'), 'Reason should include phase number')
    assert.ok(output.reason.includes('Test Generation'), 'Reason should include phase name')
  })

  it('should handle corrupt/invalid JSON state file gracefully (exit 0)', () => {
    mkdirSync(join(tmpDir, '.sparq', 'state'), { recursive: true })
    writeFileSync(join(tmpDir, '.sparq', 'state', 'current-task.json'), '{not valid json!!!')

    const result = runStopHook({ cwd: tmpDir }, tmpDir)
    assert.equal(result.exitCode, 0)
    assert.equal(result.stdout, '', 'Should allow stop on corrupt state')
  })

  it('should handle missing .sparq/state/ directory (exit 0)', () => {
    // tmpDir exists but has no .sparq/ at all
    const result = runStopHook({ cwd: tmpDir }, tmpDir)
    assert.equal(result.exitCode, 0)
    assert.equal(result.stdout, '', 'Should allow stop when state dir missing')
  })
})
