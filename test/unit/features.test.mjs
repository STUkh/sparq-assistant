import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  ALL_FEATURE_NAMES,
  FEATURE_GROUPS,
  getAgentsForFeatures,
  getMcpServersForFeatures,
  getSkillsForFeatures,
  getTemplatesForFeatures,
  PRESET_FEATURES,
  resolveFeatures,
} from '../../bin/lib/features.mjs'

// ---------------------------------------------------------------------------
// FEATURE_GROUPS structure
// ---------------------------------------------------------------------------

describe('FEATURE_GROUPS', () => {
  const requiredFields = [
    'name',
    'description',
    'agents',
    'skills',
    'mcpServers',
    'templates',
    'alwaysIncluded',
  ]

  it('should have all required fields in every group', () => {
    for (const [key, group] of Object.entries(FEATURE_GROUPS)) {
      for (const field of requiredFields) {
        assert.ok(field in group, `Feature group "${key}" is missing required field "${field}"`)
      }
    }
  })

  it('should have string name and description in every group', () => {
    for (const [key, group] of Object.entries(FEATURE_GROUPS)) {
      assert.equal(typeof group.name, 'string', `"${key}".name should be a string`)
      assert.equal(typeof group.description, 'string', `"${key}".description should be a string`)
      assert.ok(group.name.length > 0, `"${key}".name should be non-empty`)
      assert.ok(group.description.length > 0, `"${key}".description should be non-empty`)
    }
  })

  it('should have array values for agents, skills, mcpServers, and templates', () => {
    for (const [key, group] of Object.entries(FEATURE_GROUPS)) {
      assert.ok(Array.isArray(group.agents), `"${key}".agents should be an array`)
      assert.ok(Array.isArray(group.skills), `"${key}".skills should be an array`)
      assert.ok(Array.isArray(group.mcpServers), `"${key}".mcpServers should be an array`)
      assert.ok(Array.isArray(group.templates), `"${key}".templates should be an array`)
    }
  })

  it('should have boolean alwaysIncluded in every group', () => {
    for (const [key, group] of Object.entries(FEATURE_GROUPS)) {
      assert.equal(
        typeof group.alwaysIncluded,
        'boolean',
        `"${key}".alwaysIncluded should be a boolean`,
      )
    }
  })

  it('should mark only "core" as alwaysIncluded', () => {
    for (const [key, group] of Object.entries(FEATURE_GROUPS)) {
      if (key === 'core') {
        assert.equal(group.alwaysIncluded, true, '"core" should be alwaysIncluded')
      } else {
        assert.equal(group.alwaysIncluded, false, `"${key}" should not be alwaysIncluded`)
      }
    }
  })

  it('should contain the orchestrator agent in core', () => {
    assert.ok(
      FEATURE_GROUPS.core.agents.includes('sparq-orchestrator.md'),
      'core should include the orchestrator agent',
    )
  })

  it('should be frozen (immutable)', () => {
    assert.ok(Object.isFrozen(FEATURE_GROUPS), 'FEATURE_GROUPS should be frozen')
  })
})

// ---------------------------------------------------------------------------
// ALL_FEATURE_NAMES
// ---------------------------------------------------------------------------

describe('ALL_FEATURE_NAMES', () => {
  it('should be a frozen array', () => {
    assert.ok(Array.isArray(ALL_FEATURE_NAMES), 'should be an array')
    assert.ok(Object.isFrozen(ALL_FEATURE_NAMES), 'should be frozen')
  })

  it('should contain every key from FEATURE_GROUPS', () => {
    const keys = Object.keys(FEATURE_GROUPS)
    assert.deepEqual(
      [...ALL_FEATURE_NAMES].sort(),
      [...keys].sort(),
      'ALL_FEATURE_NAMES should match FEATURE_GROUPS keys',
    )
  })

  it('should include all expected feature names', () => {
    const expected = [
      'core',
      'manual-tests',
      'e2e',
      'jira',
      'confluence',
      'figma',
      'testrail',
      'qase',
      'tms-local',
      'playwright-mcp',
      'export',
      'dev-tools',
      'playwright-best-practices',
      'cypress-best-practices',
    ]
    for (const name of expected) {
      assert.ok(ALL_FEATURE_NAMES.includes(name), `should include "${name}"`)
    }
  })
})

// ---------------------------------------------------------------------------
// PRESET_FEATURES
// ---------------------------------------------------------------------------

