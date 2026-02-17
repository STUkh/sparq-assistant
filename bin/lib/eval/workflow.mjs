// bin/lib/eval/workflow.mjs — high-level eval composition

import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { compareToBaseline, PASS_THRESHOLD, saveResults } from '../commands/eval-reflect.mjs'
import { checkOptimizeGate, clearOptimizeMarker } from '../commands/eval-state.mjs'
import { PKG_ROOT } from '../constants.mjs'
import { info, style, warn } from '../state.mjs'
import { collectFileResults, findExactMatch } from './artifact-resolver.mjs'
import { listEvalCaseFiles, parseEvalCase } from './case-loader.mjs'
import { printMissingOutputs, scoreAndPrint } from './file-checks.mjs'
import { getScenarioPipeline } from './metadata.mjs'
import { updateBaselinePolicyStateFromRun } from './persistence.mjs'
import { executePipeline, formatDuration } from './pipeline-executor.mjs'
import { evaluateRunPolicy } from './policy.mjs'
import {
  callModelApi,
  createStats,
  resolveProviderOrThrow,
  validateProviderEnv,
} from './provider.mjs'
import { printBanner, printEvalStatusLines, printSummary, resultPct } from './reporting.mjs'
import { scoreWithRubrics } from './rubric-runner.mjs'

const EVALS_DIR = join(PKG_ROOT, 'test', 'evals')
const CASES_DIR = join(EVALS_DIR, 'cases')
const RUBRICS_DIR = join(EVALS_DIR, 'rubrics')

function cleanWorkspace(projectRoot) {
  for (const dir of ['e2e', '.sparq']) {
    const path = resolve(projectRoot, dir)
    if (existsSync(path)) rmSync(path, { recursive: true, force: true })
  }
}

function scoredPercentage(score, maxScore) {
  return maxScore > 0 ? Math.round((score / maxScore) * 100) : 0
}

async function evaluateCase(casePath, projectRoot, provider, stats, options = {}) {
  const evalCase = parseEvalCase(casePath)

  if (provider.type !== 'mock') {
    return evaluateCaseExecute(evalCase, casePath, projectRoot, provider, stats)
  }

  return evaluateCaseMock(evalCase, casePath, projectRoot, provider, stats, options)
}

async function evaluateCaseMock(evalCase, casePath, projectRoot, provider, stats, options = {}) {
  const { compact = false } = options
  const fileResults = collectFileResults(evalCase.expected_outputs, projectRoot)
  const foundFiles = fileResults.filter((file) => file.status === 'found')

  if (foundFiles.length === 0) {
    if (compact) {
      console.log(`  ${style.dim('--')}  ${evalCase.name} ${style.dim(`[${evalCase.scenario}]`)}`)
    } else {
      console.log(`\n  Case: ${evalCase.name} (${evalCase.scenario})`)
      console.log(`  ${'─'.repeat(50)}`)
      printMissingOutputs(fileResults)
    }

    return {
      caseName: evalCase.name,
      caseFile: relative(PKG_ROOT, casePath),
      scenario: evalCase.scenario,
      score: 0,
      maxScore: 0,
      status: 'no-outputs',
      rubricResults: [],
      skippedRubrics: [],
      requiredRubricsSkipped: 0,
      pipeline: [],
    }
  }

  console.log(`\n  ${style.cyan(evalCase.scenario)}  ${evalCase.name}`)
  console.log(`  ${'─'.repeat(50)}`)
  for (const file of fileResults) {
    const icon = file.status === 'found' ? style.green('OK') : style.red('MISS')
    console.log(`    [${icon}] ${file.path}`)
  }

  const missingFiles = fileResults.filter((file) => file.status === 'missing')
  const missingPenalty = missingFiles.length
  const combinedContent = foundFiles.map((file) => file.content).join('\n---\n')
  const rubricResult = await scoreWithRubrics({
    rubrics: evalCase.rubrics,
    scenario: evalCase.scenario,
    content: combinedContent,
    checks: [],
    provider,
    stats,
    rubricsDir: RUBRICS_DIR,
    callModelApi,
  })

  rubricResult.totalMax += missingPenalty
  if (missingPenalty > 0) {
    rubricResult.findings.push(
      `${missingPenalty} expected output(s) missing: ${missingFiles.map((file) => file.path).join(', ')}`,
    )
  }

  const { totalScore, totalMax } = scoreAndPrint(rubricResult, foundFiles)

  return {
    caseName: evalCase.name,
    caseFile: relative(PKG_ROOT, casePath),
    scenario: evalCase.scenario,
    score: totalScore,
    maxScore: totalMax,
    percentage: scoredPercentage(totalScore, totalMax),
    status: 'evaluated',
    rubricResults: rubricResult.rubricResults,
    skippedRubrics: rubricResult.skippedRubrics,
    requiredRubricsSkipped: rubricResult.requiredRubricsSkipped,
    pipeline: (getScenarioPipeline(evalCase.scenario) ?? []).map((step) => step.agent),
  }
}

