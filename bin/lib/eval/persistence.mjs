// bin/lib/eval/persistence.mjs — baseline policy and promotion helpers

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { atomicWriteSync } from '../commands/eval-reflect.mjs'
import { PKG_ROOT } from '../constants.mjs'

const DATA_DIR = join(PKG_ROOT, 'test', 'evals', 'data')
const RUNS_DIR = join(DATA_DIR, 'runs')
const BASELINES_DIR = join(DATA_DIR, 'baselines')
const POLICY_STATE_FILE = '.policy-state.json'
const BASELINE_VERSION = '3.0'

function resolvePaths(dataDir) {
  const root = dataDir ?? DATA_DIR
  return {
    dataDir: root,
    runsDir: join(root, 'runs'),
    baselinesDir: join(root, 'baselines'),
    policyFile: join(root, 'runs', POLICY_STATE_FILE),
  }
}

function ensureDir(path) {
  mkdirSync(path, { recursive: true })
}

function casePct(r) {
  if (typeof r.percentage === 'number') return r.percentage
  if (r.maxScore > 0) return Math.round((r.score / r.maxScore) * 100)
  return 0
}

function caseKey(modelKey, caseName) {
  return `${modelKey}::${caseName}`
}

export function caseStemFromResult(result) {
  if (result.caseFile) return basename(result.caseFile, '.yaml')
  return result.caseName.toLowerCase().replace(/[^a-z0-9]+/g, '-')
}

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

export function loadBaselinePolicyState(options = {}) {
  const { policyFile } = resolvePaths(options.dataDir)
  if (!existsSync(policyFile)) {
    return { version: '1.0', updatedAt: null, cases: {} }
  }
  try {
    const parsed = JSON.parse(readFileSync(policyFile, 'utf-8'))
    if (parsed?.cases && typeof parsed.cases === 'object') return parsed
  } catch {
    // ignore corrupted file; reset below
  }
  return { version: '1.0', updatedAt: null, cases: {} }
}

export function saveBaselinePolicyState(state, options = {}) {
  const { runsDir, policyFile } = resolvePaths(options.dataDir)
  ensureDir(runsDir)
  atomicWriteSync(policyFile, JSON.stringify(state, null, 2))
}

export function updateBaselinePolicyStateFromRun(results, modelKey, policy, options = {}) {
  if (!policy.strict) return loadBaselinePolicyState(options)

  const now = new Date().toISOString()
  const state = loadBaselinePolicyState(options)
  const optimizePending = options.optimizeGatePending && !policy.gateCanClear
  const threshold = policy.passThreshold ?? 75

  for (const result of results) {
    const caseName = result.caseName ?? result.caseFile ?? 'unknown-case'
    const key = caseKey(modelKey, caseName)
    const prev = state.cases[key] ?? {
      model: modelKey,
      caseName,
      cleanStrictPassStreak: 0,
      lastStrictPassAt: null,
      optimizeGatePending: false,
    }

    const cleanPass =
      result.status === 'evaluated' &&
      casePct(result) >= threshold &&
      (result.requiredRubricsSkipped ?? 0) === 0 &&
      (result.skippedRubrics ?? []).length === 0

    const cleanStrictPassStreak = cleanPass ? prev.cleanStrictPassStreak + 1 : 0
    state.cases[key] = {
      model: modelKey,
      caseName,
      cleanStrictPassStreak,
      lastStrictPassAt: cleanPass ? now : prev.lastStrictPassAt,
      optimizeGatePending: optimizePending,
    }
  }

  state.version = '1.0'
  state.updatedAt = now
  saveBaselinePolicyState(state, options)
  return state
}

export function getPromotionEligibility(modelKey, caseName, options = {}) {
  const state = loadBaselinePolicyState(options)
  const entry = state.cases[caseKey(modelKey, caseName)]
  if (!entry) {
    return { eligible: false, reason: `No strict pass history for ${caseName} (${modelKey})` }
  }
  if (entry.optimizeGatePending) {
    return { eligible: false, reason: 'Optimize gate pending — re-eval clean strict pass required' }
  }
  if (entry.cleanStrictPassStreak < 2) {
    return {
      eligible: false,
      reason: `Requires 2 consecutive clean strict passes (current: ${entry.cleanStrictPassStreak})`,
    }
  }
  return { eligible: true, reason: null, entry }
}

export function saveCaseBaselines(cases, modelKey, options = {}) {
  const { baselinesDir } = resolvePaths(options.dataDir)
  const now = new Date().toISOString()
  const modelDir = join(baselinesDir, modelKey)
  ensureDir(modelDir)
  const checksums = computeAgentChecksums()
  let written = 0

  for (const result of cases) {
    const caseStem = caseStemFromResult(result)
    const payload = {
      version: BASELINE_VERSION,
      timestamp: now,
      model: modelKey,
      agentChecksums: checksums,
      passThreshold: options.passThreshold ?? 75,
      case: result,
    }
    atomicWriteSync(join(modelDir, `${caseStem}.json`), JSON.stringify(payload, null, 2))
    written++
  }
  return { written, modelDir }
}

export function readLatestRun(options = {}) {
  const { runsDir } = resolvePaths(options.dataDir)
  if (!existsSync(runsDir)) return null
  const files = readdirSync(runsDir)
    .filter((f) => f.endsWith('.json') && f !== POLICY_STATE_FILE)
    .sort()
  if (files.length === 0) return null
  const latest = files[files.length - 1]
  const parsed = JSON.parse(readFileSync(join(runsDir, latest), 'utf-8'))
  return { filename: latest, run: parsed }
}

function isStrictRun(run) {
  if (run?.strict === true) return true
  if (run?.policy?.strict === true) return true
  return false
}

export function readLatestStrictRun(options = {}) {
  const { runsDir } = resolvePaths(options.dataDir)
  if (!existsSync(runsDir)) return null

  const files = readdirSync(runsDir)
    .filter((f) => f.endsWith('.json') && f !== POLICY_STATE_FILE)
    .sort()
    .reverse()

  for (const file of files) {
    try {
      const run = JSON.parse(readFileSync(join(runsDir, file), 'utf-8'))
      if (isStrictRun(run)) return { filename: file, run }
    } catch {
      // ignore malformed run and continue scanning older files
    }
  }
  return null
}

export function resolveEvalPaths(options = {}) {
  return resolvePaths(options.dataDir)
}

export { RUNS_DIR, BASELINES_DIR }