describe('PRESET_FEATURES', () => {
  it('should be a frozen object', () => {
    assert.ok(Object.isFrozen(PRESET_FEATURES), 'should be frozen')
  })

  it('should have all, minimal, e2e-only, and full-qa presets', () => {
    assert.ok('all' in PRESET_FEATURES, 'should have "all" preset')
    assert.ok('minimal' in PRESET_FEATURES, 'should have "minimal" preset')
    assert.ok('e2e-only' in PRESET_FEATURES, 'should have "e2e-only" preset')
    assert.ok('full-qa' in PRESET_FEATURES, 'should have "full-qa" preset')
  })

  it('"all" preset should contain every feature name', () => {
    assert.deepEqual(
      [...PRESET_FEATURES.all].sort(),
      [...ALL_FEATURE_NAMES].sort(),
      '"all" should expand to all feature names',
    )
  })

  it('"minimal" preset should contain only core', () => {
    assert.deepEqual(PRESET_FEATURES.minimal, ['core'])
  })

  it('"e2e-only" preset should contain core, e2e, and playwright-mcp', () => {
    assert.deepEqual(
      [...PRESET_FEATURES['e2e-only']].sort(),
      ['core', 'e2e', 'playwright-mcp'].sort(),
    )
  })

  it('"full-qa" preset should match "all"', () => {
    assert.deepEqual(PRESET_FEATURES['full-qa'], PRESET_FEATURES.all)
  })
})

// ---------------------------------------------------------------------------
// resolveFeatures
// ---------------------------------------------------------------------------

describe('resolveFeatures', () => {
  it('should always include core even with empty selection', () => {
    const result = resolveFeatures([])
    assert.ok(result.has('core'), 'empty selection should still include core')
    assert.equal(result.size, 1, 'empty selection should resolve to only core')
  })

  it('should resolve a single feature name', () => {
    const result = resolveFeatures(['e2e'])
    assert.ok(result.has('core'), 'should include core')
    assert.ok(result.has('e2e'), 'should include e2e')
    assert.equal(result.size, 2)
  })

  it('should resolve multiple feature names', () => {
    const result = resolveFeatures(['e2e', 'jira', 'figma'])
    assert.ok(result.has('core'), 'should include core')
    assert.ok(result.has('e2e'), 'should include e2e')
    assert.ok(result.has('jira'), 'should include jira')
    assert.ok(result.has('figma'), 'should include figma')
    assert.equal(result.size, 4)
  })

  it('should resolve the "all" preset to all features', () => {
    const result = resolveFeatures(['all'])
    for (const name of ALL_FEATURE_NAMES) {
      assert.ok(result.has(name), `"all" should include "${name}"`)
    }
    assert.equal(result.size, ALL_FEATURE_NAMES.length)
  })

  it('should resolve the "minimal" preset to only core', () => {
    const result = resolveFeatures(['minimal'])
    assert.ok(result.has('core'), 'should include core')
    assert.equal(result.size, 1, 'minimal should resolve to only core')
  })

  it('should resolve the "e2e-only" preset to core + e2e + playwright-mcp', () => {
    const result = resolveFeatures(['e2e-only'])
    assert.ok(result.has('core'), 'should include core')
    assert.ok(result.has('e2e'), 'should include e2e')
    assert.ok(result.has('playwright-mcp'), 'should include playwright-mcp')
    assert.equal(result.size, 3)
  })

  it('should resolve the "full-qa" preset to all features', () => {
    const result = resolveFeatures(['full-qa'])
    assert.equal(result.size, ALL_FEATURE_NAMES.length, 'full-qa should include all features')
  })

  it('should deduplicate when preset and individual features overlap', () => {
    const result = resolveFeatures(['e2e-only', 'e2e', 'core'])
    assert.equal(result.size, 3, 'should deduplicate overlapping features')
    assert.ok(result.has('core'))
    assert.ok(result.has('e2e'))
    assert.ok(result.has('playwright-mcp'))
  })

  it('should throw on unknown feature name', () => {
    assert.throws(
      () => resolveFeatures(['nonexistent']),
      { message: /Unknown feature "nonexistent"/ },
      'should throw for unrecognised feature',
    )
  })

  it('should throw on unknown name even when mixed with valid names', () => {
    assert.throws(() => resolveFeatures(['e2e', 'bad-name']), {
      message: /Unknown feature "bad-name"/,
    })
  })

  it('should include valid feature names in the error message', () => {
    try {
      resolveFeatures(['nope'])
      assert.fail('should have thrown')
    } catch (err) {
      assert.ok(err.message.includes('core'), 'error should list "core" as a valid name')
      assert.ok(err.message.includes('e2e'), 'error should list "e2e" as a valid name')
      assert.ok(err.message.includes('all'), 'error should list "all" as a valid preset')
    }
  })

  it('should resolve qase feature', () => {
    const result = resolveFeatures(['qase'])
    assert.ok(result.has('core'), 'should include core')
    assert.ok(result.has('qase'), 'should include qase')
    assert.equal(result.size, 2)
  })

  it('should resolve tms-local feature', () => {
    const result = resolveFeatures(['tms-local'])
    assert.ok(result.has('core'), 'should include core')
    assert.ok(result.has('tms-local'), 'should include tms-local')
    assert.equal(result.size, 2)
  })

  it('should return a Set', () => {
    const result = resolveFeatures(['e2e'])
    assert.ok(result instanceof Set, 'should return a Set')
  })
})

