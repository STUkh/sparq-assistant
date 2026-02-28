/**
 * Naming conventions rubric — validates all ID formats across output types.
 * Checks: REQ IDs, TC IDs, REG IDs, VF IDs, SRC labels, no duplicate IDs.
 * maxScore is dynamic — only counts checks where the ID type is found in content.
 * The duplicate check always counts.
 *
 * Duplicate detection: IDs are expected to appear multiple times when cross-referenced
 * across output files (e.g., REQ-login-001 in requirements doc AND coverage matrix,
 * TC IDs in test cases AND spec file titles). Only flag as duplicates when the same
 * ID appears 3+ times, indicating likely copy-paste errors rather than traceability refs.
 */

/**
 * Validate matched IDs against a strict pattern. Returns null if valid or not present,
 * or a finding string if invalid IDs found.
 */
function validateIds(matches, validPattern, label) {
  if (!matches) return null
  const invalid = matches.filter((id) => !validPattern.test(id))
  if (invalid.length === 0) return null
  return `Invalid ${label}: ${invalid.join(', ')}`
}

const ID_CHECKS = [
  {
    find: /REQ-[a-zA-Z][\w-]*-\d{3}/g,
    valid: /^REQ-[a-z]+(?:-[a-z]+)*-\d{3}$/,
    label: 'REQ IDs (expected REQ-{kebab-case}-{NNN})',
  },
  {
    find: /TC-[\w]+-(?:HP|VE|SEC|EC|A11Y)-\d{3}/g,
    valid: /^TC-\w+-(?:HP|VE|SEC|EC|A11Y)-\d{3}$/,
    label: 'TC IDs',
  },
  {
    find: /REG-[A-Z]+-\d+-\d{3}/g,
    valid: /^REG-[A-Z]+-\d+-\d{3}$/,
    label: 'REG IDs',
  },
  {
    find: /VF-\d+/g,
    valid: /^VF-\d+$/,
    label: 'VF IDs',
  },
  {
    find: /SRC-[A-Z]/g,
    valid: /^SRC-[JCFL]$/,
    label: 'SRC labels (expected SRC-J/C/F/L)',
  },
]

function findDuplicates(allIds) {
  const counts = new Map()
  for (const id of allIds) {
    counts.set(id, (counts.get(id) || 0) + 1)
  }
  // Only flag IDs appearing 3+ times — 2 occurrences is expected cross-referencing
  // (e.g., REQ ID in requirements doc + coverage matrix, TC ID in test case + spec title)
  const dupes = []
  for (const [id, count] of counts) {
    if (count >= 3) dupes.push(id)
  }
  return dupes
}

export function evaluate(content, _checks = [], _options = {}) {
  const findings = []
  let score = 0
  let maxScore = 0

  const allMatched = []

  for (const check of ID_CHECKS) {
    const matches = content.match(check.find)
    if (!matches) continue
    maxScore++
    allMatched.push(...matches)
    const error = validateIds(matches, check.valid, check.label)
    if (error) {
      findings.push(error)
    } else {
      score++
    }
  }

  // Duplicate check — REQ IDs exempt (many tests legitimately trace to same requirement)
  maxScore++
  const nonReqIds = allMatched.filter((id) => !id.startsWith('REQ-'))
  const dupes = findDuplicates(nonReqIds)
  if (dupes.length === 0) {
    score++
  } else {
    findings.push(`Duplicate IDs found: ${dupes.join(', ')}`)
  }

  return { score, maxScore, findings }
}
