/**
 * Coverage completeness rubric - validates all 5 test categories are present.
 * Checks: HP, VE, SEC, EC, A11Y categories exist with adequate test counts.
 */
export function evaluate(content, _checks = []) {
  const findings = []
  let score = 0
  const maxScore = 5

  const categories = [
    { abbr: 'HP', name: 'Happy Path' },
    { abbr: 'VE', name: 'Validation Errors' },
    { abbr: 'SEC', name: 'Security' },
    { abbr: 'EC', name: 'Edge Cases' },
    { abbr: 'A11Y', name: 'Accessibility' },
  ]

  for (const cat of categories) {
    const pattern = new RegExp(`TC-\\w+-${cat.abbr}-\\d{3}`)
    if (pattern.test(content)) {
      score++
    } else {
      findings.push(`Missing category: ${cat.name} (${cat.abbr}) - no test cases found`)
    }
  }

  return { score, maxScore, findings }
}
