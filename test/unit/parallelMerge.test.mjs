import assert from 'node:assert/strict'
import { join, resolve } from 'node:path'
import { describe, it } from 'node:test'

const RUBRICS_DIR = resolve(import.meta.dirname, '..', '..', 'bin', 'lib', 'rubrics')

async function loadRubric(name) {
  const { evaluate } = await import(join(RUBRICS_DIR, `${name}.mjs`))
  return evaluate
}

// ---------------------------------------------------------------------------
// parallel-merge rubric
// ---------------------------------------------------------------------------

describe('parallel-merge rubric', () => {
  it('should return correct interface shape', async () => {
    const evaluate = await loadRubric('parallel-merge')
    const result = evaluate('', [])
    assert.ok('score' in result)
    assert.ok('maxScore' in result)
    assert.ok('findings' in result)
    assert.equal(result.maxScore, 5)
  })

  it('should only fail the barrel-exports check for empty content', async () => {
    const evaluate = await loadRubric('parallel-merge')
    // Empty content: no barrel exports (fail), no duplicate exports (pass),
    // no registry entries key (pass), no TC IDs (pass), no parallel field (pass) — score = 4
    const result = evaluate('', [])
    assert.equal(result.score, 4)
    assert.equal(result.maxScore, 5)
    assert.ok(
      result.findings.some((f) => {
        const msg = typeof f === 'string' ? f : (f.message ?? String(f))
        return /barrel export/i.test(msg)
      }),
      `Should flag missing barrel exports on empty input: ${JSON.stringify(result.findings)}`,
    )
  })

  it('should score 5/5 for valid barrel export content with no duplicates', async () => {
    const evaluate = await loadRubric('parallel-merge')
    const content = [
      "export { LoginPage } from './login-page'",
      "export { DashboardPage } from './dashboard-page'",
      "export { CheckoutPage } from './checkout-page'",
    ].join('\n')
    const result = evaluate(content, [])
    assert.equal(result.score, 5, `Expected 5/5, findings: ${JSON.stringify(result.findings)}`)
    assert.equal(result.maxScore, 5)
    assert.equal(result.findings.length, 0)
  })

  it('should produce a finding for missing barrel export lines', async () => {
    const evaluate = await loadRubric('parallel-merge')
    const content = 'const foo = 1\nconst bar = 2\n// no exports here'
    const result = evaluate(content, [])
    assert.ok(
      result.findings.some((f) =>
        /barrel export/i.test(typeof f === 'string' ? f : (f.message ?? f)),
      ),
      `Should flag missing barrel exports: ${JSON.stringify(result.findings)}`,
    )
  })

  it('should produce a finding for duplicate exports', async () => {
    const evaluate = await loadRubric('parallel-merge')
    const content = [
      "export { LoginPage } from './login-page'",
      "export { LoginPage } from './login-page-v2'",
      "export { DashboardPage } from './dashboard-page'",
    ].join('\n')
    const result = evaluate(content, [])
    assert.ok(
      result.findings.some((f) => {
        const msg = typeof f === 'string' ? f : (f.message ?? String(f))
        return /duplicate export/i.test(msg)
      }),
      `Should flag duplicate exports: ${JSON.stringify(result.findings)}`,
    )
  })

  it('should produce a finding for duplicate TC IDs', async () => {
    const evaluate = await loadRubric('parallel-merge')
    const content = [
      "export { LoginPage } from './login-page'",
      '// TC-LOGIN-HP-001 — Happy path login',
      '// TC-LOGIN-HP-001 — Happy path login duplicate',
      '// TC-LOGIN-VE-001 — Validation check',
    ].join('\n')
    const result = evaluate(content, [])
    assert.ok(
      result.findings.some((f) => {
        const msg = typeof f === 'string' ? f : (f.message ?? String(f))
        return /duplicate TC ID/i.test(msg)
      }),
      `Should flag duplicate TC IDs: ${JSON.stringify(result.findings)}`,
    )
  })

  it('should produce a finding for registry with missing version field', async () => {
    const evaluate = await loadRubric('parallel-merge')
    const content = [
      "export { LoginPage } from './login-page'",
      JSON.stringify({ entries: { test1: 'value1' } }),
    ].join('\n')
    const result = evaluate(content, [])
    assert.ok(
      result.findings.some((f) => {
        const msg = typeof f === 'string' ? f : (f.message ?? String(f))
        return /registry/i.test(msg) || /version/i.test(msg)
      }),
      `Should flag missing registry version: ${JSON.stringify(result.findings)}`,
    )
  })

  it('should pass registry check when entries is an object with version', async () => {
    const evaluate = await loadRubric('parallel-merge')
    const registry = JSON.stringify({ version: '1.0', entries: { task1: 'done', task2: 'done' } })
    const content = ["export { LoginPage } from './login-page'", registry].join('\n')
    const result = evaluate(content, [])
    assert.ok(
      !result.findings.some((f) => {
        const msg = typeof f === 'string' ? f : (f.message ?? String(f))
        return /registry/i.test(msg)
      }),
      `Should not flag registry when version present: ${JSON.stringify(result.findings)}`,
    )
  })

  it('should satisfy score <= maxScore invariant for any input', async () => {
    const evaluate = await loadRubric('parallel-merge')
    const cases = [
      '',
      'plain text',
      "export { Foo } from './foo'",
      JSON.stringify({ version: '1.0', entries: {} }),
      "export { A } from './a'\nexport { A } from './b'",
    ]
    for (const content of cases) {
      const result = evaluate(content, [])
      assert.ok(
        result.score <= result.maxScore,
        `score ${result.score} exceeds maxScore ${result.maxScore} for: ${content.slice(0, 40)}`,
      )
    }
  })
})
