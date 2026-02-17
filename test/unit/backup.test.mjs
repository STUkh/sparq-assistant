import assert from 'node:assert/strict'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'
import {
  cleanupBackup,
  copyDirForBackup,
  createBackup,
  restoreBackup,
} from '../../bin/lib/backup.mjs'
import { cleanTempDir, createTempDir } from '../helpers/setup.mjs'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Create a .claude/ directory tree with sample agents, skills, and templates.
 */
function createClaudeFixture(dir) {
  const claudeDir = join(dir, '.claude')
  mkdirSync(join(claudeDir, 'agents'), { recursive: true })
  mkdirSync(join(claudeDir, 'skills', 'sparq-analyze'), { recursive: true })
  mkdirSync(join(claudeDir, 'templates'), { recursive: true })

  writeFileSync(join(claudeDir, 'agents', 'sparq-orchestrator.md'), '# Orchestrator')
  writeFileSync(join(claudeDir, 'agents', 'sparq-analyst.md'), '# Analyst')
  writeFileSync(join(claudeDir, 'skills', 'sparq-analyze', 'SKILL.md'), '# Analyze')
  writeFileSync(join(claudeDir, 'templates', 'sparq-execution-plan.md'), '# Plan')

  return claudeDir
}

// ---------------------------------------------------------------------------
// createBackup
// ---------------------------------------------------------------------------

describe('createBackup', () => {
  let tempDir
  let backupDir

  beforeEach(() => {
    tempDir = createTempDir()
    backupDir = join(tempDir, '.sparq-backup')
  })

  afterEach(() => {
    cleanTempDir(tempDir)
  })

  it('should return false when .claude/ does not exist', () => {
    const result = createBackup(tempDir, backupDir)
    assert.equal(result, false)
    assert.ok(!existsSync(backupDir), 'backup dir should not be created')
  })

  it('should return true and copy agents/skills/templates', () => {
    createClaudeFixture(tempDir)

    const result = createBackup(tempDir, backupDir)
    assert.equal(result, true)
    assert.ok(existsSync(backupDir), 'backup dir should exist')
    assert.ok(
      existsSync(join(backupDir, 'agents', 'sparq-orchestrator.md')),
      'agent file should be backed up',
    )
    assert.ok(
      existsSync(join(backupDir, 'skills', 'sparq-analyze', 'SKILL.md')),
      'skill file should be backed up',
    )
    assert.ok(
      existsSync(join(backupDir, 'templates', 'sparq-execution-plan.md')),
      'template file should be backed up',
    )
  })

  it('should preserve file contents in backup', () => {
    createClaudeFixture(tempDir)

    createBackup(tempDir, backupDir)
    const content = readFileSync(join(backupDir, 'agents', 'sparq-orchestrator.md'), 'utf-8')
    assert.equal(content, '# Orchestrator')
  })

  it('should overwrites existing backup directory', () => {
    createClaudeFixture(tempDir)

    // Create an initial backup with an extra file
    mkdirSync(backupDir, { recursive: true })
    writeFileSync(join(backupDir, 'stale-file.txt'), 'stale')

    const result = createBackup(tempDir, backupDir)
    assert.equal(result, true)
    assert.ok(!existsSync(join(backupDir, 'stale-file.txt')), 'old backup files should be removed')
    assert.ok(
      existsSync(join(backupDir, 'agents', 'sparq-orchestrator.md')),
      'new backup files should exist',
    )
  })

  it('should skip directories that do not exist under .claude/', () => {
    // Create .claude/ with only agents — no skills or templates
    const claudeDir = join(tempDir, '.claude')
    mkdirSync(join(claudeDir, 'agents'), { recursive: true })
    writeFileSync(join(claudeDir, 'agents', 'agent.md'), '# Agent')

    const result = createBackup(tempDir, backupDir)
    assert.equal(result, true)
    assert.ok(existsSync(join(backupDir, 'agents', 'agent.md')), 'agents should be backed up')
    assert.ok(
      !existsSync(join(backupDir, 'skills')),
      'skills dir should not be created when source is missing',
    )
    assert.ok(
      !existsSync(join(backupDir, 'templates')),
      'templates dir should not be created when source is missing',
    )
  })
})

// ---------------------------------------------------------------------------
// copyDirForBackup
// ---------------------------------------------------------------------------