// ---------------------------------------------------------------------------
// getAgentsForFeatures
// ---------------------------------------------------------------------------

describe('getAgentsForFeatures', () => {
  it('should return orchestrator for core-only selection', () => {
    const features = resolveFeatures([])
    const agents = getAgentsForFeatures(features)
    assert.deepEqual(agents, ['sparq-orchestrator.md'])
  })

  it('should return correct agents for manual-tests', () => {
    const features = resolveFeatures(['manual-tests'])
    const agents = getAgentsForFeatures(features)
    assert.ok(agents.includes('sparq-orchestrator.md'), 'should include orchestrator from core')
    assert.ok(
      agents.includes('sparq-requirements-analyst.md'),
      'should include requirements-analyst',
    )
    assert.ok(agents.includes('sparq-manual-test-writer.md'), 'should include manual-test-writer')
  })

  it('should return correct agents for e2e', () => {
    const features = resolveFeatures(['e2e'])
    const agents = getAgentsForFeatures(features)
    assert.ok(agents.includes('sparq-orchestrator.md'), 'should include orchestrator from core')
    assert.ok(agents.includes('sparq-automation-engineer.md'), 'should include automation-engineer')
    assert.ok(agents.includes('sparq-test-validator.md'), 'should include test-validator')
  })

  it('should return all 5 agents for all features', () => {
    const features = resolveFeatures(['all'])
    const agents = getAgentsForFeatures(features)
    assert.equal(agents.length, 5, 'should include all 5 agents')
    assert.ok(agents.includes('sparq-orchestrator.md'))
    assert.ok(agents.includes('sparq-requirements-analyst.md'))
    assert.ok(agents.includes('sparq-manual-test-writer.md'))
    assert.ok(agents.includes('sparq-automation-engineer.md'))
    assert.ok(agents.includes('sparq-test-validator.md'))
  })

  it('should deduplicate agents across features', () => {
    const features = resolveFeatures(['manual-tests', 'e2e'])
    const agents = getAgentsForFeatures(features)
    const unique = new Set(agents)
    assert.equal(agents.length, unique.size, 'agents should have no duplicates')
  })

  it('should return empty array for feature groups with no agents', () => {
    const features = new Set(['jira'])
    const agents = getAgentsForFeatures(features)
    assert.deepEqual(agents, [], 'jira alone has no agents')
  })
})

// ---------------------------------------------------------------------------
// getSkillsForFeatures
// ---------------------------------------------------------------------------

