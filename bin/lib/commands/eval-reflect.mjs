// bin/lib/commands/eval-reflect.mjs — Eval reflection: save, compare, audit, trends

import { execSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { atomicWriteSync } from '../atomic-write.mjs'
import { PKG_ROOT } from '../constants.mjs'
import { info, style } from '../state.mjs'

// Re-export for backward compatibility
export { atomicWriteSync } from '../atomic-write.mjs'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DATA_DIR = join(PKG_ROOT, 'test', 'evals', 'data')
const RUNS_DIR = join(DATA_DIR, 'runs')
const BASELINES_DIR = join(DATA_DIR, 'baselines')
export const PASS_THRESHOLD = 75
const BASELINE_VERSION = '3.0'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ensureDir(dir) {
  mkdirSync(dir, { recursive: true })
}

// GAP 6.4: branch-aware run filenames
function getCurrentBranch() {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8', timeout: 3000 }).trim()
  } catch {
    return null
  }
}

function branchSuffix() {
  const branch = getCurrentBranch()
  if (!branch || branch === 'main' || branch === 'master') return ''
  return `-${branch.replace(/[^a-z0-9-]/gi, '-').slice(0, 30)}`
}

// GAP 6.2: agent checksums for baseline freshness
function computeAgentChecksums() {
  const agentsDir = join(PKG_ROOT, 'claude', 'agents')
  if (!existsSync(agentsDir)) return {}
  const checksums = {}
  for (const file of readdirSync(agentsDir).filter(
    (f) => f.startsWith('sparq-') && f.endsWith('.md'),
  )) {
    const content = readFileSync(join(agentsDir, file), 'utf-8')
    checksums[file] = createHash('md5').update(content).digest('hex').slice(0, 8)
  }
  return checksums
}

// atomicWriteSync extracted to ../atomic-write.mjs (imported + re-exported above)

function formatTimestamp(date) {
  const p = (n, len = 2) => String(n).padStart(len, '0')
  return (
    `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}` +
    `-${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}` +
    `.${p(date.getMilliseconds(), 3)}`
  )
}

function resolveDirs(dataDir) {
  return {
    runsDir: dataDir ? join(dataDir, 'runs') : RUNS_DIR,
    baselinesDir: dataDir ? join(dataDir, 'baselines') : BASELINES_DIR,
  }
}

function casePct(r) {
  return r.maxScore > 0 ? Math.round((r.score / r.maxScore) * 100) : 0
}

function summarize(results) {
  const evaluated = results.filter((r) => r.status === 'evaluated')
  const totalScore = evaluated.reduce((s, r) => s + r.score, 0)
  const totalMaxScore = evaluated.reduce((s, r) => s + r.maxScore, 0)
  const percentage = totalMaxScore > 0 ? Math.round((totalScore / totalMaxScore) * 100) : 0
  const passed = evaluated.filter((r) => casePct(r) >= PASS_THRESHOLD).length
  return {
    totalScore,
    totalMaxScore,
    percentage,
    evaluated: evaluated.length,
    passed,
    failed: evaluated.length - passed,
  }
}

function deltaColor(d) {
  if (d > 0) return style.green
  if (d < 0) return style.red
  return style.dim
}

// ---------------------------------------------------------------------------
// 1. saveResults
// ---------------------------------------------------------------------------

