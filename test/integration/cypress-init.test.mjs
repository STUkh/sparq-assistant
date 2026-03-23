import assert from 'node:assert/strict'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { after, before, describe, it } from 'node:test'
import {
  cleanTempDir,
  createMockProject,
  createTempDir,
  readJsonFile,
  runCli,
} from '../helpers/setup.mjs'

describe('Cypress init lifecycle', { concurrency: false }, () => {
  let tempDir

  before(() => {
    tempDir = createTempDir()
    createMockProject(tempDir, {
      name: 'cypress-lifecycle-test',
      dependencies: {
        vue: '^3.4.0',
        'vue-router': '^4.3.0',
      },
      devDependencies: {
        cypress: '^13.6.0',
        typescript: '^5.3.0',
      },
      withGit: true,
    })

    // Create cypress.config.ts so detectFrameworkConfig finds Cypress
    writeFileSync(join(tempDir, 'cypress.config.ts'), 'export default defineConfig({})\n')

    // Create Cypress directory structure for scanCypressStructure
    mkdirSync(join(tempDir, 'cypress', 'e2e'), { recursive: true })
    mkdirSync(join(tempDir, 'cypress', 'support', 'pages'), { recursive: true })
    mkdirSync(join(tempDir, 'cypress', 'fixtures'), { recursive: true })

    // Create support/commands.ts for hasSupportFile detection
    writeFileSync(join(tempDir, 'cypress', 'support', 'commands.ts'), '// Cypress commands\n')
  })

  after(() => {
    cleanTempDir(tempDir)
  })

  it('Step 1: init detects Cypress as the E2E framework', async () => {
    const { exitCode } = await runCli(['init', '--non-interactive', tempDir])

    assert.equal(exitCode, 0, 'Init should exit 0')
    assert.ok(existsSync(join(tempDir, 'sparq.config.json')), 'sparq.config.json should exist')

    const config = readJsonFile(tempDir, 'sparq.config.json')
    assert.ok(config, 'Config should be parseable')
    assert.equal(config.e2e.framework, 'cypress', 'e2e.framework should be cypress')
  })

  it('Step 3: config reflects detected Cypress directory structure', () => {
    const config = readJsonFile(tempDir, 'sparq.config.json')

    assert.ok(config.e2e.structure, 'e2e.structure should exist')

    // scanCypressStructure maps cypress/e2e -> specs, cypress/support/pages -> pages
    assert.equal(config.e2e.structure.specs, 'cypress/e2e', 'structure.specs should be cypress/e2e')
    assert.equal(
      config.e2e.structure.pages,
      'cypress/support/pages',
      'structure.pages should be cypress/support/pages',
    )
  })

  it('Step 4: doctor runs and validates Cypress installation', async () => {
    const { stdout, exitCode } = await runCli(['doctor', tempDir])

    // Doctor is framework-aware: skips Playwright CLI check for Cypress projects
    assert.equal(exitCode, 0, 'Doctor should exit 0 for valid Cypress installation')
    assert.ok(stdout.includes('checks passed'), 'Should show checks passed summary')
    assert.ok(stdout.length > 0, 'Doctor should produce output')
  })

  it('Step 7: cypress-best-practices skill installed, not playwright-best-practices', () => {
    assert.ok(
      existsSync(join(tempDir, '.claude', 'skills', 'sparq-cypress-best-practices')),
      'sparq-cypress-best-practices skill should be installed for Cypress projects',
    )
    assert.ok(
      !existsSync(join(tempDir, '.claude', 'skills', 'sparq-playwright-best-practices')),
      'sparq-playwright-best-practices should NOT be installed for Cypress projects',
    )
  })

  it('Step 8: config has project section with detected extensions (no techStack)', () => {
    const config = readJsonFile(tempDir, 'sparq.config.json')

    assert.equal(config.techStack, undefined, 'techStack should not exist in config')
    assert.ok(
      config.project.componentFileExtensions,
      'componentFileExtensions should be on project',
    )
    assert.ok(config.project.sourceRoot, 'sourceRoot should be on project')
  })
})
