/**
 * Resume state compliance rubric — validates state files per resume-protocol.md.
 * Checks: required fields, phaseStatus values, scenario format, completedPhases,
 * ISO 8601 timestamps, parallel tasks, config snapshot.
 */

const VALID_PHASE_STATUSES = [
  'starting',
  'agent_dispatched',
  'parallel_dispatched',
  'parallel_collecting',
  'merging',
  'checkpoint_pending',
  'checkpoint_approved',
  'completing',
  'completed',
  'failed',
]

const ISO_8601_Z = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/

/**
 * Find the closing brace index for an opening brace at position `start`.
 * Returns -1 if no balanced closing brace is found.
 */
function findClosingBrace(content, start) {
  let depth = 0
  for (let j = start; j < content.length; j++) {
    if (content[j] === '{') depth++
    if (content[j] === '}') depth--
    if (depth === 0) return j
  }
  return -1
}

/**
 * Try to parse a balanced JSON block starting at position `i`.
 * Returns a parsed object if it contains `version` and `workflowId`, otherwise null.
 */
function tryParseStateBlock(content, i) {
  const end = findClosingBrace(content, i)
  if (end === -1) return null
  const block = content.slice(i, end + 1)
  if (!block.includes('"version"')) return null
  try {
    const parsed = JSON.parse(block)
    if (parsed.version && parsed.workflowId) return parsed
  } catch {
    // Not valid JSON at this position
  }
  return null
}

/**
 * Try to parse JSON from a markdown code fence.
 */
function tryParseFenced(content) {
  const fenced = content.match(/```(?:json)?\s*\n([\s\S]*?)\n```/)
  if (!fenced) return null
  try {
    return JSON.parse(fenced[1])
  } catch {
    return null
  }
}

/**
 * Try to parse JSON from content. Supports content that is pure JSON,
 * markdown fences, or embedded JSON blocks. Uses balanced-brace matching
 * to correctly extract objects when multiple files are concatenated.
 */
function extractJson(content) {
  try {
    return JSON.parse(content)
  } catch {
    // Try extracting from markdown code fences
  }

  const fenced = tryParseFenced(content)
  if (fenced) return fenced

  for (let i = 0; i < content.length; i++) {
    if (content[i] !== '{') continue
    const result = tryParseStateBlock(content, i)
    if (result) return result
  }
  return null
}

function checkRequiredFields(state) {
  const required = ['version', 'workflowId', 'scenario', 'phase', 'phaseStatus']
  const missing = required.filter((f) => state[f] === undefined)
  if (missing.length === 0) return null
  return `Missing required fields: ${missing.join(', ')}`
}

function checkPhaseStatus(state) {
  if (typeof state.phaseStatus === 'string' && VALID_PHASE_STATUSES.includes(state.phaseStatus)) {
    return null
  }
  return (
    `Invalid phaseStatus "${state.phaseStatus}" ` +
    `(expected one of: ${VALID_PHASE_STATUSES.join(', ')})`
  )
}

function checkScenario(state) {
  if (typeof state.scenario === 'string' && /^S[1-6]$/.test(state.scenario)) {
    return null
  }
  return `Invalid scenario "${state.scenario}" (expected S1-S6)`
}

function checkCompletedPhases(state) {
  if (Array.isArray(state.completedPhases)) {
    const fields = ['phase', 'completedAt', 'handoffPath', 'status']
    const allValid = state.completedPhases.every((entry) =>
      fields.every((f) => entry[f] !== undefined),
    )
    if (allValid) return null
    return (
      'completedPhases entries missing required fields ' +
      '(phase, completedAt, handoffPath, status)'
    )
  }
  if (state.completedPhases === undefined) return null
  return 'completedPhases is not an array'
}

function checkTimestamps(state) {
  const fields = ['startedAt', 'updatedAt', 'interruptedAt']
  const found = fields.filter((f) => state[f] !== undefined)
  if (found.length === 0) {
    return 'No timestamp fields found (expected startedAt, updatedAt)'
  }
  const bad = found.filter((f) => !ISO_8601_Z.test(state[f]))
  if (bad.length === 0) return null
  return `Non-ISO-8601-Z timestamps: ${bad.map((f) => `${f}="${state[f]}"`).join(', ')}`
}

function checkTeammates(state) {
  if (state.teammates === undefined) return null
  if (!Array.isArray(state.teammates)) return 'teammates is not an array'
  const fields = ['name', 'role', 'status']
  const allValid = state.teammates.every((t) => fields.every((f) => t[f] !== undefined))
  if (allValid) return null
  return 'teammates entries missing required fields (name, role, status)'
}

function checkConfigSnapshot(state) {
  if (state.configHash === undefined && state.configSummary === undefined) {
    return null
  }
  if (state.configHash && state.configSummary) return null
  const missing = []
  if (!state.configHash) missing.push('configHash')
  if (!state.configSummary) missing.push('configSummary')
  return `Config snapshot missing: ${missing.join(', ')}`
}

const STATE_CHECKS = [
  checkRequiredFields,
  checkPhaseStatus,
  checkScenario,
  checkCompletedPhases,
  checkTimestamps,
  checkTeammates,
  checkConfigSnapshot,
]

export function evaluate(content, _checks = []) {
  const findings = []
  let score = 0
  const maxScore = 7

  const state = extractJson(content)
  if (!state) {
    findings.push('No valid JSON state object found in content')
    return { score: 0, maxScore, findings }
  }

  for (const checkFn of STATE_CHECKS) {
    const error = checkFn(state)
    if (error) {
      findings.push(error)
    } else {
      score++
    }
  }

  return { score, maxScore, findings }
}
