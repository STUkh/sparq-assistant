import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { cmdHelp, cmdHelpCommand } from '../../bin/lib/commands/help.mjs'
import { captureLog } from '../helpers/setup.mjs'

// ---------------------------------------------------------------------------
// cmdHelpCommand — per-command help
// ---------------------------------------------------------------------------

describe('cmdHelpCommand', () => {
  it('should show init help with --features and --defaults', () => {
    const output = captureLog(() => cmdHelpCommand('init'))
    assert.ok(output.includes('init'), 'should mention init')
    assert.ok(output.includes('--features'), 'should mention --features')
    assert.ok(output.includes('--defaults'), 'should mention --defaults')
  })

  it('should show doctor help with --fix and --deep', () => {
    const output = captureLog(() => cmdHelpCommand('doctor'))
    assert.ok(output.includes('doctor'), 'should mention doctor')
    assert.ok(output.includes('--fix'), 'should mention --fix')
    assert.ok(output.includes('--deep'), 'should mention --deep')
  })

  it('should show update help with --only and --skip', () => {
    const output = captureLog(() => cmdHelpCommand('update'))
    assert.ok(output.includes('--only'), 'should mention --only')
    assert.ok(output.includes('--skip'), 'should mention --skip')
  })

  it('should show clean help with --type and --older-than', () => {
    const output = captureLog(() => cmdHelpCommand('clean'))
    assert.ok(output.includes('--type'), 'should mention --type')
    assert.ok(output.includes('--older-than'), 'should mention --older-than')
  })

  it('should show improve help with --max-iterations', () => {
    const output = captureLog(() => cmdHelpCommand('improve'))
    assert.ok(output.includes('improve'), 'should mention improve')
    assert.ok(output.includes('--max-iterations'), 'should mention --max-iterations')
  })

  it('should show baseline help with promote usage', () => {
    const output = captureLog(() => cmdHelpCommand('baseline'))
    assert.ok(output.includes('baseline'), 'should mention baseline')
    assert.ok(output.includes('promote'), 'should mention promote action')
  })

  it('should show "Unknown command" for nonexistent command', () => {
    const output = captureLog(() => cmdHelpCommand('nonexistent'))
    assert.ok(output.includes('Unknown command'), 'should indicate unknown command')
  })
})

// ---------------------------------------------------------------------------
// cmdHelp — general help
// ---------------------------------------------------------------------------

describe('cmdHelp', () => {
  it('should include FEATURES section', () => {
    const output = captureLog(() => cmdHelp())
    assert.ok(output.includes('FEATURES'), 'should contain FEATURES section')
  })

  it('should list sparq-automation-engineer agent', () => {
    const output = captureLog(() => cmdHelp())
    assert.ok(
      output.includes('sparq-automation-engineer'),
      'should list sparq-automation-engineer agent',
    )
  })

  it('should list /sparq:regression skill', () => {
    const output = captureLog(() => cmdHelp())
    assert.ok(output.includes('/sparq:regression'), 'should list /sparq:regression skill')
  })

  it('should list /sparq:refactor skill', () => {
    const output = captureLog(() => cmdHelp())
    assert.ok(output.includes('/sparq:refactor'), 'should list /sparq:refactor skill')
  })

  it('should show --defaults in init per-command help', () => {
    const output = captureLog(() => cmdHelpCommand('init'))
    assert.ok(output.includes('--defaults'), 'init help should mention --defaults flag')
  })

  it('should show --fix in doctor per-command help', () => {
    const output = captureLog(() => cmdHelpCommand('doctor'))
    assert.ok(output.includes('--fix'), 'doctor help should mention --fix flag')
  })

  it('should hide improve and baseline from default help (advanced only)', () => {
    const output = captureLog(() => cmdHelp())
    assert.ok(!output.includes('improve'), 'default help should hide improve command')
    assert.ok(!output.includes('baseline'), 'default help should hide baseline command')
    const advanced = captureLog(() => cmdHelp({ advanced: true }))
    assert.ok(advanced.includes('improve'), 'advanced help should show improve command')
    assert.ok(advanced.includes('baseline'), 'advanced help should show baseline command')
  })

  it('should include SKILLS section with category groups', () => {
    const output = captureLog(() => cmdHelp())
    assert.ok(output.includes('SKILLS'), 'should contain SKILLS section')
    assert.ok(output.includes('Setup'), 'should have Setup category')
    assert.ok(output.includes('Generate'), 'should have Generate category')
    assert.ok(output.includes('Maintain'), 'should have Maintain category')
  })

  it('should list QA-audience skills in categorized groups', () => {
    const output = captureLog(() => cmdHelp())
    assert.ok(output.includes('/sparq:init'), 'should list /sparq:init in Setup')
    assert.ok(output.includes('/sparq:config'), 'should list /sparq:config in Setup')
    assert.ok(output.includes('/sparq:start'), 'should list /sparq:start in Setup')
    assert.ok(output.includes('/sparq:generate'), 'should list /sparq:generate in Generate')
    assert.ok(output.includes('/sparq:generate-manual'), 'should list /sparq:generate-manual')
    assert.ok(output.includes('/sparq:generate-e2e'), 'should list /sparq:generate-e2e')
    assert.ok(output.includes('/sparq:manual-to-e2e'), 'should list /sparq:manual-to-e2e')
    assert.ok(output.includes('/sparq:validate'), 'should list /sparq:validate in Maintain')
    assert.ok(output.includes('/sparq:sync'), 'should list /sparq:sync in Maintain')
    assert.ok(output.includes('/sparq:export'), 'should list /sparq:export in Maintain')
  })

  it('should hide dev skills from default help and show in advanced', () => {
    const output = captureLog(() => cmdHelp())
    assert.ok(!output.includes('/sparq:analyze'), 'default help should hide /sparq:analyze')
    assert.ok(!output.includes('/sparq:optimize'), 'default help should hide /sparq:optimize')
    const advanced = captureLog(() => cmdHelp({ advanced: true }))
    assert.ok(
      advanced.includes('Framework Development'),
      'advanced should have Framework Development',
    )
    assert.ok(advanced.includes('/sparq:analyze'), 'advanced should list /sparq:analyze')
    assert.ok(advanced.includes('/sparq:eval'), 'advanced should list /sparq:eval')
    assert.ok(advanced.includes('/sparq:improve'), 'advanced should list /sparq:improve')
    assert.ok(
      advanced.includes('/sparq:baseline-promote'),
      'advanced should list /sparq:baseline-promote',
    )
    assert.ok(advanced.includes('/sparq:optimize'), 'advanced should list /sparq:optimize')
  })

  it('should hide service primitives by default', () => {
    const output = captureLog(() => cmdHelp())
    assert.ok(
      !output.includes('Service Primitives [service]'),
      'default help should not include service primitives subsection',
    )
    assert.ok(
      output.includes('help advanced'),
      'default help should include hint for advanced help surface',
    )
  })

  it('should show dev skills in advanced help under Framework Development', () => {
    const output = captureLog(() => cmdHelp({ advanced: true }))

    assert.ok(
      output.includes('Framework Development'),
      'advanced help should include Framework Development section',
    )
    assert.ok(
      output.includes('/sparq:eval-reflect'),
      'advanced help should list /sparq:eval-reflect',
    )
    assert.ok(output.includes('/sparq:eval-tune'), 'advanced help should list /sparq:eval-tune')
    assert.ok(output.includes('/sparq:optimize'), 'advanced help should list /sparq:optimize')
    assert.ok(
      output.includes('/sparq:audit-prompts'),
      'advanced help should list /sparq:audit-prompts',
    )
  })
})
