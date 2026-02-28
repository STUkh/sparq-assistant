/**
 * Coverage completeness rubric - validates all 5 test categories are present.
 * Checks: HP, VE, SEC, EC, A11Y categories exist with adequate test counts.
 *
 * Intentionally always-on: this rubric runs on .sparq/*.md artifact files and
 * must report missing categories even when no TC IDs are present — that absence
 * is itself a finding. Routing to the right file type is handled by lint.mjs.
 */
export function evaluate(content, _checks = [], _options = {}) {
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