export function saveResults(results, stats, modelKey, options = {}) {
  const { runsDir, baselinesDir } = resolveDirs(options.dataDir)
  ensureDir(runsDir)
  const now = new Date()
  const strict = options.strict ?? false
  const runStatus = options.runStatus ?? 'UNKNOWN'
  const policy = options.policy ?? null
  const skipReasons = options.skipReasons ?? []
  const requiredRubricsSkipped = options.requiredRubricsSkipped ?? 0
  const improve = options.improve ?? null
  const payload = {
    version: BASELINE_VERSION,
    timestamp: now.toISOString(),
    model: modelKey,
    strict,
    runStatus,
    policy,
    skipReasons,
    requiredRubricsSkipped,
    passThreshold: PASS_THRESHOLD,
    ...(improve ? { improve } : {}),
    stats: {
      apiCalls: stats.apiCalls,
      inputTokens: stats.inputTokens,
      outputTokens: stats.outputTokens,
      durationMs: Date.now() - stats.startTime,
      estimatedCost: 0,
    },
    cases: results,
    summary: summarize(results),
  }
  const json = JSON.stringify(payload, null, 2)
  const filename = `${formatTimestamp(now)}${branchSuffix()}-${modelKey}.json`
  atomicWriteSync(join(runsDir, filename), json)
  info(`Saved run: ${style.dim(filename)}`)

  if (options.baseline) {
    const modelDir = join(baselinesDir, modelKey)
    ensureDir(modelDir)
    const agentChecksums = computeAgentChecksums()
    const evaluated = results.filter((r) => r.status === 'evaluated')
    for (const r of evaluated) {
      const caseStem = r.caseFile
        ? basename(r.caseFile, '.yaml')
        : r.caseName.toLowerCase().replace(/[^a-z0-9]+/g, '-')
      const casePayload = {
        version: BASELINE_VERSION,
        timestamp: now.toISOString(),
        model: modelKey,
        agentChecksums,
        passThreshold: PASS_THRESHOLD,
        case: r,
      }
      atomicWriteSync(join(modelDir, `${caseStem}.json`), JSON.stringify(casePayload, null, 2))
    }
    info(`Saved ${evaluated.length} baseline(s): ${style.dim(`${modelKey}/`)}`)
  }

  return { filename, payload }
}

// ---------------------------------------------------------------------------
// 2. compareToBaseline
// ---------------------------------------------------------------------------

function loadPerCaseBaselines(modelDir) {
  const map = new Map()
  const checksums = new Map()
  if (!existsSync(modelDir)) return { map, checksums: null }
  for (const file of readdirSync(modelDir).filter((f) => f.endsWith('.json'))) {
    try {
      const data = JSON.parse(readFileSync(join(modelDir, file), 'utf-8'))
      if (data.case) map.set(data.case.caseName, casePct(data.case))
      if (data.agentChecksums && checksums.size === 0) {
        for (const [k, v] of Object.entries(data.agentChecksums)) checksums.set(k, v)
      }
    } catch {
      // skip corrupted baseline files
    }
  }
  return { map, checksums: checksums.size > 0 ? checksums : null }
}

function loadLegacyBaseline(baselinesDir, modelKey) {
  const map = new Map()
  const legacyPath = join(baselinesDir, `${modelKey}.json`)
  if (!existsSync(legacyPath)) return map
  try {
    const legacy = JSON.parse(readFileSync(legacyPath, 'utf-8'))
    for (const c of legacy.cases ?? []) map.set(c.caseName, casePct(c))
  } catch {
    // skip corrupted legacy baseline
  }
  return map
}

function loadBaselineMap(baselinesDir, modelKey) {
  const perCase = loadPerCaseBaselines(join(baselinesDir, modelKey))
  if (perCase.map.size > 0) return perCase
  return { map: loadLegacyBaseline(baselinesDir, modelKey), checksums: null }
}

function printComparisonRow(r, baselineMap, regressions) {
  const curPct = casePct(r)
  const basePct = baselineMap.get(r.caseName) ?? null
  const baseStr = basePct !== null ? `${String(basePct).padStart(3)}%` : '  - '
  const curStr = `${String(curPct).padStart(3)}%`
  let deltaStr = '   - '
  if (basePct !== null) {
    const d = curPct - basePct
    const sign = d > 0 ? '+' : ''
    deltaStr = deltaColor(d)(`${sign}${d}%`.padStart(5))
    if (d < 0) regressions.push(r.caseName)
  }
  console.log(`  ${r.caseName.padEnd(32)} ${baseStr}  ${curStr}  ${deltaStr}`)
}

function checkBaselineFreshness(baselineChecksums) {
  if (!baselineChecksums) return
  const current = computeAgentChecksums()
  const changed = []
  for (const [file, hash] of baselineChecksums) {
    if (current[file] && current[file] !== hash) changed.push(file.replace(/\.md$/, ''))
  }
  if (changed.length > 0) {
    console.log(
      `  ${style.yellow(`Baseline stale — ${changed.length} agent(s) changed since baseline: ${changed.join(', ')}`)}`,
    )
  }
}

