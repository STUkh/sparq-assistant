import assert from 'node:assert/strict'
import { basename } from 'node:path'
import { describe, it } from 'node:test'
import { buildTunePlan } from '../../bin/lib/eval/tune-catalog.mjs'

describe('tune catalog', () => {
  it('maps ranked fixes into file operations', () => {
    const plan = buildTunePlan(
      {
        rankedFixes: [
          {
            id: 'fix-1',
            agent: 'automation-engineer',
            section: 'constants',
            text: 'no_pattern: "@playwright/test" unexpectedly found',
            rubrics: ['playwright-syntax'],
            count: 2,
          },
        ],
      },
      { maxOperations: 4 },
    )

    assert.equal(plan.operations.length, 1)
    assert.equal(plan.files.length, 1)
    assert.ok(plan.operations[0].marker.includes('[sparq:auto:fix-1]'))
    assert.equal(plan.operations[0].section, 'constants')
    assert.equal(basename(plan.operations[0].file), 'sparq-automation-engineer.md')
  })

  it('deduplicates duplicate fixes by marker and target section', () => {
    const plan = buildTunePlan(
      {
        rankedFixes: [
          {
            id: 'fix-1',
            agent: 'requirements-analyst',
            section: 'constants',
            text: 'REQ-\\w+-\\d{3} not found',
            rubrics: ['naming-conventions'],
            count: 1,
          },
          {
            id: 'fix-1',
            agent: 'requirements-analyst',
            section: 'constants',
            text: 'REQ-\\w+-\\d{3} not found',
            rubrics: ['naming-conventions'],
            count: 1,
          },
        ],
      },
      { maxOperations: 8 },
    )

    assert.equal(plan.operations.length, 1)
  })
})
