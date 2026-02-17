/**
 * Parallel merge rubric - validates Tier 2 artifacts and merged output
 * from parallel execution. Checks: barrel additions format, duplicate exports,
 * registry structure, TC ID collisions, handoff parallel field.
 */

function findDuplicates(items) {
  const seen = new Set()
  const dupes = []
  for (const item of items) {
    if (seen.has(item)) dupes.push(item)
    seen.add(item)
  }
  return dupes
}

function checkBarrelExports(content) {
  const passed = /^export\s*\{\s*\w+\s*\}\s*from\s*'/m.test(content)
  if (passed) return null
  return "No valid barrel export lines found (expected export { Name } from '...')"
}

function checkDuplicateExports(content) {
  const exportMatches = content.match(/export\s*\{\s*(\w+)\s*\}/g)
  if (!exportMatches) return null
  const names = exportMatches.map((m) => m.match(/\{\s*(\w+)\s*\}/)[1])
  const dupes = findDuplicates(names)
  if (dupes.length === 0) return null
  return `Duplicate exports found: ${dupes.join(', ')}`
}

function checkRegistryStructure(content) {
  if (!content.includes('"entries"')) return null
  const hasVersion = content.includes('"version"')
  const hasEntriesObj = /"entries"\s*:\s*\{/.test(content)
  if (hasVersion && hasEntriesObj) return null
  return 'Registry has "entries" but missing "version" or entries is not an object'
}

function checkTcIdCollisions(content) {
  const tcIds = content.match(/TC-[\w-]+-(?:HP|VE|SEC|EC|A11Y)-\d{3}/g)
  if (!tcIds) return null
  const dupes = findDuplicates(tcIds)
  if (dupes.length === 0) return null
  return `Duplicate TC IDs found: ${dupes.join(', ')}`
}

function checkParallelField(content) {
  if (!content.includes('"parallel"')) return null
  const required = ['taskId', 'totalTasks', 'taskIndex']
  const missing = required.filter((f) => !content.includes(`"${f}"`))
  if (missing.length === 0) return null
  return `Handoff parallel field missing: ${missing.join(', ')}`
}

const MERGE_CHECKS = [
  checkBarrelExports,
  checkDuplicateExports,
  checkRegistryStructure,
  checkTcIdCollisions,
  checkParallelField,
]

export function evaluate(content, _checks = []) {
  const findings = []
  let score = 0
  const maxScore = MERGE_CHECKS.length

  for (const checkFn of MERGE_CHECKS) {
    const finding = checkFn(content)
    if (finding) {
      findings.push(finding)
    } else {
      score++
    }
  }

  return { score, maxScore, findings }
}
