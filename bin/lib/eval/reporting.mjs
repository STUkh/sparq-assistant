// bin/lib/eval/reporting.mjs — eval run banner, summaries, and machine-readable output

import { basename } from 'node:path'
import { createInterface } from 'node:readline'
import { PASS_THRESHOLD } from '../commands/eval-reflect.mjs'
import { calculateCost } from './provider.mjs'

function scoreVerdict(pct, style) {
  if (pct >= PASS_THRESHOLD) return style.green(`PASS (${pct}% >= ${PASS_THRESHOLD}%)`)
  return style.red(`FAIL (${pct}% < ${PASS_THRESHOLD}%)`)
}

function scoreColor(pct, style) {
  if (pct >= PASS_THRESHOLD) return style.green
  if (pct >= 50) return style.yellow
  return style.red
}

export function resultPct(result) {
  if (typeof result.percentage === 'number') return result.percentage
  if (result.maxScore > 0) return Math.round((result.score / result.maxScore) * 100)
  return 0
}

function printApiStats(provider, stats, modelKey) {
  if (provider.type === 'mock' || stats.apiCalls === 0) return

  const tokens = (stats.inputTokens + stats.outputTokens).toLocaleString()
  const label = provider.type === 'anthropic' ? provider.modelId : 'local'
  const costInfo =
    provider.type === 'anthropic' ? ` · $${calculateCost(stats, modelKey).toFixed(2)}` : ''
  console.log(`  API: ${label} · ${stats.apiCalls} calls · ${tokens} tokens${costInfo}`)
}

export function printSummary(results, stats, provider, modelKey, policy, duration, style) {
  const evaluated = results.filter((result) => result.status === 'evaluated')
  const nonEvaluated = results.filter((result) => result.status !== 'evaluated')

  console.log(`\n  ${'═'.repeat(50)}`)

  if (evaluated.length > 0) {
    let grandScore = 0
    let grandMax = 0
    const pcts = []

    for (const result of evaluated) {
      const pct = resultPct(result)
      pcts.push(pct)
      const color = scoreColor(pct, style)
      console.log(
        `  ${color(`${String(result.score).padStart(3)}/${result.maxScore}`)}  ${result.caseName}`,
      )
      grandScore += result.score
      grandMax += result.maxScore
    }

    const grandPct = grandMax > 0 ? Math.round((grandScore / grandMax) * 100) : 0
    console.log(`  ${'─'.repeat(50)}`)
    console.log(`  Score: ${grandScore}/${grandMax} (${grandPct}%)`)
    console.log(`  Min: ${Math.min(...pcts)}%  Max: ${Math.max(...pcts)}%`)
    console.log(`  Verdict: ${scoreVerdict(grandPct, style)}`)
  }

  console.log(`  Cases evaluated: ${evaluated.length}/${results.length}`)
  if (nonEvaluated.length > 0) {
    const byStatus = new Map()
    for (const result of nonEvaluated) {
      const key = result.status ?? 'unknown'
      byStatus.set(key, (byStatus.get(key) ?? 0) + 1)
    }
    const statusSummary = [...byStatus.entries()].map(([status, count]) => `${count} ${status}`)
    console.log(`  Non-evaluated: ${statusSummary.join(', ')}`)
  }

  printApiStats(provider, stats, modelKey)
  console.log(`  Policy: ${policy.runStatus}${policy.strict ? ' (strict)' : ''}`)
  if (policy.failures.length > 0) {
    for (const failure of policy.failures) console.log(`  - ${failure.message}`)
  }
  console.log(`  Duration: ${duration}`)
  console.log(`  ${'═'.repeat(50)}\n`)
}

function buildConfirmMessage(provider, modelKey, caseCount) {
  const cases = `${caseCount} case${caseCount > 1 ? 's' : ''}`
  if (provider.type === 'anthropic') {
    const pricing = { haiku: [1, 5], sonnet: [3, 15], opus: [5, 25] }[modelKey]
    if (pricing) {
      const [inputRate, outputRate] = pricing
      const estLow = ((caseCount * 20_000) / 1_000_000) * inputRate
      const estHigh = estLow + ((caseCount * 3_000) / 1_000_000) * outputRate
      const cost = caseCount > 1 ? `~$${estLow.toFixed(2)}-${estHigh.toFixed(2)}` : '~$0.01-0.15'
      return `  This will execute agent prompts via ${provider.modelId} (${cost} for ${cases}).`
    }
    return `  This will execute agent prompts via ${provider.modelId} (${cases}).`
  }

  return `  This will execute agent prompts via local model server (${cases}).`
}

async function confirmExecution(provider, modelKey, caseCount) {
  console.log(buildConfirmMessage(provider, modelKey, caseCount))
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((res) => {
    rl.question('  Proceed? (y/N): ', (answer) => {
      rl.close()
      res(answer.trim().toLowerCase() === 'y')
    })
  })
}

export async function printBanner(options) {
  const {
    provider,
    modelKey,
    skipConfirm,
    caseCount,
    projectRoot,
    strict,
    allowSkips,
    validateProvider,
  } = options

  const cases = `${caseCount} case${caseCount > 1 ? 's' : ''}`
  console.log(`\n  SparQ Eval Runner\n  ${'═'.repeat(50)}`)

  if (provider.type === 'mock') {
    console.log(`  Mode: Mock · ${cases}`)
    console.log(`  Project: ${projectRoot}`)
  } else {
    validateProvider(provider, modelKey)
    if (provider.type === 'anthropic') {
      console.log(`  Mode: API · ${provider.modelId} · ${cases}`)
    } else {
      console.log(`  Mode: Local · ${process.env.SPARQ_LOCAL_MODEL_URL} · ${cases}`)
    }

    if (!skipConfirm) {
      const proceed = await confirmExecution(provider, modelKey, caseCount)
      if (!proceed) {
        console.log('  Aborted.\n')
        process.exit(0)
      }
    }
  }

  console.log(`  Policy: ${strict ? 'strict' : 'relaxed'}${allowSkips ? ' + allow-skips' : ''}`)
  console.log()
}

function nextImproveHint(failing, all) {
  if (failing.length === 0) return null
  if (all) return 'sparq improve --all'

  const stem = failing[0].caseFile ? basename(failing[0].caseFile, '.yaml') : null
  return stem ? `sparq improve ${stem}` : null
}

export function printEvalStatusLines(policy, results, options = {}) {
  const { all = false, caseName = null, info } = options

  const failing = results.filter(
    (result) => result.status !== 'evaluated' || resultPct(result) < PASS_THRESHOLD,
  )

  const nextAction = policy.runStatus !== 'PASS' ? nextImproveHint(failing, all) : null
  const promoteHint = all
    ? 'sparq baseline promote --all'
    : caseName
      ? `sparq baseline promote ${caseName}`
      : 'sparq baseline promote <case>'

  console.log(`[sparq] EVAL_STATUS=${policy.runStatus}`)
  if (nextAction) console.log(`[sparq] NEXT_ACTION=${nextAction}`)
  else if (policy.runStatus === 'PASS') console.log(`[sparq] NEXT_ACTION=${promoteHint}`)

  if (nextAction) info(`Next action: ${nextAction}`)
  return nextAction
}
