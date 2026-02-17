/**
 * Handoff compliance rubric — validates handoff JSON objects against handoff-schema.md.
 * Checks: version, from, to, scenario, phase, status, report, failed-gaps.
 */

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
 * Returns a parsed object if it contains `version` and `from`, otherwise null.
 */
function tryParseHandoffBlock(content, i) {
  const end = findClosingBrace(content, i)
  if (end === -1) return null
  const block = content.slice(i, end + 1)
  if (!block.includes('"version"')) return null
  try {
    const parsed = JSON.parse(block)
    if (parsed.version && parsed.from) return parsed
  } catch {
    // Not valid JSON at this position
  }
  return null
}

/**
 * Extract the first JSON object from content that looks like a handoff.
 * Uses balanced-brace matching to handle nested objects.
 */
function extractHandoff(content) {
  try {
    const parsed = JSON.parse(content)
    if (parsed.version) return parsed
  } catch {
    // Not pure JSON — scan for embedded JSON blocks
  }

  for (let i = 0; i < content.length; i++) {
    if (content[i] !== '{') continue
    const result = tryParseHandoffBlock(content, i)
    if (result) return result
  }
  return null
}

const VALID_PHASES = ['P0', 'P0.5', 'P1', 'P1.5', 'P2', 'P3']
const VALID_STATUSES = ['success', 'partial', 'failed']

function checkVersion(handoff) {
  if (handoff.version === '1.0') return null
  return `Expected version "1.0", found "${handoff.version}"`
}

function checkFrom(handoff) {
  if (typeof handoff.from === 'string' && handoff.from.startsWith('sparq-')) return null
  return `Expected "from" with sparq agent name, found "${handoff.from}"`
}

function checkTo(handoff) {
  if (typeof handoff.to === 'string' && handoff.to.length > 0) return null
  return 'Missing or empty "to" field'
}

function checkScenario(handoff) {
  if (typeof handoff.scenario === 'string' && /^S[1-6](\+S[1-6])?$/.test(handoff.scenario)) {
    return null
  }
  return `Expected "scenario" matching S[1-6] or S[1-6]+S[1-6], found "${handoff.scenario}"`
}

function checkPhase(handoff) {
  if (typeof handoff.phase === 'string' && VALID_PHASES.includes(handoff.phase)) {
    return null
  }
  return `Expected "phase" in [${VALID_PHASES.join(', ')}], found "${handoff.phase}"`
}

function checkStatus(handoff) {
  if (typeof handoff.status === 'string' && VALID_STATUSES.includes(handoff.status)) {
    return null
  }
  return `Expected "status" in [${VALID_STATUSES.join(', ')}], found "${handoff.status}"`
}

function checkReport(handoff) {
  if (
    handoff.report &&
    typeof handoff.report === 'object' &&
    handoff.report.counts &&
    Array.isArray(handoff.report.artifacts)
  ) {
    return null
  }
  return 'Missing or malformed "report" (expected {counts, artifacts[]})'
}

function checkFailedGaps(handoff) {
  if (handoff.status !== 'failed') return null
  if (Array.isArray(handoff.gaps) && handoff.gaps.length > 0) return null
  return 'Status is "failed" but "gaps" is empty or missing'
}

const HANDOFF_CHECKS = [
  checkVersion,
  checkFrom,
  checkTo,
  checkScenario,
  checkPhase,
  checkStatus,
  checkReport,
  checkFailedGaps,
]

export function evaluate(content, _checks = []) {
  const findings = []
  let score = 0
  const maxScore = 8

  const handoff = extractHandoff(content)
  if (!handoff) {
    findings.push('No handoff JSON object found in content')
    return { score: 0, maxScore, findings }
  }

  for (const checkFn of HANDOFF_CHECKS) {
    const error = checkFn(handoff)
    if (error) {
      findings.push(error)
    } else {
      score++
    }
  }

  return { score, maxScore, findings }
}
