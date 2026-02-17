import assert from 'node:assert/strict'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { cleanTempDir, createMockProject, createTempDir, runCli } from '../helpers/setup.mjs'

describe('Clean command integration', () => {
  let tempDir

  beforeEach(() => {
    tempDir = createTempDir()
    createMockProject(tempDir, {
      name: 'clean-test',
      dependencies: { vue: '^3.4.0' },
      devDependencies: { '@playwright/test': '^1.40.0' },
      withGit: true,
    })
  })

  afterEach(() => {
    cleanTempDir(tempDir)
  })

  /**
   * Helper: run init then create mock artifacts in .sparq/.
   */
  async function initAndSeedArtifacts() {
    const { exitCode } = await runCli(['init', '--non-interactive', tempDir])
    assert.equal(exitCode, 0, 'Init should exit 0 before seeding artifacts')

    // Seed mock artifacts in multiple output directories
    const reqDir = join(tempDir, '.sparq', 'requirements')
    const tcDir = join(tempDir, '.sparq', 'test-cases')
    const covDir = join(tempDir, '.sparq', 'coverage')
    const trackingDir = join(tempDir, '.sparq', 'tracking')

    mkdirSync(reqDir, { recursive: true })
    mkdirSync(tcDir, { recursive: true })
    mkdirSync(covDir, { recursive: true })
    mkdirSync(trackingDir, { recursive: true })

    writeFileSync(join(reqDir, 'REQ-login.md'), '# Login Requirements\n')
    writeFileSync(join(reqDir, 'REQ-signup.md'), '# Signup Requirements\n')
    writeFileSync(join(tcDir, 'TC-login.md'), '# Login Tests\n')
    writeFileSync(join(tcDir, 'TC-signup.md'), '# Signup Tests\n')
    writeFileSync(join(covDir, 'coverage-matrix.md'), '# Coverage Matrix\n')
    writeFileSync(join(trackingDir, 'test-registry.json'), '{}')
  }

  // ---------------------------------------------------------------------------
  // 1. Clean with --force after init + seeded artifacts
  // ---------------------------------------------------------------------------

  it('should remove artifacts and keep .manifest.json with --force', async () => {
    await initAndSeedArtifacts()

    // Confirm artifacts exist before clean
    assert.ok(
      existsSync(join(tempDir, '.sparq', 'requirements', 'REQ-login.md')),
      'REQ-login.md should exist before clean',
    )
    assert.ok(
      existsSync(join(tempDir, '.sparq', 'test-cases', 'TC-login.md')),
      'TC-login.md should exist before clean',
    )

    const { stdout, exitCode } = await runCli(['clean', '--force', '--non-interactive', tempDir])

    assert.equal(exitCode, 0, 'Clean --force should exit 0')
    assert.ok(
      stdout.includes('Deleted') || stdout.includes('artifact'),
      'Output should report deletion',
    )

    // Artifacts should be removed
    assert.ok(
      !existsSync(join(tempDir, '.sparq', 'requirements', 'REQ-login.md')),
      'REQ-login.md should be removed',
    )
    assert.ok(
      !existsSync(join(tempDir, '.sparq', 'requirements', 'REQ-signup.md')),
      'REQ-signup.md should be removed',
    )
    assert.ok(
      !existsSync(join(tempDir, '.sparq', 'test-cases', 'TC-login.md')),
      'TC-login.md should be removed',
    )
    assert.ok(
      !existsSync(join(tempDir, '.sparq', 'coverage', 'coverage-matrix.md')),
      'coverage-matrix.md should be removed',
    )

    // .manifest.json must be preserved (protected)
    assert.ok(
      existsSync(join(tempDir, '.sparq', '.manifest.json')),
      '.manifest.json should be preserved',
    )

    // tracking/test-registry.json should be preserved (protected without --all)
    assert.ok(
      existsSync(join(tempDir, '.sparq', 'tracking', 'test-registry.json')),
      'test-registry.json should be preserved without --all',
    )
  })

  // ---------------------------------------------------------------------------
  // 2. Clean with --type=requirements --force — only removes requirements/
  // ---------------------------------------------------------------------------

  it('should only remove requirements when --type=requirements is used', async () => {
    await initAndSeedArtifacts()

    const { exitCode } = await runCli([
      'clean',
      '--type=requirements',
      '--force',
      '--non-interactive',
      tempDir,
    ])

    assert.equal(exitCode, 0, 'Clean --type=requirements --force should exit 0')

    // Requirements should be gone
    assert.ok(
      !existsSync(join(tempDir, '.sparq', 'requirements', 'REQ-login.md')),
      'REQ-login.md should be removed',
    )
    assert.ok(
      !existsSync(join(tempDir, '.sparq', 'requirements', 'REQ-signup.md')),
      'REQ-signup.md should be removed',
    )

    // Other artifact types should be preserved
    assert.ok(
      existsSync(join(tempDir, '.sparq', 'test-cases', 'TC-login.md')),
      'TC-login.md should be preserved',
    )
    assert.ok(
      existsSync(join(tempDir, '.sparq', 'test-cases', 'TC-signup.md')),
      'TC-signup.md should be preserved',
    )
    assert.ok(
      existsSync(join(tempDir, '.sparq', 'coverage', 'coverage-matrix.md')),
      'coverage-matrix.md should be preserved',
    )
    assert.ok(
      existsSync(join(tempDir, '.sparq', 'tracking', 'test-registry.json')),
      'test-registry.json should be preserved',
    )
  })

  // ---------------------------------------------------------------------------
  // 3. Clean on project with no .sparq/ — graceful handling
  // ---------------------------------------------------------------------------

  it('should handle gracefully when no .sparq/ directory exists', async () => {
    // Do NOT run init — no .sparq/ directory
    assert.ok(!existsSync(join(tempDir, '.sparq')), '.sparq/ should not exist before clean')

    const { stdout, exitCode } = await runCli(['clean', '--force', '--non-interactive', tempDir])

    assert.equal(exitCode, 0, 'Clean should exit 0 when no .sparq/ exists')
    assert.ok(
      stdout.includes('No .sparq/') || stdout.includes('nothing to clean'),
      'Output should indicate nothing to clean',
    )
  })

  // ---------------------------------------------------------------------------
  // 4. Clean --non-interactive without --force — should fail (safety check)
  // ---------------------------------------------------------------------------

  it('should fail in non-interactive mode without --force', async () => {
    await initAndSeedArtifacts()

    const { stdout, stderr, exitCode } = await runCli(['clean', '--non-interactive', tempDir])

    const output = stdout + stderr

    // The command should indicate failure — destructive operation requires --force
    assert.ok(
      output.includes('--force') || output.includes('Destructive') || exitCode !== 0,
      'Should fail or warn about needing --force in non-interactive mode',
    )

    // Artifacts should still exist (nothing deleted)
    assert.ok(
      existsSync(join(tempDir, '.sparq', 'requirements', 'REQ-login.md')),
      'REQ-login.md should still exist after failed clean',
    )
    assert.ok(
      existsSync(join(tempDir, '.sparq', 'test-cases', 'TC-login.md')),
      'TC-login.md should still exist after failed clean',
    )
  })

  // ---------------------------------------------------------------------------
  // 5. Clean --all --force — should also remove tracking/test-registry.json
  // ---------------------------------------------------------------------------

  it('should remove test-registry.json when --all --force is used', async () => {
    await initAndSeedArtifacts()

    // Confirm test-registry.json exists
    assert.ok(
      existsSync(join(tempDir, '.sparq', 'tracking', 'test-registry.json')),
      'test-registry.json should exist before clean --all',
    )

    const { stdout, exitCode } = await runCli([
      'clean',
      '--all',
      '--force',
      '--non-interactive',
      tempDir,
    ])

    assert.equal(exitCode, 0, 'Clean --all --force should exit 0')
    assert.ok(
      stdout.includes('Deleted') || stdout.includes('artifact'),
      'Output should report deletion',
    )

    // test-registry.json should now be removed
    assert.ok(
      !existsSync(join(tempDir, '.sparq', 'tracking', 'test-registry.json')),
      'test-registry.json should be removed with --all',
    )

    // Other artifacts should also be removed
    assert.ok(
      !existsSync(join(tempDir, '.sparq', 'requirements', 'REQ-login.md')),
      'REQ-login.md should be removed',
    )
    assert.ok(
      !existsSync(join(tempDir, '.sparq', 'test-cases', 'TC-login.md')),
      'TC-login.md should be removed',
    )

    // .manifest.json must still be preserved (always protected)
    assert.ok(
      existsSync(join(tempDir, '.sparq', '.manifest.json')),
      '.manifest.json should be preserved even with --all',
    )
  })

  // ---------------------------------------------------------------------------
  // 6. Clean with --type filter for test-cases only
  // ---------------------------------------------------------------------------

  it('should only remove test-cases when --type=test-cases is used', async () => {
    await initAndSeedArtifacts()

    const { exitCode } = await runCli([
      'clean',
      '--type=test-cases',
      '--force',
      '--non-interactive',
      tempDir,
    ])

    assert.equal(exitCode, 0, 'Clean --type=test-cases --force should exit 0')

    // Test cases should be gone
    assert.ok(
      !existsSync(join(tempDir, '.sparq', 'test-cases', 'TC-login.md')),
      'TC-login.md should be removed',
    )
    assert.ok(
      !existsSync(join(tempDir, '.sparq', 'test-cases', 'TC-signup.md')),
      'TC-signup.md should be removed',
    )

    // Requirements and coverage should be preserved
    assert.ok(
      existsSync(join(tempDir, '.sparq', 'requirements', 'REQ-login.md')),
      'REQ-login.md should be preserved',
    )
    assert.ok(
      existsSync(join(tempDir, '.sparq', 'coverage', 'coverage-matrix.md')),
      'coverage-matrix.md should be preserved',
    )
  })

  // ---------------------------------------------------------------------------
  // 7. Clean with invalid --type should report error
  // ---------------------------------------------------------------------------

  it('should report error for invalid --type value', async () => {
    await initAndSeedArtifacts()

    const { stdout, stderr } = await runCli([
      'clean',
      '--type=nonexistent',
      '--force',
      '--non-interactive',
      tempDir,
    ])

    const output = stdout + stderr
    assert.ok(
      output.includes('Unknown artifact type') || output.includes('nonexistent'),
      'Should report unknown artifact type',
    )

    // Artifacts should remain untouched
    assert.ok(
      existsSync(join(tempDir, '.sparq', 'requirements', 'REQ-login.md')),
      'Artifacts should not be deleted on invalid type',
    )
  })

  // ---------------------------------------------------------------------------
  // 8. Clean when .sparq/ exists but has no matching artifacts
  // ---------------------------------------------------------------------------

  it('should report no matching artifacts when .sparq/ is empty of removable files', async () => {
    const { exitCode: initCode } = await runCli(['init', '--non-interactive', tempDir])
    assert.equal(initCode, 0, 'Init should exit 0')

    // .sparq/ exists but only has .manifest.json (protected) — no removable artifacts
    const { stdout, exitCode } = await runCli(['clean', '--force', '--non-interactive', tempDir])

    assert.equal(exitCode, 0, 'Clean should exit 0 when no artifacts match')
    assert.ok(
      stdout.includes('No artifacts') || stdout.includes('nothing'),
      'Should report no matching artifacts',
    )
  })

  // ---------------------------------------------------------------------------
  // 9. Clean preserves .backup/ directory
  // ---------------------------------------------------------------------------

  it('should preserve .backup/ directory during clean', async () => {
    await initAndSeedArtifacts()

    // Create a .backup/ directory with content
    const backupDir = join(tempDir, '.sparq', '.backup')
    mkdirSync(backupDir, { recursive: true })
    writeFileSync(join(backupDir, 'backup-2024-01-01.json'), '{"backup": true}')

    const { exitCode } = await runCli(['clean', '--force', '--non-interactive', tempDir])

    assert.equal(exitCode, 0, 'Clean should exit 0')

    // .backup/ and its contents should be preserved
    assert.ok(
      existsSync(join(backupDir, 'backup-2024-01-01.json')),
      '.backup/ contents should be preserved',
    )

    // Regular artifacts should be removed
    assert.ok(
      !existsSync(join(tempDir, '.sparq', 'requirements', 'REQ-login.md')),
      'REQ-login.md should be removed',
    )
  })
})
