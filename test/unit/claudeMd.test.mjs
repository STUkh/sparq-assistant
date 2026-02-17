import assert from 'node:assert/strict'
import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'
import {
  cleanTempDir,
  createMockProject,
  createTempDir,
  readTextFile,
  runCli,
} from '../helpers/setup.mjs'

describe('Rule file management (.claude/rules/sparq.md)', () => {
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

  it('should create .claude/rules/sparq.md after init', async () => {
    await runCli(['init', '--non-interactive', tempDir])

    const rulePath = join(tempDir, '.claude', 'rules', 'sparq.md')
    assert.ok(existsSync(rulePath), '.claude/rules/sparq.md should be created')
    const content = readTextFile(tempDir, join('.claude', 'rules', 'sparq.md'))
    assert.ok(content.includes('SparQ'), 'Rule file should contain SparQ reference')
  })

  it('should regenerate .claude/rules/sparq.md on re-init with latest detection', async () => {
    await runCli(['init', '--non-interactive', tempDir])

    // Modify the rule file
    const rulePath = join(tempDir, '.claude', 'rules', 'sparq.md')
    writeFileSync(rulePath, '# Custom rule content\n')

    await runCli(['init', '--non-interactive', tempDir])

    const content = readTextFile(tempDir, join('.claude', 'rules', 'sparq.md'))
    assert.ok(content.includes('SparQ'), 'Should regenerate with latest detection results')
    assert.notEqual(content, '# Custom rule content\n', 'Should overwrite custom content')
  })

  it('should reference config and output paths in rule file', async () => {
    await runCli(['init', '--non-interactive', tempDir])

    const content = readTextFile(tempDir, join('.claude', 'rules', 'sparq.md'))
    assert.ok(content.includes('sparq.config.json'), 'Rule file should reference config file')
    assert.ok(content.includes('.sparq/'), 'Rule file should reference output directory')
  })

  it('should remove rule file after uninstall', async () => {
    await runCli(['init', '--non-interactive', tempDir])

    const rulePath = join(tempDir, '.claude', 'rules', 'sparq.md')
    assert.ok(existsSync(rulePath), 'Rule file should exist before uninstall')

    await runCli(['uninstall', '--force', '--non-interactive', tempDir])

    assert.ok(!existsSync(rulePath), 'Rule file should be removed after uninstall')
  })

  it('should not create CLAUDE.md during init', async () => {
    await runCli(['init', '--non-interactive', tempDir])

    // New installations should not create CLAUDE.md (uses rule file instead)
    assert.ok(!existsSync(join(tempDir, 'CLAUDE.md')), 'CLAUDE.md should not be created by init')
  })
})
