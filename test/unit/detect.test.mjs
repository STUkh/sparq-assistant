import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { after, afterEach, before, beforeEach, describe, it } from 'node:test'
import {
  compareTechStacks,
  detectE2ESetup,
  displayTechStack,
  formatTechName,
} from '../../bin/lib/detect.mjs'
import { cleanTempDir, createOutputCapture, createTempDir } from '../helpers/setup.mjs'

// ---------------------------------------------------------------------------
// formatTechName
// ---------------------------------------------------------------------------

describe('formatTechName', () => {
  it('should format vue-router as Vue Router', () => {
    assert.equal(formatTechName('vue-router'), 'Vue Router')
  })

  it('should format react-router as React Router', () => {
    assert.equal(formatTechName('react-router'), 'React Router')
  })

  it('should capitalize first letter for unknown names', () => {
    assert.equal(formatTechName('somelib'), 'Somelib')
  })

  it('should capitalize a single character', () => {
    assert.equal(formatTechName('x'), 'X')
  })
})

// ---------------------------------------------------------------------------
// compareTechStacks
// ---------------------------------------------------------------------------

describe('compareTechStacks', () => {
  const baseStack = {
    framework: 'vue',
    router: 'vue-router',
    componentFileExtensions: ['.vue'],
    sourceRoot: 'src',
    routeDiscoveryPattern: '**/router/**/*.ts',
  }

  it('should return empty array for identical stacks', () => {
    const diffs = compareTechStacks(baseStack, { ...baseStack })
    assert.deepEqual(diffs, [])
  })

  it('should detect framework change', () => {
    const diffs = compareTechStacks(baseStack, { ...baseStack, framework: 'react' })
    assert.ok(diffs.some((d) => d.includes('Framework')))
  })

  it('should detect router change', () => {
    const diffs = compareTechStacks(baseStack, { ...baseStack, router: 'react-router' })
    assert.ok(diffs.some((d) => d.includes('Router')))
  })

  it('should return multiple diffs when multiple fields change', () => {
    const diffs = compareTechStacks(baseStack, {
      ...baseStack,
      framework: 'react',
      router: 'react-router',
      componentFileExtensions: ['.tsx', '.jsx'],
    })
    assert.ok(diffs.length >= 3, `Expected at least 3 diffs, got ${diffs.length}`)
  })

  it('should detect value to null change', () => {
    const diffs = compareTechStacks(baseStack, { ...baseStack, framework: null })
    assert.ok(diffs.some((d) => d.includes('Framework')))
  })
})

// ---------------------------------------------------------------------------
// detectE2ESetup
// ---------------------------------------------------------------------------

describe('detectE2ESetup', () => {
  let tempDir

  before(() => {
    tempDir = createTempDir()
  })

  after(() => {
    cleanTempDir(tempDir)
  })

  it('should return detected=false when no config or dirs', () => {
    const subDir = join(tempDir, 'empty-project')
    mkdirSync(subDir, { recursive: true })
    const result = detectE2ESetup(subDir)
    assert.equal(result.detected, false)
  })

  it('should detect playwright from playwright.config.ts', () => {
    const subDir = join(tempDir, 'pw-ts-project')
    mkdirSync(subDir, { recursive: true })
    writeFileSync(join(subDir, 'playwright.config.ts'), 'export default {}')
    const result = detectE2ESetup(subDir)
    assert.equal(result.detected, true)
    assert.equal(result.framework, 'playwright')
    assert.equal(result.configFile, 'playwright.config.ts')
  })

  it('should detect cypress from cypress.config.ts', () => {
    const subDir = join(tempDir, 'cy-project')
    mkdirSync(subDir, { recursive: true })
    writeFileSync(join(subDir, 'cypress.config.ts'), 'export default {}')
    const result = detectE2ESetup(subDir)
    assert.equal(result.detected, true)
    assert.equal(result.framework, 'cypress')
    assert.equal(result.configFile, 'cypress.config.ts')
  })

  it('should scan e2e dir for pages/specs/fixtures subdirs', () => {
    const subDir = join(tempDir, 'e2e-structure-project')
    mkdirSync(subDir, { recursive: true })
    mkdirSync(join(subDir, 'e2e', 'pages'), { recursive: true })
    mkdirSync(join(subDir, 'e2e', 'specs'), { recursive: true })
    mkdirSync(join(subDir, 'e2e', 'fixtures'), { recursive: true })
    const result = detectE2ESetup(subDir)
    assert.equal(result.detected, true)
    assert.equal(result.structure.pages, 'e2e/pages')
    assert.equal(result.structure.specs, 'e2e/specs')
    assert.equal(result.structure.fixtures, 'e2e/fixtures')
  })

  it('should detect base page class', () => {
    const subDir = join(tempDir, 'base-page-project')
    mkdirSync(join(subDir, 'e2e', 'pages'), { recursive: true })
    writeFileSync(join(subDir, 'e2e', 'pages', 'abstract-page.ts'), 'export class AbstractPage {}')
    const result = detectE2ESetup(subDir)
    assert.equal(result.hasAbstractPage, true)
    assert.ok(result.baseClass.includes('abstract-page.ts'))
  })

  it('should detect fixture index.ts', () => {
    const subDir = join(tempDir, 'fixture-index-project')
    mkdirSync(join(subDir, 'e2e', 'fixtures'), { recursive: true })
    writeFileSync(join(subDir, 'e2e', 'fixtures', 'index.ts'), 'export const test = {}')
    const result = detectE2ESetup(subDir)
    assert.equal(result.hasFixtureIndex, true)
    assert.ok(result.fixtureIndex.includes('index.ts'))
  })

  it('should return empty arrays when no files in subdirs', () => {
    const subDir = join(tempDir, 'empty-e2e-project')
    mkdirSync(join(subDir, 'e2e', 'pages'), { recursive: true })
    mkdirSync(join(subDir, 'e2e', 'specs'), { recursive: true })
    const result = detectE2ESetup(subDir)
    assert.equal(result.detected, true)
  })
})

