import assert from 'node:assert/strict'
import { existsSync, mkdirSync, utimesSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'
import {
  cmdClean,
  formatSize,
  getArtifactType,
  scanArtifacts,
} from '../../bin/lib/commands/clean.mjs'
import { cleanTempDir, createTempDir } from '../helpers/setup.mjs'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Create a .sparq/ directory tree with sample artifacts for testing.
 */
function createSparqFixture(dir) {
  const sparqDir = join(dir, '.sparq')

  // Output directories matching SPARQ_OUTPUT_DIRS
  const dirs = [
    'requirements',
    'test-cases',
    'automation/generated',
    'coverage',
    'validation',
    'refresh',
    'tracking',
    'plans',
    '.backup',
  ]

  for (const d of dirs) {
    mkdirSync(join(sparqDir, d), { recursive: true })
  }

  // Protected files
  writeFileSync(join(sparqDir, '.manifest.json'), '{}')
  writeFileSync(join(sparqDir, 'tracking', 'test-registry.json'), '{}')

  // Sample artifacts
  writeFileSync(join(sparqDir, 'requirements', 'REQ-login.md'), '# Login Requirements')
  writeFileSync(join(sparqDir, 'requirements', 'REQ-signup.md'), '# Signup Requirements')
  writeFileSync(join(sparqDir, 'test-cases', 'TC-login-HP.md'), '# Login Happy Path')
  writeFileSync(join(sparqDir, 'test-cases', 'TC-login-EC.md'), '# Login Edge Cases')
  writeFileSync(
    join(sparqDir, 'automation', 'generated', 'login.spec.ts'),
    'test("login", async () => {})',
  )
  writeFileSync(join(sparqDir, 'coverage', 'coverage-matrix.md'), '# Coverage')
  writeFileSync(join(sparqDir, 'validation', 'validation-report.md'), '# Validation')
  writeFileSync(join(sparqDir, 'plans', 'execution-plan.md'), '# Plan')
  writeFileSync(join(sparqDir, '.backup', 'old-config.json'), '{}')

  return sparqDir
}

/**
 * Set a file's mtime to N days ago.
 */
function setFileAge(filePath, daysAgo) {
  const past = new Date(Date.now() - daysAgo * 86_400_000)
  utimesSync(filePath, past, past)
}

/**
 * Create a minimal project structure so validateTargetDir passes.
 */
function createProject(dir) {
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'package.json'), '{"name":"test"}')
}

// ---------------------------------------------------------------------------
// formatSize
// ---------------------------------------------------------------------------

describe('formatSize', () => {
  it('should format 0 bytes', () => {
    assert.equal(formatSize(0), '0 B')
  })

  it('should format bytes below 1 KB', () => {
    assert.equal(formatSize(512), '512 B')
    assert.equal(formatSize(1023), '1023 B')
  })

  it('should format exactly 1 KB', () => {
    assert.equal(formatSize(1024), '1.0 KB')
  })

  it('should format kilobytes', () => {
    assert.equal(formatSize(1536), '1.5 KB')
    assert.equal(formatSize(10240), '10.0 KB')
  })

  it('should format exactly 1 MB', () => {
    assert.equal(formatSize(1048576), '1.0 MB')
  })

  it('should format megabytes', () => {
    assert.equal(formatSize(5242880), '5.0 MB')
  })

  it('should format exactly 1 GB', () => {
    assert.equal(formatSize(1073741824), '1.0 GB')
  })

  it('should format gigabytes', () => {
    assert.equal(formatSize(2147483648), '2.0 GB')
  })
})

// ---------------------------------------------------------------------------
// getArtifactType
// ---------------------------------------------------------------------------

describe('getArtifactType', () => {
  it('should map requirements paths', () => {
    assert.equal(getArtifactType('requirements/REQ-login.md'), 'requirements')
  })

  it('should map test-cases paths', () => {
    assert.equal(getArtifactType('test-cases/TC-login-HP.md'), 'test-cases')
  })

  it('should map automation paths', () => {
    assert.equal(getArtifactType('automation/generated/login.spec.ts'), 'automation')
  })

  it('should map coverage paths', () => {
    assert.equal(getArtifactType('coverage/matrix.md'), 'coverage')
  })

  it('should map validation paths', () => {
    assert.equal(getArtifactType('validation/report.md'), 'validation')
  })

  it('should map refresh paths', () => {
    assert.equal(getArtifactType('refresh/diff.md'), 'refresh')
  })

  it('should map tracking paths', () => {
    assert.equal(getArtifactType('tracking/test-registry.json'), 'tracking')
  })

  it('should map plans paths', () => {
    assert.equal(getArtifactType('plans/execution-plan.md'), 'plans')
  })

  it('should return unknown for unrecognized paths', () => {
    assert.equal(getArtifactType('random/file.txt'), 'unknown')
    assert.equal(getArtifactType('something-else.json'), 'unknown')
  })

  it('should handle backslash paths (Windows)', () => {
    assert.equal(getArtifactType('requirements\\REQ-login.md'), 'requirements')
  })
})

