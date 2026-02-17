import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it } from 'node:test'
import { cmdHelp } from '../../bin/lib/commands/help.mjs'
import { captureLog } from '../helpers/setup.mjs'

function readWorkspaceFile(relPath) {
  return readFileSync(resolve(import.meta.dirname, '../..', relPath), 'utf-8')
}

describe('docs consistency: reliability-first eval flow', () => {
  it('keeps README default eval flow lean (eval -> improve -> baseline promote)', () => {
    const readme = readWorkspaceFile('README.md')
    const marker = 'Default reliability-first eval flow:'
    const start = readme.indexOf(marker)
    assert.ok(start >= 0, 'README should include default reliability-first eval flow section')

    const slice = readme.slice(start, start + 500)
    assert.ok(slice.includes('eval <case|--all> --strict'))
    assert.ok(slice.includes('improve <case|--all>'))
    assert.ok(slice.includes('baseline promote <case|--all>'))
    assert.ok(!slice.includes('optimize'), 'default flow should not include optimize')
    assert.ok(!slice.includes('eval-reflect'), 'default flow should not include eval-reflect')
    assert.ok(!slice.includes('eval-tune'), 'default flow should not include eval-tune')
    assert.ok(
      slice.includes('prefer `--model haiku`'),
      'default flow should include model readiness hint for improve',
    )
  })

  it('keeps README skills-first quick loop generation-aware for improve', () => {
    const readme = readWorkspaceFile('README.md')
    const marker = 'Low-cost prompt quality loop for Claude Code users (skills-first):'
    const start = readme.indexOf(marker)
    assert.ok(start >= 0, 'README should include skills-first loop section')

    const slice = readme.slice(start, start + 500)
    assert.ok(slice.includes('/sparq:eval s6-bug-regression --strict --model haiku'))
    assert.ok(slice.includes('/sparq:improve s6-bug-regression --model haiku'))
  })

  it('keeps CLAUDE eval workflow section model-aware for improve', () => {
    const claude = readWorkspaceFile('CLAUDE.md')
    const marker = 'Eval self-improvement workflow (lean default + advanced path)'
    const start = claude.indexOf(marker)
    assert.ok(start >= 0, 'CLAUDE should include eval self-improvement workflow section')

    const slice = claude.slice(start, start + 600)
    assert.ok(slice.includes('sparq improve <case|--all> --model haiku'))
  })

  it('keeps eval-workflow default section free of advanced service commands', () => {
    const workflow = readWorkspaceFile('claude/skills/sparq-shared/references/eval-workflow.md')
    const marker = 'Default reliability-first flow is now:'
    const start = workflow.indexOf(marker)
    assert.ok(start >= 0, 'eval-workflow should include default flow section')

    const end = workflow.indexOf('## Prompt Development Flow')
    const block = workflow.slice(start, end > start ? end : start + 400)
    assert.ok(block.includes('sparq eval <case|--all> --strict'))
    assert.ok(block.includes('sparq improve <case|--all>'))
    assert.ok(block.includes('sparq baseline promote <case|--all>'))
    assert.ok(!block.includes('optimize'), 'default flow block should not include optimize')
    assert.ok(!block.includes('eval-reflect'), 'default flow block should not include eval-reflect')
    assert.ok(!block.includes('eval-tune'), 'default flow block should not include eval-tune')
  })

  it('default help output hides advanced eval/service commands', () => {
    const help = captureLog(() => cmdHelp())
    assert.ok(!help.includes('Service Primitives [service]'))
    assert.ok(!help.includes('/sparq:eval-reflect'))
    assert.ok(!help.includes('/sparq:eval-tune'))
    assert.ok(!help.includes('/sparq:optimize'))
  })

  it('advanced help output includes Framework Development section', () => {
    const help = captureLog(() => cmdHelp({ advanced: true }))
    assert.ok(help.includes('Framework Development'))
    assert.ok(help.includes('/sparq:eval-reflect'))
    assert.ok(help.includes('/sparq:eval-tune'))
    assert.ok(help.includes('/sparq:optimize'))
  })
})
