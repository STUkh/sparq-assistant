// bin/lib/commands/lint.mjs — Lint generated E2E test files using code-based rubrics

import { existsSync, globSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { PKG_ROOT, SARIF_OUTPUT_PATH, VERSION } from '../constants.mjs'
import { buildSarifReport } from '../sarif.mjs'
import { emoji, fail, heading, info, ok, SYM_FAIL, SYM_WARN, style, warn } from '../state.mjs'

// ---------------------------------------------------------------------------
// Workspace helpers
// ---------------------------------------------------------------------------

/**
 * Read workspace list from root sparq.config.json.
 * Returns an empty array when the file is missing, unreadable, or has no workspaces.
 *
 * @param {string} rootDir - Absolute path to the project root
 * @returns {Array<{path: string, name?: string}>}
 */
function readWorkspaceList(rootDir) {
  const configPath = join(rootDir, 'sparq.config.json')
  if (!existsSync(configPath)) return []
  try {
    const config = JSON.parse(readFileSync(configPath, 'utf-8'))
    return Array.isArray(config.workspaces) ? config.workspaces : []
  } catch {
    return []
  }
}

/**
 * Load lint-relevant config from sparq.config.json.
 * Returns framework hint for rubric routing (null when unknown).
 *
 * @param {string} projectDir - Absolute path to the project root
 * @returns {{ framework: string|null }}
 */
function loadLintConfig(projectDir) {
  const configPath = join(projectDir, 'sparq.config.json')
  if (!existsSync(configPath)) return { framework: null }
  try {
    const config = JSON.parse(readFileSync(configPath, 'utf-8'))
    const fw = config?.e2e?.framework ?? config?.project?.framework ?? null
    return { framework: typeof fw === 'string' ? fw : null }
  } catch {
    return { framework: null }
  }
}

// ---------------------------------------------------------------------------
// Rubric definitions — each has an id, description, and file filter
// ---------------------------------------------------------------------------

const RUBRICS_DIR = join(PKG_ROOT, 'bin', 'lib', 'rubrics')

// Rubrics that run on test code files (.spec.ts, .cy.ts, .test.ts, etc.)
const FILE_RUBRICS = Object.freeze([
  { id: 'flaky-test-detection', label: 'Flaky patterns' },
  { id: 'playwright-syntax', label: 'Playwright syntax' },
  { id: 'cypress-syntax', label: 'Cypress syntax' },
  { id: 'assertion-detection', label: 'Assertion coverage' },
  { id: 'locator-quality', label: 'Locator quality' },
  { id: 'format-compliance', label: 'ID format compliance' },
  { id: 'error-handling-compliance', label: 'Error handling' },
  { id: 'naming-conventions', label: 'Naming conventions' },
  { id: 'executability-check', label: 'Executability check' },
  { id: 'regression-compliance', label: 'Regression compliance' },
])

// Rubrics that run on JSON artifact files in .sparq/ (handoffs, state, parallel)
const ARTIFACT_RUBRICS = Object.freeze([
  { id: 'handoff-compliance', label: 'Handoff compliance' },
  { id: 'parallel-merge', label: 'Parallel merge' },
  { id: 'resume-state-compliance', label: 'Resume state compliance' },
])

// Rubrics that run on markdown output files in .sparq/ (requirements, test cases, etc.)
const MARKDOWN_RUBRICS = Object.freeze([
  { id: 'coverage-completeness', label: 'Coverage completeness' },
  { id: 'cross-output-consistency', label: 'Cross-output consistency' },
  { id: 'requirement-coverage', label: 'Requirement coverage' },
  { id: 'template-compliance', label: 'Template compliance' },
  { id: 'progress-signal-compliance', label: 'Progress signal compliance' },
])

// ---------------------------------------------------------------------------
// File discovery
// ---------------------------------------------------------------------------

const TEST_EXTENSIONS = new Set(['.ts', '.mjs', '.js', '.tsx', '.md'])
const TEST_PATTERNS = ['**/*.spec.ts', '**/*.spec.mjs', '**/*.cy.ts', '**/*.test.ts', '**/*.md']
const IGNORE_DIRS = ['node_modules', 'dist', '.git', '.sparq/parallel', '.sparq/tune']

const ARTIFACT_EXTENSIONS = new Set(['.json', '.jsonl'])
const ARTIFACT_PATTERNS = ['**/*.json', '**/*.jsonl']
const ARTIFACT_IGNORE_DIRS = ['node_modules', 'dist', '.git']

const SPARQ_MD_PATTERNS = ['**/*.md']

function collectFiles(targetPath) {
  const stat = existsSync(targetPath)
  if (!stat) return []

  const files = []
  for (const pattern of TEST_PATTERNS) {
    const matches = globSync(pattern, {
      cwd: targetPath,
      ignore: IGNORE_DIRS.map((d) => `${d}/**`),
    })
    for (const f of matches) {
      const ext = f.slice(f.lastIndexOf('.'))
      if (TEST_EXTENSIONS.has(ext) && !files.includes(f)) {
        files.push(f)
      }
    }
  }
  return files.sort()
}

function collectArtifactFiles(sparqDir) {
  if (!existsSync(sparqDir)) return []

  const files = []
  for (const pattern of ARTIFACT_PATTERNS) {
    const matches = globSync(pattern, {
      cwd: sparqDir,
      ignore: ARTIFACT_IGNORE_DIRS.map((d) => `${d}/**`),
    })
    for (const f of matches) {
      const ext = f.slice(f.lastIndexOf('.'))
      if (ARTIFACT_EXTENSIONS.has(ext) && !files.includes(f)) {
        files.push(f)
      }
    }
  }
  return files.sort()
}

function collectSparqMarkdownFiles(sparqDir) {
  if (!existsSync(sparqDir)) return []

  const files = []
  for (const pattern of SPARQ_MD_PATTERNS) {
    const matches = globSync(pattern, {
      cwd: sparqDir,
      ignore: ARTIFACT_IGNORE_DIRS.map((d) => `${d}/**`),
    })
    for (const f of matches) {
      if (f.endsWith('.md') && !files.includes(f)) {
        files.push(f)
      }
    }
  }
  return files.sort()
}

// ---------------------------------------------------------------------------
// Run rubrics on a single file
// ---------------------------------------------------------------------------

function toFinding(f, rubricLabel) {
  return {
    rubric: rubricLabel,
    message: typeof f === 'string' ? f : f.message,
    severity: typeof f === 'string' ? 'warning' : (f.severity ?? 'warning'),
  }
}

async function runRubric(rubric, content, options = {}) {
  const rubricPath = join(RUBRICS_DIR, `${rubric.id}.mjs`)
  if (!existsSync(rubricPath)) return null
  try {
    const { evaluate } = await import(rubricPath)
    const result = evaluate(content, [], options)
    if (!result || result.skipped || result.maxScore === 0) return null
    const findings = (result.findings ?? []).map((f) => toFinding(f, rubric.label))
    return { score: result.score, maxScore: result.maxScore, findings }
  } catch {
    return null
  }
}

async function lintFile(_filePath, content, rubrics, options = {}) {
  let totalScore = 0
  let totalMax = 0
  const findings = []

  for (const rubric of rubrics) {
    const result = await runRubric(rubric, content, options)
    if (!result) continue
    totalScore += result.score
    totalMax += result.maxScore
    findings.push(...result.findings)
  }

  return { findings, score: totalScore, maxScore: totalMax }
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

function severityIcon(severity) {
  if (severity === 'critical') return style.red(SYM_FAIL)
  if (severity === 'warning') return style.yellow(SYM_WARN)
  return style.dim('·')
}

function renderResults(results, baseDir) {
  let totalFindings = 0
  let totalCritical = 0
  let filesWithIssues = 0

  for (const { file, findings, score, maxScore } of results) {
    if (findings.length === 0) continue
    filesWithIssues++
    totalFindings += findings.length
    totalCritical += findings.filter((f) => f.severity === 'critical').length

    const pct = maxScore > 0 ? Math.round((score / maxScore) * 100) : 100
    const pctColor = pct >= 80 ? style.green : pct >= 60 ? style.yellow : style.red
    const relPath = relative(baseDir, file)
    console.log(`\n  ${style.bold(relPath)} ${style.dim(`(${pctColor(`${pct}%`)})`)}`)

    for (const { rubric, message, severity } of findings) {
      console.log(`    ${severityIcon(severity)} ${style.dim(`[${rubric}]`)} ${message}`)
    }
  }

  return { totalFindings, totalCritical, filesWithIssues, totalFiles: results.length }
}

// ---------------------------------------------------------------------------
// Threshold helpers
// ---------------------------------------------------------------------------

function parseThreshold(raw) {
  if (raw == null) return null
  const n = parseInt(String(raw), 10)
  if (!Number.isFinite(n) || n < 0 || n > 100) {
    warn(`Invalid --threshold value '${raw}' (must be 0-100), ignoring`)
    return null
  }
  return n
}

function buildScanSummary(files, artifactFiles, sparqMdFiles) {
  const parts = []
  if (files.length > 0) parts.push(`${files.length} test file(s)`)
  if (artifactFiles.length > 0) parts.push(`${artifactFiles.length} artifact file(s)`)
  if (sparqMdFiles.length > 0) parts.push(`${sparqMdFiles.length} .sparq markdown file(s)`)
  return parts.join(', ')
}

async function lintFileGroup(baseDir, files, rubrics, results, options = {}) {
  let score = 0
  let maxScore = 0
  for (const file of files) {
    const filePath = join(baseDir, file)
    const content = readFileSync(filePath, 'utf-8')
    const result = await lintFile(filePath, content, rubrics, { ...options, filePath })
    results.push({ file: filePath, ...result })
    score += result.score
    maxScore += result.maxScore
  }
  return { score, maxScore }
}

function renderThreshold(overallPct, threshold, thresholdFailed) {
  const pctColor = overallPct >= threshold ? style.green : style.red
  const thresholdStatus = thresholdFailed ? 'failed' : 'passed'
  const statusColor = thresholdFailed ? style.red : style.green
  console.log(
    `  ${style.dim('Quality score:')} ${pctColor(`${overallPct}%`)} ${style.dim(`(threshold: ${threshold}%)`)} — ${statusColor(thresholdStatus)}`,
  )
}

// ---------------------------------------------------------------------------
// Coverage gate helpers
// ---------------------------------------------------------------------------

/**
 * Parse --coverage-gate value. Returns null if invalid.
 * @param {string|null} raw
 * @returns {number|null}
 */
function parseCoverageGate(raw) {
  if (raw == null) return null
  const n = parseInt(String(raw), 10)
  if (!Number.isFinite(n) || n < 0 || n > 100) {
    warn(`Invalid --coverage-gate value '${raw}' (must be 0-100), ignoring`)
    return null
  }
  return n
}

/**
 * A file is considered "passing" when its score% >= FILE_PASS_THRESHOLD.
 */
const FILE_PASS_THRESHOLD = 70

function renderCoverageGate(passingFiles, totalFiles, passingPct, coverageGate, gateFailed) {
  const pctColor = gateFailed ? style.red : style.green
  const statusColor = gateFailed ? style.red : style.green
  const status = gateFailed ? 'failed' : 'passed'
  console.log(
    `  ${style.dim('Coverage gate:')} ${pctColor(`${passingPct}%`)} of files passing ${style.dim(`(${passingFiles}/${totalFiles}, gate: ${coverageGate}%)`)} — ${statusColor(status)}`,
  )
}

// ---------------------------------------------------------------------------
// SARIF output helpers
// ---------------------------------------------------------------------------

/**
 * Collect per-file, per-rubric findings in the shape expected by buildSarifReport.
 * Each result entry in the results array carries per-finding rubric metadata.
 * We reconstruct rubricId from the rubric label by looking up FILE_RUBRICS.
 *
 * @param {Array<{file: string, findings: Array<{rubric: string, message: string, severity: string}>}>} results
 * @returns {Array<{filePath: string, rubricId: string, findings: Array<{severity: string, message: string}>}>}
 */
function collectSarifInput(results) {
  // Build a label → id reverse map from all rubric lists
  const labelToId = new Map()
  for (const r of [...FILE_RUBRICS, ...ARTIFACT_RUBRICS, ...MARKDOWN_RUBRICS]) {
    labelToId.set(r.label, r.id)
  }

  const sarifInput = []

  for (const { file, findings } of results) {
    // Group findings by rubric label
    const byRubric = new Map()
    for (const finding of findings) {
      const rubricId = labelToId.get(finding.rubric) ?? finding.rubric
      if (!byRubric.has(rubricId)) byRubric.set(rubricId, [])
      byRubric.get(rubricId).push({ severity: finding.severity, message: finding.message })
    }

    for (const [rubricId, rubricFindings] of byRubric) {
      sarifInput.push({ filePath: file, rubricId, findings: rubricFindings })
    }
  }

  return sarifInput
}

/**
 * Write a SARIF report for the given lint results to the default output path.
 * @param {Array<object>} results - lint results array
 * @param {string} resolvedPath - project root (used to resolve SARIF_OUTPUT_PATH)
 */
function writeSarifReport(results, resolvedPath) {
  const sarifInput = collectSarifInput(results)
  const report = buildSarifReport(sarifInput, VERSION)
  const outputPath = join(resolvedPath, SARIF_OUTPUT_PATH)
  const outputDir = dirname(outputPath)
  mkdirSync(outputDir, { recursive: true })
  writeFileSync(outputPath, JSON.stringify(report, null, 2), 'utf-8')
  console.log(`  ${style.dim('SARIF report written to:')} ${SARIF_OUTPUT_PATH}`)
}

// ---------------------------------------------------------------------------
// JSON output
// ---------------------------------------------------------------------------

/**
 * Emit structured JSON summary to stdout.
 * @param {Array<{file: string, findings: Array<{severity: string, message: string, rubric: string}>, score: number, maxScore: number}>} results
 * @param {string} baseDir
 */
function renderJsonOutput(results, baseDir) {
  let totalCritical = 0
  let totalWarnings = 0

  const files = results.map(({ file, findings, score, maxScore }) => {
    const critical = findings.filter((f) => f.severity === 'critical').length
    const warnings = findings.filter((f) => f.severity === 'warning').length
    totalCritical += critical
    totalWarnings += warnings
    return {
      file: relative(baseDir, file),
      score,
      maxScore,
      findings: findings.map(({ severity, message, rubric }) => ({ severity, message, rubric })),
    }
  })

  const output = {
    files,
    summary: {
      total: results.length,
      critical: totalCritical,
      warnings: totalWarnings,
    },
  }

  console.log(JSON.stringify(output, null, 2))
}

// ---------------------------------------------------------------------------
// Coverage gate computation
// ---------------------------------------------------------------------------

function computeCoverageGate(results, coverageGate) {
  const totalFiles = results.length
  let passingFiles = 0
  for (const { score, maxScore } of results) {
    const pct = maxScore > 0 ? (score / maxScore) * 100 : 100
    if (pct >= FILE_PASS_THRESHOLD) passingFiles++
  }
  const passingPct = totalFiles > 0 ? Math.round((passingFiles / totalFiles) * 100) : 100
  const gateFailed = coverageGate != null && passingPct < coverageGate
  return { passingFiles, totalFiles, passingPct, gateFailed }
}

// ---------------------------------------------------------------------------
// Format-specific output renderers
// ---------------------------------------------------------------------------

function renderSarifOutput(results, resolvedPath, coverageGate) {
  writeSarifReport(results, resolvedPath)
  const { passingFiles, totalFiles, passingPct, gateFailed } = computeCoverageGate(
    results,
    coverageGate,
  )
  if (coverageGate != null) {
    renderCoverageGate(passingFiles, totalFiles, passingPct, coverageGate, gateFailed)
  }
  return !gateFailed
}

function renderHumanOutput(results, resolvedPath, _grandTotalScore, _grandTotalMax, options) {
  const threshold = parseThreshold(options.threshold)
  const coverageGate = parseCoverageGate(options.coverageGate)
  const { passingFiles, totalFiles, passingPct, gateFailed } = computeCoverageGate(
    results,
    coverageGate,
  )
  const { totalFindings, totalCritical, filesWithIssues } = renderResults(results, resolvedPath)
  // Per-file average: each file contributes equally, prevents one bad file from tanking the score
  const overallPct = computeOverallPct(results)
  const thresholdFailed = threshold != null && overallPct < threshold

  console.log()
  if (totalFindings === 0) {
    ok(`${totalFiles} file(s) scanned — no issues found`)
    if (threshold != null) ok(`Quality score: ${overallPct}% (threshold: ${threshold}%) — passed`)
    if (coverageGate != null) {
      renderCoverageGate(passingFiles, totalFiles, passingPct, coverageGate, false)
    }
    return true
  }

  const criticalLabel = totalCritical > 0 ? style.red(` (${totalCritical} critical)`) : ''
  warn(`${totalFindings} issue(s) in ${filesWithIssues}/${totalFiles} file(s)${criticalLabel}`)
  if (threshold != null) renderThreshold(overallPct, threshold, thresholdFailed)
  if (coverageGate != null) {
    renderCoverageGate(passingFiles, totalFiles, passingPct, coverageGate, gateFailed)
  }

  if (options.strict && totalCritical > 0) return false
  if (thresholdFailed) return false
  if (gateFailed) return false
  return totalFindings === 0
}

// ---------------------------------------------------------------------------
// Single-path lint run (internal)
// ---------------------------------------------------------------------------

/**
 * Compute per-file average score percentage.
 * Each file with maxScore > 0 contributes equally to the average.
 * Files where all rubrics skipped (maxScore === 0) are excluded.
 */
export function computeOverallPct(results) {
  const scored = results.filter((r) => r.maxScore > 0)
  if (scored.length === 0) return 100
  const sum = scored.reduce((acc, r) => acc + (r.score / r.maxScore) * 100, 0)
  return Math.round(sum / scored.length)
}

async function runAllRubrics(resolvedPath) {
  const sparqDir = join(resolvedPath, '.sparq')
  const lintConfig = loadLintConfig(resolvedPath)
  const files = collectFiles(resolvedPath)
  const artifactFiles = collectArtifactFiles(sparqDir)
  const sparqMdFiles = collectSparqMarkdownFiles(sparqDir)
  const results = []
  // Pass framework config to FILE_RUBRICS only (artifact/markdown rubrics are framework-agnostic)
  const testScores = await lintFileGroup(resolvedPath, files, FILE_RUBRICS, results, lintConfig)
  const artifactScores = await lintFileGroup(sparqDir, artifactFiles, ARTIFACT_RUBRICS, results)
  const mdScores = await lintFileGroup(sparqDir, sparqMdFiles, MARKDOWN_RUBRICS, results)
  const grandTotalScore = testScores.score + artifactScores.score + mdScores.score
  const grandTotalMax = testScores.maxScore + artifactScores.maxScore + mdScores.maxScore
  return { files, artifactFiles, sparqMdFiles, results, grandTotalScore, grandTotalMax }
}

const VALID_FORMATS = new Set(['human', 'sarif', 'json'])

async function lintSinglePath(resolvedPath, options, labelSuffix = '') {
  const format = options.format || 'human'
  if (!VALID_FORMATS.has(format)) {
    fail(`Invalid --format value '${format}' (must be one of: human, sarif, json)`)
    return false
  }
  const coverageGate = parseCoverageGate(options.coverageGate)
  const headingLabel = labelSuffix
    ? `${emoji.audit}SparQ Lint — ${labelSuffix}`
    : `${emoji.audit}SparQ Lint — ${resolvedPath}`
  if (format === 'human') heading(headingLabel)

  if (!existsSync(resolvedPath)) {
    warn(`Path not found: ${resolvedPath}`)
    return false
  }

  const { files, artifactFiles, sparqMdFiles, results, grandTotalScore, grandTotalMax } =
    await runAllRubrics(resolvedPath)

  if (files.length + artifactFiles.length + sparqMdFiles.length === 0) {
    if (format === 'human')
      info('No test files found. Looking for *.spec.ts, *.cy.ts, *.test.ts, *.md')
    if (format === 'json')
      console.log(JSON.stringify({ files: [], summary: { total: 0, critical: 0, warnings: 0 } }))
    return true
  }

  if (format === 'human')
    info(`Scanning ${buildScanSummary(files, artifactFiles, sparqMdFiles)}...`)
  if (format === 'sarif') return renderSarifOutput(results, resolvedPath, coverageGate)
  if (format === 'json') {
    renderJsonOutput(results, resolvedPath)
    const { gateFailed } = computeCoverageGate(results, coverageGate)
    return !gateFailed
  }

  return renderHumanOutput(results, resolvedPath, grandTotalScore, grandTotalMax, options)
}

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

export async function cmdLint(targetPath, options = {}) {
  const rootPath = resolve(targetPath || process.cwd())

  // --all-workspaces: lint every workspace declared in root sparq.config.json
  if (options.allWorkspaces) {
    const workspaces = readWorkspaceList(rootPath)
    if (workspaces.length === 0) {
      warn('No workspaces found in sparq.config.json. Add a "workspaces" array to enable.')
      return false
    }
    let allPassed = true
    for (const ws of workspaces) {
      const wsPath = resolve(rootPath, ws.path)
      const wsLabel = ws.name ?? ws.path
      const passed = await lintSinglePath(wsPath, options, wsLabel)
      if (!passed) allPassed = false
    }
    return allPassed
  }

  // --workspace {path}: lint a single workspace scoped to that subdirectory
  if (options.workspace) {
    const wsPath = resolve(rootPath, options.workspace)
    return lintSinglePath(wsPath, options, options.workspace)
  }

  // Default: lint the target path (existing behavior)
  return lintSinglePath(rootPath, options)
}