async function evaluateCaseExecute(evalCase, casePath, projectRoot, provider, stats) {
  console.log(`  Case: ${evalCase.name} (${evalCase.scenario})`)
  console.log(`  ${'─'.repeat(50)}`)

  let artifacts
  try {
    artifacts = await executePipeline(evalCase, provider, stats, { callModelApi, style })
  } catch (error) {
    console.log(`  ERROR: ${error.message}\n`)
    return {
      caseName: evalCase.name,
      caseFile: relative(PKG_ROOT, casePath),
      scenario: evalCase.scenario,
      score: 0,
      maxScore: 0,
      status: 'api-error',
      rubricResults: [],
      skippedRubrics: [],
      requiredRubricsSkipped: 0,
      pipeline: [],
    }
  }

  const fileResults = []
  for (const output of evalCase.expected_outputs) {
    const content = findExactMatch(artifacts, output.path) ?? ''
    const status = content ? 'found' : 'missing'
    fileResults.push({ path: output.path, status, content, checks: output.checks })
    const icon = status === 'found' ? style.green('OK') : style.red('MISS')
    console.log(`  [${icon}] ${output.path}`)
  }

  const foundFiles = fileResults.filter((file) => file.status === 'found')
  if (foundFiles.length === 0) {
    console.log('  No artifacts extracted from API response.\n')
    return {
      caseName: evalCase.name,
      caseFile: relative(PKG_ROOT, casePath),
      scenario: evalCase.scenario,
      score: 0,
      maxScore: 0,
      status: 'no-artifacts',
      rubricResults: [],
      skippedRubrics: [],
      requiredRubricsSkipped: 0,
      pipeline: [],
    }
  }

  for (const [path, content] of artifacts) {
    const fullPath = resolve(projectRoot, path)
    mkdirSync(dirname(fullPath), { recursive: true })
    writeFileSync(fullPath, content, 'utf-8')
  }
  console.log(`  Wrote ${artifacts.size} artifact(s) to disk`)

  for (const file of foundFiles) {
    const pad = Math.max(1, 47 - file.path.length)
    console.log(`\n  ┌─ ${style.cyan(file.path)} ${'─'.repeat(pad)}`)
    for (const line of file.content.split('\n')) console.log(`  │ ${line}`)
    console.log(`  └${'─'.repeat(50)}`)
  }
  console.log()

  const missingFiles = fileResults.filter((file) => file.status === 'missing')
  const missingPenalty = missingFiles.length
  const combinedContent = foundFiles.map((file) => file.content).join('\n---\n')
  const rubricResult = await scoreWithRubrics({
    rubrics: evalCase.rubrics,
    scenario: evalCase.scenario,
    content: combinedContent,
    checks: [],
    provider,
    stats,
    rubricsDir: RUBRICS_DIR,
    callModelApi,
  })
  rubricResult.totalMax += missingPenalty
  if (missingPenalty > 0) {
    rubricResult.findings.push(
      `${missingPenalty} expected output(s) missing: ${missingFiles.map((file) => file.path).join(', ')}`,
    )
  }

  const { totalScore, totalMax } = scoreAndPrint(rubricResult, foundFiles)

  return {
    caseName: evalCase.name,
    caseFile: relative(PKG_ROOT, casePath),
    scenario: evalCase.scenario,
    score: totalScore,
    maxScore: totalMax,
    percentage: scoredPercentage(totalScore, totalMax),
    status: 'evaluated',
    rubricResults: rubricResult.rubricResults,
    skippedRubrics: rubricResult.skippedRubrics,
    requiredRubricsSkipped: rubricResult.requiredRubricsSkipped,
    pipeline: (getScenarioPipeline(evalCase.scenario) ?? []).map((step) => step.agent),
  }
}

