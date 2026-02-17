// bin/lib/eval/improve-engine.mjs — deterministic improve orchestration

import {
  checkOptimizeGate,
  createCheckpoint,
  restoreCheckpoint,
  saveTuneRecord,
} from '../commands/eval-state.mjs'
import { readLatestStrictRun } from './persistence.mjs'
import { applyTunePlan } from './prompt-editor.mjs'
import { resolveProvider } from './provider.mjs'
import { generateReflection } from './reflection-engine.mjs'
import { buildTunePlan } from './tune-catalog.mjs'
import { runEvalWorkflow } from './workflow.mjs'

const STATUS = Object.freeze({
  PASS: 'IMPROVED_AND_PASSING',
  PARTIAL: 'PARTIAL_IMPROVEMENT',
  NONE: 'NO_IMPROVEMENT',
  BLOCKED: 'BLOCKED',
})

function casePercentage(result) {
  if (typeof result.percentage === 'number') return result.percentage
  if (result.maxScore > 0) return Math.round((result.score / result.maxScore) * 100)
  return 0
}

function scopeLabel(caseName, all) {
  if (all) return '--all'
  return caseName ?? '<case>'
}

function baselinePromoteHint(caseName, all) {
  if (all) return 'sparq baseline promote --all'
  if (caseName) return `sparq baseline promote ${caseName}`
  return 'sparq baseline promote <case>'
}

function improveRetryHint(caseName, all, modelKey) {
  if (all) return `sparq improve --all --model ${modelKey}`
  if (caseName) return `sparq improve ${caseName} --model ${modelKey}`
  return `sparq improve <case> --model ${modelKey}`
}

function blockedResult(reason, nextAction, modelKey = null, exitCode = 2) {
  return {
    status: STATUS.BLOCKED,
    exitCode,
    reason,
    nextAction,
    modelKey,
    iterations: 0,
    tunedFiles: [],
    tunedFileCount: 0,
    appliedFixIds: [],
    scoreDeltaByCase: [],
  }
}

function finalizeResult(status, options) {
  const {
    caseName,
    all,
    modelKey,
    iterations,
    reason,
    tunedFiles,
    appliedFixIds,
    scoreDeltaByCase,
    exitCode,
  } = options

  const nextAction =
    status === STATUS.PASS
      ? baselinePromoteHint(caseName, all)
      : improveRetryHint(caseName, all, modelKey)

  return {
    status,
    exitCode,
    reason,
    nextAction,
    modelKey,
    iterations,
    tunedFiles: [...tunedFiles],
    tunedFileCount: tunedFiles.size,
    appliedFixIds: [...appliedFixIds],
    scoreDeltaByCase,
  }
}

function resolveModel(model) {
  if (model) {
    return { ok: true, modelKey: model, sourceRunFile: null }
  }

  const latestStrict = readLatestStrictRun()
  const latestModel = latestStrict?.run?.model ?? null
  if (latestModel) {
    return {
      ok: true,
      modelKey: latestModel,
      sourceRunFile: latestStrict.filename,
    }
  }

  return {
    ok: false,
    reason:
      'No model resolved for improve. Run `sparq eval <case|--all> --strict --model haiku` first or pass --model.',
  }
}

function unknownModelConstraint(modelKey, caseName, all) {
  return blockedResult(
    `Resolved model "${modelKey}" is not recognized.`,
    improveRetryHint(caseName, all, 'haiku'),
    modelKey,
  )
}

function mockModelConstraint(caseName, all, modelKey) {
  const nextAction = all
    ? 'sparq improve --all --model haiku'
    : caseName
      ? `sparq improve ${caseName} --model haiku`
      : 'sparq improve <case> --model haiku'

  return blockedResult(
    'Improve requires a generation-capable model. Resolved model is mock.',
    nextAction,
    modelKey,
  )
}

function providerEnvConstraint(provider, caseName, all, modelKey) {
  if (provider.type === 'anthropic' && !process.env.ANTHROPIC_API_KEY) {
    const nextAction = all
      ? 'sparq improve --all --model local'
      : caseName
        ? `sparq improve ${caseName} --model local`
        : 'sparq improve <case> --model local'
    return blockedResult(
      'Resolved model requires ANTHROPIC_API_KEY, but it is not set.',
      nextAction,
      modelKey,
    )
  }

  if (provider.type === 'openai' && !process.env.SPARQ_LOCAL_MODEL_URL) {
    const nextAction = all
      ? 'sparq improve --all --model haiku'
      : caseName
        ? `sparq improve ${caseName} --model haiku`
        : 'sparq improve <case> --model haiku'
    return blockedResult(
      'Resolved local model requires SPARQ_LOCAL_MODEL_URL, but it is not set.',
      nextAction,
      modelKey,
    )
  }

  return null
}

function modelConstraint(modelKey, caseName, all) {
  const provider = resolveProvider(modelKey)
  if (!provider) return unknownModelConstraint(modelKey, caseName, all)
  if (provider.type === 'mock') return mockModelConstraint(caseName, all, modelKey)
  return providerEnvConstraint(provider, caseName, all, modelKey)
}

