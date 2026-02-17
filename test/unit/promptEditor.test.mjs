import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { applyTunePlan, validateEditedPrompt } from '../../bin/lib/eval/prompt-editor.mjs'
import { cleanTempDir, createTempDir } from '../helpers/setup.mjs'

function makeAgentPrompt() {
  return `---
name: sparq-test-agent
description: test
model: sonnet
---

# Test Agent

<rules>
- Existing rule.
</rules>

<done_criteria>
1. Keep output deterministic.
</done_criteria>

<references>
- .claude/skills/sparq-shared/references/eval-workflow.md
</references>
`
}

describe('prompt editor', () => {
  let tempDir
  let agentFile

  beforeEach(() => {
    tempDir = createTempDir()
    mkdirSync(join(tempDir, 'claude', 'agents'), { recursive: true })
    agentFile = join(tempDir, 'claude', 'agents', 'sparq-test-agent.md')
    writeFileSync(agentFile, makeAgentPrompt(), 'utf-8')
  })

  afterEach(() => {
    cleanTempDir(tempDir)
  })

  it('applies tune operations into tagged sections', () => {
    const plan = {
      byFile: new Map([
        [
          agentFile,
          [
            {
              fixId: 'fix-1',
              section: 'rules',
              marker: '[sparq:auto:fix-1]',
              line: '- [sparq:auto:fix-1] Add explicit REQ ID examples.',
            },
          ],
        ],
      ]),
    }

    const result = applyTunePlan(plan)
    assert.equal(result.tunedFileCount, 1)
    assert.ok(result.appliedFixIds.includes('fix-1'))

    const updated = readFileSync(agentFile, 'utf-8')
    assert.ok(updated.includes('[sparq:auto:fix-1]'))
  })

  it('is idempotent when marker already exists', () => {
    const op = {
      fixId: 'fix-2',
      section: 'rules',
      marker: '[sparq:auto:fix-2]',
      line: '- [sparq:auto:fix-2] Keep deterministic output constraints.',
    }

    const first = applyTunePlan({ byFile: new Map([[agentFile, [op]]]) })
    const second = applyTunePlan({ byFile: new Map([[agentFile, [op]]]) })

    assert.equal(first.tunedFileCount, 1)
    assert.equal(second.tunedFileCount, 0)
  })

  it('validates required sections and line budget', () => {
    const valid = validateEditedPrompt(makeAgentPrompt(), { maxLines: 50 })
    assert.equal(valid.valid, true)

    const invalid = validateEditedPrompt('# Missing required sections', { maxLines: 10 })
    assert.equal(invalid.valid, false)
  })
})