function buildCaseNotFoundReport(caseName, provider, modelKey, strict, allowSkips) {
  const missingCase = caseName ?? 'unknown-case'
  const result = {
    caseName: missingCase,
    caseFile: caseName ? `${caseName}.yaml` : null,
    status: 'case-not-found',
    score: 0,
    maxScore: 0,
    skippedRubrics: [],
    requiredRubricsSkipped: 0,
  }

  return {
    results: [result],
    stats: createStats(),
    policy: evaluateRunPolicy([result], {
      strict,
      allowSkips,
      passThreshold: PASS_THRESHOLD,
      optimizeGatePending: false,
    }),
    provider,
    modelKey,
    runFile: null,
    nextAction: null,
  }
}

async function evaluateCasesForRun(casePaths, options) {
  const { all, shouldClean, projectRoot, artifactRoot, provider, stats } = options
  const results = []

  for (const casePath of casePaths) {
    if (shouldClean && all && results.length > 0) cleanWorkspace(projectRoot)

    const stem = basename(casePath, '.yaml')
    const caseProjectRoot = artifactRoot ? resolve(projectRoot, artifactRoot, stem) : projectRoot
    const result = await evaluateCase(casePath, caseProjectRoot, provider, stats, { compact: all })
    results.push(result)
  }

  return results
}

function saveRunArtifacts(results, stats, modelKey, strict, policy, improve) {
  return saveResults(results, stats, modelKey, {
    baseline: false,
    strict,
    runStatus: policy.runStatus,
    policy,
    skipReasons: policy.skipReasons,
    requiredRubricsSkipped: policy.requiredRubricsSkipped,
    improve: improve ?? null,
  })
}

export async function runEvalWorkflow(options = {}) {
  const {
    caseName = null,
    all = false,
    model: modelKey = 'mock',
    yes: skipConfirm = false,
    project: projectDir = process.cwd(),
    strict = true,
    allowSkips = false,
    clean = null,
    artifactRoot = null,
    emitStatusLines = true,
    compareBaseline = true,
    improve = null,
  } = options

  const provider = resolveProviderOrThrow(modelKey)
  const casePaths = listEvalCaseFiles(CASES_DIR, { all, caseName })
  if (!all && casePaths.length === 0) {
    return buildCaseNotFoundReport(caseName, provider, modelKey, strict, allowSkips)
  }

  const projectRoot = resolve(projectDir)
  const stats = createStats()
  const shouldClean = clean ?? provider.type !== 'mock'
  const optimizeGate = strict ? checkOptimizeGate() : { needsReeval: false }

  await printBanner({
    provider,
    modelKey,
    skipConfirm,
    caseCount: casePaths.length,
    projectRoot,
    strict,
    allowSkips,
    validateProvider: validateProviderEnv,
  })
  if (strict && optimizeGate.needsReeval) warn(optimizeGate.reason)

  const results = await evaluateCasesForRun(casePaths, {
    all,
    shouldClean,
    projectRoot,
    artifactRoot,
    provider,
    stats,
  })

  const policy = evaluateRunPolicy(results, {
    strict,
    allowSkips,
    passThreshold: PASS_THRESHOLD,
    optimizeGatePending: strict && optimizeGate.needsReeval,
  })

  const persisted = saveRunArtifacts(results, stats, modelKey, strict, policy, improve)

  updateBaselinePolicyStateFromRun(results, modelKey, policy, {
    optimizeGatePending: strict && optimizeGate.needsReeval && !policy.gateCanClear,
  })

  if (policy.gateCanClear) {
    clearOptimizeMarker()
    info('Optimize gate cleared after strict clean re-eval.')
  }

  if (compareBaseline) compareToBaseline(results, modelKey)

  const duration = formatDuration(Date.now() - stats.startTime)
  printSummary(results, stats, provider, modelKey, policy, duration, style)

  const nextAction = emitStatusLines
    ? printEvalStatusLines(policy, results, { all, caseName, info })
    : null

  return {
    results,
    stats,
    policy,
    provider,
    modelKey,
    nextAction,
    runFile: persisted?.filename ?? null,
  }
}

export function listAvailableEvalCases() {
  return readdirSync(CASES_DIR)
    .filter((file) => file.endsWith('.yaml'))
    .map((file) => basename(file, '.yaml'))
}

export function getEvalCasesDir() {
  return CASES_DIR
}

export function isPolicyPassing(report) {
  return report?.policy?.runStatus === 'PASS'
}

export function isCaseFailing(result) {
  if (result.status !== 'evaluated') return true
  return resultPct(result) < PASS_THRESHOLD
}