// ---------------------------------------------------------------------------
// scanArtifacts
// ---------------------------------------------------------------------------

describe('scanArtifacts', () => {
  let tempDir
  let sparqDir

  beforeEach(() => {
    tempDir = createTempDir()
    createProject(tempDir)
    sparqDir = createSparqFixture(tempDir)
  })

  afterEach(() => {
    cleanTempDir(tempDir)
  })

  it('should find all non-protected files in .sparq/', () => {
    const artifacts = scanArtifacts(sparqDir)

    // Should find: 2 requirements + 2 test-cases + 1 automation + 1 coverage
    //            + 1 validation = 7 artifacts
    // Should NOT include: .manifest.json, tracking/test-registry.json, .backup/*, plans/*
    assert.equal(artifacts.length, 7)
  })

  it('should exclude .manifest.json from results', () => {
    const artifacts = scanArtifacts(sparqDir)
    const manifestEntries = artifacts.filter((a) => a.relativePath === '.manifest.json')
    assert.equal(manifestEntries.length, 0, '.manifest.json should be excluded')
  })

  it('should exclude .backup/ directory from results', () => {
    const artifacts = scanArtifacts(sparqDir)
    const backupEntries = artifacts.filter((a) => a.relativePath.startsWith('.backup'))
    assert.equal(backupEntries.length, 0, '.backup/ files should be excluded')
  })

  it('should exclude tracking/test-registry.json by default', () => {
    const artifacts = scanArtifacts(sparqDir)
    const registryEntries = artifacts.filter(
      (a) => a.relativePath === 'tracking/test-registry.json',
    )
    assert.equal(registryEntries.length, 0, 'test-registry.json should be excluded by default')
  })

  it('should include tracking/test-registry.json when includeTrackingRegistry is true', () => {
    const artifacts = scanArtifacts(sparqDir, { includeTrackingRegistry: true })
    const registryEntries = artifacts.filter(
      (a) => a.relativePath === 'tracking/test-registry.json',
    )
    assert.equal(registryEntries.length, 1, 'test-registry.json should be included')
  })

  it('should filter by type when type option is given', () => {
    const artifacts = scanArtifacts(sparqDir, { type: 'requirements' })
    assert.equal(artifacts.length, 2)
    for (const a of artifacts) {
      assert.equal(a.type, 'requirements')
    }
  })

  it('should filter by type automation', () => {
    const artifacts = scanArtifacts(sparqDir, { type: 'automation' })
    assert.equal(artifacts.length, 1)
    assert.equal(artifacts[0].type, 'automation')
  })

  it('should return empty array when type filter matches nothing', () => {
    const artifacts = scanArtifacts(sparqDir, { type: 'refresh' })
    assert.equal(artifacts.length, 0)
  })

  it('should filter by age when olderThan option is given', () => {
    // Make two requirement files old
    setFileAge(join(sparqDir, 'requirements', 'REQ-login.md'), 45)
    setFileAge(join(sparqDir, 'requirements', 'REQ-signup.md'), 45)

    const artifacts = scanArtifacts(sparqDir, { olderThan: 30 })
    assert.equal(artifacts.length, 2, 'Only 2 files should be older than 30 days')
    for (const a of artifacts) {
      assert.equal(a.type, 'requirements')
    }
  })

  it('should return empty array when no files are older than threshold', () => {
    const artifacts = scanArtifacts(sparqDir, { olderThan: 30 })
    assert.equal(artifacts.length, 0, 'Freshly created files should not match 30-day filter')
  })

  it('should combine type and olderThan filters', () => {
    setFileAge(join(sparqDir, 'requirements', 'REQ-login.md'), 45)
    setFileAge(join(sparqDir, 'test-cases', 'TC-login-HP.md'), 45)

    const artifacts = scanArtifacts(sparqDir, { type: 'requirements', olderThan: 30 })
    assert.equal(artifacts.length, 1, 'Only 1 requirements file should be older than 30 days')
    assert.equal(artifacts[0].type, 'requirements')
  })

  it('should return entries with correct structure', () => {
    const artifacts = scanArtifacts(sparqDir, { type: 'coverage' })
    assert.equal(artifacts.length, 1)

    const entry = artifacts[0]
    assert.ok(typeof entry.path === 'string', 'path should be a string')
    assert.ok(typeof entry.relativePath === 'string', 'relativePath should be a string')
    assert.ok(typeof entry.size === 'number', 'size should be a number')
    assert.ok(entry.mtime instanceof Date, 'mtime should be a Date')
    assert.equal(entry.type, 'coverage')
    assert.ok(entry.size > 0, 'size should be positive')
  })

  it('should return empty array when .sparq/ does not exist', () => {
    const artifacts = scanArtifacts(join(tempDir, 'nonexistent'))
    assert.equal(artifacts.length, 0)
  })
})

// ---------------------------------------------------------------------------
// cmdClean
// ---------------------------------------------------------------------------

