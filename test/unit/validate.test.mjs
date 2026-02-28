import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { after, afterEach, before, beforeEach, describe, it } from 'node:test'
import {
  isValidConfluenceKey,
  isValidJiraKey,
  isValidQaseProjectCode,
  parseTestRailId,
  sanitizeProjectName,
  validateConfig,
  validateTargetDir,
} from '../../bin/lib/validate.mjs'
import { cleanTempDir, createOutputCapture, createTempDir } from '../helpers/setup.mjs'

// ---------------------------------------------------------------------------
// sanitizeProjectName
// ---------------------------------------------------------------------------

describe('sanitizeProjectName', () => {
  it('should leave a normal name unchanged', () => {
    assert.equal(sanitizeProjectName('my-project'), 'my-project')
  })

  it('should strip null bytes', () => {
    assert.equal(sanitizeProjectName('my\x00project'), 'myproject')
  })

  it('should strip tab characters', () => {
    assert.equal(sanitizeProjectName('my\tproject'), 'myproject')
  })

  it('should strip newline characters', () => {
    assert.equal(sanitizeProjectName('my\nproject'), 'myproject')
  })

  it('should strip carriage return characters', () => {
    assert.equal(sanitizeProjectName('my\rproject'), 'myproject')
  })

  it('should strip DEL character', () => {
    assert.equal(sanitizeProjectName('my\x7Fproject'), 'myproject')
  })

  it('should remove forward slashes', () => {
    assert.equal(sanitizeProjectName('my/project'), 'myproject')
  })

  it('should enforce max 200 characters', () => {
    const longName = 'a'.repeat(250)
    assert.equal(sanitizeProjectName(longName).length, 200)
  })

  it('should return empty string for only control chars', () => {
    assert.equal(sanitizeProjectName('\x00\x01\x02'), '')
  })

  it('should preserve Unicode characters', () => {
    assert.equal(sanitizeProjectName('projet-alpha'), 'projet-alpha')
  })

  it('should preserve spaces', () => {
    assert.equal(sanitizeProjectName('my project'), 'my project')
  })

  it('should preserve hyphens and underscores', () => {
    assert.equal(sanitizeProjectName('my-project_name'), 'my-project_name')
  })
})

// ---------------------------------------------------------------------------
// isValidJiraKey
// ---------------------------------------------------------------------------

describe('isValidJiraKey', () => {
  it('should accept two-letter key EP', () => {
    assert.equal(isValidJiraKey('EP'), true)
  })

  it('should accept key with hyphen MY-PROJ', () => {
    assert.equal(isValidJiraKey('MY-PROJ'), true)
  })

  it('should reject lowercase key', () => {
    assert.equal(isValidJiraKey('ep'), false)
  })

  it('should reject key starting with digit', () => {
    assert.equal(isValidJiraKey('2PROJ'), false)
  })

  it('should reject empty string', () => {
    assert.equal(isValidJiraKey(''), false)
  })

  it('should reject key with spaces', () => {
    assert.equal(isValidJiraKey('MY PROJ'), false)
  })

  it('should reject key with special chars', () => {
    assert.equal(isValidJiraKey('PROJ!'), false)
  })
})

// ---------------------------------------------------------------------------
// isValidConfluenceKey
// ---------------------------------------------------------------------------

describe('isValidConfluenceKey', () => {
  it('should accept uppercase key PROJ', () => {
    assert.equal(isValidConfluenceKey('PROJ'), true)
  })

  it('should reject lowercase key', () => {
    assert.equal(isValidConfluenceKey('proj'), false)
  })

  it('should reject key starting with digit', () => {
    assert.equal(isValidConfluenceKey('2PROJ'), false)
  })

  it('should reject empty string', () => {
    assert.equal(isValidConfluenceKey(''), false)
  })
})

// ---------------------------------------------------------------------------
// isValidQaseProjectCode
// ---------------------------------------------------------------------------

