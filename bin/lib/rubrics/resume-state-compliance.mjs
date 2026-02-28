/**
 * Resume state compliance rubric — validates state files per resume-protocol.md.
 * Checks: required fields, phaseStatus values, scenario format, completedPhases,
 * ISO 8601 timestamps, parallel tasks, config snapshot.
 */

import { extractJsonBlock } from './shared/json-extract.mjs'

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

export function evaluate(content, _checks = [], _options = {}) {
  const findings = []
  let score = 0
  const maxScore = 7

  const state = extractJsonBlock(content, (obj) => obj.version && obj.workflowId)
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
