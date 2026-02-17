// bin/lib/eval/policy.mjs — strict run policy evaluation

function casePercentage(result) {
  if (typeof result.percentage === 'number') return result.percentage
  if (result.maxScore > 0) return Math.round((result.score / result.maxScore) * 100)
  return 0
}

function isHardStatus(status) {
  return status === 'api-error' || status === 'error'
}

function caseLabel(result) {
  return result.caseName ?? result.caseFile ?? 'unknown-case'
}

function collectSkipReasons(result) {
  const skipped = result.skippedRubrics ?? []
  return skipped.map((entry) => entry.reason).filter(Boolean)
}

function evaluateThresholdFailure(result, passThreshold) {
  const pct = casePercentage(result)
  if (pct >= passThreshold) return null
  const caseName = caseLabel(result)
  return {
    type: 'threshold',
    caseName,
    message: `${caseName} scored ${pct}% (< ${passThreshold}%)`,
  }
}

function evaluateStatusFailure(result, strict, allowSkips) {
  const status = result.status ?? 'unknown'
  if (status === 'evaluated') return null

  const caseName = caseLabel(result)
  if (strict && !allowSkips) {
    return {
      type: 'non-evaluated',
      caseName,
      message: `${caseName} was not evaluated (${status})`,
    }
  }

  if (isHardStatus(status)) {
    return {
      type: 'runtime',
      caseName,
      message: `${caseName} failed with status ${status}`,
    }
  }

  return null
}

function evaluateRequiredRubricFailure(strict, allowSkips, requiredRubricsSkipped) {
  if (!strict || allowSkips || requiredRubricsSkipped <= 0) return null
  return {
    type: 'required-rubric-skipped',
    caseName: null,
    message: `${requiredRubricsSkipped} required rubric(s) were skipped`,
  }
}

function evaluateOptimizeGateFailure(strict, optimizeGatePending, allStrictPassing) {
  if (!strict || !optimizeGatePending || allStrictPassing) return null
  return {
    type: 'optimize-gate',
    caseName: null,
    message: 'Optimize gate is pending — strict clean re-eval is required before promotion',
  }
}

export function evaluateRunPolicy(results, options = {}) {
  const {
    strict = true,
    allowSkips = false,
    passThreshold = 75,
    optimizeGatePending = false,
  } = options

  const failures = []
  const skipReasons = []
  let requiredRubricsSkipped = 0
  let evaluated = 0
  let passed = 0

  for (const result of results) {
    const status = result.status ?? 'unknown'
    requiredRubricsSkipped += result.requiredRubricsSkipped ?? 0
    skipReasons.push(...collectSkipReasons(result))

    if (status === 'evaluated') {
      evaluated++
      const thresholdFailure = evaluateThresholdFailure(result, passThreshold)
      if (thresholdFailure) failures.push(thresholdFailure)
      else passed++
      continue
    }

    const statusFailure = evaluateStatusFailure(result, strict, allowSkips)
    if (statusFailure) failures.push(statusFailure)
  }

  const rubricFailure = evaluateRequiredRubricFailure(strict, allowSkips, requiredRubricsSkipped)
  if (rubricFailure) failures.push(rubricFailure)

  const allStrictPassing = failures.length === 0
  const gateCanClear = optimizeGatePending && allStrictPassing
  const gateFailure = evaluateOptimizeGateFailure(strict, optimizeGatePending, allStrictPassing)
  if (gateFailure) failures.push(gateFailure)

  const runStatus = failures.length === 0 ? 'PASS' : 'FAIL'
  return {
    runStatus,
    strict,
    allowSkips,
    passThreshold,
    totalCases: results.length,
    evaluatedCases: evaluated,
    passedCases: passed,
    failedCases: results.length - passed,
    requiredRubricsSkipped,
    skipReasons: [...new Set(skipReasons.filter(Boolean))],
    failures,
    gateCanClear,
  }
}
