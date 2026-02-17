// bin/lib/merge.mjs — Parallel execution merge utilities
//
// Pure functions for merging Tier 2 artifacts from parallel Task agents.
// No filesystem I/O — callers handle reading/writing.

// ---------------------------------------------------------------------------
// Barrel Export Merging
// ---------------------------------------------------------------------------

export const EXPORT_RE = /^export\s*\{\s*(\w+)\s*\}/

/**
 * Parse existing export names from barrel file content.
 * @param {string} barrelContent
 * @returns {Set<string>}
 */
const parseExistingExports = (barrelContent) => {
  const exports = new Set()
  for (const line of barrelContent.split('\n')) {
    const match = line.match(EXPORT_RE)
    if (match) exports.add(match[1])
  }
  return exports
}

/**
 * Process a single line from an additions file, updating seen/newLines/added/duplicates.
 * @param {string} line
 * @param {object} ctx - Shared context: { existingExports, seen, newLines, added, duplicates }
 */
const processAdditionLine = (line, ctx) => {
  const trimmed = line.trim()
  if (!trimmed) return

  const match = trimmed.match(EXPORT_RE)
  if (!match) return

  const exportName = match[1]
  if (ctx.seen.has(exportName)) {
    if (!ctx.existingExports.has(exportName) && !ctx.duplicates.includes(exportName)) {
      ctx.duplicates.push(exportName)
    }
    return
  }

  ctx.seen.add(exportName)
  ctx.newLines.push(trimmed)
  ctx.added.push(exportName)
}

/**
 * Merge barrel export additions from parallel Task agents into existing
 * barrel content. Deduplicates by export name, sorts new exports
 * alphabetically, appends after existing content.
 *
 * @param {string} currentBarrel - Current index.ts file content (may be empty)
 * @param {string[]} additionsContents - Array of .additions file contents
 * @returns {{ content: string, added: string[], duplicates: string[] }}
 */
export function mergeBarrelAdditions(currentBarrel, additionsContents) {
  const existingExports = parseExistingExports(currentBarrel)
  const ctx = {
    existingExports,
    seen: new Set(existingExports),
    newLines: [],
    added: [],
    duplicates: [],
  }

  for (const content of additionsContents) {
    for (const line of content.split('\n')) {
      processAdditionLine(line, ctx)
    }
  }

  if (ctx.newLines.length === 0) {
    return { content: currentBarrel, added: ctx.added, duplicates: ctx.duplicates }
  }

  ctx.newLines.sort()

  const base = currentBarrel.trimEnd()
  const merged = base ? `${base}\n${ctx.newLines.join('\n')}\n` : `${ctx.newLines.join('\n')}\n`

  return { content: merged, added: ctx.added, duplicates: ctx.duplicates }
}

// ---------------------------------------------------------------------------
// Registry Partial Merging
// ---------------------------------------------------------------------------

/**
 * Check if a registry key represents a conflict and track it.
 * @param {string} key
 * @param {number} partialIndex
 * @param {object} ctx - { registryEntries, keyOrigins, conflicts }
 */
const detectRegistryConflict = (key, partialIndex, ctx) => {
  const isInOriginal = key in ctx.registryEntries && !ctx.keyOrigins.has(key)
  const isFromOtherPartial = ctx.keyOrigins.has(key) && ctx.keyOrigins.get(key) !== partialIndex

  if (isInOriginal) {
    ctx.conflicts.push(key)
    return
  }
  if (isFromOtherPartial && !ctx.conflicts.includes(key)) {
    ctx.conflicts.push(key)
  }
}

/**
 * Determine if a key is genuinely new (not in original registry or any previous partial).
 * @param {string} key
 * @param {object} ctx - { registryEntries, keyOrigins }
 * @returns {boolean}
 */
const isNewRegistryKey = (key, ctx) => !(key in ctx.registryEntries) && !ctx.keyOrigins.has(key)

/**
 * Merge partial test registry entries from parallel Task agents into an
 * existing registry object. Applies in order — last-write-wins for same key.
 *
 * @param {object|null} currentRegistry - Parsed test-registry.json or null
 * @param {object[]} partials - Array of parsed .partial.json objects
 * @returns {{ registry: object, added: number, conflicts: string[] }}
 */
export function mergeRegistryPartials(currentRegistry, partials) {
  const registry = currentRegistry
    ? structuredClone(currentRegistry)
    : { version: '1.0', lastUpdated: '', entries: {} }

  const ctx = {
    registryEntries: registry.entries,
    keyOrigins: new Map(),
    conflicts: [],
  }
  let added = 0

  for (let i = 0; i < partials.length; i++) {
    const entries = partials[i]?.entries
    if (!entries || typeof entries !== 'object') continue

    for (const [key, value] of Object.entries(entries)) {
      detectRegistryConflict(key, i, ctx)
      if (isNewRegistryKey(key, ctx)) added++
      registry.entries[key] = value
      ctx.keyOrigins.set(key, i)
    }
  }

  registry.lastUpdated = new Date().toISOString()

  return { registry, added, conflicts: ctx.conflicts }
}

