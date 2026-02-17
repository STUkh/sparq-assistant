/**
 * Error handling compliance rubric - validates agent outputs follow SparQ error
 * handling patterns. Checks: retry signals, fallback documentation, gap entries,
 * partial status, circuit breaker signals.
 */

// Check 1: MCP error with retry signal
function checkMcpRetrySignal(content) {
  const applicable = /(?:MCP|mcp).*(?:error|timeout|failure|unavailable|refused)/i.test(content)
  if (!applicable) return null
  const passed = /\[sparq\].*(?:Retry|Fallback):/.test(content)
  return { passed, finding: 'MCP error detected but no [sparq] Retry/Fallback signal found' }
}

// Check 2: Fallback with gap entry
function checkFallbackGaps(content) {
  const applicable = /\[sparq\].*Fallback:/.test(content)
  if (!applicable) return null
  const passed = /"gaps"\s*:\s*\[(?!\s*\])/.test(content)
  return { passed, finding: 'Fallback signal present but handoff gaps array is empty or missing' }
}

// Check 3: Source failure with fallback action
function checkSourceFallback(content) {
  const applicable =
    /(?:jira|confluence|figma|testrail|qase).*(?:unavailable|failed|timeout|refused|down)/i.test(
      content,
    )
  if (!applicable) return null
  const passed = /(?:fallback|degraded?|alternative|skip|grep|user.?input)/i.test(content)
  return { passed, finding: 'Source failure detected but no fallback action documented' }
}

// Check 4: Degraded execution with partial status
function checkPartialStatus(content) {
  const applicable = /\[sparq\].*Fallback:/.test(content)
  if (!applicable) return null
  const passed = /"status"\s*:\s*"partial"/.test(content)
  return { passed, finding: 'Fallback occurred but handoff status is not "partial"' }
}

// Check 5: Circuit breaker signal
function checkCircuitBreaker(content) {
  const applicable = /(?:retry.*retry|attempt [23]|backoff.*backoff|2 failures|circuit)/i.test(
    content,
  )
  if (!applicable) return null
  const passed = /\[sparq\].*(?:Warning|circuit.?breaker|OPEN)/i.test(content)
  return {
    passed,
    finding: 'Multiple failures detected but no circuit breaker or warning signal',
  }
}

const ERROR_CHECKS = [
  checkMcpRetrySignal,
  checkFallbackGaps,
  checkSourceFallback,
  checkPartialStatus,
  checkCircuitBreaker,
]

export function evaluate(content, _checks = []) {
  const findings = []
  let score = 0
  let maxScore = 0

  for (const checkFn of ERROR_CHECKS) {
    const result = checkFn(content)
    if (!result) continue
    maxScore++
    if (result.passed) {
      score++
    } else {
      findings.push(result.finding)
    }
  }

  if (maxScore === 0) {
    return { score: 0, maxScore: 0, findings: [], skipped: true }
  }

  return { score, maxScore, findings }
}
