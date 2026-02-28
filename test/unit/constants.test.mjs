import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import {
  AGENT_NAMES,
  AUDIT_SENTINEL_END,
  AUDIT_SENTINEL_START,
  COMMANDS,
  EXIT_SUCCESS,
  generateRuleContent,
  MATURITY_LEVELS,
  MAX_MIGRATION_ITERATIONS,
  MAX_RECURSION_DEPTH,
  PKG_AGENTS_DIR,
  PKG_MCP_DIR,
  PKG_ROOT,
  PKG_SKILLS_DIR,
  PKG_TEMPLATES_DIR,
  SPARQ_CLAUDE_BLOCK_END,
  SPARQ_CLAUDE_BLOCK_START,
  SPARQ_HEADING,
  SPARQ_OUTPUT_DIRS,
  SPARQ_RULE_CONTENT,
  SPARQ_RULE_FILE,
  VERSION,
} from '../../bin/lib/constants.mjs'

// ---------------------------------------------------------------------------
// Exit Codes
// ---------------------------------------------------------------------------

describe('exit codes', () => {
  it('EXIT_SUCCESS should be 0', () => {
    assert.equal(EXIT_SUCCESS, 0)
  })
})

// ---------------------------------------------------------------------------
// VERSION
// ---------------------------------------------------------------------------

describe('VERSION', () => {
  it('should match package.json version', () => {
    const pkg = JSON.parse(readFileSync(join(PKG_ROOT, 'package.json'), 'utf-8'))
    assert.equal(VERSION, pkg.version)
  })

  it('should be a valid semver string', () => {
    assert.match(VERSION, /^\d+\.\d+\.\d+$/, 'VERSION should match semver pattern')
  })
})

// ---------------------------------------------------------------------------
// PKG paths
// ---------------------------------------------------------------------------

describe('PKG paths', () => {
  it('PKG_ROOT should be an existing directory', () => {
    assert.ok(existsSync(PKG_ROOT), 'PKG_ROOT should exist')
  })

  it('PKG_AGENTS_DIR should be an existing directory', () => {
    assert.ok(existsSync(PKG_AGENTS_DIR), 'PKG_AGENTS_DIR should exist')
  })

  it('PKG_SKILLS_DIR should be an existing directory', () => {
    assert.ok(existsSync(PKG_SKILLS_DIR), 'PKG_SKILLS_DIR should exist')
  })

  it('PKG_TEMPLATES_DIR should be an existing directory', () => {
    assert.ok(existsSync(PKG_TEMPLATES_DIR), 'PKG_TEMPLATES_DIR should exist')
  })

  it('PKG_MCP_DIR should be an existing directory', () => {
    assert.ok(existsSync(PKG_MCP_DIR), 'PKG_MCP_DIR should exist')
  })
})

// ---------------------------------------------------------------------------
// AGENT_NAMES
// ---------------------------------------------------------------------------

describe('AGENT_NAMES', () => {
  it('should be frozen', () => {
    assert.ok(Object.isFrozen(AGENT_NAMES), 'AGENT_NAMES should be frozen')
  })

  it('should contain exactly 5 agents', () => {
    assert.equal(AGENT_NAMES.length, 5)
  })

  it('should include sparq-orchestrator.md', () => {
    assert.ok(AGENT_NAMES.includes('sparq-orchestrator.md'))
  })

  it('should include sparq-requirements-analyst.md', () => {
    assert.ok(AGENT_NAMES.includes('sparq-requirements-analyst.md'))
  })

  it('every entry should end with .md', () => {
    for (const name of AGENT_NAMES) {
      assert.ok(name.endsWith('.md'), `${name} should end with .md`)
    }
  })

  it('every agent file should exist on disk', () => {
    for (const name of AGENT_NAMES) {
      const agentPath = join(PKG_AGENTS_DIR, name)
      assert.ok(existsSync(agentPath), `Agent file should exist: ${agentPath}`)
    }
  })
})

// ---------------------------------------------------------------------------
// SPARQ_OUTPUT_DIRS
// ---------------------------------------------------------------------------

describe('SPARQ_OUTPUT_DIRS', () => {
  it('should contain .sparq/requirements', () => {
    assert.ok(SPARQ_OUTPUT_DIRS.includes('.sparq/requirements'))
  })
})

// ---------------------------------------------------------------------------
// COMMANDS
// ---------------------------------------------------------------------------

describe('COMMANDS', () => {
  it('should have init command', () => {
    assert.ok('init' in COMMANDS, 'should have init')
  })

  it('should have update command', () => {
    assert.ok('update' in COMMANDS, 'should have update')
  })

  it('should have uninstall command', () => {
    assert.ok('uninstall' in COMMANDS, 'should have uninstall')
  })

  it('should have clean command', () => {
    assert.ok('clean' in COMMANDS, 'should have clean')
  })

  it('should have doctor command', () => {
    assert.ok('doctor' in COMMANDS, 'should have doctor')
  })

  it('should have lint command', () => {
    assert.ok('lint' in COMMANDS, 'should have lint')
  })

  it('should have help command', () => {
    assert.ok('help' in COMMANDS, 'should have help')
  })

  it('should have audit command', () => {
    assert.ok('audit' in COMMANDS, 'should have audit')
  })
})

