// bin/lib/eval/file-checks.mjs — per-output checks and scoring helpers

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const FILE_CHECK_HANDLERS = [
  {
    key: 'has_section',
    evaluate(content, value) {
      const sectionName = typeof value === 'string' ? value : ''
      const pattern = new RegExp(`^#{1,4}\\s+${escapeRegExp(sectionName)}`, 'm')
      return {
        passed: pattern.test(content),
        msg: `has_section: "${sectionName}" not found`,
      }
    },
  },
  {
    key: 'has_pattern',
    evaluate(content, value) {
      const pattern = typeof value === 'string' ? value : ''
      return {
        passed: new RegExp(pattern).test(content),
        msg: `has_pattern: "${pattern}" not found`,
      }
    },
  },
  {
    key: 'no_pattern',
    evaluate(content, value) {
      const pattern = typeof value === 'string' ? value : ''
      return {
        passed: !new RegExp(pattern).test(content),
        msg: `no_pattern: "${pattern}" unexpectedly found`,
      }
    },
  },
  {
    key: 'min_count',
    evaluate(content, value) {
      const matches = content.match(/REQ-\w+-\d{3}/g)
      const count = matches?.length ?? 0
      return {
        passed: count >= value,
        msg: `min_count: expected >= ${value}, found ${count}`,
      }
    },
  },
  {
    key: 'min_test_count',
    evaluate(content, value) {
      const matches = content.match(/TC-\w+-(?:HP|VE|SEC|EC|A11Y)-\d{3}/g)
      const count = matches?.length ?? 0
      return {
        passed: count >= value,
        msg: `min_test_count: expected >= ${value}, found ${count}`,
      }
    },
  },
  {
    key: 'has_severity_counts',
    evaluate(content) {
      const passed = /\b(Critical|Warning|Info)\b/.test(content) && /\b\d+\b/.test(content)
      return {
        passed,
        msg: 'Missing severity counts (expected Critical/Warning/Info with counts)',
      }
    },
  },
  {
    key: 'has_tms_id',
    evaluate(content, value) {
      const provider = typeof value === 'string' ? value : '\\w+'
      const pattern = new RegExp(`tmsId:\\s*${provider}:\\d+`)
      return {
        passed: pattern.test(content),
        msg: `has_tms_id: "${provider}:*" not found`,
      }
    },
  },
]

function evaluateSingleCheck(content, check) {
  for (const handler of FILE_CHECK_HANDLERS) {
    if (check[handler.key] === undefined) continue
    return handler.evaluate(content, check[handler.key])
  }
  return null
}

export function evaluateFileChecks(content, checks) {
  let score = 0
  let maxScore = 0
  const findings = []

  for (const check of checks) {
    const result = evaluateSingleCheck(content, check)
    if (!result) continue

    maxScore++
    if (result.passed) score++
    else findings.push(result.msg)
  }

  return { score, maxScore, findings }
}

export function printMissingOutputs(fileResults) {
  console.log('  Status: NO OUTPUTS FOUND')
  console.log('  Expected files not found:')
  for (const f of fileResults) console.log(`    - ${f.path}`)
  console.log('  Run the corresponding scenario to generate outputs first.\n')
}

export function scoreAndPrint(rubricResult, foundFiles) {
  for (const file of foundFiles) {
    const checkResult = evaluateFileChecks(file.content, file.checks)
    rubricResult.totalScore += checkResult.score
    rubricResult.totalMax += checkResult.maxScore
    rubricResult.findings.push(...checkResult.findings)
  }

  const pct =
    rubricResult.totalMax > 0
      ? Math.round((rubricResult.totalScore / rubricResult.totalMax) * 100)
      : 0
  console.log(`  Score: ${rubricResult.totalScore}/${rubricResult.totalMax} (${pct}%)`)

  if (rubricResult.findings.length > 0) {
    console.log('  Findings:')
    for (const finding of rubricResult.findings) console.log(`    - ${finding}`)
  }

  console.log()
  return { totalScore: rubricResult.totalScore, totalMax: rubricResult.totalMax }
}
