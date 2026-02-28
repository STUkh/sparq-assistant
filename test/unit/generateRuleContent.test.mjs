import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { generateRuleContent, SPARQ_RULE_CONTENT } from '../../bin/lib/constants.mjs'

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
