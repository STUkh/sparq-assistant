import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { cleanTempDir, createMockProject, createTempDir, runCli } from '../helpers/setup.mjs'

describe('Config validation via doctor command', () => {
  let tempDir

  beforeEach(() => {
    tempDir = createTempDir()
  })

  afterEach(() => {
    cleanTempDir(tempDir)
  })

  /**
   * Helper: run init first to create a valid installation, then run doctor.
   */
  async function initAndDoctor() {
    createMockProject(tempDir, {
      dependencies: { vue: '^3.4.0' },
      devDependencies: { typescript: '^5.3.0' },
      withGit: true,
    })
    await runCli(['init', '--non-interactive', tempDir])
    return runCli(['doctor', tempDir])
  }

  /**
   * Helper: run init, then overwrite sparq.config.json with custom config, then run doctor.
   */
  async function initWithCustomConfig(config) {
    createMockProject(tempDir, {
      dependencies: { vue: '^3.4.0' },
      devDependencies: { typescript: '^5.3.0' },
      withGit: true,
    })
    await runCli(['init', '--non-interactive', tempDir])
    writeFileSync(join(tempDir, 'sparq.config.json'), `${JSON.stringify(config, null, 2)}\n`)
    return runCli(['doctor', tempDir])
  }

  it('should pass doctor checks on a valid complete installation', async () => {
    const { stdout, exitCode } = await initAndDoctor()
    // Doctor should report all checks passing
    assert.ok(stdout.includes('checks passed'), 'Should show checks passed summary')
    assert.equal(exitCode, 0, 'Should exit 0 for valid installation')
  })

  it('should warn when config is missing "version" field', async () => {
    const { stdout } = await initWithCustomConfig({
      project: { name: 'test', testDir: 'e2e' },
      sources: { jira: { enabled: true } },
    })
    assert.ok(
      stdout.includes('version') || stdout.includes('Missing'),
      'Should warn about missing version field',
    )
  })

  it('should warn when config is missing "project" section', async () => {
    const { stdout } = await initWithCustomConfig({
      version: '1.0.0',
      sources: { jira: { enabled: true } },
    })
    assert.ok(
      stdout.includes('project') || stdout.includes('Missing'),
      'Should warn about missing project section',
    )
  })

  it('should warn when config is missing "sources" section', async () => {
    const { stdout } = await initWithCustomConfig({
      version: '1.0.0',
      project: { name: 'test', testDir: 'e2e' },
    })
    assert.ok(
      stdout.includes('sources') || stdout.includes('Missing'),
      'Should warn about missing sources section',
    )
  })

  it('should warn when sources.jira.enabled is a string instead of boolean', async () => {
    const { stdout } = await initWithCustomConfig({
      version: '1.0.0',
      project: { name: 'test', testDir: 'e2e' },
      sources: { jira: { enabled: 'true' } },
    })
    assert.ok(
      stdout.includes('boolean') || stdout.includes('jira'),
      'Should warn about invalid boolean type',
    )
  })

  it('should warn when outputs.tms provider=testrail with null projectId', async () => {
    const { stdout } = await initWithCustomConfig({
      version: '1.0.0',
      project: { testDir: 'e2e' },
      sources: { jira: { enabled: true } },
      outputs: {
        tms: { provider: 'testrail', testrail: { projectId: null, suiteId: null } },
      },
    })
    assert.ok(
      stdout.includes('projectId') || stdout.includes('testrail') || stdout.includes('tms'),
      'Should warn about null projectId when TMS provider is testrail',
    )
  })

  it('should report validation warnings when config is an empty object', async () => {
    const { stdout } = await initWithCustomConfig({})
    // An empty config {} is missing version, project, and sources — doctor warns about these
    assert.ok(
      stdout.includes('Missing') ||
        stdout.includes('version') ||
        stdout.includes('project') ||
        stdout.includes('warning'),
      'Should report validation warnings for empty config',
    )
  })
})
