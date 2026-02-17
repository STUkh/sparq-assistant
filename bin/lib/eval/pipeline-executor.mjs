// bin/lib/eval/pipeline-executor.mjs — scenario pipeline execution

import { parseArtifacts } from './artifact-resolver.mjs'
import { getScenarioPipeline } from './metadata.mjs'
import { buildSystemPrompt, buildUserMessage } from './prompt-builder.mjs'

function logPromptDetails(style, agentName, phase, systemLen, userLen, priorLen) {
  console.log(`\n    ${'─'.repeat(50)}`)
  console.log(`    ${style.cyan(`sparq-${agentName}`)} · ${phase}`)
  console.log(
    `    Prompt: ${systemLen.toLocaleString()} sys + ${userLen.toLocaleString()} user chars`,
  )
  if (priorLen > 0) console.log(`    (+ ${priorLen.toLocaleString()} chars prior output appended)`)
}

export function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`
  const seconds = ms / 1000
  if (seconds < 60) return `${seconds.toFixed(1)}s`
  const minutes = Math.floor(seconds / 60)
  const secs = Math.round(seconds % 60)
  return `${minutes}m ${secs}s`
}

function logResponseDetails(tokensIn, tokensOut, durationMs, artifacts, rawLen) {
  const parts = [
    `${tokensIn.toLocaleString()}→${tokensOut.toLocaleString()} tokens`,
    formatDuration(durationMs),
  ]
  if (artifacts.size > 0) parts.push(`${artifacts.size} artifact${artifacts.size > 1 ? 's' : ''}`)
  console.log(`    Response: ${parts.join(' · ')}`)

  if (artifacts.size > 0) {
    for (const [path, content] of artifacts) {
      console.log(`      → ${path} (${content.length.toLocaleString()} chars)`)
    }
    return
  }

  console.log(`      (no delimited artifacts — raw response: ${rawLen.toLocaleString()} chars)`)
}

export async function executePipeline(evalCase, provider, stats, options = {}) {
  const { callModelApi, style } = options
  const pipeline = getScenarioPipeline(evalCase.scenario)
  if (!pipeline) throw new Error(`No pipeline defined for scenario: ${evalCase.scenario}`)

  let priorOutputs = ''
  const allArtifacts = new Map()

  for (const step of pipeline) {
    const systemPrompt = buildSystemPrompt(step.agent)
    let userMessage = buildUserMessage(evalCase)
    if (priorOutputs) userMessage += `\n\n## Prior Phase Output\n${priorOutputs}`

    logPromptDetails(
      style,
      step.agent,
      step.phase,
      systemPrompt.length,
      userMessage.length,
      priorOutputs.length,
    )

    const stepStart = Date.now()
    const prevIn = stats.inputTokens
    const prevOut = stats.outputTokens
    const response = await callModelApi(systemPrompt, userMessage, provider, stats)
    const artifacts = parseArtifacts(response)

    logResponseDetails(
      stats.inputTokens - prevIn,
      stats.outputTokens - prevOut,
      Date.now() - stepStart,
      artifacts,
      response.length,
    )

    for (const [path, content] of artifacts) allArtifacts.set(path, content)
    priorOutputs +=
      artifacts.size === 0 ? `\n\n${response}` : `\n\n${[...artifacts.values()].join('\n---\n')}`
  }

  return allArtifacts
}
