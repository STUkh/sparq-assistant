import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { cleanTempDir, createTempDir } from '../helpers/setup.mjs'

const SCRIPT_PATH = join(
  import.meta.dirname,
  '..',
  '..',
  'claude',
  'hooks',
  'sparq-pre-compact.mjs',
)

/**
 * Run the pre-compact hook as a subprocess with JSON on stdin.
 */
function runPreCompactHook(inputJson, cwd) {
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
// sparq-pre-compact.mjs
// ---------------------------------------------------------------------------

describe('sparq-pre-compact', () => {
  let tmpDir

  beforeEach(() => {
    tmpDir = createTempDir()
  })

  afterEach(() => {
    cleanTempDir(tmpDir)
  })

  it('should output empty when no state directory exists', () => {
    const result = runPreCompactHook({ cwd: tmpDir }, tmpDir)
    assert.equal(result.exitCode, 0)
    assert.equal(result.stdout, '', 'Should produce no output without state dir')
  })

  it('should output structured summary with phase, scenario, feature', () => {
    mkdirSync(join(tmpDir, '.sparq', 'state'), { recursive: true })
    writeFileSync(
      join(tmpDir, '.sparq', 'state', 'current-task.json'),
      JSON.stringify({
        currentPhase: '2',
        totalPhases: '4',
        phaseName: 'Test Generation',
        scenario: 'S3',
        feature: 'Login',
        phaseStatus: 'in_progress',
      }),
    )

    const result = runPreCompactHook({ cwd: tmpDir }, tmpDir)
    assert.equal(result.exitCode, 0)
    assert.ok(result.stdout.includes('Phase: 2/4'), 'Should include phase info')
    assert.ok(result.stdout.includes('Scenario: S3'), 'Should include scenario')
    assert.ok(result.stdout.includes('Feature: Login'), 'Should include feature')
    assert.ok(result.stdout.includes('Status: in_progress'), 'Should include status')
  })

  it('should include decision constraints from decisions.json', () => {
    mkdirSync(join(tmpDir, '.sparq', 'state'), { recursive: true })
    writeFileSync(
      join(tmpDir, '.sparq', 'state', 'current-task.json'),
      JSON.stringify({ currentPhase: '1', scenario: 'S1', phaseStatus: 'in_progress' }),
    )
    writeFileSync(
      join(tmpDir, '.sparq', 'state', 'decisions.json'),
      JSON.stringify({
        decisions: [{ phase: 'P1', choice: 'approve', constraints: ['use data-testid selectors'] }],
      }),
    )

    const result = runPreCompactHook({ cwd: tmpDir }, tmpDir)
    assert.ok(result.stdout.includes('Active constraints'), 'Should include constraints section')
    assert.ok(result.stdout.includes('use data-testid selectors'), 'Should include constraint text')
  })

  it('should include last checkpoint info from decisions.json', () => {
    mkdirSync(join(tmpDir, '.sparq', 'state'), { recursive: true })
    writeFileSync(
      join(tmpDir, '.sparq', 'state', 'current-task.json'),
      JSON.stringify({ currentPhase: '2', scenario: 'S2', phaseStatus: 'in_progress' }),
    )
    writeFileSync(
      join(tmpDir, '.sparq', 'state', 'decisions.json'),
      JSON.stringify({
        decisions: [
          { phase: 'P1', choice: 'approve' },
          { phase: 'P2', choice: 'proceed with changes' },
        ],
      }),
    )

    const result = runPreCompactHook({ cwd: tmpDir }, tmpDir)
    assert.ok(result.stdout.includes('Last checkpoint: P2'), 'Should include last checkpoint phase')
    assert.ok(
      result.stdout.includes('proceed with changes'),
      'Should include last checkpoint choice',
    )
  })

  it('should include E2E summary from config-snapshot.json (truncated)', () => {
    mkdirSync(join(tmpDir, '.sparq', 'state'), { recursive: true })
    writeFileSync(
      join(tmpDir, '.sparq', 'state', 'current-task.json'),
      JSON.stringify({ currentPhase: '1', scenario: 'S3', phaseStatus: 'in_progress' }),
    )
    const longSummary = 'A'.repeat(400)
    writeFileSync(
      join(tmpDir, '.sparq', 'state', 'config-snapshot.json'),
      JSON.stringify({ e2eSummary: longSummary }),
    )

    const result = runPreCompactHook({ cwd: tmpDir }, tmpDir)
    assert.ok(result.stdout.includes('E2E summary:'), 'Should include E2E summary section')
    assert.ok(result.stdout.includes('...'), 'Should truncate long summaries')
    // The truncated text should be 300 chars max
    const summaryLine = result.stdout.split('\n').find((l) => l.includes('E2E summary:'))
    assert.ok(summaryLine, 'Summary line should exist')
    // 300 chars of A + "..." at the end, prefixed by "- E2E summary: "
    assert.ok(!summaryLine.includes('A'.repeat(301)), 'Should not include more than 300 chars')
  })

  it('should handle missing individual state files gracefully (partial output)', () => {
    mkdirSync(join(tmpDir, '.sparq', 'state'), { recursive: true })
    // Only create current-task.json, skip decisions.json and config-snapshot.json
    writeFileSync(
      join(tmpDir, '.sparq', 'state', 'current-task.json'),
      JSON.stringify({ currentPhase: '1', scenario: 'S1', phaseStatus: 'in_progress' }),
    )

    const result = runPreCompactHook({ cwd: tmpDir }, tmpDir)
    assert.equal(result.exitCode, 0)
    assert.ok(result.stdout.includes('Phase:'), 'Should include available phase info')
    assert.ok(result.stdout.includes('RECOVERY'), 'Should include recovery directive')
    // Should NOT have constraints or E2E summary since those files are missing
    assert.ok(!result.stdout.includes('Active constraints'), 'Should omit missing constraints')
    assert.ok(!result.stdout.includes('E2E summary'), 'Should omit missing config summary')
  })

  it('should handle corrupt state files gracefully', () => {
    mkdirSync(join(tmpDir, '.sparq', 'state'), { recursive: true })
    writeFileSync(join(tmpDir, '.sparq', 'state', 'current-task.json'), '{corrupt json!!!')
    writeFileSync(join(tmpDir, '.sparq', 'state', 'decisions.json'), '{also broken')

    const result = runPreCompactHook({ cwd: tmpDir }, tmpDir)
    assert.equal(result.exitCode, 0)
    // With all files corrupt, only the header + recovery directive remain — not enough for output
    // (the script only outputs if parts.length > 2, i.e., more than header + recovery)
  })

  it('should include RECOVERY directive as second line of output', () => {
    mkdirSync(join(tmpDir, '.sparq', 'state'), { recursive: true })
    writeFileSync(
      join(tmpDir, '.sparq', 'state', 'current-task.json'),
      JSON.stringify({ currentPhase: '1', scenario: 'S1', phaseStatus: 'in_progress' }),
    )

    const result = runPreCompactHook({ cwd: tmpDir }, tmpDir)
    const lines = result.stdout.split('\n')
    assert.ok(lines[0].includes('pre-compaction snapshot'), 'First line should be header')
    assert.ok(lines[1].includes('RECOVERY'), 'Second line should be recovery directive')
    assert.ok(
      lines[1].includes('Re-read .sparq/state/'),
      'Recovery directive should reference state files',
    )
  })

  it('should include parallel task status from parallel.json', () => {
    mkdirSync(join(tmpDir, '.sparq', 'state'), { recursive: true })
    writeFileSync(
      join(tmpDir, '.sparq', 'state', 'current-task.json'),
      JSON.stringify({ currentPhase: '2', scenario: 'S3', phaseStatus: 'in_progress' }),
    )
    writeFileSync(
      join(tmpDir, '.sparq', 'state', 'parallel.json'),
      JSON.stringify({
        tasks: [
          { taskId: 'batch-1', status: 'completed' },
          { taskId: 'batch-2', status: 'completed' },
          { taskId: 'batch-3', status: 'in_progress' },
        ],
        mergeStep: 2,
      }),
    )

    const result = runPreCompactHook({ cwd: tmpDir }, tmpDir)
    assert.ok(
      result.stdout.includes('Parallel: 2/3 tasks completed'),
      'Should include parallel status',
    )
    assert.ok(result.stdout.includes('Merge progress: step 2'), 'Should include merge step')
  })

  it('should include framework from config-snapshot.json', () => {
    mkdirSync(join(tmpDir, '.sparq', 'state'), { recursive: true })
    writeFileSync(
      join(tmpDir, '.sparq', 'state', 'current-task.json'),
      JSON.stringify({ currentPhase: '1', scenario: 'S3', phaseStatus: 'in_progress' }),
    )
    writeFileSync(
      join(tmpDir, '.sparq', 'state', 'config-snapshot.json'),
      JSON.stringify({ framework: 'playwright' }),
    )

    const result = runPreCompactHook({ cwd: tmpDir }, tmpDir)
    assert.ok(result.stdout.includes('Framework: playwright'), 'Should include framework')
  })

  it('should include expected/delivered counts from current-task.json', () => {
    mkdirSync(join(tmpDir, '.sparq', 'state'), { recursive: true })
    writeFileSync(
      join(tmpDir, '.sparq', 'state', 'current-task.json'),
      JSON.stringify({
        currentPhase: '2',
        scenario: 'S3',
        phaseStatus: 'in_progress',
        expectedCount: 15,
        expectedType: 'specs',
        deliveredCount: 12,
      }),
    )

    const result = runPreCompactHook({ cwd: tmpDir }, tmpDir)
    assert.ok(
      result.stdout.includes('Expected: 15 specs'),
      'Should include expected count and type',
    )
    assert.ok(result.stdout.includes('Delivered: 12'), 'Should include delivered count')
  })
})