describe('getSkillsForFeatures', () => {
  it('should always include sparq-shared', () => {
    const features = resolveFeatures([])
    const skills = getSkillsForFeatures(features)
    assert.ok(skills.includes('sparq-shared'), 'should always include sparq-shared')
  })

  it('should include sparq-shared even for feature groups with no skills', () => {
    const features = new Set(['jira'])
    const skills = getSkillsForFeatures(features)
    assert.ok(skills.includes('sparq-shared'), 'should include sparq-shared regardless')
  })

  it('should return correct skills for core', () => {
    const features = resolveFeatures([])
    const skills = getSkillsForFeatures(features)
    assert.ok(skills.includes('sparq-shared'))
    assert.ok(skills.includes('sparq-analyze'))
    assert.ok(skills.includes('sparq-init'))
    assert.ok(skills.includes('sparq-start'))
    assert.ok(skills.includes('sparq-config'))
    assert.ok(skills.includes('sparq-resume'))
    assert.ok(skills.includes('sparq-resume'))
  })

  it('should return correct skills for manual-tests', () => {
    const features = resolveFeatures(['manual-tests'])
    const skills = getSkillsForFeatures(features)
    assert.ok(skills.includes('sparq-generate'))
    assert.ok(skills.includes('sparq-generate-manual'))
    assert.ok(skills.includes('sparq-manual-to-e2e'))
  })

  it('should return correct skills for e2e', () => {
    const features = resolveFeatures(['e2e'])
    const skills = getSkillsForFeatures(features)
    assert.ok(skills.includes('sparq-generate-e2e'))
    assert.ok(skills.includes('sparq-sync'))
  })

  it('should deduplicate skills across features', () => {
    const features = resolveFeatures(['all'])
    const skills = getSkillsForFeatures(features)
    const unique = new Set(skills)
    assert.equal(skills.length, unique.size, 'skills should have no duplicates')
  })

  it('should include export skill for testrail and export features', () => {
    const features = resolveFeatures(['testrail', 'export'])
    const skills = getSkillsForFeatures(features)
    const exportCount = skills.filter((s) => s === 'sparq-export').length
    assert.equal(exportCount, 1, 'sparq-export should appear exactly once')
  })

  it('should include optimize skill for dev-tools feature', () => {
    const features = resolveFeatures(['dev-tools'])
    const skills = getSkillsForFeatures(features)
    assert.ok(skills.includes('sparq-optimize'), 'should include sparq-optimize skill')
  })

  it('should include lean eval flow skills for dev-tools feature', () => {
    const features = resolveFeatures(['dev-tools'])
    const skills = getSkillsForFeatures(features)
    assert.ok(skills.includes('sparq-eval'), 'should include sparq-eval')
    assert.ok(skills.includes('sparq-improve'), 'should include sparq-improve')
    assert.ok(skills.includes('sparq-baseline-promote'), 'should include sparq-baseline-promote')
  })

  it('should include audit-prompts skill for dev-tools feature', () => {
    const features = resolveFeatures(['dev-tools'])
    const skills = getSkillsForFeatures(features)
    assert.ok(skills.includes('sparq-audit-prompts'), 'should include sparq-audit-prompts skill')
  })
})

// ---------------------------------------------------------------------------
// getMcpServersForFeatures
// ---------------------------------------------------------------------------

describe('getMcpServersForFeatures', () => {
  it('should return empty array for core-only', () => {
    const features = resolveFeatures([])
    const servers = getMcpServersForFeatures(features)
    assert.deepEqual(servers, [], 'core has no MCP servers')
  })

  it('should return atlassian for jira', () => {
    const features = resolveFeatures(['jira'])
    const servers = getMcpServersForFeatures(features)
    assert.ok(servers.includes('atlassian'))
  })

  it('should return atlassian for confluence', () => {
    const features = resolveFeatures(['confluence'])
    const servers = getMcpServersForFeatures(features)
    assert.ok(servers.includes('atlassian'))
  })

  it('should deduplicate atlassian when both jira and confluence are selected', () => {
    const features = resolveFeatures(['jira', 'confluence'])
    const servers = getMcpServersForFeatures(features)
    const atlassianCount = servers.filter((s) => s === 'atlassian').length
    assert.equal(atlassianCount, 1, 'atlassian should appear exactly once')
  })

  it('should return figma server for figma feature', () => {
    const features = resolveFeatures(['figma'])
    const servers = getMcpServersForFeatures(features)
    assert.deepEqual(servers, ['figma'])
  })

  it('should return testrail server for testrail feature', () => {
    const features = resolveFeatures(['testrail'])
    const servers = getMcpServersForFeatures(features)
    assert.ok(servers.includes('testrail'))
  })

  it('should return playwright server for playwright-mcp feature', () => {
    const features = resolveFeatures(['playwright-mcp'])
    const servers = getMcpServersForFeatures(features)
    assert.deepEqual(servers, ['playwright'])
  })

  it('should return all 5 servers for all features', () => {
    const features = resolveFeatures(['all'])
    const servers = getMcpServersForFeatures(features)
    assert.ok(servers.includes('atlassian'), 'should include atlassian')
    assert.ok(servers.includes('figma'), 'should include figma')
    assert.ok(servers.includes('testrail'), 'should include testrail')
    assert.ok(servers.includes('qase'), 'should include qase')
    assert.ok(servers.includes('playwright'), 'should include playwright')
    assert.equal(servers.length, 5, 'should have exactly 5 unique servers')
  })

  it('should return qase server for qase feature', () => {
    const features = resolveFeatures(['qase'])
    const servers = getMcpServersForFeatures(features)
    assert.ok(servers.includes('qase'))
  })

  it('should return empty array for tms-local feature', () => {
    const features = resolveFeatures(['tms-local'])
    const servers = getMcpServersForFeatures(features)
    // tms-local has no MCP servers — core also has none
    assert.deepEqual(servers, [], 'tms-local should have no MCP servers')
  })
})

