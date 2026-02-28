import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { cmdHelp, cmdHelpCommand } from '../../bin/lib/commands/help.mjs'
import { captureLog } from '../helpers/setup.mjs'

// ---------------------------------------------------------------------------
// cmdHelpCommand — per-command help
// ---------------------------------------------------------------------------

describe('cmdHelpCommand', () => {
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

  it('should show lint command in default help', () => {
    const output = captureLog(() => cmdHelp())
    assert.ok(output.includes('lint'), 'default help should show lint command')
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
    const advanced = captureLog(() => cmdHelp({ advanced: true }))
    assert.ok(
      advanced.includes('Framework Development'),
      'advanced should have Framework Development',
    )
    assert.ok(advanced.includes('/sparq:analyze'), 'advanced should list /sparq:analyze')
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
    assert.ok(output.includes('/sparq:analyze'), 'advanced help should list /sparq:analyze')
  })
})
