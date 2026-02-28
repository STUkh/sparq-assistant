/**
 * Cross-output consistency rubric — validates ID coherence across multi-file outputs.
 * Checks: REQ ID consistency, TC traceability, feature slug alignment,
 *         no phantom IDs, count consistency.
 *
 * Scoring (maxScore = 5):
 *   1. REQ IDs defined in requirements appear in test-case content
 *   2. TC IDs defined in test-cases appear in spec files or elsewhere
 *   3. REQ-{feature} and TC-{feature} use the same feature slug
 *   4. No phantom IDs (orphan definitions or dangling references)
 *   5. Handoff count matches actual output count
 */

const REQ_PATTERN = /REQ-(\w+)-(\d{3})/g
const TC_PATTERN = /TC-(\w+)-(?:HP|VE|SEC|EC|A11Y)-(\d{3})/g
const REG_PATTERN = /REG-[A-Z]+-\d+-\d{3}/g

function extractUniqueIds(content, pattern) {
  return new Set([...content.matchAll(pattern)].map((m) => m[0]))
}

function extractFeatureSlugs(content, pattern) {
  return new Set([...content.matchAll(pattern)].map((m) => m[1]))
}

function hasMultipleIdTypes(content) {
  const hasReq = REQ_PATTERN.test(content)
  REQ_PATTERN.lastIndex = 0
  const hasTc = TC_PATTERN.test(content)
  TC_PATTERN.lastIndex = 0
  const hasReg = REG_PATTERN.test(content)
  REG_PATTERN.lastIndex = 0
  const types = [hasReq, hasTc, hasReg].filter(Boolean).length
  return types >= 2 || (hasReq && hasTc)
}

/**
 * Check 1: REQ IDs defined in requirements content also appear in
 * test-case or spec content (1 point).
 */