// ---------------------------------------------------------------------------
// getTemplatesForFeatures
// ---------------------------------------------------------------------------

describe('getTemplatesForFeatures', () => {
  it('should return execution plan template for core-only', () => {
    const features = resolveFeatures([])
    const templates = getTemplatesForFeatures(features)
    assert.deepEqual(templates, ['sparq-execution-plan.md'])
  })

  it('should return correct templates for manual-tests', () => {
    const features = resolveFeatures(['manual-tests'])
    const templates = getTemplatesForFeatures(features)
    assert.ok(templates.includes('sparq-requirements.md'))
    assert.ok(templates.includes('sparq-test-case.md'))
    assert.ok(templates.includes('sparq-coverage-matrix.md'))
  })

  it('should return correct templates for e2e', () => {
    const features = resolveFeatures(['e2e'])
    const templates = getTemplatesForFeatures(features)
    assert.ok(templates.includes('sparq-validation-report.md'))
    assert.ok(templates.includes('sparq-coverage-matrix.md'))
    assert.ok(templates.includes('sparq-refresh-diff.md'))
  })

  it('should deduplicate sparq-coverage-matrix.md across manual-tests and e2e', () => {
    const features = resolveFeatures(['manual-tests', 'e2e'])
    const templates = getTemplatesForFeatures(features)
    const coverageCount = templates.filter((t) => t === 'sparq-coverage-matrix.md').length
    assert.equal(coverageCount, 1, 'sparq-coverage-matrix.md should appear exactly once')
  })

  it('should return empty array for features with no templates', () => {
    const features = new Set(['jira'])
    const templates = getTemplatesForFeatures(features)
    assert.deepEqual(templates, [])
  })

  it('should return all unique templates for all features', () => {
    const features = resolveFeatures(['all'])
    const templates = getTemplatesForFeatures(features)
    const unique = new Set(templates)
    assert.equal(templates.length, unique.size, 'templates should have no duplicates')
    assert.ok(templates.length >= 5, `should have at least 5 templates, got ${templates.length}`)
  })
})

// ---------------------------------------------------------------------------
// sparq-validate in e2e features
// ---------------------------------------------------------------------------

describe('sparq-validate in e2e features', () => {
  it('should include sparq-validate in skills for e2e features', () => {
    const features = resolveFeatures(['e2e'])
    const skills = getSkillsForFeatures(features)
    assert.ok(skills.includes('sparq-validate'), 'e2e features should include sparq-validate skill')
  })

  it('should still include sparq-sync in skills for e2e features', () => {
    const features = resolveFeatures(['e2e'])
    const skills = getSkillsForFeatures(features)
    assert.ok(skills.includes('sparq-sync'), 'e2e features should still include sparq-sync skill')
  })

  it('should always include sparq-shared in skills for e2e features', () => {
    const skills = getSkillsForFeatures(new Set(['e2e']))
    assert.ok(skills.includes('sparq-shared'), 'sparq-shared should always be included')
  })
})

// ---------------------------------------------------------------------------
// PRESET_FEATURES — cypress-e2e preset
// ---------------------------------------------------------------------------

describe('PRESET_FEATURES — cypress-e2e preset', () => {
  it('should have cypress-e2e preset', () => {
    assert.ok('cypress-e2e' in PRESET_FEATURES)
  })

  it('should contain core and e2e without playwright-mcp', () => {
    assert.deepEqual([...PRESET_FEATURES['cypress-e2e']].sort(), ['core', 'e2e'].sort())
  })

  it('should not include playwright-mcp in cypress-e2e preset', () => {
    assert.ok(
      !PRESET_FEATURES['cypress-e2e'].includes('playwright-mcp'),
      'cypress-e2e should not include playwright-mcp',
    )
  })
})

// ---------------------------------------------------------------------------
// resolveFeatures — cypress-e2e preset
// ---------------------------------------------------------------------------

describe('resolveFeatures — cypress-e2e preset', () => {
  it('should resolve cypress-e2e preset to core and e2e', () => {
    const result = resolveFeatures(['cypress-e2e'])
    assert.ok(result.has('core'), 'should include core')
    assert.ok(result.has('e2e'), 'should include e2e')
    assert.equal(result.size, 2)
  })

  it('should not include playwright-mcp when resolving cypress-e2e', () => {
    const result = resolveFeatures(['cypress-e2e'])
    assert.ok(!result.has('playwright-mcp'), 'should not include playwright-mcp')
  })
})
