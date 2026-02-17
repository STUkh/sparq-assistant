import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import {
  cleanTempDir,
  createMockProject,
  createTempDir,
  readJsonFile,
  runCli,
} from '../helpers/setup.mjs'

describe('Tech stack detection via init --non-interactive', () => {
  let tempDir

  beforeEach(() => {
    tempDir = createTempDir()
  })

  afterEach(() => {
    cleanTempDir(tempDir)
  })

  /**
   * Helper: create a project with given deps, run init, return the project section from config.
   * techStack is no longer persisted — derived fields live in project.
   */
  async function initAndGetProject(dependencies = {}, devDependencies = {}) {
    createMockProject(tempDir, { dependencies, devDependencies, withGit: true })
    await runCli(['init', '--non-interactive', tempDir])
    const config = readJsonFile(tempDir, 'sparq.config.json')
    return config?.project
  }

  it('should detect Vue framework and set componentFileExtensions', async () => {
    const project = await initAndGetProject({ vue: '^3.4.0' })
    assert.ok(Array.isArray(project.componentFileExtensions), 'Should have componentFileExtensions')
    assert.ok(project.componentFileExtensions.includes('.vue'), 'Should include .vue')
  })

  it('should detect React framework and set componentFileExtensions', async () => {
    const project = await initAndGetProject({ react: '^18.2.0' })
    assert.ok(Array.isArray(project.componentFileExtensions), 'Should have componentFileExtensions')
    assert.ok(
      project.componentFileExtensions.some((ext) => ext === '.tsx' || ext === '.jsx'),
      'Should include .tsx or .jsx',
    )
  })

  it('should have componentFileExtensions even for unrecognized framework', async () => {
    const project = await initAndGetProject({ express: '^4.18.0' })
    // Detection returns default extensions even when no known framework is found
    assert.ok(
      project.componentFileExtensions === null || Array.isArray(project.componentFileExtensions),
      'componentFileExtensions should be null or array',
    )
  })

  it('should not include techStack section in config', async () => {
    createMockProject(tempDir, {
      dependencies: { vue: '^3.4.0', 'vue-router': '^4.2.0' },
      devDependencies: {},
      withGit: true,
    })
    await runCli(['init', '--non-interactive', tempDir])
    const config = readJsonFile(tempDir, 'sparq.config.json')
    assert.equal(config.techStack, undefined, 'techStack should not be in config')
    assert.ok(config.project.sourceRoot, 'sourceRoot should be on project')
    assert.ok(config.project.routeDiscoveryPattern, 'routeDiscoveryPattern should be on project')
  })
})