export function compareToBaseline(results, modelKey, options = {}) {
  const { baselinesDir } = resolveDirs(options.dataDir)
  const { map: baselineMap, checksums: baselineChecksums } = loadBaselineMap(baselinesDir, modelKey)
  if (baselineMap.size === 0) return null

  const currentSummary = summarize(results)
  const regressions = []

  checkBaselineFreshness(baselineChecksums)

  // Calculate baseline overall from matched cases only
  let baseTotal = 0
  let baseCount = 0
  for (const [, pct] of baselineMap) {
    baseTotal += pct
    baseCount++
  }
  const baselinePct = baseCount > 0 ? Math.round(baseTotal / baseCount) : 0

  console.log(`\n  Baseline Comparison (${style.bold(modelKey)})`)
  console.log(`  ${'─'.repeat(56)}`)
  console.log(`  ${'Case'.padEnd(32)} Base  Curr  Delta`)
  console.log(`  ${'─'.repeat(56)}`)

  for (const r of results) {
    if (r.status === 'evaluated') printComparisonRow(r, baselineMap, regressions)
  }

  const delta = currentSummary.percentage - baselinePct
  const sign = delta > 0 ? '+' : ''
  console.log(`  ${'─'.repeat(56)}`)
  console.log(
    `  ${'Overall'.padEnd(32)} ${String(baselinePct).padStart(3)}%` +
      `  ${String(currentSummary.percentage).padStart(3)}%` +
      `  ${deltaColor(delta)(`${sign}${delta}%`.padStart(5))}`,
  )
  // GAP 3.4: delta direction tracking
  const direction = delta > 2 ? 'improving' : delta < -2 ? 'declining' : 'stable'
  const dirLabel =
    direction === 'improving'
      ? style.green(direction)
      : direction === 'declining'
        ? style.red(direction)
        : style.dim(direction)
  console.log(`  Direction: ${dirLabel}`)
  console.log()
  if (regressions.length > 0) {
    console.log(`  ${style.red(`Regressions: ${regressions.join(', ')}`)}`)
    console.log()
  }
  return { baselinePct, currentPct: currentSummary.percentage, delta, regressions, direction }
}

// ---------------------------------------------------------------------------
// 3. auditPrompts
// ---------------------------------------------------------------------------

function auditSingleAgent(file, agentsDir) {
  const content = readFileSync(join(agentsDir, file), 'utf-8')
  const lines = content.split('\n').length
  const name = basename(file, '.md')
  const hasFrontmatter = content.startsWith('---')
  const hasDone = /<done_criteria>/.test(content)
  const hasRefs = /<references>/.test(content)
  const hasProgress = /<progress_signals>/.test(content)
  const warnings = []

  if (lines > 300) warnings.push(`${lines} lines (>300)`)
  if (!hasFrontmatter) warnings.push('no frontmatter')
  if (!hasDone) warnings.push('no <done_criteria>')
  if (!hasRefs) warnings.push('no <references>')
  if (!hasProgress) warnings.push('no <progress_signals>')

  const ck = (v) => (v ? style.green('Y') : style.red('N'))
  const warnStr = warnings.length > 0 ? style.yellow(warnings.join('; ')) : style.dim('OK')
  const lc = lines > 300 ? style.yellow : style.dim
  console.log(
    `  ${name.padEnd(28)} ${lc(String(lines).padStart(4))}` +
      `  ${ck(hasFrontmatter).padEnd(4)}` +
      `${ck(hasDone).padEnd(6)}` +
      `${ck(hasRefs).padEnd(6)}` +
      `${ck(hasProgress).padEnd(6)}` +
      `${warnStr}`,
  )
  return {
    name,
    lines,
    hasRequiredSections: hasFrontmatter && hasDone && hasRefs && hasProgress,
    warnings,
  }
}

export function auditPrompts() {
  const agentsDir = join(PKG_ROOT, 'claude', 'agents')
  const files = readdirSync(agentsDir).filter((f) => f.startsWith('sparq-') && f.endsWith('.md'))

  console.log(`\n  Prompt Audit`)
  console.log(`  ${'─'.repeat(62)}`)
  console.log(`  ${'Agent'.padEnd(28)} Lines  FM  Done  Refs  Prog  Warns`)
  console.log(`  ${'─'.repeat(62)}`)

  const agents = files.map((f) => auditSingleAgent(f, agentsDir))

  console.log(`  ${'─'.repeat(62)}`)
  const warnCount = agents.filter((a) => a.warnings.length > 0).length
  if (warnCount === 0) {
    console.log(`  ${style.green('All agents pass audit checks.')}`)
  } else {
    console.log(`  ${style.yellow(`${warnCount} agent(s) with warnings.`)}`)
  }
  console.log()
  return { agents }
}