// ---------------------------------------------------------------------------
// Audit constants
// ---------------------------------------------------------------------------

describe('audit constants', () => {
  it('AUDIT_SENTINEL_START should be an HTML comment', () => {
    assert.match(AUDIT_SENTINEL_START, /^<!--.*-->$/)
  })

  it('AUDIT_SENTINEL_END should be an HTML comment', () => {
    assert.match(AUDIT_SENTINEL_END, /^<!--.*-->$/)
  })

  it('MATURITY_LEVELS should contain expected level names', () => {
    assert.deepEqual(
      [...MATURITY_LEVELS],
      ['Bare', 'Scaffolded', 'Partial', 'Established', 'Production-Ready'],
    )
  })

  it('SPARQ_OUTPUT_DIRS should include .sparq/prompts', () => {
    assert.ok(SPARQ_OUTPUT_DIRS.includes('.sparq/prompts'))
  })
})

// ---------------------------------------------------------------------------
// Legacy CLAUDE.md markers (kept for backward-compat uninstall)
// ---------------------------------------------------------------------------

describe('legacy CLAUDE.md markers', () => {
  it('SPARQ_CLAUDE_BLOCK_START should be an HTML comment', () => {
    assert.match(SPARQ_CLAUDE_BLOCK_START, /^<!--.*-->$/)
  })

  it('SPARQ_CLAUDE_BLOCK_END should be an HTML comment', () => {
    assert.match(SPARQ_CLAUDE_BLOCK_END, /^<!--.*-->$/)
  })

  it('SPARQ_HEADING should start with ##', () => {
    assert.ok(SPARQ_HEADING.startsWith('##'), 'heading should start with ##')
  })
})

// ---------------------------------------------------------------------------
// SPARQ_RULE_FILE / SPARQ_RULE_CONTENT
// ---------------------------------------------------------------------------

describe('rule file constants', () => {
  it('SPARQ_RULE_FILE should be sparq.md', () => {
    assert.equal(SPARQ_RULE_FILE, 'sparq.md')
  })

  it('SPARQ_RULE_CONTENT should be a non-empty string', () => {
    assert.equal(typeof SPARQ_RULE_CONTENT, 'string')
    assert.ok(SPARQ_RULE_CONTENT.length > 0, 'content should not be empty')
  })

  it('SPARQ_RULE_CONTENT should contain SparQ heading', () => {
    assert.ok(SPARQ_RULE_CONTENT.includes('SparQ'), 'content should mention SparQ')
  })

  it('SPARQ_RULE_CONTENT should reference config file', () => {
    assert.ok(
      SPARQ_RULE_CONTENT.includes('sparq.config.json'),
      'content should reference config file',
    )
  })
})

// ---------------------------------------------------------------------------
// generateRuleContent
// ---------------------------------------------------------------------------

describe('generateRuleContent', () => {
  it('should return SPARQ_RULE_CONTENT when no detection results', () => {
    assert.equal(generateRuleContent(), SPARQ_RULE_CONTENT)
    assert.equal(generateRuleContent(null, null), SPARQ_RULE_CONTENT)
  })

  it('should include framework info when techStack provided', () => {
    const content = generateRuleContent({ framework: 'vue', frameworkVersion: '3.4.0' })
    assert.ok(content.includes('vue'), 'should include framework name')
    assert.ok(content.includes('3.4.0'), 'should include version')
    assert.ok(content.includes('Project Stack'), 'should include stack heading')
  })

  it('should include E2E info when e2eConfig provided', () => {
    const content = generateRuleContent(null, {
      framework: 'playwright',
      configFile: 'playwright.config.ts',
    })
    assert.ok(content.includes('playwright'), 'should include e2e framework')
    assert.ok(content.includes('playwright.config.ts'), 'should include config file')
  })

  it('should include selector strategy section', () => {
    const content = generateRuleContent({ framework: 'vue' }, { framework: 'playwright' })
    assert.ok(content.includes('Selector Strategy'), 'should include selector strategy')
    assert.ok(content.includes('data-testid'), 'should include data-testid')
  })

  it('should include structure directories when present', () => {
    const content = generateRuleContent(null, {
      framework: 'playwright',
      structure: { pages: 'e2e/pages', specs: 'e2e/specs', fixtures: null },
    })
    assert.ok(content.includes('pages'), 'should include pages')
    assert.ok(content.includes('specs'), 'should include specs')
  })

  it('should include base class when present', () => {
    const content = generateRuleContent(null, {
      framework: 'playwright',
      baseClass: 'e2e/pages/abstract.page.ts',
    })
    assert.ok(content.includes('abstract.page.ts'), 'should include base class')
  })
})

// ---------------------------------------------------------------------------
// Limits
// ---------------------------------------------------------------------------

describe('limits', () => {
  it('MAX_RECURSION_DEPTH should be 20', () => {
    assert.equal(MAX_RECURSION_DEPTH, 20)
  })

  it('MAX_MIGRATION_ITERATIONS should be 100', () => {
    assert.equal(MAX_MIGRATION_ITERATIONS, 100)
  })
})
