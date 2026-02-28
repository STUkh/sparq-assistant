/**
 * Format compliance rubric - validates output format matches SparQ conventions.
 * Checks: TC ID format (all code-generating scenarios), REQ ID format (S1/S3/S5).
 * Scenario-aware: skips checks that don't apply to the scenario's output type.
 * REG- IDs in S3 bug mode are validated by the regression-compliance rubric.
 */

function checkTcIds(content) {
  const passed = content.match(/TC-\w+-(?:HP|VE|SEC|EC|A11Y)-\d{3}/g)?.length > 0
  return { passed, finding: 'No valid TC IDs found (expected TC-{feature}-{ABBR}-{NNN})' }
}

function checkReqIds(content) {
  const passed = content.match(/REQ-\w+-\d{3}/g)?.length > 0
  return { passed, finding: 'No valid REQ IDs found (expected REQ-{feature}-{NNN})' }
}

function collectChecks(content, scenario) {
  const checks = []
  // Scenarios that don't produce TC IDs: classification, S4
  const skipTc = scenario === 'classification' || scenario === 'S4'
  if (!skipTc) checks.push(checkTcIds(content))

  // Scenarios that don't produce REQ IDs: classification, S2, S4
  const skipReq = scenario === 'classification' || scenario === 'S2' || scenario === 'S4'
  if (!skipReq) checks.push(checkReqIds(content))

  return checks
}

export function evaluate(content, _checks = [], options = {}) {
  const findings = []
  let score = 0
  let maxScore = 0

  for (const result of collectChecks(content, options.scenario)) {
    maxScore++
    if (result.passed) {
      score++
    } else {
      findings.push(result.finding)
    }
  }

  return { score, maxScore, findings }
}