// ---------------------------------------------------------------------------
// 4. showTrends
// ---------------------------------------------------------------------------

function printTrendRows(files, runsDir) {
  const pcts = []
  for (const file of files) {
    const data = JSON.parse(readFileSync(join(runsDir, file), 'utf-8'))
    const pct = data.summary?.percentage ?? 0
    pcts.push(pct)
    const ts = data.timestamp?.slice(0, 19).replace('T', ' ') ?? file.slice(0, 15)
    const model = (data.model ?? '?').padEnd(10)
    const verdict = pct >= PASS_THRESHOLD ? style.green('PASS') : style.red('FAIL')
    console.log(`  ${ts.padEnd(20)} ${model} ${String(pct).padStart(3)}%   ${verdict}`)
  }
  return pcts
}

export function showTrends(modelKey, options = {}) {
  const { runsDir } = resolveDirs(options.dataDir)
  if (!existsSync(runsDir)) {
    info('No runs saved yet.')
    return
  }
  let files = readdirSync(runsDir)
    .filter((f) => f.endsWith('.json'))
    .sort()
  if (modelKey) {
    files = files.filter((f) => f.endsWith(`-${modelKey}.json`))
  }
  if (files.length === 0) {
    info(modelKey ? `No runs found for ${style.bold(modelKey)}.` : 'No runs found.')
    return
  }

  console.log(`\n  Score History${modelKey ? ` (${style.bold(modelKey)})` : ''}`)
  console.log(`  ${'─'.repeat(56)}`)
  console.log(`  ${'Timestamp'.padEnd(20)} ${'Model'.padEnd(10)} Score  Result`)
  console.log(`  ${'─'.repeat(56)}`)

  const pcts = printTrendRows(files, runsDir)
  if (pcts.length >= 3) {
    const recent = pcts.slice(-3)
    const trend =
      recent[2] > recent[0]
        ? style.green('improving')
        : recent[2] < recent[0]
          ? style.red('declining')
          : style.dim('stable')
    console.log(`  ${'─'.repeat(56)}`)
    console.log(`  Trend (last 3 runs): ${trend}`)
  }
  console.log()
}

// ---------------------------------------------------------------------------
// 5. detectConvergence — GAP 3.1: oscillation, stagnation, iteration limit
// ---------------------------------------------------------------------------

function loadCaseScores(caseName, modelKey, runsDir) {
  let files = readdirSync(runsDir).filter((f) => f.endsWith('.json'))
  if (modelKey) files = files.filter((f) => f.endsWith(`-${modelKey}.json`))
  files.sort()

  const scores = []
  for (const f of files.slice(-6)) {
    try {
      const run = JSON.parse(readFileSync(join(runsDir, f), 'utf-8'))
      const match = (run.cases ?? []).find(
        (c) =>
          c.caseName === caseName || (c.caseFile && basename(c.caseFile, '.yaml') === caseName),
      )
      if (match) scores.push(casePct(match))
    } catch {} // skip corrupted run files
  }
  return scores
}

function checkOscillation(scores) {
  if (scores.length < 3) return null
  const deltas = scores.slice(1).map((s, i) => s - scores[i])
  const signs = deltas.map((d) => Math.sign(d))
  if (signs[0] === 0) return null
  for (let i = 1; i < signs.length; i++) {
    if (signs[i] === 0 || signs[i] === signs[i - 1]) return null
  }
  return `Score oscillating across ${scores.length} runs: ${scores.map((s) => `${s}%`).join(' \u2192 ')}`
}

function checkStagnation(scores) {
  if (scores.length < 3) return null
  const recent3 = scores.slice(-3)
  const range = Math.max(...recent3) - Math.min(...recent3)
  if (range >= 2) return null
  return (
    `Score stagnant at ~${recent3[recent3.length - 1]}% across ` +
    `${recent3.length} runs (range: ${range.toFixed(1)}%)`
  )
}

function checkExhaustion(scores) {
  if (scores.length < 5) return null
  if (scores[scores.length - 1] > scores[0]) return null
  return (
    `${scores.length} iterations without net improvement ` +
    `(${scores[0]}% \u2192 ${scores[scores.length - 1]}%)`
  )
}

