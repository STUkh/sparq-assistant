// bin/lib/eval/rubric-runner.mjs — rubric execution and aggregation

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getRubricMetadata, getRubricWeight, isRubricApplicable } from './metadata.mjs'

function parseGraderResponse(text) {
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) return null
  try {
    return JSON.parse(jsonMatch[0])
  } catch {
    return null
  }
}

function graderJsonToResult(data) {
  const findings = []
  let score = 0
  let maxScore = 0
  for (const [key, val] of Object.entries(data)) {
    if (key === 'overallScore' || key === 'feedback') continue
    if (typeof val === 'number') {
      score += val
      maxScore += 5
    }
  }
  if (data.feedback) findings.push(data.feedback)
  return { score, maxScore, findings }
}

async function runModelGrader(mdPath, content, provider, stats, callModelApi) {
  const graderPrompt = readFileSync(mdPath, 'utf-8')
  const systemPrompt =
    'You are a QA evaluation grader. Score the content below using the rubric provided.' +
    `\n\n${graderPrompt}`
  const userMessage = `Evaluate this output:\n\n${content}`
  const response = await callModelApi(systemPrompt, userMessage, provider, stats)
  const parsed = parseGraderResponse(response)
  if (!parsed) {
    return {
      score: 0,
      maxScore: 0,
      findings: ['Model grader returned invalid JSON'],
      skipped: false,
      skipReason: null,
    }
  }
  return { ...graderJsonToResult(parsed), skipped: false, skipReason: null }
}

async function runRubric(rubricName, content, checks, options) {
  const { rubricsDir, scenario, provider, stats, callModelApi } = options
  const rubricPath = join(rubricsDir, `${rubricName}.mjs`)
  if (!existsSync(rubricPath)) {
    const mdPath = join(rubricsDir, `${rubricName}.md`)
    if (existsSync(mdPath)) {
      if (provider && provider.type !== 'mock') {
        return runModelGrader(mdPath, content, provider, stats, callModelApi)
      }
      return {
        score: 0,
        maxScore: 0,
        findings: [],
        skipped: true,
        skipReason: 'model-required',
      }
    }
    return {
      score: 0,
      maxScore: 0,
      findings: [`Rubric not found: ${rubricName}`],
      skipped: false,
      skipReason: null,
    }
  }

  const { evaluate } = await import(rubricPath)
  const result = await evaluate(content, checks, { scenario, provider, stats })
  if (result?.skipped) {
    return {
      score: result.score ?? 0,
      maxScore: result.maxScore ?? 0,
      findings: result.findings ?? [],
      skipped: true,
      skipReason: result.skipReason ?? 'not-applicable',
    }
  }
  return { ...result, skipped: false, skipReason: null }
}

function printRubricResult(log, rubricName, result, meta) {
  if (result.skipped) {
    const detail = result.skipReason ? ` - ${result.skipReason}` : ''
    log(`  Rubric: ${rubricName} (skipped${detail})`)
    return
  }

  const pct = result.maxScore > 0 ? Math.round((result.score / result.maxScore) * 100) : 0
  const weightLabel = meta.weight > 1 ? ` ×${meta.weight}` : ''
  log(`  Rubric: ${rubricName} — ${result.score}/${result.maxScore} (${pct}%)${weightLabel}`)
}

export async function scoreWithRubrics(options) {
  const {
    rubrics,
    scenario,
    content,
    checks = [],
    provider,
    stats,
    rubricsDir,
    callModelApi,
    log = console.log,
  } = options

  let totalScore = 0
  let totalMax = 0
  const findings = []
  const rubricResults = []
  const skippedRubrics = []
  let requiredRubricsSkipped = 0

  for (const rubricName of rubrics) {
    const meta = getRubricMetadata(rubricName)
    if (!isRubricApplicable(rubricName, scenario)) {
      skippedRubrics.push({
        rubric: rubricName,
        reason: 'not-applicable',
        kind: meta.kind,
      })
      printRubricResult(log, rubricName, { skipped: true, skipReason: 'not-applicable' }, meta)
      continue
    }

    const result = await runRubric(rubricName, content, checks, {
      scenario,
      provider,
      stats,
      rubricsDir,
      callModelApi,
    })
    if (result.skipped) {
      skippedRubrics.push({
        rubric: rubricName,
        reason: result.skipReason ?? 'skipped',
        kind: meta.kind,
      })
      if (meta.kind === 'model_required') requiredRubricsSkipped++
      printRubricResult(log, rubricName, result, meta)
      continue
    }

    const weight = getRubricWeight(rubricName)
    totalScore += result.score * weight
    totalMax += result.maxScore * weight
    findings.push(...(result.findings ?? []))
    rubricResults.push({
      rubric: rubricName,
      score: result.score,
      maxScore: result.maxScore,
      weight,
      kind: meta.kind,
      findings: result.findings ?? [],
    })
    printRubricResult(log, rubricName, result, meta)
  }

  return {
    totalScore,
    totalMax,
    findings,
    rubricResults,
    skippedRubrics,
    requiredRubricsSkipped,
  }
}