describe('copyDirForBackup', () => {
  let tempDir

  beforeEach(() => {
    tempDir = createTempDir()
  })

  afterEach(() => {
    cleanTempDir(tempDir)
  })

  it('should copy files recursively', () => {
    const srcDir = join(tempDir, 'src')
    const destDir = join(tempDir, 'dest')

    mkdirSync(join(srcDir, 'sub'), { recursive: true })
    writeFileSync(join(srcDir, 'file.txt'), 'root file')
    writeFileSync(join(srcDir, 'sub', 'nested.txt'), 'nested file')

    copyDirForBackup(srcDir, destDir)

    assert.ok(existsSync(join(destDir, 'file.txt')), 'root file should be copied')
    assert.ok(existsSync(join(destDir, 'sub', 'nested.txt')), 'nested file should be copied')
    assert.equal(readFileSync(join(destDir, 'file.txt'), 'utf-8'), 'root file')
    assert.equal(readFileSync(join(destDir, 'sub', 'nested.txt'), 'utf-8'), 'nested file')
  })

  it('should skip symlinks', () => {
    const srcDir = join(tempDir, 'src')
    const destDir = join(tempDir, 'dest')

    mkdirSync(srcDir, { recursive: true })
    writeFileSync(join(srcDir, 'real.txt'), 'real content')
    symlinkSync(join(srcDir, 'real.txt'), join(srcDir, 'link.txt'))

    copyDirForBackup(srcDir, destDir)

    assert.ok(existsSync(join(destDir, 'real.txt')), 'real file should be copied')
    assert.ok(!existsSync(join(destDir, 'link.txt')), 'symlink should be skipped')
  })

  it('should stop at MAX_RECURSION_DEPTH', () => {
    // Create a directory chain deeper than MAX_RECURSION_DEPTH (20)
    const srcDir = join(tempDir, 'src')
    let deepDir = srcDir
    for (let i = 0; i <= 22; i++) {
      deepDir = join(deepDir, `d${i}`)
    }
    mkdirSync(deepDir, { recursive: true })
    writeFileSync(join(deepDir, 'deep.txt'), 'deep')

    const destDir = join(tempDir, 'dest')
    copyDirForBackup(srcDir, destDir)

    // The file at depth > 20 should not be copied
    let checkDir = destDir
    for (let i = 0; i <= 22; i++) {
      checkDir = join(checkDir, `d${i}`)
    }
    assert.ok(
      !existsSync(join(checkDir, 'deep.txt')),
      'file beyond MAX_RECURSION_DEPTH should not be copied',
    )
  })

  it('should warn on unreadable directory', () => {
    const destDir = join(tempDir, 'dest')

    // Calling with a non-existent src directory triggers the catch in readdirSync
    const nonExistentSrc = join(tempDir, 'does-not-exist')
    // Should not throw — it logs a warning internally
    copyDirForBackup(nonExistentSrc, destDir)

    // The dest directory should still be created (mkdirSync runs before readdirSync)
    assert.ok(existsSync(destDir), 'dest dir should be created even when src is unreadable')
  })

  it('should handle empty source directory', () => {
    const srcDir = join(tempDir, 'empty-src')
    const destDir = join(tempDir, 'dest')
    mkdirSync(srcDir, { recursive: true })

    copyDirForBackup(srcDir, destDir)

    assert.ok(existsSync(destDir), 'dest dir should be created')
    const entries = readdirSync(destDir)
    assert.equal(entries.length, 0, 'dest dir should be empty')
  })

  it('should copy multiple files in the same directory', () => {
    const srcDir = join(tempDir, 'src')
    const destDir = join(tempDir, 'dest')

    mkdirSync(srcDir, { recursive: true })
    writeFileSync(join(srcDir, 'a.txt'), 'aaa')
    writeFileSync(join(srcDir, 'b.txt'), 'bbb')
    writeFileSync(join(srcDir, 'c.txt'), 'ccc')

    copyDirForBackup(srcDir, destDir)

    assert.equal(readFileSync(join(destDir, 'a.txt'), 'utf-8'), 'aaa')
    assert.equal(readFileSync(join(destDir, 'b.txt'), 'utf-8'), 'bbb')
    assert.equal(readFileSync(join(destDir, 'c.txt'), 'utf-8'), 'ccc')
  })
})

