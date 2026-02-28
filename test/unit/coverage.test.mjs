// test/unit/coverage.test.mjs — Tests for sparq coverage command

import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { cleanTempDir, createTempDir } from '../helpers/setup.mjs'

const { collectReqIds, collectTcLinks, computeCoverage, cmdCoverage } = await import(
  '../../bin/lib/commands/coverage.mjs'
)

let tmpDir

beforeEach(() => {
  tmpDir = createTempDir()
})

afterEach(() => {
  cleanTempDir(tmpDir)
})

// ---------------------------------------------------------------------------
// collectReqIds
// ---------------------------------------------------------------------------

describe('collectReqIds', () => {
  it('should collect unique REQ IDs from markdown files', () => {
    const sparqDir = join(tmpDir, '.sparq')
    const reqDir = join(sparqDir, 'requirements')
    mkdirSync(reqDir, { recursive: true })
    writeFileSync(
      join(reqDir, 'login.md'),
      `# Requirements: Login
## REQ-login-001: Valid login
## REQ-login-002: Invalid login
## REQ-login-001: Duplicate mention`,
    )
    const ids = collectReqIds(sparqDir)
    assert.equal(ids.size, 2, 'should deduplicate REQ IDs')
    assert.ok(ids.has('REQ-login-001'))
    assert.ok(ids.has('REQ-login-002'))
  })

  it('should return empty set when requirements directory is missing', () => {
    const sparqDir = join(tmpDir, '.sparq')
    mkdirSync(sparqDir, { recursive: true })
    const ids = collectReqIds(sparqDir)
    assert.equal(ids.size, 0)
  })

  it('should collect from multiple files', () => {
    const sparqDir = join(tmpDir, '.sparq')
    const reqDir = join(sparqDir, 'requirements')
    mkdirSync(reqDir, { recursive: true })
    writeFileSync(join(reqDir, 'login.md'), 'REQ-login-001 REQ-login-002')
    writeFileSync(join(reqDir, 'settings.md'), 'REQ-settings-001')
    const ids = collectReqIds(sparqDir)
    assert.equal(ids.size, 3)
  })
})

// ---------------------------------------------------------------------------
// collectTcLinks
// ---------------------------------------------------------------------------

describe('collectTcLinks', () => {
  it('should build REQ-to-TC reverse map from test case files', () => {
    const sparqDir = join(tmpDir, '.sparq')
    const tcDir = join(sparqDir, 'test-cases')
    mkdirSync(tcDir, { recursive: true })
    writeFileSync(
      join(tcDir, 'login.md'),
      `# Test Cases: Login

#### TC-login-HP-001: Successful login

**Priority:** P1 | **Type:** Happy Path | **Auto:** automatable | **Reqs:** REQ-login-001

#### TC-login-VE-001: Invalid credentials

**Priority:** P1 | **Type:** Validation | **Auto:** automatable | **Reqs:** REQ-login-002

#### TC-login-SEC-001: Account lockout

**Priority:** P1 | **Type:** Security | **Auto:** automatable | **Reqs:** REQ-login-001
`,
    )
    const linkMap = collectTcLinks(sparqDir)
    assert.ok(linkMap.has('REQ-login-001'))
    assert.equal(linkMap.get('REQ-login-001').length, 2)
    assert.ok(linkMap.get('REQ-login-001').includes('TC-login-HP-001'))
    assert.ok(linkMap.get('REQ-login-001').includes('TC-login-SEC-001'))
    assert.ok(linkMap.has('REQ-login-002'))
    assert.equal(linkMap.get('REQ-login-002').length, 1)
  })

  it('should return empty map when test-cases directory is missing', () => {
    const sparqDir = join(tmpDir, '.sparq')
    mkdirSync(sparqDir, { recursive: true })
    const linkMap = collectTcLinks(sparqDir)
    assert.equal(linkMap.size, 0)
  })
})

