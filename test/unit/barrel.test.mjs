import assert from 'node:assert/strict'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { buildExportLine, filenameToExportName, updateBarrelExport } from '../../bin/lib/barrel.mjs'
import { setDryRun } from '../../bin/lib/state.mjs'
import { cleanTempDir, createTempDir } from '../helpers/setup.mjs'

// ---------------------------------------------------------------------------
// filenameToExportName
// ---------------------------------------------------------------------------

describe('filenameToExportName', () => {
  it('should convert dot-separated filename to PascalCase', () => {
    assert.equal(filenameToExportName('login.page.ts'), 'LoginPage')
  })

  it('should convert hyphen-separated filename to PascalCase', () => {
    assert.equal(filenameToExportName('user-profile.page.ts'), 'UserProfilePage')
  })

  it('should convert underscore-separated filename to PascalCase', () => {
    assert.equal(filenameToExportName('my_helper.util.ts'), 'MyHelperUtil')
  })

  it('should handle mixed separators', () => {
    assert.equal(filenameToExportName('auth-login.steps.ts'), 'AuthLoginSteps')
  })

  it('should handle single segment filenames', () => {
    assert.equal(filenameToExportName('helpers.ts'), 'Helpers')
  })

  it('should convert fixture filenames correctly', () => {
    assert.equal(filenameToExportName('auth.fixture.ts'), 'AuthFixture')
  })

  it('should convert steps filenames correctly', () => {
    assert.equal(filenameToExportName('login.steps.ts'), 'LoginSteps')
  })

  it('should handle multiple consecutive separators', () => {
    const result = filenameToExportName('my--double.page.ts')
    assert.equal(typeof result, 'string')
    assert.ok(result.length > 0, 'Should produce a non-empty result')
  })
})

// ---------------------------------------------------------------------------
// buildExportLine
// ---------------------------------------------------------------------------

describe('buildExportLine', () => {
  it('should generate correct export line format', () => {
    assert.equal(
      buildExportLine('LoginPage', 'login.page.ts'),
      "export { LoginPage } from './login.page'",
    )
  })

  it('should strip .ts extension from import path', () => {
    const line = buildExportLine('AuthFixture', 'auth.fixture.ts')
    assert.ok(!line.includes('.ts'), 'Import path should not contain .ts extension')
    assert.ok(line.includes("'./auth.fixture'"), 'Should have correct import path')
  })

  it('should include export name in curly braces', () => {
    const line = buildExportLine('UserProfilePage', 'user-profile.page.ts')
    assert.ok(line.includes('{ UserProfilePage }'), 'Should wrap name in curly braces')
  })
})

// ---------------------------------------------------------------------------
// updateBarrelExport
// ---------------------------------------------------------------------------

describe('updateBarrelExport', () => {
  let tempDir

  beforeEach(() => {
    tempDir = createTempDir()
  })

  afterEach(() => {
    setDryRun(false)
    cleanTempDir(tempDir)
  })

  it('should create new index.ts if it does not exist', () => {
    const indexPath = join(tempDir, 'index.ts')
    const added = updateBarrelExport(indexPath, ['login.page.ts', 'settings.page.ts'])

    assert.ok(existsSync(indexPath), 'index.ts should be created')
    const content = readFileSync(indexPath, 'utf-8')
    assert.ok(
      content.includes("export { LoginPage } from './login.page'"),
      'Should contain LoginPage export',
    )
    assert.ok(
      content.includes("export { SettingsPage } from './settings.page'"),
      'Should contain SettingsPage export',
    )
    assert.deepEqual(added, ['LoginPage', 'SettingsPage'])
  })

  it('should append to existing index.ts without duplicates', () => {
    const indexPath = join(tempDir, 'index.ts')
    writeFileSync(indexPath, "export { LoginPage } from './login.page'\n")

    const added = updateBarrelExport(indexPath, ['login.page.ts', 'settings.page.ts'])

    const content = readFileSync(indexPath, 'utf-8')
    const loginCount = (content.match(/LoginPage/g) || []).length
    assert.equal(loginCount, 1, 'LoginPage should appear exactly once')
    assert.ok(
      content.includes("export { SettingsPage } from './settings.page'"),
      'Should append SettingsPage export',
    )
    assert.deepEqual(added, ['SettingsPage'])
  })

  it('should correctly convert filenames to PascalCase export names', () => {
    const indexPath = join(tempDir, 'index.ts')
    updateBarrelExport(indexPath, [
      'user-profile.page.ts',
      'auth.fixture.ts',
      'checkout-flow.steps.ts',
    ])

    const content = readFileSync(indexPath, 'utf-8')
    assert.ok(
      content.includes("export { UserProfilePage } from './user-profile.page'"),
      'Should have UserProfilePage export',
    )
    assert.ok(
      content.includes("export { AuthFixture } from './auth.fixture'"),
      'Should have AuthFixture export',
    )
    assert.ok(
      content.includes("export { CheckoutFlowSteps } from './checkout-flow.steps'"),
      'Should have CheckoutFlowSteps export',
    )
  })

  it('should skip .spec.ts files', () => {
    const indexPath = join(tempDir, 'index.ts')
    const added = updateBarrelExport(indexPath, ['login.page.ts', 'login.spec.ts'])

    const content = readFileSync(indexPath, 'utf-8')
    assert.ok(
      content.includes("export { LoginPage } from './login.page'"),
      'Should include .page.ts export',
    )
    assert.ok(!content.includes('spec'), 'Should not include .spec.ts export')
    assert.deepEqual(added, ['LoginPage'])
  })

  it('should skip non-.ts files', () => {
    const indexPath = join(tempDir, 'index.ts')
    const added = updateBarrelExport(indexPath, ['login.page.ts', 'readme.md', 'config.json'])

    assert.deepEqual(added, ['LoginPage'])
    const content = readFileSync(indexPath, 'utf-8')
    const lines = content.trim().split('\n')
    assert.equal(lines.length, 1, 'Should only have one export line')
  })

  it('should return empty array when no exportable files are provided', () => {
    const indexPath = join(tempDir, 'index.ts')
    const added = updateBarrelExport(indexPath, ['readme.md', 'data.json'])

    assert.deepEqual(added, [])
    assert.ok(!existsSync(indexPath), 'Should not create index.ts for no exportable files')
  })

  it('should end file with trailing newline', () => {
    const indexPath = join(tempDir, 'index.ts')
    updateBarrelExport(indexPath, ['login.page.ts'])

    const content = readFileSync(indexPath, 'utf-8')
    assert.ok(content.endsWith('\n'), 'File should end with trailing newline')
  })

  it('should sort new exports alphabetically', () => {
    const indexPath = join(tempDir, 'index.ts')
    updateBarrelExport(indexPath, ['zebra.page.ts', 'alpha.page.ts', 'middle.page.ts'])

    const content = readFileSync(indexPath, 'utf-8')
    const lines = content.trim().split('\n')
    assert.equal(lines.length, 3, 'Should have 3 export lines')
    assert.ok(lines[0].includes('AlphaPage'), 'First line should be AlphaPage')
    assert.ok(lines[1].includes('MiddlePage'), 'Second line should be MiddlePage')
    assert.ok(lines[2].includes('ZebraPage'), 'Third line should be ZebraPage')
  })

  it('should handle empty file list', () => {
    const indexPath = join(tempDir, 'index.ts')
    const added = updateBarrelExport(indexPath, [])

    assert.deepEqual(added, [])
    assert.ok(!existsSync(indexPath), 'Should not create index.ts for empty list')
  })
})
