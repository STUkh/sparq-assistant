import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { runImproveWorkflow } from '../../bin/lib/eval/improve-engine.mjs'

describe('improve engine', () => {
  let originalApiKey
  let originalLocalUrl

  beforeEach(() => {
    originalApiKey = process.env.ANTHROPIC_API_KEY
    originalLocalUrl = process.env.SPARQ_LOCAL_MODEL_URL
    delete process.env.ANTHROPIC_API_KEY
    delete process.env.SPARQ_LOCAL_MODEL_URL
  })

  afterEach(() => {
    process.env.ANTHROPIC_API_KEY = originalApiKey
    process.env.SPARQ_LOCAL_MODEL_URL = originalLocalUrl
  })

  it('returns usage-level failure when no scope is provided', async () => {
    const result = await runImproveWorkflow({})
    assert.equal(result.status, 'BLOCKED')
    assert.equal(result.exitCode, 1)
    assert.ok(result.reason.includes('Usage'))
  })

  it('returns BLOCKED for non-generation mock model', async () => {
    const result = await runImproveWorkflow({
      caseName: 's6-bug-regression',
      model: 'mock',
    })
    assert.equal(result.status, 'BLOCKED')
    assert.equal(result.exitCode, 2)
    assert.ok(result.reason.includes('generation-capable model'))
    assert.ok(result.nextAction.includes('--model haiku'))
  })

  it('returns BLOCKED for unknown model id', async () => {
    const result = await runImproveWorkflow({
      caseName: 's6-bug-regression',
      model: 'unknown-model-tier',
    })
    assert.equal(result.status, 'BLOCKED')
    assert.equal(result.exitCode, 2)
    assert.ok(result.reason.includes('not recognized'))
  })

  it('returns BLOCKED when resolved API model lacks required environment', async () => {
    const result = await runImproveWorkflow({
      caseName: 's6-bug-regression',
      model: 'haiku',
    })
    assert.equal(result.status, 'BLOCKED')
    assert.equal(result.exitCode, 2)
    assert.ok(result.reason.includes('ANTHROPIC_API_KEY'))
  })
})
