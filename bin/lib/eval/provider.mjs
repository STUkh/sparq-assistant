// bin/lib/eval/provider.mjs — provider resolution, API calls, and token stats

export const PROVIDERS = Object.freeze({
  mock: { type: 'mock' },
  haiku: { type: 'anthropic', modelId: 'claude-haiku-4-5-20251001' },
  sonnet: { type: 'anthropic', modelId: 'claude-sonnet-4-5-20250929' },
  opus: { type: 'anthropic', modelId: 'claude-opus-4-6' },
  local: { type: 'openai' },
})

export const MODEL_PRICING = Object.freeze({
  haiku: [1, 5],
  sonnet: [3, 15],
  opus: [5, 25],
})

export function resolveProvider(modelKey) {
  if (PROVIDERS[modelKey]) return PROVIDERS[modelKey]
  if (modelKey?.startsWith?.('claude-')) return { type: 'anthropic', modelId: modelKey }
  return null
}

export function resolveProviderOrThrow(modelKey) {
  const provider = resolveProvider(modelKey)
  if (provider) return provider
  const shortcuts = Object.keys(PROVIDERS).join(', ')
  throw new Error(
    `Unknown model "${modelKey}". Shortcuts: ${shortcuts}, or use a full claude-* model ID`,
  )
}

export function createStats() {
  return { apiCalls: 0, inputTokens: 0, outputTokens: 0, startTime: Date.now() }
}

export function isGenerationCapable(provider) {
  return provider.type !== 'mock'
}

export function validateProviderEnv(provider, modelKey) {
  if (provider.type === 'anthropic' && !process.env.ANTHROPIC_API_KEY) {
    throw new Error(`ANTHROPIC_API_KEY is required for --model ${modelKey}`)
  }
  if (provider.type === 'openai' && !process.env.SPARQ_LOCAL_MODEL_URL) {
    throw new Error(`SPARQ_LOCAL_MODEL_URL is required for --model ${modelKey}`)
  }
}

export function calculateCost(stats, modelKey) {
  const pricing = MODEL_PRICING[modelKey]
  if (!pricing) return 0
  const inputCost = (stats.inputTokens / 1_000_000) * pricing[0]
  const outputCost = (stats.outputTokens / 1_000_000) * pricing[1]
  return inputCost + outputCost
}

async function callClaudeApi(systemPrompt, userMessage, model, stats, retries = 1) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 120_000)

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 8192,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      const body = await response.text()
      if (retries > 0 && (response.status === 429 || response.status >= 500)) {
        console.log(`    API ${response.status}, retrying in 2s...`)
        await new Promise((r) => setTimeout(r, 2000))
        return callClaudeApi(systemPrompt, userMessage, model, stats, retries - 1)
      }
      throw new Error(`Claude API error ${response.status}: ${body}`)
    }

    const data = await response.json()
    stats.apiCalls++
    stats.inputTokens += data.usage?.input_tokens ?? 0
    stats.outputTokens += data.usage?.output_tokens ?? 0
    return data.content[0].text
  } finally {
    clearTimeout(timeout)
  }
}

async function callOpenAiApi(systemPrompt, userMessage, stats, retries = 1) {
  const baseUrl = process.env.SPARQ_LOCAL_MODEL_URL
  const modelName = process.env.SPARQ_LOCAL_MODEL_NAME ?? 'default'
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 120_000)

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: modelName,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        max_tokens: 8192,
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      const body = await response.text()
      if (retries > 0 && (response.status === 429 || response.status >= 500)) {
        console.log(`    API ${response.status}, retrying in 2s...`)
        await new Promise((r) => setTimeout(r, 2000))
        return callOpenAiApi(systemPrompt, userMessage, stats, retries - 1)
      }
      throw new Error(`Local model API error ${response.status}: ${body}`)
    }

    const data = await response.json()
    stats.apiCalls++
    stats.inputTokens += data.usage?.prompt_tokens ?? 0
    stats.outputTokens += data.usage?.completion_tokens ?? 0
    return data.choices[0].message.content
  } finally {
    clearTimeout(timeout)
  }
}

export async function callModelApi(systemPrompt, userMessage, provider, stats) {
  if (provider.type === 'anthropic') {
    return callClaudeApi(systemPrompt, userMessage, provider.modelId, stats)
  }
  return callOpenAiApi(systemPrompt, userMessage, stats)
}