// ---------------------------------------------------------------------------
// computeCoverage
// ---------------------------------------------------------------------------

describe('computeCoverage', () => {
  it('should compute correct percentage with partial coverage', () => {
    const reqIds = new Set(['REQ-login-001', 'REQ-login-002', 'REQ-login-003', 'REQ-login-004'])
    const tcLinkMap = new Map([
      ['REQ-login-001', ['TC-login-HP-001']],
      ['REQ-login-002', ['TC-login-VE-001']],
      ['REQ-login-003', ['TC-login-SEC-001']],
    ])
    const result = computeCoverage(reqIds, tcLinkMap)
    assert.equal(result.total, 4)
    assert.equal(result.covered, 3)
    assert.equal(result.uncovered, 1)
    assert.equal(result.percentage, 75)
    assert.deepEqual(result.gaps, ['REQ-login-004'])
  })

  it('should return 100% with zero requirements', () => {
    const result = computeCoverage(new Set(), new Map())
    assert.equal(result.total, 0)
    assert.equal(result.percentage, 100)
    assert.deepEqual(result.gaps, [])
  })

  it('should return 0% when no tests exist', () => {
    const reqIds = new Set(['REQ-login-001', 'REQ-login-002', 'REQ-login-003'])
    const result = computeCoverage(reqIds, new Map())
    assert.equal(result.total, 3)
    assert.equal(result.covered, 0)
    assert.equal(result.uncovered, 3)
    assert.equal(result.percentage, 0)
    assert.equal(result.gaps.length, 3)
  })

  it('should return 100% when all requirements are covered', () => {
    const reqIds = new Set(['REQ-login-001', 'REQ-login-002'])
    const tcLinkMap = new Map([
      ['REQ-login-001', ['TC-login-HP-001']],
      ['REQ-login-002', ['TC-login-VE-001', 'TC-login-VE-002']],
    ])
    const result = computeCoverage(reqIds, tcLinkMap)
    assert.equal(result.percentage, 100)
    assert.equal(result.gaps.length, 0)
  })
})

// ---------------------------------------------------------------------------
// cmdCoverage (integration-level)
// ---------------------------------------------------------------------------

describe('cmdCoverage', () => {
  it('should return false when .sparq/ directory is missing', async () => {
    const result = await cmdCoverage(tmpDir)
    assert.equal(result, false)
  })

  it('should return true when coverage meets threshold', async () => {
    const sparqDir = join(tmpDir, '.sparq')
    const reqDir = join(sparqDir, 'requirements')
    const tcDir = join(sparqDir, 'test-cases')
    mkdirSync(reqDir, { recursive: true })
    mkdirSync(tcDir, { recursive: true })
    writeFileSync(join(reqDir, 'login.md'), 'REQ-login-001\nREQ-login-002')
    writeFileSync(
      join(tcDir, 'login.md'),
      `#### TC-login-HP-001: Login
**Reqs:** REQ-login-001

#### TC-login-VE-001: Error
**Reqs:** REQ-login-002`,
    )
    const result = await cmdCoverage(tmpDir, { threshold: '80', format: 'json' })
    assert.equal(result, true)
  })

  it('should return false when coverage is below threshold', async () => {
    const sparqDir = join(tmpDir, '.sparq')
    const reqDir = join(sparqDir, 'requirements')
    const tcDir = join(sparqDir, 'test-cases')
    mkdirSync(reqDir, { recursive: true })
    mkdirSync(tcDir, { recursive: true })
    writeFileSync(join(reqDir, 'login.md'), 'REQ-login-001\nREQ-login-002\nREQ-login-003')
    writeFileSync(
      join(tcDir, 'login.md'),
      `#### TC-login-HP-001: Login
**Reqs:** REQ-login-001`,
    )
    const result = await cmdCoverage(tmpDir, { threshold: '80', format: 'json' })
    assert.equal(result, false)
  })
})