export function detectConvergence(caseName, modelKey, options = {}) {
  const { runsDir } = resolveDirs(options.dataDir)
  if (!existsSync(runsDir)) return { status: 'insufficient-data', iterations: 0, scores: [] }

  const scores = loadCaseScores(caseName, modelKey, runsDir)
  if (scores.length < 2) return { status: 'insufficient-data', iterations: scores.length, scores }

  const checks = [
    [checkOscillation, 'oscillating'],
    [checkStagnation, 'stagnant'],
    [checkExhaustion, 'exhausted'],
  ]
  for (const [fn, status] of checks) {
    const message = fn(scores)
    if (message) return { status, iterations: scores.length, scores, message }
  }

  return { status: 'healthy', iterations: scores.length, scores }
}

// ---------------------------------------------------------------------------
// 6. loadLatestResults
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 7. parseReflection — GAP 4.1: structured reflection parsing & validation
// ---------------------------------------------------------------------------

const REQUIRED_SECTIONS = ['## Metadata', '## Summary', '## Priority Fixes']

export function parseReflection(content) {
  const errors = []

  // Check required headings
  for (const heading of REQUIRED_SECTIONS) {
    if (!content.includes(heading)) errors.push(`Missing section: ${heading}`)
  }

  // Extract metadata fields
  const metadata = {}
  const metaBlock = content.match(/## Metadata\n([\s\S]*?)(?=\n## )/)?.[1] ?? ''
  for (const [, key, val] of metaBlock.matchAll(/^- (.+?):\s*(.+)$/gm)) {
    metadata[key.trim()] = val.trim()
  }
  if (!metadata.Run) errors.push('Metadata missing "Run" field')
  if (!metadata.Model) errors.push('Metadata missing "Model" field')

  // Extract priority fixes
  const fixes = []
  const fixBlock = content.match(/## Priority Fixes\n([\s\S]*?)(?=\n## |$)/)?.[1] ?? ''
  for (const [, num, text] of fixBlock.matchAll(/^(\d+)\.\s+\*\*(.+?)\*\*/gm)) {
    fixes.push({ rank: Number(num), text })
  }

  // Extract per-case sections
  const cases = []
  for (const [, name, pct] of content.matchAll(/^### (.+?)\s+\((\d+)%\)/gm)) {
    cases.push({ name, percentage: Number(pct) })
  }

  return {
    valid: errors.length === 0,
    errors,
    metadata,
    fixes,
    cases,
    timestamp: metadata.Run?.match(/\d{8}/)?.[0] ?? null,
  }
}

// ---------------------------------------------------------------------------
// 8. loadLatestReflection — find most recent reflection file
// ---------------------------------------------------------------------------

export function loadLatestReflection(options = {}) {
  const dataDir = options.dataDir ?? DATA_DIR
  const reflectDir = join(dataDir, 'reflections')
  if (!existsSync(reflectDir)) return null
  const files = readdirSync(reflectDir)
    .filter((f) => f.endsWith('.md'))
    .sort()
  if (files.length === 0) return null
  const latest = files[files.length - 1]
  const content = readFileSync(join(reflectDir, latest), 'utf-8')
  const parsed = parseReflection(content)

  // GAP 4.3: check freshness — warn if 3+ runs exist since this reflection
  let staleWarning = null
  const { runsDir } = resolveDirs(dataDir)
  if (existsSync(runsDir)) {
    const reflectTs = latest.replace('.md', '')
    const runFiles = readdirSync(runsDir)
      .filter((f) => f.endsWith('.json'))
      .sort()
    const newerRuns = runFiles.filter((f) => f.slice(0, reflectTs.length) > reflectTs)
    if (newerRuns.length >= 3) {
      staleWarning =
        `Reflection is stale — ${newerRuns.length} run(s) since it was generated. ` +
        'Consider running /sparq:eval-reflect first.'
    }
  }

  return { filename: latest, content, parsed, staleWarning }
}

// ---------------------------------------------------------------------------
// 9. loadLatestResults
// ---------------------------------------------------------------------------

export function loadLatestResults(modelKey, options = {}) {
  const { runsDir } = resolveDirs(options.dataDir)
  if (!existsSync(runsDir)) return null
  let files = readdirSync(runsDir).filter((f) => f.endsWith('.json'))
  if (modelKey) {
    files = files.filter((f) => f.endsWith(`-${modelKey}.json`))
  }
  files.sort()
  if (files.length === 0) return null
  const latest = files[files.length - 1]
  try {
    return JSON.parse(readFileSync(join(runsDir, latest), 'utf-8'))
  } catch {
    info(`Warning: could not parse ${style.dim(latest)}`)
    return null
  }
}