// ---------------------------------------------------------------------------
// ID Collision Detection
// ---------------------------------------------------------------------------

/**
 * Detect duplicate TC or VF IDs across entries from multiple sources.
 *
 * @param {Array<{ id: string, source: string }>} entries
 * @returns {Array<{ id: string, sources: string[] }>}
 */
export function detectIdCollisions(entries) {
  const idMap = new Map()

  for (const { id, source } of entries) {
    if (!idMap.has(id)) {
      idMap.set(id, new Set())
    }
    idMap.get(id).add(source)
  }

  const collisions = []
  for (const [id, sources] of idMap) {
    if (sources.size > 1) {
      collisions.push({ id, sources: [...sources].sort() })
    }
  }

  return collisions.sort((a, b) => a.id.localeCompare(b.id))
}

// ---------------------------------------------------------------------------
// Tier Assignment Validation
// ---------------------------------------------------------------------------

/**
 * Validate file write assignments against the three-tier isolation model.
 *
 * @param {Array<{ path: string, taskId: string, tier: 1|2|3 }>} fileAssignments
 * @returns {{ valid: boolean, violations: Array<{ path: string, type: string, taskIds: string[] }> }}
 */
export function validateTierAssignment(fileAssignments) {
  const violations = []

  // Check Tier 1 conflicts: same path from different tasks
  const tier1Files = new Map()
  for (const { path, taskId, tier } of fileAssignments) {
    if (tier === 1) {
      if (!tier1Files.has(path)) {
        tier1Files.set(path, new Set())
      }
      tier1Files.get(path).add(taskId)
    }

    // Check Tier 3 write attempts
    if (tier === 3) {
      violations.push({
        path,
        type: 'tier3_write',
        taskIds: [taskId],
      })
    }
  }

  for (const [path, taskIds] of tier1Files) {
    if (taskIds.size > 1) {
      violations.push({
        path,
        type: 'tier1_conflict',
        taskIds: [...taskIds].sort(),
      })
    }
  }

  return {
    valid: violations.length === 0,
    violations: violations.sort((a, b) => a.path.localeCompare(b.path)),
  }
}

// ---------------------------------------------------------------------------
// ID Renumbering
// ---------------------------------------------------------------------------

const TC_RE = /^(TC-[\w-]+?-(?:HP|VE|SEC|EC|A11Y)-)(\d{3})$/
const VF_RE = /^(VF-)(\d+)$/

/**
 * Parse an ID string and return its prefix and type, or null if malformed.
 * @param {string} id
 * @returns {{ prefix: string, type: 'tc' | 'vf' } | null}
 */
const parseIdPrefix = (id) => {
  const tcMatch = id.match(TC_RE)
  if (tcMatch) return { prefix: tcMatch[1], type: 'tc' }

  const vfMatch = id.match(VF_RE)
  if (vfMatch) return { prefix: vfMatch[1], type: 'vf' }

  return null
}

/**
 * Build groups of IDs keyed by prefix.
 * @param {string[]} ids
 * @returns {Map<string, Array<{ original: string, type: string }>>}
 */
const groupIdsByPrefix = (ids) => {
  const groups = new Map()
  for (const id of ids) {
    const parsed = parseIdPrefix(id)
    if (!parsed) continue
    if (!groups.has(parsed.prefix)) groups.set(parsed.prefix, [])
    groups.get(parsed.prefix).push({ original: id, type: parsed.type })
  }
  return groups
}

/**
 * Format a counter value for the given ID type.
 * @param {number} counter
 * @param {string} type - 'tc' or 'vf'
 * @returns {string}
 */
const formatIdNumber = (counter, type) =>
  type === 'tc' ? String(counter).padStart(3, '0') : String(counter)

/**
 * Re-number a set of IDs to form a contiguous sequence. Groups by prefix,
 * renumbers within each group starting from startFrom.
 *
 * @param {string[]} ids - Array of TC or VF IDs to renumber
 * @param {number} startFrom - Starting number (default 1)
 * @returns {Array<{ original: string, renumbered: string }>}
 */
export function renumberIds(ids, startFrom = 1) {
  const groups = groupIdsByPrefix(ids)
  const results = []

  for (const [prefix, items] of groups) {
    let counter = startFrom
    for (const item of items) {
      results.push({
        original: item.original,
        renumbered: `${prefix}${formatIdNumber(counter, item.type)}`,
      })
      counter++
    }
  }

  return results
}

// ---------------------------------------------------------------------------
// Parallel Handoff Validation
// ---------------------------------------------------------------------------

const VALID_SCENARIOS = new Set(['S1', 'S2', 'S3', 'S4', 'S5', 'S6'])
const VALID_STATUSES = new Set(['success', 'partial', 'failed'])
const PHASE_RE = /^P\d(\.\d)?$/