describe('isValidQaseProjectCode', () => {
  it('should accept uppercase code PROJ', () => {
    assert.equal(isValidQaseProjectCode('PROJ'), true)
  })

  it('should accept code with digits PROJ2', () => {
    assert.equal(isValidQaseProjectCode('PROJ2'), true)
  })

  it('should accept code with hyphen MY-PROJ', () => {
    assert.equal(isValidQaseProjectCode('MY-PROJ'), true)
  })

  it('should reject lowercase code', () => {
    assert.equal(isValidQaseProjectCode('proj'), false)
  })

  it('should reject code starting with digit', () => {
    assert.equal(isValidQaseProjectCode('2PROJ'), false)
  })

  it('should reject empty string', () => {
    assert.equal(isValidQaseProjectCode(''), false)
  })
})

// ---------------------------------------------------------------------------
// parseTestRailId
// ---------------------------------------------------------------------------

describe('parseTestRailId', () => {
  it('should return 1 for "1"', () => {
    assert.equal(parseTestRailId('1'), 1)
  })

  it('should return 42 for "42"', () => {
    assert.equal(parseTestRailId('42'), 42)
  })

  it('should return 999999 for "999999"', () => {
    assert.equal(parseTestRailId('999999'), 999999)
  })

  it('should return null for null', () => {
    assert.equal(parseTestRailId(null), null)
  })

  it('should return null for "0"', () => {
    assert.equal(parseTestRailId('0'), null)
  })
})

// ---------------------------------------------------------------------------
// validateTargetDir
// ---------------------------------------------------------------------------

describe('validateTargetDir', () => {
  let tempDir
  const capture = createOutputCapture()

  before(() => {
    tempDir = createTempDir()
  })

  after(() => {
    cleanTempDir(tempDir)
  })

  beforeEach(() => {
    capture.start()
  })

  afterEach(() => {
    capture.stop()
  })

  it('should reject a non-existent path', () => {
    const result = validateTargetDir(join(tempDir, 'nonexistent'))
    assert.equal(result, false)
  })

  it('should reject a file (not directory)', () => {
    const filePath = join(tempDir, 'testfile.txt')
    writeFileSync(filePath, 'hello')
    const result = validateTargetDir(filePath)
    assert.equal(result, false)
  })

  it('should accept a valid directory', () => {
    const result = validateTargetDir(tempDir)
    assert.equal(result, true)
  })
})

// ---------------------------------------------------------------------------
// validateConfig
// ---------------------------------------------------------------------------