function byCase(results) {
  const map = new Map()
  for (const result of results) {
    const key = result.caseName ?? result.caseFile ?? 'unknown-case'
    map.set(key, result)
  }
  return map
}

function scoreDelta(previousResults, nextResults) {
  const prev = byCase(previousResults)
  const next = byCase(nextResults)
  const deltas = []

  for (const [key, nextResult] of next.entries()) {
    const prevResult = prev.get(key)
    if (!prevResult) continue
    deltas.push({ caseName: key, delta: casePercentage(nextResult) - casePercentage(prevResult) })
  }

  return deltas
}

function hasPositiveDelta(deltas) {
  return deltas.some((delta) => delta.delta > 0)
}

function currentImproveMeta(state, reflectionFile, iteration) {
  return {
    iteration,
    maxIterations: state.maxIterations,
    sourceRunFile: state.sourceRunFile,
    reflectionFile,
    appliedFixIds: [...state.appliedFixIds],
    tunedFiles: [...state.tunedFiles],
    scoreDeltaByCase: state.lastScoreDelta,
  }
}

function tuneRecordFromPlan(plan, reflectionFile, modelKey) {
  return {
    reflectionSource: reflectionFile,
    modelTier: modelKey,
    fixes: plan.operations.map((op) => ({
      agent: `sparq-${op.agent}`,
      section: `<${op.section}>`,
      technique: 'AUTO',
      rubricChecks: op.rubrics,
      expectedDelta: op.expectedDelta,
      finding: op.sourceText,
    })),
  }
}

function classifyUnresolvedGate(report) {
  const hasGateFailure = (report.policy?.failures ?? []).some(
    (failure) => failure.type === 'optimize-gate',
  )
  if (!hasGateFailure) return null

  const gate = checkOptimizeGate()
  if (!gate.needsReeval) return null
  return gate.reason
}

async function runStrictEval(base, modelKey, improveMeta) {
  return runEvalWorkflow({
    caseName: base.caseName,
    all: base.all,
    model: modelKey,
    project: base.projectDir,
    strict: base.strict,
    allowSkips: base.allowSkips,
    yes: base.skipConfirm,
    artifactRoot: base.artifactRoot,
    emitStatusLines: false,
    compareBaseline: false,
    improve: improveMeta,
  })
}

function usageFailure() {
  return blockedResult(
    'Usage: sparq improve <case-name> | --all',
    'sparq improve <case-name> --model haiku',
    null,
    1,
  )
}

function blockedNoPlanResult(state, base) {
  const gateReason = classifyUnresolvedGate(state.current)
  const reason = gateReason ?? 'No actionable fixes derived from current findings.'
  const next = gateReason
    ? improveRetryHint(base.caseName, base.all, state.modelKey)
    : 'sparq eval-reflect && sparq eval-tune (service path)'
  return blockedResult(reason, next, state.modelKey)
}

function applyPlanWithCheckpoint(plan, modelKey) {
  const checkpoint = createCheckpoint()
  if (!checkpoint.success) {
    return {
      ok: false,
      result: blockedResult(
        `Checkpoint creation failed: ${checkpoint.error}`,
        'Resolve git state and retry improve.',
        modelKey,
      ),
    }
  }

  let applyResult
  try {
    applyResult = applyTunePlan(plan)
  } catch (error) {
    if (!checkpoint.empty) restoreCheckpoint()
    return {
      ok: false,
      result: blockedResult(
        `Tune apply failed: ${error.message}`,
        'Review prompt structure and retry improve.',
        modelKey,
      ),
    }
  }

  if (applyResult.tunedFileCount === 0) {
    return {
      ok: false,
      result: blockedResult(
        'No prompt files were updated by tune plan.',
        'Use /sparq:eval-tune for targeted manual fixes.',
        modelKey,
      ),
    }
  }

  return { ok: true, applyResult }
}

function absorbApplyResult(state, applyResult) {
  for (const file of applyResult.tunedFiles) state.tunedFiles.add(file)
  for (const fixId of applyResult.appliedFixIds) state.appliedFixIds.add(fixId)
}

function updateDeltaState(state, deltas) {
  state.lastScoreDelta = deltas
  if (hasPositiveDelta(deltas)) {
    state.positiveDeltaObserved = true
    state.noImprovementStreak = 0
    return
  }
  state.noImprovementStreak += 1
}

function maybeFinishIteration(state, base, iteration, nextReport, deltas) {
  if (base.strict && nextReport.policy.runStatus === 'PASS') {
    return finalizeResult(STATUS.PASS, {
      caseName: base.caseName,
      all: base.all,
      modelKey: state.modelKey,
      iterations: iteration,
      reason: null,
      tunedFiles: state.tunedFiles,
      appliedFixIds: state.appliedFixIds,
      scoreDeltaByCase: deltas,
      exitCode: 0,
    })
  }

  if (state.noImprovementStreak < 2) return null
  return finalizeResult(STATUS.NONE, {
    caseName: base.caseName,
    all: base.all,
    modelKey: state.modelKey,
    iterations: iteration,
    reason: 'No positive score delta across two consecutive iterations.',
    tunedFiles: state.tunedFiles,
    appliedFixIds: state.appliedFixIds,
    scoreDeltaByCase: deltas,
    exitCode: 2,
  })
}

