import assert from 'node:assert/strict'
import { join, resolve } from 'node:path'
import { describe, it } from 'node:test'

const RUBRICS_DIR = resolve(import.meta.dirname, '..', '..', 'bin', 'lib', 'rubrics')

async function loadRubric(name) {
  const { evaluate } = await import(join(RUBRICS_DIR, `${name}.mjs`))
  return evaluate
}

// ---------------------------------------------------------------------------
// template-compliance rubric
// ---------------------------------------------------------------------------

describe('template-compliance rubric', () => {
  it('should return correct interface shape', async () => {
    const evaluate = await loadRubric('template-compliance')
    const result = evaluate('plain content with no recognized structure', [])
    assert.ok('score' in result)
    assert.ok('maxScore' in result)
    assert.ok('findings' in result)
  })

  it('should score full points for valid requirements-type content with all sections', async () => {
    const evaluate = await loadRubric('template-compliance')
    const content = [
      '## Metadata',
      'Feature: Login',
      '',
      '## Sources',
      'SRC-J: JIRA-123',
      '',
      '## User Journey',
      'User navigates to /login',
      '',
      '## Requirements',
      '- REQ-LOGIN-001: User can log in',
      '',
      '## UI Elements',
      '- #email-input',
    ].join('\n')
    const result = evaluate(content, [])
    // requirements type detects on REQ-\w+-\d{3} + ## Requirements
    assert.ok(
      result.score > 0,
      `Should score > 0 for valid requirements content: ${JSON.stringify(result)}`,
    )
    assert.equal(result.score, result.maxScore, `Should score max: ${JSON.stringify(result)}`)
    assert.equal(result.findings.length, 0)
  })

  it('should produce findings for requirements content missing some sections', async () => {
    const evaluate = await loadRubric('template-compliance')
    const content = [
      '## Requirements',
      '- REQ-LOGIN-001: User can log in',
      // Missing: Metadata, Sources, User Journey, UI Elements
    ].join('\n')
    const result = evaluate(content, [])
    assert.ok(result.findings.length > 0, `Should flag missing sections: ${JSON.stringify(result)}`)
    assert.ok(result.score < result.maxScore)
  })
})