// ---------------------------------------------------------------------------
// restoreBackup
// ---------------------------------------------------------------------------

describe('restoreBackup', () => {
  let tempDir
  let backupDir

  beforeEach(() => {
    tempDir = createTempDir()
    backupDir = join(tempDir, '.sparq-backup')
  })

  afterEach(() => {
    cleanTempDir(tempDir)
  })

  it('should restore from backup to .claude/', () => {
    // Set up a backup directory with agent and skill files
    mkdirSync(join(backupDir, 'agents'), { recursive: true })
    mkdirSync(join(backupDir, 'skills', 'sparq-init'), { recursive: true })
    mkdirSync(join(backupDir, 'templates'), { recursive: true })
    writeFileSync(join(backupDir, 'agents', 'sparq-orchestrator.md'), '# Restored')
    writeFileSync(join(backupDir, 'skills', 'sparq-init', 'SKILL.md'), '# Init')
    writeFileSync(join(backupDir, 'templates', 'plan.md'), '# Plan')

    // Ensure .claude/ exists as restore target
    mkdirSync(join(tempDir, '.claude'), { recursive: true })

    restoreBackup(tempDir, backupDir)

    assert.ok(
      existsSync(join(tempDir, '.claude', 'agents', 'sparq-orchestrator.md')),
      'agent file should be restored',
    )
    assert.equal(
      readFileSync(join(tempDir, '.claude', 'agents', 'sparq-orchestrator.md'), 'utf-8'),
      '# Restored',
    )
    assert.ok(
      existsSync(join(tempDir, '.claude', 'skills', 'sparq-init', 'SKILL.md')),
      'skill file should be restored',
    )
    assert.ok(
      existsSync(join(tempDir, '.claude', 'templates', 'plan.md')),
      'template file should be restored',
    )
  })

  it('should be a no-op when backup does not exist', () => {
    // Create .claude/ to verify nothing changes
    mkdirSync(join(tempDir, '.claude'), { recursive: true })

    // Should not throw
    restoreBackup(tempDir, join(tempDir, 'nonexistent-backup'))

    // .claude/ should remain empty
    const entries = readdirSync(join(tempDir, '.claude'))
    assert.equal(entries.length, 0, '.claude/ should remain unchanged')
  })

  it('should skip restore for missing subdirectories in backup', () => {
    // Backup only has agents — no skills or templates
    mkdirSync(join(backupDir, 'agents'), { recursive: true })
    writeFileSync(join(backupDir, 'agents', 'agent.md'), '# Agent')

    mkdirSync(join(tempDir, '.claude'), { recursive: true })
    restoreBackup(tempDir, backupDir)

    assert.ok(
      existsSync(join(tempDir, '.claude', 'agents', 'agent.md')),
      'agents should be restored',
    )
    assert.ok(
      !existsSync(join(tempDir, '.claude', 'skills')),
      'skills dir should not be created when not in backup',
    )
  })
})

// ---------------------------------------------------------------------------
// cleanupBackup
// ---------------------------------------------------------------------------

describe('cleanupBackup', () => {
  let tempDir

  beforeEach(() => {
    tempDir = createTempDir()
  })

  afterEach(() => {
    cleanTempDir(tempDir)
  })

  it('should remove the backup directory', () => {
    const backupDir = join(tempDir, '.sparq-backup')
    mkdirSync(join(backupDir, 'agents'), { recursive: true })
    writeFileSync(join(backupDir, 'agents', 'file.md'), 'content')

    cleanupBackup(backupDir)

    assert.ok(!existsSync(backupDir), 'backup directory should be removed')
  })

  it('should be a no-op when directory does not exist', () => {
    const backupDir = join(tempDir, 'nonexistent-backup')

    // Should not throw
    cleanupBackup(backupDir)

    assert.ok(!existsSync(backupDir), 'directory should still not exist')
  })

  it('should remove deeply nested backup contents', () => {
    const backupDir = join(tempDir, '.sparq-backup')
    mkdirSync(join(backupDir, 'skills', 'sparq-analyze', 'sub'), { recursive: true })
    writeFileSync(join(backupDir, 'skills', 'sparq-analyze', 'sub', 'deep.md'), 'deep')

    cleanupBackup(backupDir)

    assert.ok(!existsSync(backupDir), 'deeply nested backup should be fully removed')
  })
})
