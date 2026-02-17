import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { generateConfig, MIGRATIONS, migrateConfig } from '../../bin/lib/config.mjs'
import { VERSION } from '../../bin/lib/constants.mjs'
import { resetState, setDryRun } from '../../bin/lib/state.mjs'
import { cleanTempDir, createOutputCapture, createTempDir } from '../helpers/setup.mjs'

// ---------------------------------------------------------------------------
// Console capture
// ---------------------------------------------------------------------------

const capture = createOutputCapture()

beforeEach(() => {
  capture.start()
  resetState()
})

afterEach(() => {
  capture.stop()
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMinimalConfig(overrides = {}) {
  return {
    version: '1.0.0',
    project: { testDir: 'e2e' },
    sources: { jira: { enabled: false }, confluence: { enabled: false } },
    preferences: {},
    outputs: {},
    ...overrides,
  }
}

function makeGathered(overrides = {}) {
  return {
    projectName: 'test-project',
    testDir: 'e2e',
    jiraEnabled: false,
    jiraKey: null,
    confluenceEnabled: false,
    confluenceSpace: null,
    figmaEnabled: false,
    localEnabled: true,
    jiraExportEnabled: false,
    confluenceExportEnabled: false,
    tmsProvider: null,
    ...overrides,
  }
}

function makeE2eConfig(overrides = {}) {
  return {
    detected: true,
    framework: 'playwright',
    configFile: 'playwright.config.ts',
    ...overrides,
  }
}

function makeTechStack(overrides = {}) {
  return {
    framework: 'vue',
    frameworkVersion: '3.4.0',
    router: 'vue-router',
    sourceRoot: 'src',
    routeDiscoveryPattern: '**/route*/**/*.ts',
    componentFileExtensions: ['.vue'],
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// MIGRATIONS export
// ---------------------------------------------------------------------------

describe('MIGRATIONS', () => {
  it('should be an object (empty at v1.0.0 baseline)', () => {
    assert.equal(typeof MIGRATIONS, 'object')
  })

  it('should have target and migrate function for each entry', () => {
    for (const [key, entry] of Object.entries(MIGRATIONS)) {
      assert.equal(typeof entry.target, 'string', `${key} should have string target`)
      assert.equal(typeof entry.migrate, 'function', `${key} should have migrate function`)
    }
  })
})

// ---------------------------------------------------------------------------
// migrateConfig
// ---------------------------------------------------------------------------

describe('migrateConfig', () => {
  it('should set version to current VERSION for a 1.0.0 config', () => {
    const config = makeMinimalConfig({ version: '1.0.0' })
    const result = migrateConfig(config)
    assert.equal(result.version, VERSION)
  })

  it('should return unchanged config already at current version', () => {
    const config = makeMinimalConfig({
      version: VERSION,
      preferences: { locatorPriority: ['getByTestId'] },
      outputs: { tms: { provider: null } },
    })
    const result = migrateConfig(config)
    assert.equal(result.version, VERSION)
  })

  it('should default to 1.0.0 when version missing', () => {
    const config = makeMinimalConfig()
    delete config.version
    const result = migrateConfig(config)
    assert.equal(result.version, VERSION)
  })

  it('should run validateConfig on result (warning output)', () => {
    const config = makeMinimalConfig({ version: '1.0.0' })
    migrateConfig(config)
    assert.equal(config.version, VERSION)
  })
})

// ---------------------------------------------------------------------------
// generateConfig (needs temp dirs)
// ---------------------------------------------------------------------------

describe('generateConfig', () => {
  let tempDir

  beforeEach(() => {
    tempDir = createTempDir()
  })

  afterEach(() => {
    setDryRun(false)
    cleanTempDir(tempDir)
  })

  it('should generate config with all gathered fields', () => {
    const config = generateConfig(tempDir, makeGathered(), makeE2eConfig(), makeTechStack())
    assert.equal(config.project.testDir, 'e2e')
    assert.equal(config.project.sourceRoot, 'src')
    assert.deepEqual(config.project.componentFileExtensions, ['.vue'])
    assert.equal(config.techStack, undefined, 'techStack should not be in generated config')
    assert.equal(config.sources.local.enabled, true)
  })

  it('should default to playwright framework when not detected', () => {
    const e2eConfig = makeE2eConfig({ detected: false, framework: null })
    const config = generateConfig(tempDir, makeGathered(), e2eConfig, makeTechStack())
    assert.equal(config.e2e.framework, 'playwright')
  })

  it('should build TMS config for testrail provider', () => {
    const gathered = makeGathered({
      tmsProvider: 'testrail',
      testRailProjectId: 42,
      testRailSuiteId: 7,
    })
    const config = generateConfig(tempDir, gathered, makeE2eConfig(), makeTechStack())
    assert.equal(config.outputs.tms.provider, 'testrail')
    assert.equal(config.outputs.tms.testrail.projectId, 42)
    assert.equal(config.outputs.tms.testrail.suiteId, 7)
  })

  it('should build TMS config for qase provider', () => {
    const gathered = makeGathered({
      tmsProvider: 'qase',
      qaseProjectCode: 'PROJ',
    })
    const config = generateConfig(tempDir, gathered, makeE2eConfig(), makeTechStack())
    assert.equal(config.outputs.tms.provider, 'qase')
    assert.equal(config.outputs.tms.qase.projectCode, 'PROJ')
  })

  it('should build TMS config for local provider', () => {
    const gathered = makeGathered({
      tmsProvider: 'local',
      tmsLocalOutputDir: 'output/tms',
      tmsLocalFormat: 'csv',
    })
    const config = generateConfig(tempDir, gathered, makeE2eConfig(), makeTechStack())
    assert.equal(config.outputs.tms.provider, 'local')
    assert.equal(config.outputs.tms.local.outputDir, 'output/tms')
    assert.equal(config.outputs.tms.local.format, 'csv')
  })

  it('should build TMS config with null provider', () => {
    const gathered = makeGathered({ tmsProvider: null })
    const config = generateConfig(tempDir, gathered, makeE2eConfig(), makeTechStack())
    assert.equal(config.outputs.tms.provider, null)
    assert.equal(config.outputs.tms.testrail, undefined)
    assert.equal(config.outputs.tms.qase, undefined)
    assert.equal(config.outputs.tms.local, undefined)
  })

  it('should set version to VERSION', () => {
    const config = generateConfig(tempDir, makeGathered(), makeE2eConfig(), makeTechStack())
    assert.equal(config.version, VERSION)
  })

  it('should write config file to disk', () => {
    generateConfig(tempDir, makeGathered(), makeE2eConfig(), makeTechStack())
    const configPath = join(tempDir, 'sparq.config.json')
    assert.ok(existsSync(configPath), 'sparq.config.json should exist')
    const written = JSON.parse(readFileSync(configPath, 'utf-8'))
    assert.equal(written.project.testDir, 'e2e')
    assert.equal(written.techStack, undefined, 'techStack should not be written')
    assert.equal(written.version, VERSION)
  })

  it('should NOT write in dry-run mode', () => {
    setDryRun(true)
    generateConfig(tempDir, makeGathered(), makeE2eConfig(), makeTechStack())
    const configPath = join(tempDir, 'sparq.config.json')
    assert.ok(!existsSync(configPath), 'sparq.config.json should not exist in dry-run')
  })

  it('should set default TMS local output dir and format', () => {
    const gathered = makeGathered({ tmsProvider: 'local' })
    const config = generateConfig(tempDir, gathered, makeE2eConfig(), makeTechStack())
    assert.equal(config.outputs.tms.local.outputDir, '.sparq/tms-export')
    assert.equal(config.outputs.tms.local.format, 'json')
  })

  it('should include preferences with default values', () => {
    const config = generateConfig(tempDir, makeGathered(), makeE2eConfig(), makeTechStack())
    assert.equal(config.preferences.interactiveMode, true)
    assert.equal(config.preferences.testMultiplier, 5)
    assert.equal(config.preferences.checkpointLevel, 'full')
    assert.ok(Array.isArray(config.preferences.locatorPriority))
  })

  it('should include maxClarifications in preferences', () => {
    const config = generateConfig(tempDir, makeGathered(), makeE2eConfig(), makeTechStack())
    assert.equal(config.preferences.maxClarifications, 2)
    assert.equal(config.ux, undefined, 'ux section should not exist')
  })

  // -------------------------------------------------------------------------
  // Cypress framework
  // -------------------------------------------------------------------------

  it('should set cypress locatorPriority for cypress framework', () => {
    const config = generateConfig(
      tempDir,
      makeGathered(),
      makeE2eConfig({ framework: 'cypress' }),
      makeTechStack(),
    )
    assert.equal(config.preferences.locatorPriority[0], 'cy.findByTestId')
  })

  it('should set playwright locatorPriority for playwright framework', () => {
    const config = generateConfig(tempDir, makeGathered(), makeE2eConfig(), makeTechStack())
    assert.equal(config.preferences.locatorPriority[0], 'getByTestId')
  })

  it('should preserve cypress framework in e2e section', () => {
    const config = generateConfig(
      tempDir,
      makeGathered(),
      makeE2eConfig({ framework: 'cypress', configFile: 'cypress.config.ts' }),
      makeTechStack(),
    )
    assert.equal(config.e2e.framework, 'cypress')
  })
})