async function applyIteration(state, base, iteration) {
  const reflection = generateReflection(state.current, { passThreshold: 75 })
  const plan = buildTunePlan(reflection, { maxOperations: 8 })
  if (plan.operations.length === 0) {
    return { done: true, result: blockedNoPlanResult(state, base) }
  }

  const applyPhase = applyPlanWithCheckpoint(plan, state.modelKey)
  if (!applyPhase.ok) return { done: true, result: applyPhase.result }
  absorbApplyResult(state, applyPhase.applyResult)

  saveTuneRecord(tuneRecordFromPlan(plan, reflection.reflectionFile, state.modelKey))

  const nextReport = await runStrictEval(
    base,
    state.modelKey,
    currentImproveMeta(state, reflection.reflectionFile, iteration),
  )

  const deltas = scoreDelta(state.current.results, nextReport.results)
  updateDeltaState(state, deltas)

  const terminalResult = maybeFinishIteration(state, base, iteration, nextReport, deltas)
  if (terminalResult) return { done: true, result: terminalResult }

  state.current = nextReport
  return { done: false }
}

function finalIterationResult(base, state) {
  const status = state.positiveDeltaObserved ? STATUS.PARTIAL : STATUS.NONE
  const reason = state.positiveDeltaObserved
    ? 'Reached max iterations with positive deltas but strict policy still failing.'
    : 'Reached max iterations with no net improvement.'

  return finalizeResult(status, {
    caseName: base.caseName,
    all: base.all,
    modelKey: state.modelKey,
    iterations: state.maxIterations,
    reason,
    tunedFiles: state.tunedFiles,
    appliedFixIds: state.appliedFixIds,
    scoreDeltaByCase: state.lastScoreDelta,
    exitCode: 2,
  })
}

function normalizeBaseOptions(options = {}) {
  return {
    caseName: options.caseName ?? null,
    all: options.all ?? false,
    projectDir: options.project ?? process.cwd(),
    strict: options.strict ?? true,
    allowSkips: options.allowSkips ?? false,
    maxIterations: Math.max(1, Number(options.maxIterations) || 3),
    skipConfirm: options.yes ?? true,
    artifactRoot: options.artifactRoot ?? null,
  }
}

function scopeProvided(base) {
  return Boolean(base.caseName || base.all)
}

function unresolvedModelResult(base, resolved) {
  const next = base.all
    ? 'sparq eval --all --strict --model haiku'
    : `sparq eval ${scopeLabel(base.caseName, base.all)} --strict --model haiku`
  return blockedResult(resolved.reason, next)
}

function resolveWorkflowContext(base, explicitModel) {
  const resolved = resolveModel(explicitModel)
  if (!resolved.ok) return { ok: false, result: unresolvedModelResult(base, resolved) }

  const constraint = modelConstraint(resolved.modelKey, base.caseName, base.all)
  if (constraint) return { ok: false, result: constraint }

  return { ok: true, resolved }
}

function initialImproveMeta(base, resolved) {
  return {
    iteration: 0,
    maxIterations: base.maxIterations,
    sourceRunFile: resolved.sourceRunFile ?? null,
    reflectionFile: null,
    appliedFixIds: [],
    tunedFiles: [],
    scoreDeltaByCase: [],
  }
}

function passWithoutTuningResult(base, modelKey) {
  return finalizeResult(STATUS.PASS, {
    caseName: base.caseName,
    all: base.all,
    modelKey,
    iterations: 0,
    reason: null,
    tunedFiles: new Set(),
    appliedFixIds: new Set(),
    scoreDeltaByCase: [],
    exitCode: 0,
  })
}

function buildState(base, resolved, initial) {
  return {
    modelKey: resolved.modelKey,
    sourceRunFile: resolved.sourceRunFile ?? initial.runFile ?? null,
    maxIterations: base.maxIterations,
    current: initial,
    tunedFiles: new Set(),
    appliedFixIds: new Set(),
    noImprovementStreak: 0,
    positiveDeltaObserved: false,
    lastScoreDelta: [],
  }
}

export async function runImproveWorkflow(options = {}) {
  const base = normalizeBaseOptions(options)
  if (!scopeProvided(base)) return usageFailure()

  const context = resolveWorkflowContext(base, options.model ?? null)
  if (!context.ok) return context.result

  const initial = await runStrictEval(
    base,
    context.resolved.modelKey,
    initialImproveMeta(base, context.resolved),
  )
  if (base.strict && initial.policy.runStatus === 'PASS') {
    return passWithoutTuningResult(base, context.resolved.modelKey)
  }

  const state = buildState(base, context.resolved, initial)

  for (let iteration = 1; iteration <= base.maxIterations; iteration++) {
    const iterationResult = await applyIteration(state, base, iteration)
    if (iterationResult.done) return iterationResult.result
  }

  return finalIterationResult(base, state)
}
