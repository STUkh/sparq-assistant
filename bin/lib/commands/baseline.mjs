// bin/lib/commands/baseline.mjs — baseline promotion command

import { basename } from 'node:path'
import { getPromotionEligibility, readLatestRun, saveCaseBaselines } from '../eval/persistence.mjs'
import { fail, heading, info, style, warn } from '../state.mjs'
import { checkOptimizeGate } from './eval-state.mjs'

function usage() {
  heading('SparQ Baseline')
  info('Usage: sparq baseline promote <case-name>')
  info('       sparq baseline promote --all')
  info('Rule: requires 2 consecutive clean strict passes and no optimize gate pending.')
}

function findCase(runCases, token) {
  return runCases.find((c) => {
    if (c.caseName === token) return true
    if (!c.caseFile) return false
    return basename(c.caseFile, '.yaml') === token
  })
}

function isValidRequest(action, caseName, all) {
  if (action !== 'promote') return false
  if (!all && !caseName) return false
  return true
}

function printUsageAndFail() {
  usage()
  process.exitCode = 2
}

function ensureOptimizeGateClear() {
  const gate = checkOptimizeGate()
  if (!gate.needsReeval) return true
  fail(gate.reason)
  process.exitCode = 2
  return false
}

function loadLatestEvaluatedRun() {
  const latest = readLatestRun()
  if (!latest) {
    fail('No eval runs found. Run `sparq eval --strict` first.')
    process.exitCode = 2
    return null
  }

  const runCases = (latest.run.cases ?? []).filter((c) => c.status === 'evaluated')
  if (runCases.length === 0) {
    fail(`Latest run ${latest.filename} has no evaluated cases to promote.`)
    process.exitCode = 2
    return null
  }

  return { latest, runCases }
}

function classifyTargets(tokens, runCases, modelKey) {
  const promotable = []
  const denied = []

  for (const token of tokens) {
    const hit = findCase(runCases, token)
    if (!hit) {
      denied.push({ token, reason: 'Not present as evaluated case in latest run' })
      continue
    }

    const eligibility = getPromotionEligibility(modelKey, hit.caseName)
    if (!eligibility.eligible) {
      denied.push({ token: hit.caseName, reason: eligibility.reason })
      continue
    }

    promotable.push(hit)
  }

  return { promotable, denied }
}

function printDeniedCases(denied) {
  for (const deniedCase of denied) warn(`${deniedCase.token}: ${deniedCase.reason}`)
}

export async function cmdBaseline(options = {}) {
  const { action = null, caseName = null, all = false, model: explicitModel = null } = options

  if (!isValidRequest(action, caseName, all)) {
    printUsageAndFail()
    return
  }

  if (!ensureOptimizeGateClear()) {
    return
  }

  const latestRun = loadLatestEvaluatedRun()
  if (!latestRun) {
    return
  }

  const { latest, runCases } = latestRun
  const modelKey = explicitModel ?? latest.run.model ?? 'mock'
  const tokens = all ? runCases.map((c) => c.caseName) : [caseName]
  const { promotable, denied } = classifyTargets(tokens, runCases, modelKey)

  if (promotable.length === 0) {
    fail('No cases eligible for baseline promotion.')
    printDeniedCases(denied)
    process.exitCode = 2
    return
  }

  const { written, modelDir } = saveCaseBaselines(promotable, modelKey)
  info(`Promoted ${written} case(s) to baseline: ${style.dim(modelDir)}`)

  if (denied.length > 0) {
    printDeniedCases(denied)
    process.exitCode = 2
    return
  }

  process.exitCode = 0
}
