// claude/hooks/sparq-stop-guard.mjs — SparQ workflow exit guard (Stop hook)
// Prevents premature exit during active SparQ workflows.
// Protocol: reads JSON from stdin, outputs JSON decision to stdout.

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const input = JSON.parse(readFileSync(0, 'utf-8'))

// Safety valve: prevent infinite loop (Ralph Loop pattern)
if (input.stop_hook_active) process.exit(0)

const cwd = input.cwd || process.cwd()
const statePath = join(cwd, '.sparq', 'state', 'current-task.json')

// No active workflow — allow stop
if (!existsSync(statePath)) process.exit(0)

try {
  const state = JSON.parse(readFileSync(statePath, 'utf-8'))
  const { phaseStatus, currentPhase, phaseName, scenario } = state

  // Workflow complete or failed — allow stop
  if (phaseStatus === 'completed' || phaseStatus === 'failed') {
    process.exit(0)
  }

  // Workflow in progress — block stop
  const phase = currentPhase || 'unknown'
  const name = phaseName || scenario || 'active workflow'
  const reason = `SparQ workflow in progress at Phase ${phase} (${name}). Continue the workflow or archive state with /sparq:resume for later continuation.`

  console.log(JSON.stringify({ decision: 'block', reason }))
} catch {
  // Parse error or read failure — allow stop gracefully
  process.exit(0)
}
