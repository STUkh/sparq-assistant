/**
 * Regression compliance rubric — evaluates S3 bug mode outputs (inline regression tests).
 * Checks: REG-ID format, single describe block scoped to REG- content, page object reuse,
 * repro steps coverage, ticket ID in content.
 */
export function evaluate(content, _checks = [], options = {}) {
  // Skip files that show no regression intent — feature specs use TC IDs, not REG-
  const hasRegId = /REG-[A-Z]+-\d+-\d{3}/.test(content)
  if (!hasRegId) {
    return { score: 0, maxScore: 0, findings: [], skipped: true }
  }

  const findings = []
  let score = 0
  let maxScore = 0

  // 1. Has REG-{ticket}-{NNN} format
  maxScore++
  if (/REG-[A-Z]+-\d+-\d{3}/.test(content)) {
    score++
  } else {
    findings.push('Missing REG-{ticket}-{NNN} ID format (expected REG-TICKET-N-NNN)')
  }

  // 2. Single spec file (count test.describe blocks with REG- ID <= 1)
  maxScore++
  const regDescribeBlocks = content.match(/test\.describe\s*\([^,]*REG-[A-Z]+-\d+-\d{3}/g)
  const regDescribeCount = regDescribeBlocks ? regDescribeBlocks.length : 0
  if (regDescribeCount <= 1) {
    score++
  } else {
    findings.push(
      `Expected single regression spec (<=1 test.describe with REG- ID), found ${regDescribeCount}`,
    )
  }

  // 3. Page object reuse (import from pages/fixtures)
  maxScore++
  if (/import\s+.*from\s+['"].*(?:pages|fixtures)/.test(content)) {
    score++
  } else {
    findings.push(
      'No page object or fixture imports found (expected import from pages/ or fixtures/)',
    )
  }

  // 4. Repro steps keywords
  maxScore++
  if (/(?:step|reproduce|repro|navigate|click|enter)/i.test(content)) {
    score++
  } else {
    findings.push('No repro step keywords found (step, reproduce, navigate, click, enter)')
  }

  // 5. Ticket ID in content (Jira-style PREFIX-NNN)
  maxScore++
  if (/[A-Z]+-\d+/.test(content)) {
    score++
  } else {
    findings.push('No ticket ID found in content (expected Jira-style PREFIX-NNN)')
  }

  // Advisory: legacy folder deprecation (does not affect score)
  if (options.filePath?.includes('/regression/')) {
    findings.push({
      severity: 'warning',
      message:
        'Regression spec is in legacy regression/ folder. Move inline to the relevant feature spec.',
    })
  }

  return { score, maxScore, findings }
}