// ---------------------------------------------------------------------------
// displayTechStack
// ---------------------------------------------------------------------------

describe('displayTechStack', () => {
  const capture = createOutputCapture()

  beforeEach(() => {
    capture.start()
  })

  afterEach(() => {
    capture.stop()
  })

  it('should print framework when present', () => {
    displayTechStack({ framework: 'vue', frameworkVersion: '3.4.0' })
    assert.ok(capture.lines().some((line) => line.includes('Vue')))
  })

  it('should skip null values (no output for all-null stack)', () => {
    displayTechStack({
      framework: null,
      router: null,
      componentFileExtensions: null,
      sourceRoot: null,
    })
    assert.equal(capture.lines().length, 0, 'No lines should appear for all-null stack')
  })

  it('should print version alongside framework name', () => {
    displayTechStack({ framework: 'vue', frameworkVersion: '3.4.0' })
    assert.ok(capture.lines().some((line) => line.includes('3.4.0')))
  })

  it('should print router when present', () => {
    displayTechStack({ router: 'vue-router' })
    assert.ok(capture.lines().some((line) => line.includes('Vue Router')))
  })
})

// ---------------------------------------------------------------------------
// detectE2ESetup — Cypress support
// ---------------------------------------------------------------------------

describe('detectE2ESetup — Cypress support', () => {
  let tempDir

  before(() => {
    tempDir = createTempDir()
  })

  after(() => {
    cleanTempDir(tempDir)
  })

  it('should detect cypress from cypress.config.mjs', () => {
    const subDir = join(tempDir, 'cy-mjs')
    mkdirSync(subDir, { recursive: true })
    writeFileSync(join(subDir, 'cypress.config.mjs'), 'export default {}')
    const result = detectE2ESetup(subDir)
    assert.equal(result.framework, 'cypress')
    assert.equal(result.configFile, 'cypress.config.mjs')
  })

  it('should prefer playwright when both configs exist', () => {
    const subDir = join(tempDir, 'cy-pw-both')
    mkdirSync(subDir, { recursive: true })
    writeFileSync(join(subDir, 'playwright.config.ts'), 'export default {}')
    writeFileSync(join(subDir, 'cypress.config.ts'), 'export default {}')
    const result = detectE2ESetup(subDir)
    assert.equal(result.framework, 'playwright')
  })

  it('should scan cypress/e2e directory for specs', () => {
    const subDir = join(tempDir, 'cy-e2e-specs')
    mkdirSync(subDir, { recursive: true })
    writeFileSync(join(subDir, 'cypress.config.ts'), 'export default {}')
    mkdirSync(join(subDir, 'cypress', 'e2e'), { recursive: true })
    const result = detectE2ESetup(subDir)
    assert.equal(result.structure.specs, 'cypress/e2e')
  })

  it('should scan cypress/support/pages directory', () => {
    const subDir = join(tempDir, 'cy-pages')
    mkdirSync(subDir, { recursive: true })
    writeFileSync(join(subDir, 'cypress.config.ts'), 'export default {}')
    mkdirSync(join(subDir, 'cypress', 'support', 'pages'), { recursive: true })
    const result = detectE2ESetup(subDir)
    assert.equal(result.structure.pages, 'cypress/support/pages')
  })

  it('should scan cypress/support/components directory', () => {
    const subDir = join(tempDir, 'cy-components')
    mkdirSync(subDir, { recursive: true })
    writeFileSync(join(subDir, 'cypress.config.ts'), 'export default {}')
    mkdirSync(join(subDir, 'cypress', 'support', 'components'), { recursive: true })
    const result = detectE2ESetup(subDir)
    assert.equal(result.structure.components, 'cypress/support/components')
  })

  it('should scan cypress/support/steps directory', () => {
    const subDir = join(tempDir, 'cy-steps')
    mkdirSync(subDir, { recursive: true })
    writeFileSync(join(subDir, 'cypress.config.ts'), 'export default {}')
    mkdirSync(join(subDir, 'cypress', 'support', 'steps'), { recursive: true })
    const result = detectE2ESetup(subDir)
    assert.equal(result.structure.steps, 'cypress/support/steps')
  })
})
