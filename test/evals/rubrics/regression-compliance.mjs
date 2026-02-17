/**
 * Regression compliance rubric — evaluates S6 Bug Regression outputs.
 * Checks: @regression tag, REG-ID format, single spec file, page object reuse,
 * repro steps coverage, ticket ID in content.
 */
export function evaluate(content, _checks = []) {
  const findings = []
  let score = 0
  let maxScore = 0

  // 1. Has @regression tag
  maxScore++
  if (/@regression/.test(content)) {
    score++
  } else {
    findings.push('Missing @regression tag in spec content')
  }

  // 2. Has REG-{ticket}-{NNN} format
  maxScore++
  if (/REG-[A-Z]+-\d+-\d{3}/.test(content)) {
    score++
  } else {
    findings.push('Missing REG-{ticket}-{NNN} ID format (expected REG-TICKET-N-NNN)')
  }

  // 3. Single spec file (count test.describe blocks <= 1)
  maxScore++
  const describeBlocks = content.match(/test\.describe\s*\(/g)
  const describeCount = describeBlocks ? describeBlocks.length : 0
  if (describeCount <= 1) {
    score++
  } else {
    findings.push(`Expected single spec (<=1 test.describe), found ${describeCount}`)
  }

  // 4. Page object reuse (import from pages/fixtures)
  maxScore++
  if (/import\s+.*from\s+['"].*(?:pages|fixtures)/.test(content)) {
    score++
  } else {
    findings.push(
      'No page object or fixture imports found (expected import from pages/ or fixtures/)',
    )
  }

  // 5. Repro steps keywords
  maxScore++
  if (/(?:step|reproduce|repro|navigate|click|enter)/i.test(content)) {
    score++
  } else {
    findings.push('No repro step keywords found (step, reproduce, navigate, click, enter)')
  }

  // 6. Ticket ID in content (Jira-style PREFIX-NNN)
  maxScore++
  if (/[A-Z]+-\d+/.test(content)) {
    score++
  } else {
    findings.push('No ticket ID found in content (expected Jira-style PREFIX-NNN)')
  }

  return { score, maxScore, findings }
}
