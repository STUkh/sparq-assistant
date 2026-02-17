// test/unit/merge.test.mjs — Unit tests for parallel merge utilities

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  detectIdCollisions,
  mergeBarrelAdditions,
  mergeRegistryPartials,
  renumberIds,
  validateParallelHandoff,
  validateTierAssignment,
} from '../../bin/lib/merge.mjs'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeHandoff(overrides = {}) {
  return {
    version: '1.0',
    from: 'sparq-automation-engineer',
    to: 'orchestrator',
    scenario: 'S3',
    phase: 'P2',
    status: 'success',
    report: { counts: { tests: 5 }, artifacts: ['e2e/specs/login.spec.ts'] },
    gaps: [],
    instructions: 'Continue to Phase 3 for verification.',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// mergeBarrelAdditions
// ---------------------------------------------------------------------------

describe('mergeBarrelAdditions', () => {
  describe('empty barrel + additions', () => {
    it('should create barrel from single additions file', () => {
      const result = mergeBarrelAdditions('', [
        "export { LoginPage } from './login.page'\nexport { DashPage } from './dash.page'\n",
      ])
      assert.ok(result.content.includes('LoginPage'))
      assert.ok(result.content.includes('DashPage'))
      assert.deepEqual(result.added.sort(), ['DashPage', 'LoginPage'])
      assert.deepEqual(result.duplicates, [])
    })

    it('should create barrel from multiple additions files', () => {
      const result = mergeBarrelAdditions('', [
        "export { LoginPage } from './login.page'\n",
        "export { SettingsPage } from './settings.page'\n",
      ])
      assert.equal(result.added.length, 2)
      assert.ok(result.content.includes('LoginPage'))
      assert.ok(result.content.includes('SettingsPage'))
    })

    it('should sort exports alphabetically', () => {
      const result = mergeBarrelAdditions('', [
        "export { Zeta } from './zeta'\nexport { Alpha } from './alpha'\n",
      ])
      const lines = result.content.trim().split('\n')
      assert.ok(lines[0].includes('Alpha'))
      assert.ok(lines[1].includes('Zeta'))
    })

    it('should end with trailing newline', () => {
      const result = mergeBarrelAdditions('', ["export { Foo } from './foo'\n"])
      assert.ok(result.content.endsWith('\n'))
    })
  })

  describe('existing barrel + additions', () => {
    const existing = "export { BasePage } from './base.page'\n"

    it('should append new exports after existing content', () => {
      const result = mergeBarrelAdditions(existing, ["export { LoginPage } from './login.page'\n"])
      const lines = result.content.trim().split('\n')
      assert.ok(lines[0].includes('BasePage'))
      assert.ok(lines[1].includes('LoginPage'))
    })

    it('should preserve existing exports unchanged', () => {
      const result = mergeBarrelAdditions(existing, ["export { LoginPage } from './login.page'\n"])
      assert.ok(result.content.startsWith("export { BasePage } from './base.page'"))
    })

    it('should not duplicate existing exports', () => {
      const result = mergeBarrelAdditions(existing, ["export { BasePage } from './base.page'\n"])
      assert.deepEqual(result.added, [])
      assert.equal(result.content, existing)
    })

    it('should report duplicates when additions overlap with existing', () => {
      const result = mergeBarrelAdditions(existing, [
        "export { BasePage } from './base.page'\nexport { NewPage } from './new.page'\n",
      ])
      assert.deepEqual(result.added, ['NewPage'])
      // BasePage was already in existing, so it's not a cross-additions duplicate
      assert.deepEqual(result.duplicates, [])
    })
  })

  describe('duplicate handling across additions', () => {
    it('should deduplicate across multiple additions files', () => {
      const result = mergeBarrelAdditions('', [
        "export { LoginPage } from './login.page'\n",
        "export { LoginPage } from './login.page'\n",
      ])
      assert.equal(result.added.length, 1)
      assert.deepEqual(result.duplicates, ['LoginPage'])
    })

    it('should keep first occurrence when same export in two files', () => {
      const result = mergeBarrelAdditions('', [
        "export { LoginPage } from './login.page'\n",
        "export { LoginPage } from './login-v2.page'\nexport { SignupPage } from './signup.page'\n",
      ])
      assert.equal(result.added.length, 2)
      assert.ok(result.content.includes('LoginPage'))
      assert.ok(result.content.includes('SignupPage'))
      assert.deepEqual(result.duplicates, ['LoginPage'])
    })
  })

  describe('edge cases', () => {
    it('should handle empty additions array', () => {
      const result = mergeBarrelAdditions('existing content\n', [])
      assert.equal(result.content, 'existing content\n')
      assert.deepEqual(result.added, [])
    })

    it('should handle additions with blank lines', () => {
      const result = mergeBarrelAdditions('', ["\n\nexport { Foo } from './foo'\n\n"])
      assert.deepEqual(result.added, ['Foo'])
    })

    it('should handle additions with trailing whitespace', () => {
      const result = mergeBarrelAdditions('', ["export { Foo } from './foo'   \n"])
      assert.deepEqual(result.added, ['Foo'])
    })

    it('should skip malformed export lines', () => {
      const result = mergeBarrelAdditions('', [
        "not a valid line\nexport { Valid } from './valid'\nimport { Nope } from './nope'\n",
      ])
      assert.deepEqual(result.added, ['Valid'])
    })
  })
})

// ---------------------------------------------------------------------------
// mergeRegistryPartials
// ---------------------------------------------------------------------------

describe('mergeRegistryPartials', () => {
  describe('fresh registry + partials', () => {
    it('should create registry from single partial', () => {
      const result = mergeRegistryPartials(null, [
        { entries: { 'login.spec.ts': { testIds: ['TC-login-HP-001'] } } },
      ])
      assert.equal(result.registry.version, '1.0')
      assert.ok(result.registry.lastUpdated)
      assert.ok(result.registry.entries['login.spec.ts'])
      assert.equal(result.added, 1)
      assert.deepEqual(result.conflicts, [])
    })

    it('should create registry from multiple partials', () => {
      const result = mergeRegistryPartials(null, [
        { entries: { 'login.spec.ts': { testIds: ['TC-login-HP-001'] } } },
        { entries: { 'signup.spec.ts': { testIds: ['TC-signup-HP-001'] } } },
      ])
      assert.equal(result.added, 2)
      assert.ok(result.registry.entries['login.spec.ts'])
      assert.ok(result.registry.entries['signup.spec.ts'])
    })

    it('should set version to 1.0', () => {
      const result = mergeRegistryPartials(null, [{ entries: { 'a.spec.ts': {} } }])
      assert.equal(result.registry.version, '1.0')
    })

    it('should set lastUpdated to ISO timestamp', () => {
      const result = mergeRegistryPartials(null, [{ entries: { 'a.spec.ts': {} } }])
      assert.ok(result.registry.lastUpdated.match(/^\d{4}-\d{2}-\d{2}T/))
    })
  })

  describe('existing registry + partials', () => {
    const existing = {
      version: '1.0',
      lastUpdated: '2025-01-01T00:00:00.000Z',
      entries: { 'old.spec.ts': { testIds: ['TC-old-HP-001'] } },
    }

    it('should merge new entries into existing registry', () => {
      const result = mergeRegistryPartials(existing, [
        { entries: { 'new.spec.ts': { testIds: ['TC-new-HP-001'] } } },
      ])
      assert.ok(result.registry.entries['old.spec.ts'])
      assert.ok(result.registry.entries['new.spec.ts'])
      assert.equal(result.added, 1)
    })

    it('should report conflicts when partials overwrite existing entries', () => {
      const result = mergeRegistryPartials(existing, [
        { entries: { 'old.spec.ts': { testIds: ['TC-old-HP-002'] } } },
      ])
      assert.deepEqual(result.conflicts, ['old.spec.ts'])
    })

    it('should not mutate the original registry', () => {
      mergeRegistryPartials(existing, [{ entries: { 'new.spec.ts': {} } }])
      assert.ok(!existing.entries['new.spec.ts'])
    })

    it('should use last-write-wins for conflicts between partials', () => {
      const result = mergeRegistryPartials(null, [
        { entries: { 'a.spec.ts': { testIds: ['first'] } } },
        { entries: { 'a.spec.ts': { testIds: ['second'] } } },
      ])
      assert.deepEqual(result.registry.entries['a.spec.ts'].testIds, ['second'])
      assert.deepEqual(result.conflicts, ['a.spec.ts'])
    })
  })

  describe('malformed input', () => {
    it('should handle null currentRegistry', () => {
      const result = mergeRegistryPartials(null, [{ entries: { 'a.spec.ts': {} } }])
      assert.equal(result.registry.version, '1.0')
    })

    it('should handle partial without entries field', () => {
      const result = mergeRegistryPartials(null, [{}])
      assert.equal(result.added, 0)
    })

    it('should handle partial with empty entries', () => {
      const result = mergeRegistryPartials(null, [{ entries: {} }])
      assert.equal(result.added, 0)
    })

    it('should handle non-object entries gracefully', () => {
      const result = mergeRegistryPartials(null, [{ entries: 'invalid' }])
      assert.equal(result.added, 0)
    })
  })

  describe('entry preservation', () => {
    it('should preserve all entry fields during merge', () => {
      const entry = {
        testIds: ['TC-login-HP-001'],
        requirements: ['REQ-login-001'],
        requirementsHash: 'abc123',
        lastRefreshedAt: '2025-01-01T00:00:00Z',
      }
      const result = mergeRegistryPartials(null, [{ entries: { 'login.spec.ts': entry } }])
      assert.deepEqual(result.registry.entries['login.spec.ts'], entry)
    })
  })
})

// ---------------------------------------------------------------------------
// detectIdCollisions
// ---------------------------------------------------------------------------

describe('detectIdCollisions', () => {
  describe('no collisions', () => {
    it('should return empty array for unique IDs across batches', () => {
      const result = detectIdCollisions([
        { id: 'TC-login-HP-001', source: 'batch-1' },
        { id: 'TC-login-HP-002', source: 'batch-2' },
      ])
      assert.deepEqual(result, [])
    })

    it('should return empty array for empty input', () => {
      assert.deepEqual(detectIdCollisions([]), [])
    })

    it('should return empty array for single batch', () => {
      const result = detectIdCollisions([
        { id: 'TC-login-HP-001', source: 'batch-1' },
        { id: 'TC-login-HP-002', source: 'batch-1' },
      ])
      assert.deepEqual(result, [])
    })
  })

  describe('collisions detected', () => {
    it('should detect same TC ID in two batches', () => {
      const result = detectIdCollisions([
        { id: 'TC-login-HP-001', source: 'batch-1' },
        { id: 'TC-login-HP-001', source: 'batch-2' },
      ])
      assert.equal(result.length, 1)
      assert.equal(result[0].id, 'TC-login-HP-001')
      assert.deepEqual(result[0].sources, ['batch-1', 'batch-2'])
    })

    it('should detect same VF ID in two batches', () => {
      const result = detectIdCollisions([
        { id: 'VF-1', source: 'check-selectors' },
        { id: 'VF-1', source: 'check-flows' },
      ])
      assert.equal(result.length, 1)
      assert.equal(result[0].id, 'VF-1')
    })

    it('should detect multiple collisions', () => {
      const result = detectIdCollisions([
        { id: 'TC-login-HP-001', source: 'batch-1' },
        { id: 'TC-login-HP-001', source: 'batch-2' },
        { id: 'TC-login-VE-001', source: 'batch-1' },
        { id: 'TC-login-VE-001', source: 'batch-3' },
      ])
      assert.equal(result.length, 2)
    })

    it('should list all conflicting sources', () => {
      const result = detectIdCollisions([
        { id: 'TC-login-HP-001', source: 'batch-1' },
        { id: 'TC-login-HP-001', source: 'batch-2' },
        { id: 'TC-login-HP-001', source: 'batch-3' },
      ])
      assert.equal(result[0].sources.length, 3)
    })
  })

  describe('edge cases', () => {
    it('should allow same ID within same source', () => {
      const result = detectIdCollisions([
        { id: 'TC-login-HP-001', source: 'batch-1' },
        { id: 'TC-login-HP-001', source: 'batch-1' },
      ])
      assert.deepEqual(result, [])
    })

    it('should sort collision results by ID', () => {
      const result = detectIdCollisions([
        { id: 'TC-login-VE-001', source: 'b1' },
        { id: 'TC-login-VE-001', source: 'b2' },
        { id: 'TC-login-HP-001', source: 'b1' },
        { id: 'TC-login-HP-001', source: 'b2' },
      ])
      assert.equal(result[0].id, 'TC-login-HP-001')
      assert.equal(result[1].id, 'TC-login-VE-001')
    })
  })
})

// ---------------------------------------------------------------------------
// validateTierAssignment
// ---------------------------------------------------------------------------

describe('validateTierAssignment', () => {
  describe('valid assignments', () => {
    it('should pass for exclusive Tier 1 files per task', () => {
      const result = validateTierAssignment([
        { path: 'e2e/specs/login.spec.ts', taskId: 'batch-1', tier: 1 },
        { path: 'e2e/specs/signup.spec.ts', taskId: 'batch-2', tier: 1 },
      ])
      assert.equal(result.valid, true)
      assert.deepEqual(result.violations, [])
    })

    it('should pass for Tier 2 overlaps', () => {
      const result = validateTierAssignment([
        { path: '.sparq/parallel/b1/shared/index.ts.additions', taskId: 'batch-1', tier: 2 },
        { path: '.sparq/parallel/b2/shared/index.ts.additions', taskId: 'batch-2', tier: 2 },
      ])
      assert.equal(result.valid, true)
    })

    it('should pass for mixed Tier 1 and Tier 2', () => {
      const result = validateTierAssignment([
        { path: 'e2e/specs/login.spec.ts', taskId: 'batch-1', tier: 1 },
        { path: '.sparq/parallel/b1/shared/additions', taskId: 'batch-1', tier: 2 },
      ])
      assert.equal(result.valid, true)
    })

    it('should pass for empty file list', () => {
      const result = validateTierAssignment([])
      assert.equal(result.valid, true)
    })
  })

  describe('violations', () => {
    it('should detect Tier 1 conflict: two tasks write same file', () => {
      const result = validateTierAssignment([
        { path: 'e2e/specs/login.spec.ts', taskId: 'batch-1', tier: 1 },
        { path: 'e2e/specs/login.spec.ts', taskId: 'batch-2', tier: 1 },
      ])
      assert.equal(result.valid, false)
      assert.equal(result.violations.length, 1)
      assert.equal(result.violations[0].type, 'tier1_conflict')
      assert.deepEqual(result.violations[0].taskIds, ['batch-1', 'batch-2'])
    })

    it('should detect Tier 3 write attempt', () => {
      const result = validateTierAssignment([
        { path: 'e2e/pages/abstract.page.ts', taskId: 'batch-1', tier: 3 },
      ])
      assert.equal(result.valid, false)
      assert.equal(result.violations[0].type, 'tier3_write')
    })

    it('should detect multiple violations', () => {
      const result = validateTierAssignment([
        { path: 'e2e/specs/login.spec.ts', taskId: 'b1', tier: 1 },
        { path: 'e2e/specs/login.spec.ts', taskId: 'b2', tier: 1 },
        { path: 'e2e/pages/base.page.ts', taskId: 'b1', tier: 3 },
      ])
      assert.equal(result.valid, false)
      assert.equal(result.violations.length, 2)
    })

    it('should report all conflicting taskIds', () => {
      const result = validateTierAssignment([
        { path: 'e2e/specs/login.spec.ts', taskId: 'b1', tier: 1 },
        { path: 'e2e/specs/login.spec.ts', taskId: 'b2', tier: 1 },
        { path: 'e2e/specs/login.spec.ts', taskId: 'b3', tier: 1 },
      ])
      assert.equal(result.violations[0].taskIds.length, 3)
    })
  })

  describe('edge cases', () => {
    it('should handle single task with multiple Tier 1 files', () => {
      const result = validateTierAssignment([
        { path: 'e2e/specs/login.spec.ts', taskId: 'batch-1', tier: 1 },
        { path: 'e2e/specs/signup.spec.ts', taskId: 'batch-1', tier: 1 },
        { path: 'e2e/pages/login.page.ts', taskId: 'batch-1', tier: 1 },
      ])
      assert.equal(result.valid, true)
    })
  })
})

// ---------------------------------------------------------------------------
// renumberIds
// ---------------------------------------------------------------------------

describe('renumberIds', () => {
  describe('TC IDs', () => {
    it('should renumber sequential TC IDs starting from 1', () => {
      const result = renumberIds(['TC-login-HP-015', 'TC-login-HP-016'], 1)
      assert.deepEqual(result, [
        { original: 'TC-login-HP-015', renumbered: 'TC-login-HP-001' },
        { original: 'TC-login-HP-016', renumbered: 'TC-login-HP-002' },
      ])
    })

    it('should renumber starting from arbitrary number', () => {
      const result = renumberIds(['TC-login-HP-001'], 5)
      assert.equal(result[0].renumbered, 'TC-login-HP-005')
    })

    it('should pad to 3 digits', () => {
      const result = renumberIds(['TC-login-HP-999'], 1)
      assert.equal(result[0].renumbered, 'TC-login-HP-001')
    })

    it('should handle multiple categories separately', () => {
      const result = renumberIds(['TC-login-HP-010', 'TC-login-VE-010', 'TC-login-HP-011'], 1)
      // HP group: 010 -> 001, 011 -> 002
      // VE group: 010 -> 001
      const hp = result.filter((r) => r.renumbered.includes('-HP-'))
      const ve = result.filter((r) => r.renumbered.includes('-VE-'))
      assert.equal(hp.length, 2)
      assert.equal(hp[0].renumbered, 'TC-login-HP-001')
      assert.equal(hp[1].renumbered, 'TC-login-HP-002')
      assert.equal(ve.length, 1)
      assert.equal(ve[0].renumbered, 'TC-login-VE-001')
    })

    it('should preserve feature prefix', () => {
      const result = renumberIds(['TC-user-profile-SEC-005'], 1)
      assert.equal(result[0].renumbered, 'TC-user-profile-SEC-001')
    })
  })

  describe('VF IDs', () => {
    it('should renumber VF IDs', () => {
      const result = renumberIds(['VF-5', 'VF-10'], 1)
      assert.deepEqual(result, [
        { original: 'VF-5', renumbered: 'VF-1' },
        { original: 'VF-10', renumbered: 'VF-2' },
      ])
    })

    it('should start from specified number', () => {
      const result = renumberIds(['VF-1'], 42)
      assert.equal(result[0].renumbered, 'VF-42')
    })
  })

  describe('edge cases', () => {
    it('should handle empty array', () => {
      assert.deepEqual(renumberIds([], 1), [])
    })

    it('should handle single ID', () => {
      const result = renumberIds(['TC-login-A11Y-003'], 1)
      assert.equal(result.length, 1)
      assert.equal(result[0].renumbered, 'TC-login-A11Y-001')
    })

    it('should handle IDs already in correct sequence', () => {
      const result = renumberIds(['TC-login-HP-001', 'TC-login-HP-002'], 1)
      assert.equal(result[0].renumbered, 'TC-login-HP-001')
      assert.equal(result[1].renumbered, 'TC-login-HP-002')
    })

    it('should skip malformed IDs silently', () => {
      const result = renumberIds(['TC-login-HP-001', 'INVALID', 'TC-login-HP-002'], 1)
      assert.equal(result.length, 2)
    })

    it('should handle EC category', () => {
      const result = renumberIds(['TC-login-EC-050'], 1)
      assert.equal(result[0].renumbered, 'TC-login-EC-001')
    })
  })
})

// ---------------------------------------------------------------------------
// validateParallelHandoff
// ---------------------------------------------------------------------------

describe('validateParallelHandoff', () => {
  describe('valid handoffs', () => {
    it('should pass for complete handoff with parallel field', () => {
      const result = validateParallelHandoff(
        makeHandoff({
          parallel: { taskId: 'batch-1', totalTasks: 3, taskIndex: 1 },
        }),
      )
      assert.equal(result.valid, true)
      assert.deepEqual(result.errors, [])
    })

    it('should pass for handoff without parallel field', () => {
      const result = validateParallelHandoff(makeHandoff())
      assert.equal(result.valid, true)
    })

    it('should pass for failed status with non-empty gaps', () => {
      const result = validateParallelHandoff(
        makeHandoff({
          status: 'failed',
          gaps: ['Jira unavailable'],
        }),
      )
      assert.equal(result.valid, true)
    })

    it('should pass for partial status', () => {
      const result = validateParallelHandoff(
        makeHandoff({
          status: 'partial',
          gaps: ['Figma timeout'],
        }),
      )
      assert.equal(result.valid, true)
    })

    it('should pass for handoff with filesWritten', () => {
      const result = validateParallelHandoff(
        makeHandoff({
          report: {
            counts: { tests: 5 },
            artifacts: ['e2e/specs/login.spec.ts'],
            filesWritten: ['e2e/specs/login.spec.ts', 'e2e/pages/login.page.ts'],
          },
        }),
      )
      assert.equal(result.valid, true)
    })
  })

  describe('missing required fields', () => {
    for (const field of ['version', 'from', 'to', 'scenario', 'phase', 'status', 'instructions']) {
      it(`should fail for missing ${field}`, () => {
        const h = makeHandoff()
        delete h[field]
        const result = validateParallelHandoff(h)
        assert.equal(result.valid, false)
        assert.ok(result.errors.some((e) => e.includes(field)))
      })
    }

    it('should fail for missing report', () => {
      const h = makeHandoff()
      delete h.report
      const result = validateParallelHandoff(h)
      assert.equal(result.valid, false)
      assert.ok(result.errors.some((e) => e.includes('report')))
    })

    it('should fail for missing gaps', () => {
      const h = makeHandoff()
      delete h.gaps
      const result = validateParallelHandoff(h)
      assert.equal(result.valid, false)
      assert.ok(result.errors.some((e) => e.includes('gaps')))
    })
  })

  describe('invalid values', () => {
    it('should fail for wrong version', () => {
      const result = validateParallelHandoff(makeHandoff({ version: '2.0' }))
      assert.equal(result.valid, false)
      assert.ok(result.errors.some((e) => e.includes('version')))
    })

    it('should fail for invalid scenario', () => {
      const result = validateParallelHandoff(makeHandoff({ scenario: 'S9' }))
      assert.equal(result.valid, false)
      assert.ok(result.errors.some((e) => e.includes('scenario')))
    })

    it('should fail for invalid phase', () => {
      const result = validateParallelHandoff(makeHandoff({ phase: 'X1' }))
      assert.equal(result.valid, false)
      assert.ok(result.errors.some((e) => e.includes('phase')))
    })

    it('should fail for invalid status', () => {
      const result = validateParallelHandoff(makeHandoff({ status: 'unknown' }))
      assert.equal(result.valid, false)
      assert.ok(result.errors.some((e) => e.includes('status')))
    })

    it('should fail for failed status with empty gaps', () => {
      const result = validateParallelHandoff(
        makeHandoff({
          status: 'failed',
          gaps: [],
        }),
      )
      assert.equal(result.valid, false)
      assert.ok(result.errors.some((e) => e.includes('failed')))
    })

    it('should fail for instructions over 100 words', () => {
      const longInstr = Array(101).fill('word').join(' ')
      const result = validateParallelHandoff(makeHandoff({ instructions: longInstr }))
      assert.equal(result.valid, false)
      assert.ok(result.errors.some((e) => e.includes('100 words')))
    })

    it('should pass for instructions exactly 100 words', () => {
      const exactInstr = Array(100).fill('word').join(' ')
      const result = validateParallelHandoff(makeHandoff({ instructions: exactInstr }))
      assert.equal(result.valid, true)
    })
  })

  describe('parallel field validation', () => {
    it('should fail for taskIndex < 1', () => {
      const result = validateParallelHandoff(
        makeHandoff({
          parallel: { taskId: 'b1', totalTasks: 3, taskIndex: 0 },
        }),
      )
      assert.equal(result.valid, false)
      assert.ok(result.errors.some((e) => e.includes('taskIndex')))
    })

    it('should fail for taskIndex > totalTasks', () => {
      const result = validateParallelHandoff(
        makeHandoff({
          parallel: { taskId: 'b1', totalTasks: 3, taskIndex: 4 },
        }),
      )
      assert.equal(result.valid, false)
      assert.ok(result.errors.some((e) => e.includes('taskIndex')))
    })

    it('should fail for non-integer taskIndex', () => {
      const result = validateParallelHandoff(
        makeHandoff({
          parallel: { taskId: 'b1', totalTasks: 3, taskIndex: 1.5 },
        }),
      )
      assert.equal(result.valid, false)
      assert.ok(result.errors.some((e) => e.includes('taskIndex')))
    })

    it('should pass for taskIndex at lower boundary (1)', () => {
      const result = validateParallelHandoff(
        makeHandoff({
          parallel: { taskId: 'b1', totalTasks: 3, taskIndex: 1 },
        }),
      )
      assert.equal(result.valid, true)
    })

    it('should pass for taskIndex at upper boundary (totalTasks)', () => {
      const result = validateParallelHandoff(
        makeHandoff({
          parallel: { taskId: 'b1', totalTasks: 3, taskIndex: 3 },
        }),
      )
      assert.equal(result.valid, true)
    })

    it('should fail for non-integer totalTasks', () => {
      const result = validateParallelHandoff(
        makeHandoff({
          parallel: { taskId: 'b1', totalTasks: 2.5, taskIndex: 1 },
        }),
      )
      assert.equal(result.valid, false)
    })
  })

  describe('filesWritten validation', () => {
    it('should fail for non-array filesWritten', () => {
      const result = validateParallelHandoff(
        makeHandoff({
          report: {
            counts: {},
            artifacts: [],
            filesWritten: 'not-an-array',
          },
        }),
      )
      assert.equal(result.valid, false)
      assert.ok(result.errors.some((e) => e.includes('filesWritten')))
    })

    it('should fail for non-string entries in filesWritten', () => {
      const result = validateParallelHandoff(
        makeHandoff({
          report: {
            counts: {},
            artifacts: [],
            filesWritten: ['valid.ts', 123],
          },
        }),
      )
      assert.equal(result.valid, false)
      assert.ok(result.errors.some((e) => e.includes('filesWritten[1]')))
    })
  })

  describe('edge cases', () => {
    it('should fail for null handoff', () => {
      const result = validateParallelHandoff(null)
      assert.equal(result.valid, false)
    })

    it('should fail for non-object handoff', () => {
      const result = validateParallelHandoff('not an object')
      assert.equal(result.valid, false)
    })

    it('should accept valid phase formats', () => {
      for (const phase of ['P0', 'P1', 'P2', 'P3', 'P0.5', 'P1.5']) {
        const result = validateParallelHandoff(makeHandoff({ phase }))
        assert.equal(result.valid, true, `phase "${phase}" should be valid`)
      }
    })
  })
})