describe('validateConfig', () => {
  const validConfig = {
    version: '1.0.0',
    project: { testDir: 'e2e' },
    sources: { jira: { enabled: true, projectKey: 'TEST' } },
  }

  it('should pass a valid complete config', () => {
    const { valid, errors } = validateConfig(validConfig)
    assert.equal(valid, true)
    assert.equal(errors.length, 0)
  })

  it('should fail when version is missing', () => {
    const { valid, errors } = validateConfig({
      project: { testDir: 'e2e' },
      sources: {},
    })
    assert.equal(valid, false)
    assert.ok(errors.some((e) => e.includes('version')))
  })

  it('should fail when project is missing', () => {
    const { valid, errors } = validateConfig({
      version: '1.0.0',
      sources: {},
    })
    assert.equal(valid, false)
    assert.ok(errors.some((e) => e.includes('project')))
  })

  it('should fail when sources is missing', () => {
    const { valid, errors } = validateConfig({
      version: '1.0.0',
      project: { testDir: 'e2e' },
    })
    assert.equal(valid, false)
    assert.ok(errors.some((e) => e.includes('sources')))
  })

  it('should pass when project.testDir is omitted', () => {
    const { valid, errors } = validateConfig({
      version: '1.0.0',
      project: {},
      sources: {},
    })
    assert.equal(valid, true)
    assert.equal(errors.length, 0)
  })

  it('should fail when project.testDir is not a string', () => {
    const { valid, errors } = validateConfig({
      version: '1.0.0',
      project: { testDir: 42 },
      sources: {},
    })
    assert.equal(valid, false)
    assert.ok(errors.some((e) => e.includes('project.testDir')))
  })

  it('should fail when sources entry has non-boolean enabled', () => {
    const { valid, errors } = validateConfig({
      version: '1.0.0',
      project: { testDir: 'e2e' },
      sources: { jira: { enabled: 'yes' } },
    })
    assert.equal(valid, false)
    assert.ok(errors.some((e) => e.includes('sources.jira.enabled')))
  })

  it('should catch inputs.tms.testrail missing projectId', () => {
    const { valid, errors } = validateConfig({
      version: '1.0.0',
      project: { testDir: 'e2e' },
      sources: {},
      inputs: { tms: { provider: 'testrail', testrail: {} } },
    })
    assert.equal(valid, false)
    assert.ok(errors.some((e) => e.includes('inputs') && e.includes('testrail')))
  })

  it('should catch inputs.tms.qase missing projectCode', () => {
    const { valid, errors } = validateConfig({
      version: '1.0.0',
      project: { testDir: 'e2e' },
      sources: {},
      inputs: { tms: { provider: 'qase', qase: {} } },
    })
    assert.equal(valid, false)
    assert.ok(errors.some((e) => e.includes('inputs') && e.includes('qase')))
  })

  it('should require projectId for testrail provider', () => {
    const { valid, errors } = validateConfig({
      version: '1.0.0',
      project: { testDir: 'e2e' },
      sources: {},
      outputs: { tms: { provider: 'testrail', testrail: {} } },
    })
    assert.equal(valid, false)
    assert.ok(errors.some((e) => e.includes('testrail.projectId')))
  })

  it('should require suiteId for testrail provider', () => {
    const { valid, errors } = validateConfig({
      version: '1.0.0',
      project: { testDir: 'e2e' },
      sources: {},
      outputs: { tms: { provider: 'testrail', testrail: { projectId: 1 } } },
    })
    assert.equal(valid, false)
    assert.ok(errors.some((e) => e.includes('testrail.suiteId')))
  })

  it('should pass testrail with valid projectId and suiteId', () => {
    const { valid } = validateConfig({
      version: '1.0.0',
      project: { testDir: 'e2e' },
      sources: {},
      outputs: { tms: { provider: 'testrail', testrail: { projectId: 1, suiteId: 2 } } },
    })
    assert.equal(valid, true)
  })

  it('should require projectCode for qase provider', () => {
    const { valid, errors } = validateConfig({
      version: '1.0.0',
      project: { testDir: 'e2e' },
      sources: {},
      outputs: { tms: { provider: 'qase', qase: {} } },
    })
    assert.equal(valid, false)
    assert.ok(errors.some((e) => e.includes('qase.projectCode')))
  })

  it('should pass qase with valid projectCode', () => {
    const { valid } = validateConfig({
      version: '1.0.0',
      project: { testDir: 'e2e' },
      sources: {},
      outputs: { tms: { provider: 'qase', qase: { projectCode: 'PROJ' } } },
    })
    assert.equal(valid, true)
  })

  it('should require jira projectKey when jira export is enabled', () => {
    const { valid, errors } = validateConfig({
      version: '1.0.0',
      project: { testDir: 'e2e' },
      sources: {},
      outputs: { jira: { enabled: true } },
    })
    assert.equal(valid, false)
    assert.ok(errors.some((e) => e.includes('sources.jira.projectKey')))
  })

  it('should require confluence spaceKey when confluence export is enabled', () => {
    const { valid, errors } = validateConfig({
      version: '1.0.0',
      project: { testDir: 'e2e' },
      sources: {},
      outputs: { confluence: { enabled: true } },
    })
    assert.equal(valid, false)
    assert.ok(errors.some((e) => e.includes('spaceKey')))
  })

  it('should return multiple errors for multiple violations', () => {
    const { valid, errors } = validateConfig({})
    assert.equal(valid, false)
    assert.ok(errors.length >= 3, `Expected at least 3 errors, got ${errors.length}`)
  })
})