/**
 * Validate required string fields on a handoff object.
 * @param {object} handoff
 * @returns {string[]} errors
 */
const validateRequiredStrings = (handoff) => {
  const fields = ['version', 'from', 'to', 'scenario', 'phase', 'status', 'instructions']
  const errors = []
  for (const field of fields) {
    if (typeof handoff[field] !== 'string') {
      errors.push(`missing or invalid field: ${field}`)
    }
  }
  return errors
}

/**
 * Validate required object/array fields on a handoff object.
 * @param {object} handoff
 * @returns {string[]} errors
 */
const validateRequiredStructures = (handoff) => {
  const errors = []
  if (!handoff.report || typeof handoff.report !== 'object') {
    errors.push('missing or invalid field: report')
  }
  if (!Array.isArray(handoff.gaps)) {
    errors.push('missing or invalid field: gaps')
  }
  return errors
}

/**
 * Validate enum/format constraints on handoff field values.
 * Only checks fields that are present and are strings.
 * @param {object} handoff
 * @returns {string[]} errors
 */
const validateFieldValues = (handoff) => {
  const errors = []
  if (typeof handoff.version === 'string' && handoff.version !== '1.0') {
    errors.push(`version must be "1.0", got "${handoff.version}"`)
  }
  if (typeof handoff.scenario === 'string' && !VALID_SCENARIOS.has(handoff.scenario)) {
    errors.push(`invalid scenario: "${handoff.scenario}"`)
  }
  if (typeof handoff.phase === 'string' && !PHASE_RE.test(handoff.phase)) {
    errors.push(`invalid phase: "${handoff.phase}"`)
  }
  if (typeof handoff.status === 'string' && !VALID_STATUSES.has(handoff.status)) {
    errors.push(`invalid status: "${handoff.status}"`)
  }
  return errors
}

/**
 * Validate cross-field constraints (failed status + gaps, instructions word count).
 * @param {object} handoff
 * @returns {string[]} errors
 */
const validateCrossFieldRules = (handoff) => {
  const errors = []
  if (handoff.status === 'failed' && Array.isArray(handoff.gaps) && handoff.gaps.length === 0) {
    errors.push('status "failed" requires non-empty gaps array')
  }
  if (typeof handoff.instructions === 'string') {
    const wordCount = handoff.instructions.trim().split(/\s+/).filter(Boolean).length
    if (wordCount > 100) {
      errors.push(`instructions exceeds 100 words (got ${wordCount})`)
    }
  }
  return errors
}

/**
 * Validate the optional parallel field on a handoff object.
 * @param {object} handoff
 * @returns {string[]} errors
 */
const validateParallelField = (handoff) => {
  if (handoff.parallel === undefined) return []

  const p = handoff.parallel
  if (!p || typeof p !== 'object') {
    return ['parallel must be an object']
  }

  const errors = []
  if (typeof p.taskIndex !== 'number' || !Number.isInteger(p.taskIndex)) {
    errors.push('parallel.taskIndex must be an integer')
  }
  if (typeof p.totalTasks !== 'number' || !Number.isInteger(p.totalTasks)) {
    errors.push('parallel.totalTasks must be an integer')
  }
  if (
    Number.isInteger(p.taskIndex) &&
    Number.isInteger(p.totalTasks) &&
    (p.taskIndex < 1 || p.taskIndex > p.totalTasks)
  ) {
    errors.push(`parallel.taskIndex must be 1..${p.totalTasks}, got ${p.taskIndex}`)
  }
  return errors
}

/**
 * Validate the optional report.filesWritten field on a handoff object.
 * @param {object} handoff
 * @returns {string[]} errors
 */
const validateFilesWritten = (handoff) => {
  if (!handoff.report || handoff.report.filesWritten === undefined) return []

  if (!Array.isArray(handoff.report.filesWritten)) {
    return ['report.filesWritten must be an array']
  }

  const errors = []
  for (let i = 0; i < handoff.report.filesWritten.length; i++) {
    if (typeof handoff.report.filesWritten[i] !== 'string') {
      errors.push(`report.filesWritten[${i}] must be a string`)
    }
  }
  return errors
}

/**
 * Validate a parallel handoff object against the extended handoff schema.
 *
 * @param {object} handoff - The handoff object to validate
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateParallelHandoff(handoff) {
  if (!handoff || typeof handoff !== 'object') {
    return { valid: false, errors: ['handoff must be a non-null object'] }
  }

  const errors = [
    ...validateRequiredStrings(handoff),
    ...validateRequiredStructures(handoff),
    ...validateFieldValues(handoff),
    ...validateCrossFieldRules(handoff),
    ...validateParallelField(handoff),
    ...validateFilesWritten(handoff),
  ]

  return { valid: errors.length === 0, errors }
}
