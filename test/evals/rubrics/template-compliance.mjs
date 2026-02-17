/**
 * Template compliance rubric — validates output structure matches template files.
 * Auto-detects output type from content and checks sections relevant to that type.
 * maxScore is dynamic based on detected output types.
 */

const OUTPUT_TYPES = {
  requirements: {
    detect: (c) => /REQ-\w+-\d{3}/.test(c) && /## Requirements/.test(c),
    sections: ['Metadata', 'Sources', 'User Journey', 'Requirements', 'UI Elements'],
  },
  testCases: {
    detect: (c) => /TC-\w+-(?:HP|VE|SEC|EC|A11Y)-\d{3}/.test(c) && /## Summary/.test(c),
    sections: ['Summary', 'Test Cases'],
    patterns: [/TC-\w+-(?:HP|VE|SEC|EC|A11Y)-\d{3}/],
  },
  coverageMatrix: {
    detect: (c) => /Traceability Matrix/.test(c) && /Gap Analysis/.test(c),
    sections: ['Traceability Matrix', 'Gap Analysis'],
  },
  validationReport: {
    detect: (c) => /VF-\d+/.test(c) && /## Findings/.test(c),
    sections: ['Findings'],
    patterns: [/VF-\d+/, /\b(?:Critical|Warning|Info)\b/],
  },
  refreshDiff: {
    detect: (c) =>
      /\b(?:NEW|CHANGED|REMOVED|UNCHANGED)\b/.test(c) &&
      /## Summary/.test(c) &&
      /requirements/.test(c),
    sections: ['Summary'],
    patterns: [/\b(?:NEW|CHANGED|REMOVED|UNCHANGED)\b/],
  },
  executionPlan: {
    detect: (c) => /## Request/.test(c) && /## Sources/.test(c) && /## Phases/.test(c),
    sections: ['Request', 'Sources', 'Phases'],
  },
}

function hasSection(content, sectionName) {
  const escaped = sectionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`^#{1,4}\\s+${escaped}`, 'm').test(content)
}

function checkOutputType(content, typeName, config) {
  const results = { score: 0, maxScore: 0, findings: [] }
  for (const section of config.sections) {
    results.maxScore++
    if (hasSection(content, section)) {
      results.score++
    } else {
      results.findings.push(`${typeName}: missing section "${section}"`)
    }
  }
  for (const pattern of config.patterns ?? []) {
    results.maxScore++
    if (pattern.test(content)) {
      results.score++
    } else {
      results.findings.push(`${typeName}: missing pattern ${pattern}`)
    }
  }
  return results
}

export function evaluate(content, _checks = []) {
  const findings = []
  let score = 0
  let maxScore = 0

  const detected = Object.entries(OUTPUT_TYPES).filter(([, config]) => config.detect(content))

  if (detected.length === 0) {
    return {
      score: 0,
      maxScore: 6,
      findings: [
        'Could not detect output type. Expected one of: requirements, testCases, ' +
          'coverageMatrix, validationReport, refreshDiff, executionPlan',
      ],
    }
  }

  for (const [typeName, config] of detected) {
    const result = checkOutputType(content, typeName, config)
    score += result.score
    maxScore += result.maxScore
    findings.push(...result.findings)
  }

  return { score, maxScore, findings }
}
