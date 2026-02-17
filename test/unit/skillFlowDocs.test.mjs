import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it } from 'node:test'

function readFile(relPath) {
  return readFileSync(resolve(import.meta.dirname, '../..', relPath), 'utf-8')
}

describe('skill flow docs consistency', () => {
  it('sparq:eval skill routes by NEXT_ACTION and model-aware improve hint', () => {
    const evalSkill = readFile('claude/skills/sparq-eval/SKILL.md')
    assert.ok(evalSkill.includes('[sparq] NEXT_ACTION='))
    assert.ok(evalSkill.includes('--model haiku'))
    assert.ok(evalSkill.includes('generation-capable model'))
  })

  it('sparq:improve skill documents machine-readable improve contract', () => {
    const improveSkill = readFile('claude/skills/sparq-improve/SKILL.md')
    assert.ok(improveSkill.includes('IMPROVE_STATUS'))
    assert.ok(improveSkill.includes('IMPROVE_ITERATIONS'))
    assert.ok(improveSkill.includes('IMPROVE_TUNED_FILES'))
    assert.ok(improveSkill.includes('NEXT_ACTION'))
  })

  it('advanced skills keep model-aware improve guidance', () => {
    const baselinePromoteSkill = readFile('claude/skills/sparq-baseline-promote/SKILL.md')
    const evalTuneSkill = readFile('claude/skills/sparq-eval-tune/SKILL.md')
    const evalReflectSkill = readFile('claude/skills/sparq-eval-reflect/SKILL.md')
    const optimizeSkill = readFile('claude/skills/sparq-optimize/SKILL.md')

    assert.ok(baselinePromoteSkill.includes('/sparq:improve {case|--all} --model haiku'))
    assert.ok(evalTuneSkill.includes('/sparq:improve {affected-case} --model haiku'))
    assert.ok(evalReflectSkill.includes('/sparq:improve {case|--all} --model haiku'))
    assert.ok(optimizeSkill.includes('/sparq:improve --all --model haiku'))
  })

  it('service skill markers remain explicit', () => {
    const reflectSkill = readFile('claude/skills/sparq-eval-reflect/SKILL.md')
    const tuneSkill = readFile('claude/skills/sparq-eval-tune/SKILL.md')
    const optimizeSkill = readFile('claude/skills/sparq-optimize/SKILL.md')

    assert.ok(reflectSkill.includes('service: true'))
    assert.ok(tuneSkill.includes('service: true'))
    assert.ok(optimizeSkill.includes('service: true'))
  })

  it('shared eval workflow avoids outdated mock-only default claim', () => {
    const workflow = readFile('claude/skills/sparq-shared/references/eval-workflow.md')
    assert.match(
      workflow,
      /improve`?\s+may return\s+`BLOCKED`\s+unless a generation-capable model is resolved/i,
    )
    assert.ok(!workflow.includes('run mock/local scoring by default (no API token cost)'))
  })
})
