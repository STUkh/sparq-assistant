import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'
import {
  buildReflectionFromRun,
  generateReflection,
  saveReflection,
} from '../../bin/lib/eval/reflection-engine.mjs'
import { cleanTempDir, createTempDir } from '../helpers/setup.mjs'

function makeReport() {
  return {
    runFile: '20260213-010101.000-mock.json',
    modelKey: 'mock',
    policy: { strict: true },
    results: [
      {
        caseName: 'S2: Manual to E2E conversion',
        caseFile: 'test/evals/cases/s2-manual-to-e2e.yaml',
        scenario: 'S2',
        status: 'evaluated',
        score: 40,
        maxScore: 100,
        percentage: 40,
        rubricResults: [
          {
            rubric: 'playwright-syntax',
            findings: ['no_pattern: "@playwright/test" unexpectedly found'],
          },
        ],
        skippedRubrics: [],
      },
    ],
  }
}

describe('reflection engine', () => {
  let tempDir

  beforeEach(() => {
    tempDir = createTempDir()
    mkdirSync(join(tempDir, 'reflections'), { recursive: true })
  })

  afterEach(() => {
    cleanTempDir(tempDir)
  })

  it('builds ranked fixes from run report', () => {
    const reflection = buildReflectionFromRun(makeReport(), { passThreshold: 75 })
    assert.equal(reflection.totalCases, 1)
    assert.equal(reflection.failingCases, 1)
    assert.ok(reflection.findingCount >= 1)
    assert.ok(reflection.rankedFixes.length >= 1)
    assert.equal(reflection.rankedFixes[0].agent, 'automation-engineer')
  })

  it('saves reflection markdown with required sections', () => {
    const reflection = buildReflectionFromRun(makeReport(), { passThreshold: 75 })
    const persisted = saveReflection(reflection, { dataDir: tempDir })
    assert.ok(existsSync(persisted.path))

    const content = readFileSync(persisted.path, 'utf-8')
    assert.ok(content.includes('## Metadata'))
    assert.ok(content.includes('## Summary'))
    assert.ok(content.includes('## Priority Fixes'))
    assert.ok(content.includes('- Run:'))
    assert.ok(content.includes('- Model:'))
  })

  it('generates reflection and persists metadata in one call', () => {
    const generated = generateReflection(makeReport(), { dataDir: tempDir })
    assert.ok(generated.reflectionFile.endsWith('.md'))
    assert.ok(generated.reflectionContent.includes('## Priority Fixes'))
  })
})
