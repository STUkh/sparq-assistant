// bin/lib/commands/coverage.mjs — Compute requirement coverage from .sparq/ artifacts

import { existsSync, globSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { emoji, fail, heading, info, ok, style, warn } from '../state.mjs'

// ---------------------------------------------------------------------------
// Artifact Parsing
// ---------------------------------------------------------------------------

const REQ_PATTERN = /REQ-\w+-\d{3}/g
const TC_PATTERN = /TC-\w+-(?:HP|VE|SEC|EC|A11Y)-\d{3}/g

/**
 * Collect unique REQ IDs from all markdown files in .sparq/requirements/.
 * @param {string} sparqDir — absolute path to .sparq/
 * @returns {Set<string>}
 */
export function collectReqIds(sparqDir) {
  const reqDir = join(sparqDir, 'requirements')
  if (!existsSync(reqDir)) return new Set()
  const files = globSync('**/*.md', { cwd: reqDir })
  const ids = new Set()
  for (const file of files) {
    const content = readFileSync(join(reqDir, file), 'utf-8')
    for (const match of content.matchAll(REQ_PATTERN)) {
      ids.add(match[0])
    }
  }
  return ids
}

/**
 * Scan .sparq/test-cases/ and build a reverse map: REQ ID -> [TC IDs].
 * Each TC section contains a **Reqs:** line linking to REQ IDs.
 * @param {string} sparqDir — absolute path to .sparq/
 * @returns {Map<string, string[]>}
 */
export function collectTcLinks(sparqDir) {
  const tcDir = join(sparqDir, 'test-cases')
  if (!existsSync(tcDir)) return new Map()
  const files = globSync('**/*.md', { cwd: tcDir })
  const linkMap = new Map()
  for (const file of files) {
    const content = readFileSync(join(tcDir, file), 'utf-8')
    // Split by TC heading boundaries
    const sections = content.split(/(?=^#{1,4}\s+TC-)/m)
    for (const section of sections) {
      const tcMatch = section.match(TC_PATTERN)
      if (!tcMatch) continue
      const tcId = tcMatch[0]
      for (const reqMatch of section.matchAll(REQ_PATTERN)) {
        const reqId = reqMatch[0]
        if (!linkMap.has(reqId)) linkMap.set(reqId, [])
        linkMap.get(reqId).push(tcId)
      }
    }
  }
  return linkMap
}

/**
 * Compute coverage metrics from requirement IDs and TC link map.
 * @param {Set<string>} reqIds
 * @param {Map<string, string[]>} tcLinkMap
 * @returns {{ total: number, covered: number, uncovered: number, percentage: number, gaps: string[] }}
 */
export function computeCoverage(reqIds, tcLinkMap) {
  const total = reqIds.size
  if (total === 0) return { total: 0, covered: 0, uncovered: 0, percentage: 100, gaps: [] }
  const gaps = []
  let covered = 0
  for (const id of reqIds) {
    const linked = tcLinkMap.get(id)
    if (linked && linked.length > 0) {
      covered++
    } else {
      gaps.push(id)
    }
  }
  const uncovered = total - covered
  const percentage = Math.round((covered / total) * 100)
  return { total, covered, uncovered, percentage, gaps }
}

// ---------------------------------------------------------------------------
// Output Rendering
// ---------------------------------------------------------------------------

function renderHuman(result) {
  heading(`${emoji.coverage}Requirement Coverage`)
  info(`Total requirements:  ${style.bold(String(result.total))}`)
  info(`Covered (1+ tests):  ${style.bold(style.green(String(result.covered)))}`)
  if (result.uncovered > 0) {
    info(`Uncovered:           ${style.bold(style.red(String(result.uncovered)))}`)
  } else {
    info(`Uncovered:           ${style.bold(String(result.uncovered))}`)
  }
  const pctColor =
    result.percentage >= 80 ? style.green : result.percentage >= 50 ? style.yellow : style.red
  info(`Coverage:            ${style.bold(pctColor(`${result.percentage}%`))}`)
  if (result.gaps.length > 0) {
    console.log('')
    warn('Uncovered requirements:')
    for (const gap of result.gaps) {
      console.log(`    ${style.dim('-')} ${gap}`)
    }
  }
  console.log('')
}

function renderJson(result) {
  console.log(JSON.stringify(result, null, 2))
}

// ---------------------------------------------------------------------------
// Command Entry Point
// ---------------------------------------------------------------------------

/**
 * Compute requirement coverage from .sparq/ artifacts.
 * @param {string} targetDir — project root
 * @param {{ format?: string, threshold?: string, workspace?: string }} options
 * @returns {Promise<boolean>} true if coverage passes threshold (or no threshold set)
 */
export async function cmdCoverage(targetDir, options = {}) {
  const sparqDir = join(targetDir, '.sparq')

  if (!existsSync(sparqDir)) {
    fail('No .sparq/ directory found. Run a SparQ workflow first to generate artifacts.')
    return false
  }

  const reqDir = join(sparqDir, 'requirements')
  const tcDir = join(sparqDir, 'test-cases')
  if (!existsSync(reqDir) && !existsSync(tcDir)) {
    fail('No requirements or test-cases found in .sparq/. Run a SparQ workflow first.')
    return false
  }

  const reqIds = collectReqIds(sparqDir)
  const tcLinkMap = collectTcLinks(sparqDir)
  const result = computeCoverage(reqIds, tcLinkMap)

  const format = options.format || 'human'
  if (format === 'json') {
    renderJson(result)
  } else {
    renderHuman(result)
  }

  if (options.threshold != null) {
    const threshold = Number(options.threshold)
    if (!Number.isFinite(threshold) || threshold < 0 || threshold > 100) {
      fail(`Invalid --threshold value: ${options.threshold} (expected 0-100)`)
      return false
    }
    if (result.percentage < threshold) {
      fail(`Coverage ${result.percentage}% is below threshold ${threshold}%`)
      return false
    }
    ok(`Coverage ${result.percentage}% meets threshold ${threshold}%`)
  }

  return true
}