describe('cmdClean', () => {
  let tempDir

  beforeEach(() => {
    tempDir = createTempDir()
    createProject(tempDir)
  })

  afterEach(() => {
    cleanTempDir(tempDir)
  })

  it('should do nothing when .sparq/ does not exist', async () => {
    // Should not throw — just print info and return
    await cmdClean(tempDir, { force: true })
  })

  it('should remove all artifacts with --all --force', async () => {
    createSparqFixture(tempDir)

    await cmdClean(tempDir, { all: true, force: true })

    // Artifacts should be gone
    assert.ok(
      !existsSync(join(tempDir, '.sparq', 'requirements', 'REQ-login.md')),
      'REQ-login.md should be deleted',
    )
    assert.ok(
      !existsSync(join(tempDir, '.sparq', 'test-cases', 'TC-login-HP.md')),
      'TC-login-HP.md should be deleted',
    )
    assert.ok(
      !existsSync(join(tempDir, '.sparq', 'coverage', 'coverage-matrix.md')),
      'coverage-matrix.md should be deleted',
    )

    // Protected files should remain
    assert.ok(
      existsSync(join(tempDir, '.sparq', '.manifest.json')),
      '.manifest.json should be preserved',
    )
    assert.ok(
      existsSync(join(tempDir, '.sparq', '.backup', 'old-config.json')),
      '.backup/ should be preserved',
    )
  })

  it('should filter by --type and only delete matching artifacts', async () => {
    createSparqFixture(tempDir)

    await cmdClean(tempDir, { type: 'requirements', force: true })

    // Requirements should be gone
    assert.ok(
      !existsSync(join(tempDir, '.sparq', 'requirements', 'REQ-login.md')),
      'Requirements files should be deleted',
    )
    assert.ok(
      !existsSync(join(tempDir, '.sparq', 'requirements', 'REQ-signup.md')),
      'Requirements files should be deleted',
    )

    // Other types should remain
    assert.ok(
      existsSync(join(tempDir, '.sparq', 'test-cases', 'TC-login-HP.md')),
      'Test cases should not be deleted when filtering by requirements',
    )
    assert.ok(
      existsSync(join(tempDir, '.sparq', 'coverage', 'coverage-matrix.md')),
      'Coverage should not be deleted when filtering by requirements',
    )
  })

  it('should not delete when nonInteractive without --force', async () => {
    createSparqFixture(tempDir)

    await cmdClean(tempDir, { nonInteractive: true })

    // Everything should still exist
    assert.ok(
      existsSync(join(tempDir, '.sparq', 'requirements', 'REQ-login.md')),
      'Files should remain when nonInteractive without --force',
    )
    assert.ok(
      existsSync(join(tempDir, '.sparq', 'test-cases', 'TC-login-HP.md')),
      'Files should remain when nonInteractive without --force',
    )
  })

  it('should preserve .manifest.json even with --all --force', async () => {
    createSparqFixture(tempDir)

    await cmdClean(tempDir, { all: true, force: true })

    assert.ok(
      existsSync(join(tempDir, '.sparq', '.manifest.json')),
      '.manifest.json must never be deleted',
    )
  })

  it('should preserve .backup/ even with --all --force', async () => {
    createSparqFixture(tempDir)

    await cmdClean(tempDir, { all: true, force: true })

    assert.ok(
      existsSync(join(tempDir, '.sparq', '.backup', 'old-config.json')),
      '.backup/ must never be deleted',
    )
  })

  it('should include tracking/test-registry.json when --all is used', async () => {
    createSparqFixture(tempDir)

    await cmdClean(tempDir, { all: true, force: true })

    // With --all, tracking registry is included in deletion
    assert.ok(
      !existsSync(join(tempDir, '.sparq', 'tracking', 'test-registry.json')),
      'test-registry.json should be deleted with --all',
    )
  })

  it('should protect tracking/test-registry.json without --all', async () => {
    createSparqFixture(tempDir)

    await cmdClean(tempDir, { type: 'tracking', force: true })

    // Without --all, tracking registry is not deletable even when type=tracking
    // (scanArtifacts excludes it by default)
    assert.ok(
      existsSync(join(tempDir, '.sparq', 'tracking', 'test-registry.json')),
      'test-registry.json should be preserved without --all',
    )
  })

  it('should handle invalid target directory', async () => {
    // Should not throw
    await cmdClean(join(tempDir, 'nonexistent'), { force: true })
  })

  it('should reject invalid artifact type', async () => {
    createSparqFixture(tempDir)

    // Should not throw, just report error
    await cmdClean(tempDir, { type: 'invalid-type', force: true })

    // All files should still exist (no deletion on invalid type)
    assert.ok(
      existsSync(join(tempDir, '.sparq', 'requirements', 'REQ-login.md')),
      'Files should remain when type is invalid',
    )
  })

  it('should do nothing when no artifacts match criteria', async () => {
    createSparqFixture(tempDir)

    // olderThan 30 days but all files are fresh
    await cmdClean(tempDir, { olderThan: 30, force: true })

    // Everything should still exist
    assert.ok(
      existsSync(join(tempDir, '.sparq', 'requirements', 'REQ-login.md')),
      'Fresh files should not be deleted by olderThan filter',
    )
  })
})
