import assert from 'node:assert/strict'
import { unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'
import {
  cleanTempDir,
  createMockProject,
  createTempDir,
  readTextFile,
  runCli,
} from '../helpers/setup.mjs'

describe('.gitignore management', () => {
  let tempDir

  beforeEach(() => {
    tempDir = createTempDir()
    createMockProject(tempDir, {
      dependencies: { vue: '^3.4.0' },
      withGit: true,
    })
  })

  afterEach(() => {
    cleanTempDir(tempDir)
  })

  it('should create .gitignore with .sparq/ when no existing .gitignore', async () => {
    // Remove the .gitignore created by createMockProject
    unlinkSync(join(tempDir, '.gitignore'))

    await runCli(['init', '--non-interactive', tempDir])

    const content = readTextFile(tempDir, '.gitignore')
    assert.ok(content !== null, '.gitignore should be created')
    assert.ok(content.includes('.sparq/'), '.gitignore should contain .sparq/ entry')
  })

  it('should append .sparq/ to existing .gitignore', async () => {
    // createMockProject already creates .gitignore with node_modules/
    await runCli(['init', '--non-interactive', tempDir])

    const content = readTextFile(tempDir, '.gitignore')
    assert.ok(content.includes('node_modules/'), 'Original .gitignore entries should be preserved')
    assert.ok(content.includes('.sparq/'), '.sparq/ should be appended to existing .gitignore')
  })

  it('should not add duplicate .sparq/ when running init twice', async () => {
    await runCli(['init', '--non-interactive', tempDir])
    await runCli(['init', '--non-interactive', tempDir])

    const content = readTextFile(tempDir, '.gitignore')
    const sparqLines = content.split('\n').filter((line) => line.trim() === '.sparq/')
    assert.equal(sparqLines.length, 1, 'Should have exactly one .sparq/ entry (no duplicates)')
  })

  it('should not duplicate .sparq/ if already present in .gitignore', async () => {
    // Pre-seed .gitignore with .sparq/ already present
    writeFileSync(join(tempDir, '.gitignore'), 'node_modules/\n.sparq/\n')

    await runCli(['init', '--non-interactive', tempDir])

    const content = readTextFile(tempDir, '.gitignore')
    const sparqLines = content.split('\n').filter((line) => line.trim() === '.sparq/')
    assert.equal(sparqLines.length, 1, 'Should not duplicate .sparq/ if already present')
  })

  it('should add SparQ comment header when appending', async () => {
    await runCli(['init', '--non-interactive', tempDir])

    const content = readTextFile(tempDir, '.gitignore')
    assert.ok(content.includes('# SparQ QA Assistant'), 'Should include a SparQ comment header')
  })

  it('should remove .sparq/ from .gitignore after uninstall', async () => {
    await runCli(['init', '--non-interactive', tempDir])

    // Verify .sparq/ was added
    let content = readTextFile(tempDir, '.gitignore')
    assert.ok(content.includes('.sparq/'), '.sparq/ should be present before uninstall')

    // Uninstall
    await runCli(['uninstall', '--force', '--non-interactive', tempDir])

    content = readTextFile(tempDir, '.gitignore')
    if (content !== null) {
      const sparqLines = content.split('\n').filter((line) => line.trim() === '.sparq/')
      assert.equal(
        sparqLines.length,
        0,
        '.sparq/ should be removed from .gitignore after uninstall',
      )
    }
  })

  it('should remove SparQ comment from .gitignore after uninstall', async () => {
    await runCli(['init', '--non-interactive', tempDir])
    await runCli(['uninstall', '--force', '--non-interactive', tempDir])

    const content = readTextFile(tempDir, '.gitignore')
    if (content !== null) {
      assert.ok(
        !content.includes('# SparQ QA Assistant output'),
        'SparQ comment should be removed from .gitignore after uninstall',
      )
    }
  })

  it('should preserve non-SparQ entries in .gitignore after uninstall', async () => {
    await runCli(['init', '--non-interactive', tempDir])
    await runCli(['uninstall', '--force', '--non-interactive', tempDir])

    const content = readTextFile(tempDir, '.gitignore')
    assert.ok(content !== null, '.gitignore should still exist')
    assert.ok(
      content.includes('node_modules/'),
      'Original node_modules/ entry should be preserved after uninstall',
    )
  })
})
