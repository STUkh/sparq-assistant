// claude/hooks/sparq-pre-compact.mjs — SparQ compaction resilience (PreCompact hook)
// Persists workflow state summary through context compaction boundary.
// Protocol: reads JSON from stdin, outputs text to stdout (included in compacted context).

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const input = JSON.parse(readFileSync(0, 'utf-8'))
const cwd = input.cwd || process.cwd()
const stateDir = join(cwd, '.sparq', 'state')

// No state directory — nothing to preserve
if (!existsSync(stateDir)) process.exit(0)

const parts = ['## SparQ Workflow State (pre-compaction snapshot)']
parts.push(
  '**RECOVERY**: Re-read .sparq/state/ files from disk. Do NOT rely on in-context memory for workflow state.',
)

// Current task state
try {
  const task = JSON.parse(readFileSync(join(stateDir, 'current-task.json'), 'utf-8'))
  parts.push(
    `- Phase: ${task.currentPhase || '?'}/${task.totalPhases || '?'} — ${task.phaseName || 'unknown'}`,
  )
  parts.push(`- Scenario: ${task.scenario || 'unknown'}`)
  parts.push(`- Feature: ${task.feature || 'unknown'}`)
  parts.push(`- Status: ${task.phaseStatus || 'unknown'}`)
  if (task.expectedCount) {
    parts.push(
      `- Expected: ${task.expectedCount} ${task.expectedType || 'items'} | Delivered: ${task.deliveredCount || 0}`,
    )
  }
} catch {
  /* skip — file missing or corrupt */
}

// Decision constraints
try {
  const decisions = JSON.parse(readFileSync(join(stateDir, 'decisions.json'), 'utf-8'))
  const constraints = (decisions.decisions || []).flatMap((d) => d.constraints || [])
  if (constraints.length > 0) {
    parts.push(`- Active constraints: ${constraints.join(', ')}`)
  }
  const lastDecision = decisions.decisions?.[decisions.decisions.length - 1]
  if (lastDecision) {
    parts.push(`- Last checkpoint: ${lastDecision.phase} — ${lastDecision.choice}`)
  }
} catch {
  /* skip */
}

// Config snapshot summary
try {
  const config = JSON.parse(readFileSync(join(stateDir, 'config-snapshot.json'), 'utf-8'))
  if (config.framework) {
    parts.push(`- Framework: ${config.framework}`)
  }
  if (config.e2eSummary) {
    const summary = config.e2eSummary.substring(0, 300)
    parts.push(`- E2E summary: ${summary}${config.e2eSummary.length > 300 ? '...' : ''}`)
  }
} catch {
  /* skip */
}

// Parallel task status
try {
  const parallel = JSON.parse(readFileSync(join(stateDir, 'parallel.json'), 'utf-8'))
  if (parallel.tasks) {
    const completed = parallel.tasks.filter((t) => t.status === 'completed').length
    const total = parallel.tasks.length
    parts.push(`- Parallel: ${completed}/${total} tasks completed`)
    if (parallel.mergeStep) {
      parts.push(`- Merge progress: step ${parallel.mergeStep}`)
    }
  }
} catch {
  /* skip — no parallel state */
}

// Only output if we have more than just the header + recovery directive
if (parts.length > 2) {
  console.log(parts.join('\n'))
}
