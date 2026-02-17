/**
 * Requirement coverage rubric — validates generated output addresses input requirements.
 * GAP 1.3 fix: catches agents that produce correctly-formatted but incomplete output.
 * Checks: REQ count vs fixture acceptance criteria, TC-to-REQ traceability.
 */

function countReqIds(content) {
  const matches = content.match(/REQ-\w+-\d{3}/g)
  return matches ? new Set(matches).size : 0
}

function countTcIds(content) {
  const matches = content.match(/TC-\w+-(?:HP|VE|SEC|EC|A11Y)-\d{3}/g)
  return matches ? new Set(matches).size : 0
}

function countRegIds(content) {
  const matches = content.match(/REG-[A-Z]+-\d+-\d{3}/g)
  return matches ? new Set(matches).size : 0
}

function checkMinimumQuantity(scenario, reqCount, tcCount, regCount) {
  if (scenario === 'S6') {
    return regCount >= 1 ? null : 'No REG IDs found — regression spec appears empty'
  }
  if (scenario === 'S2' || scenario === 'S3') {
    return tcCount >= 3 || reqCount >= 3
      ? null
      : `Low output volume: ${tcCount} TC(s), ${reqCount} REQ(s) — expected >= 3 of either`
  }
  return reqCount >= 3 ? null : `Low requirement count: ${reqCount} REQ(s) — expected >= 3`
}

function checkTraceability(content, reqCount, tcCount) {
  if (reqCount === 0 || tcCount === 0) return null
  const hasTraceability =
    /TC-\w+-\w+-\d{3}.*REQ-\w+-\d{3}/s.test(content) ||
    /REQ-\w+-\d{3}.*TC-\w+-\w+-\d{3}/s.test(content) ||
    /Traceability|Coverage Matrix|Mapping/i.test(content)
  return hasTraceability ? null : 'No traceability found between TC IDs and REQ IDs'
}

function checkDiversity(content, scenario) {
  if (scenario === 'S6') return null
  const reqFeatures = new Set([...content.matchAll(/REQ-(\w+)-\d{3}/g)].map((m) => m[1]))
  const tcFeatures = new Set([...content.matchAll(/TC-(\w+)-\w+-\d{3}/g)].map((m) => m[1]))
  const features = new Set([...reqFeatures, ...tcFeatures])
  return features.size >= 1 ? null : 'No feature areas identified in output IDs'
}

export function evaluate(content, _checks = [], options = {}) {
  const scenario = options.scenario
  if (scenario === 'classification' || scenario === 'S4') {
    return { score: 0, maxScore: 0, findings: [], skipped: true }
  }

  const findings = []
  let score = 0
  const reqCount = countReqIds(content)
  const tcCount = countTcIds(content)
  const regCount = countRegIds(content)

  const quantityFinding = checkMinimumQuantity(scenario, reqCount, tcCount, regCount)
  if (quantityFinding) {
    findings.push(quantityFinding)
  } else {
    score++
  }

  const traceFinding = checkTraceability(content, reqCount, tcCount)
  if (traceFinding) {
    findings.push(traceFinding)
  } else {
    score++
  }

  const diversityFinding = checkDiversity(content, scenario)
  if (diversityFinding) {
    findings.push(diversityFinding)
  } else {
    score++
  }

  return { score, maxScore: 3, findings }
}