function checkReqConsistency(content) {
  const reqIds = extractUniqueIds(content, REQ_PATTERN)
  if (reqIds.size === 0) return { pass: true, finding: '' }

  // Split content into requirement-like sections and test-case sections
  const lines = content.split('\n')
  const reqDefinitions = new Set()
  const reqReferences = new Set()

  for (const line of lines) {
    const lineReqs = [...line.matchAll(/REQ-(\w+)-(\d{3})/g)].map((m) => m[0])
    for (const id of lineReqs) {
      // If line looks like a definition (heading, list item with description)
      if (/^#+\s|^[-*]\s.*REQ-|^REQ-/.test(line.trim())) {
        reqDefinitions.add(id)
      }
      reqReferences.add(id)
    }
  }

  if (reqDefinitions.size === 0) return { pass: true, finding: '' }

  // Check that each defined REQ appears at least once outside its definition context
  // (i.e., referenced in test cases, coverage matrix, etc.)
  const referenced = [...reqDefinitions].filter((id) => {
    const occurrences = (
      content.match(new RegExp(id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []
    ).length
    return occurrences >= 2
  })

  if (referenced.length === reqDefinitions.size) return { pass: true, finding: '' }
  const orphans = [...reqDefinitions].filter((id) => !referenced.includes(id))
  return {
    pass: false,
    finding: `${orphans.length} REQ ID(s) defined but never referenced elsewhere: ${orphans.slice(0, 5).join(', ')}`,
  }
}

/**
 * Check 2: TC IDs defined in test-case content also appear in spec files
 * or are referenced elsewhere in the output (1 point).
 */
function checkTcTraceability(content) {
  const tcIds = extractUniqueIds(content, TC_PATTERN)
  if (tcIds.size === 0) return { pass: true, finding: '' }

  const referenced = [...tcIds].filter((id) => {
    const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return (content.match(new RegExp(escaped, 'g')) || []).length >= 2
  })

  if (referenced.length === tcIds.size) return { pass: true, finding: '' }
  const orphans = [...tcIds].filter((id) => !referenced.includes(id))
  return {
    pass: false,
    finding: `${orphans.length} TC ID(s) not traced to specs or other output: ${orphans.slice(0, 5).join(', ')}`,
  }
}

/**
 * Check 3: Feature slug alignment — REQ-{feature} and TC-{feature}
 * use the same feature slug (1 point).
 */
function checkFeatureSlugAlignment(content) {
  const reqSlugs = extractFeatureSlugs(content, REQ_PATTERN)
  const tcSlugs = extractFeatureSlugs(content, TC_PATTERN)

  if (reqSlugs.size === 0 || tcSlugs.size === 0) return { pass: true, finding: '' }

  // Check that TC slugs are a subset of REQ slugs (or overlap)
  const overlap = [...tcSlugs].filter((s) => reqSlugs.has(s))
  if (overlap.length > 0) return { pass: true, finding: '' }

  return {
    pass: false,
    finding:
      `Feature slug mismatch: REQ uses [${[...reqSlugs].join(', ')}] ` +
      `but TC uses [${[...tcSlugs].join(', ')}]`,
  }
}

/**
 * Check 4: No phantom IDs — every defined ID is referenced at least once
 * elsewhere, and every referenced ID is defined somewhere (1 point).
 */
function checkNoPhantomIds(content) {
  const allReqs = extractUniqueIds(content, REQ_PATTERN)
  const allTcs = extractUniqueIds(content, TC_PATTERN)
  const allIds = new Set([...allReqs, ...allTcs])

  if (allIds.size === 0) return { pass: true, finding: '' }

  const phantoms = []
  for (const id of allIds) {
    const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const count = (content.match(new RegExp(escaped, 'g')) || []).length
    if (count < 2) phantoms.push(id)
  }

  if (phantoms.length === 0) return { pass: true, finding: '' }

  // Allow up to 20% phantom rate for partial outputs
  const phantomRate = phantoms.length / allIds.size
  if (phantomRate <= 0.2) return { pass: true, finding: '' }

  return {
    pass: false,
    finding: `${phantoms.length} phantom ID(s) (defined once, never cross-referenced): ${phantoms.slice(0, 5).join(', ')}`,
  }
}

/**
 * Compare a handoff count against actual count. Returns a mismatch
 * string if they differ by more than 10%, or null if within tolerance.
 */
function compareCount(label, expected, actual) {
  if (actual <= 0) return null
  const tolerance = Math.ceil(expected * 0.1)
  if (Math.abs(actual - expected) <= tolerance) return null
  return `${label}: handoff says ${expected}, found ${actual}`
}

/**
 * Check 5: Count consistency — if handoff JSON contains counts,
 * verify the actual count in the output matches (1 point).
 */
function checkCountConsistency(content) {
  const countPatterns = [
    {
      key: 'testCases',
      pattern: /"testCases"\s*:\s*(\d+)/,
      countFn: () => extractUniqueIds(content, TC_PATTERN).size,
    },
    {
      key: 'specs',
      pattern: /"specs"\s*:\s*(\d+)/,
      countFn: () => (content.match(/\.spec\.ts/g) || []).length,
    },
    {
      key: 'findings',
      pattern: /"findings"\s*:\s*(\d+)/,
      countFn: () => (content.match(/VF-\d+/g) || []).length,
    },
  ]

  const mismatches = []
  let hasAny = false

  for (const { key, pattern, countFn } of countPatterns) {
    const match = content.match(pattern)
    if (!match) continue
    hasAny = true
    const expected = parseInt(match[1], 10)
    const mismatch = compareCount(key, expected, countFn())
    if (mismatch) mismatches.push(mismatch)
  }

  if (!hasAny) return { pass: true, finding: '' }
  if (mismatches.length === 0) return { pass: true, finding: '' }
  return {
    pass: false,
    finding: `Count mismatch in handoff: ${mismatches.join('; ')}`,
  }
}

export function evaluate(content, _checks = [], _options = {}) {
  // Skip if content doesn't contain multiple ID types
  if (!hasMultipleIdTypes(content)) {
    return { score: 0, maxScore: 0, findings: [], skipped: true }
  }

  const findings = []
  let score = 0

  // Check 1: REQ ID consistency
  const reqCheck = checkReqConsistency(content)
  if (reqCheck.pass) {
    score++
  } else {
    findings.push(reqCheck.finding)
  }

  // Check 2: TC traceability
  const tcCheck = checkTcTraceability(content)
  if (tcCheck.pass) {
    score++
  } else {
    findings.push(tcCheck.finding)
  }

  // Check 3: Feature slug alignment
  const slugCheck = checkFeatureSlugAlignment(content)
  if (slugCheck.pass) {
    score++
  } else {
    findings.push(slugCheck.finding)
  }

  // Check 4: No phantom IDs
  const phantomCheck = checkNoPhantomIds(content)
  if (phantomCheck.pass) {
    score++
  } else {
    findings.push(phantomCheck.finding)
  }

  // Check 5: Count consistency
  const countCheck = checkCountConsistency(content)
  if (countCheck.pass) {
    score++
  } else {
    findings.push(countCheck.finding)
  }

  return { score, maxScore: 5, findings }
}
