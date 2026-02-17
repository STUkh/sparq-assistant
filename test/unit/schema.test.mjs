import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  CONFIG_SCHEMA,
  deepValidateConfig,
  getLocatorsForFramework,
  validateField,
} from '../../bin/lib/schema.mjs'

// ---------------------------------------------------------------------------
// Fixture: valid complete config
// ---------------------------------------------------------------------------

const validConfig = {
  version: '1.0.0',
  project: {
    testDir: 'e2e',
    sourceRoot: 'src',
    routeDiscoveryPattern: '**/route*/**/*.ts',
    componentFileExtensions: ['.vue'],
  },
  sources: {
    jira: { enabled: true, projectKey: 'EP' },
    confluence: { enabled: false, spaceKey: null },
    figma: { enabled: true },
    local: { enabled: true, requirementsDir: 'docs/specs' },
  },
  e2e: { detected: true, framework: 'playwright', configFile: 'playwright.config.ts' },
  outputs: {
    testCases: { format: 'both', outputDir: '.sparq/test-cases' },
    automation: { framework: 'playwright' },
    tms: {
      provider: null,
    },
    jira: { enabled: true, createSubTask: false },
    confluence: { enabled: false, spaceKey: null, parentPageTitle: null },
  },
  preferences: {
    interactiveMode: true,
    locatorPriority: ['getByTestId', 'getByRole', 'getByLabel', 'getByText'],
    testMultiplier: 5,
  },
}

/**
 * Deep clone a config and apply overrides via a callback.
 */
function withOverride(fn) {
  const clone = JSON.parse(JSON.stringify(validConfig))
  fn(clone)
  return clone
}

// ---------------------------------------------------------------------------
// CONFIG_SCHEMA export
// ---------------------------------------------------------------------------

describe('CONFIG_SCHEMA', () => {
  it('should export a non-null object with top-level config keys', () => {
    assert.equal(typeof CONFIG_SCHEMA, 'object')
    assert.notEqual(CONFIG_SCHEMA, null)
    assert.ok('version' in CONFIG_SCHEMA, 'schema should have "version"')
    assert.ok('project' in CONFIG_SCHEMA, 'schema should have "project"')
    assert.ok('sources' in CONFIG_SCHEMA, 'schema should have "sources"')
    assert.ok('outputs' in CONFIG_SCHEMA, 'schema should have "outputs"')
    assert.ok('preferences' in CONFIG_SCHEMA, 'schema should have "preferences"')
  })

  it('should mark version, project, and sources as required', () => {
    assert.equal(CONFIG_SCHEMA.version.required, true)
    assert.equal(CONFIG_SCHEMA.project.required, true)
    assert.equal(CONFIG_SCHEMA.sources.required, true)
  })
})

// ---------------------------------------------------------------------------
// deepValidateConfig — valid config
// ---------------------------------------------------------------------------

describe('deepValidateConfig — valid config', () => {
  it('should pass with zero errors for a fully valid config', () => {
    const result = deepValidateConfig(validConfig)
    assert.equal(result.valid, true, 'valid config should pass')
    assert.equal(result.errors.length, 0, `unexpected errors: ${JSON.stringify(result.errors)}`)
  })

  it('should return warnings array even when valid', () => {
    const result = deepValidateConfig(validConfig)
    assert.ok(Array.isArray(result.warnings), 'warnings should be an array')
  })
})

// ---------------------------------------------------------------------------
// deepValidateConfig — missing required fields
// ---------------------------------------------------------------------------

describe('deepValidateConfig — missing required fields', () => {
  it('should error when version is missing', () => {
    const config = withOverride((c) => {
      delete c.version
    })
    const result = deepValidateConfig(config)
    assert.equal(result.valid, false)
    assert.ok(
      result.errors.some((e) => e.path === 'version'),
      'should have a version error',
    )
  })

  it('should error when project is missing', () => {
    const config = withOverride((c) => {
      delete c.project
    })
    const result = deepValidateConfig(config)
    assert.equal(result.valid, false)
    assert.ok(
      result.errors.some((e) => e.path === 'project'),
      'should have a project error',
    )
  })

  it('should error when sources is missing', () => {
    const config = withOverride((c) => {
      delete c.sources
    })
    const result = deepValidateConfig(config)
    assert.equal(result.valid, false)
    assert.ok(
      result.errors.some((e) => e.path === 'sources'),
      'should have a sources error',
    )
  })

  it('should accept config without project.testDir (optional)', () => {
    const config = withOverride((c) => {
      delete c.project.testDir
    })
    const result = deepValidateConfig(config)
    const testDirErrors = result.errors.filter((e) => e.path === 'project.testDir')
    assert.equal(testDirErrors.length, 0, 'missing testDir should be valid (optional)')
  })

  it('should produce multiple errors for empty config object', () => {
    const result = deepValidateConfig({})
    assert.equal(result.valid, false)
    assert.ok(result.errors.length >= 3, 'empty config should have at least 3 errors')
    const paths = result.errors.map((e) => e.path)
    assert.ok(paths.includes('version'), 'should report missing version')
    assert.ok(paths.includes('project'), 'should report missing project')
    assert.ok(paths.includes('sources'), 'should report missing sources')
  })
})

// ---------------------------------------------------------------------------
// deepValidateConfig — wrong types
// ---------------------------------------------------------------------------

describe('deepValidateConfig — type violations', () => {
  it('should error when version is a number instead of string', () => {
    const config = withOverride((c) => {
      c.version = 210
    })
    const result = deepValidateConfig(config)
    assert.equal(result.valid, false)
    assert.ok(
      result.errors.some((e) => e.path === 'version' && e.message.includes('type')),
      'should report type error for version',
    )
  })

  it('should error when project is a string instead of object', () => {
    const config = withOverride((c) => {
      c.project = 'not-an-object'
    })
    const result = deepValidateConfig(config)
    assert.equal(result.valid, false)
    assert.ok(
      result.errors.some((e) => e.path === 'project' && e.message.includes('object')),
      'should report type error for project',
    )
  })

  it('should error when sources.jira.enabled is a string', () => {
    const config = withOverride((c) => {
      c.sources.jira.enabled = 'true'
    })
    const result = deepValidateConfig(config)
    assert.equal(result.valid, false)
    assert.ok(
      result.errors.some((e) => e.path === 'sources.jira.enabled' && e.message.includes('boolean')),
      'should report type error for sources.jira.enabled',
    )
  })

  it('should error when preferences.testMultiplier is a string', () => {
    const config = withOverride((c) => {
      c.preferences.testMultiplier = 'five'
    })
    const result = deepValidateConfig(config)
    assert.equal(result.valid, false)
    assert.ok(
      result.errors.some(
        (e) => e.path === 'preferences.testMultiplier' && e.message.includes('number'),
      ),
      'should report type error for testMultiplier',
    )
  })

  it('should error when preferences.locatorPriority is a string instead of array', () => {
    const config = withOverride((c) => {
      c.preferences.locatorPriority = 'getByTestId'
    })
    const result = deepValidateConfig(config)
    assert.equal(result.valid, false)
    assert.ok(
      result.errors.some(
        (e) => e.path === 'preferences.locatorPriority' && e.message.includes('array'),
      ),
      'should report type error for locatorPriority',
    )
  })
})

// ---------------------------------------------------------------------------
// deepValidateConfig — enum violations
// ---------------------------------------------------------------------------

describe('deepValidateConfig — enum violations', () => {
  it('should error for invalid e2e.framework value', () => {
    const config = withOverride((c) => {
      c.e2e.framework = 'selenium'
    })
    const result = deepValidateConfig(config)
    assert.equal(result.valid, false)
    assert.ok(
      result.errors.some((e) => e.path === 'e2e.framework' && e.message.includes('one of')),
      'should report enum error for e2e.framework',
    )
  })

  it('should error for invalid outputs.testCases.format value', () => {
    const config = withOverride((c) => {
      c.outputs.testCases.format = 'json'
    })
    const result = deepValidateConfig(config)
    assert.equal(result.valid, false)
    assert.ok(
      result.errors.some(
        (e) => e.path === 'outputs.testCases.format' && e.message.includes('one of'),
      ),
      'should report enum error for testCases format',
    )
  })

  it('should error for invalid outputs.automation.framework value', () => {
    const config = withOverride((c) => {
      c.outputs.automation.framework = 'jest'
    })
    const result = deepValidateConfig(config)
    assert.equal(result.valid, false)
    assert.ok(
      result.errors.some(
        (e) => e.path === 'outputs.automation.framework' && e.message.includes('one of'),
      ),
      'should report enum error for automation framework',
    )
  })

  it('should error for invalid locatorPriority items', () => {
    const config = withOverride((c) => {
      c.preferences.locatorPriority = ['getByTestId', 'getByXPath']
    })
    const result = deepValidateConfig(config)
    assert.equal(result.valid, false)
    assert.ok(
      result.errors.some(
        (e) => e.path === 'preferences.locatorPriority[1]' && e.message.includes('one of'),
      ),
      'should report enum error for invalid locator item',
    )
  })
})

// ---------------------------------------------------------------------------
// deepValidateConfig — pattern violations
// ---------------------------------------------------------------------------

describe('deepValidateConfig — pattern violations', () => {
  it('should error for invalid semver in version', () => {
    const config = withOverride((c) => {
      c.version = 'v2.1'
    })
    const result = deepValidateConfig(config)
    assert.equal(result.valid, false)
    assert.ok(
      result.errors.some((e) => e.path === 'version' && e.message.includes('pattern')),
      'should report pattern error for version',
    )
  })

  it('should error for version with prefix', () => {
    const config = withOverride((c) => {
      c.version = 'v2.1.0'
    })
    const result = deepValidateConfig(config)
    assert.equal(result.valid, false)
    assert.ok(
      result.errors.some((e) => e.path === 'version'),
      'should reject version with "v" prefix',
    )
  })

  it('should error for invalid Jira project key', () => {
    const config = withOverride((c) => {
      c.sources.jira.projectKey = 'lowercase'
    })
    const result = deepValidateConfig(config)
    assert.equal(result.valid, false)
    assert.ok(
      result.errors.some(
        (e) => e.path === 'sources.jira.projectKey' && e.message.includes('pattern'),
      ),
      'should report pattern error for jira projectKey',
    )
  })

  it('should error for Jira key starting with a digit', () => {
    const config = withOverride((c) => {
      c.sources.jira.projectKey = '1PROJ'
    })
    const result = deepValidateConfig(config)
    assert.equal(result.valid, false)
    assert.ok(
      result.errors.some((e) => e.path === 'sources.jira.projectKey'),
      'should reject Jira key starting with digit',
    )
  })

  it('should error for invalid Confluence space key', () => {
    const config = withOverride((c) => {
      c.sources.confluence.spaceKey = 'bad key!'
    })
    const result = deepValidateConfig(config)
    assert.equal(result.valid, false)
    assert.ok(
      result.errors.some(
        (e) => e.path === 'sources.confluence.spaceKey' && e.message.includes('pattern'),
      ),
      'should report pattern error for confluence spaceKey',
    )
  })
})

// ---------------------------------------------------------------------------
// deepValidateConfig — number range violations
// ---------------------------------------------------------------------------

describe('deepValidateConfig — number range violations', () => {
  it('should error when testMultiplier is 0 (below min)', () => {
    const config = withOverride((c) => {
      c.preferences.testMultiplier = 0
    })
    const result = deepValidateConfig(config)
    assert.equal(result.valid, false)
    assert.ok(
      result.errors.some(
        (e) => e.path === 'preferences.testMultiplier' && e.message.includes('>= 1'),
      ),
      'should report min range error',
    )
  })

  it('should error when testMultiplier is 25 (above max)', () => {
    const config = withOverride((c) => {
      c.preferences.testMultiplier = 25
    })
    const result = deepValidateConfig(config)
    assert.equal(result.valid, false)
    assert.ok(
      result.errors.some(
        (e) => e.path === 'preferences.testMultiplier' && e.message.includes('<= 20'),
      ),
      'should report max range error',
    )
  })

  it('should accept testMultiplier at boundary (1)', () => {
    const config = withOverride((c) => {
      c.preferences.testMultiplier = 1
    })
    const result = deepValidateConfig(config)
    const multiplierErrors = result.errors.filter((e) => e.path === 'preferences.testMultiplier')
    assert.equal(multiplierErrors.length, 0, 'testMultiplier 1 should be valid')
  })

  it('should accept testMultiplier at boundary (20)', () => {
    const config = withOverride((c) => {
      c.preferences.testMultiplier = 20
    })
    const result = deepValidateConfig(config)
    const multiplierErrors = result.errors.filter((e) => e.path === 'preferences.testMultiplier')
    assert.equal(multiplierErrors.length, 0, 'testMultiplier 20 should be valid')
  })
})

// ---------------------------------------------------------------------------
// deepValidateConfig — conditional validation
// ---------------------------------------------------------------------------

describe('deepValidateConfig — conditional validation', () => {
  it('should error when tms provider=testrail but projectId is null', () => {
    const config = withOverride((c) => {
      c.outputs.tms = { provider: 'testrail', testrail: { projectId: null, suiteId: null } }
    })
    const result = deepValidateConfig(config)
    assert.equal(result.valid, false)
    assert.ok(
      result.errors.some(
        (e) => e.path === 'outputs.tms.testrail.projectId' && e.message.includes('required'),
      ),
      'should require projectId when tms provider is testrail',
    )
  })

  it('should error when tms provider=testrail but suiteId is null', () => {
    const config = withOverride((c) => {
      c.outputs.tms = { provider: 'testrail', testrail: { projectId: 1, suiteId: null } }
    })
    const result = deepValidateConfig(config)
    assert.equal(result.valid, false)
    assert.ok(
      result.errors.some(
        (e) => e.path === 'outputs.tms.testrail.suiteId' && e.message.includes('required'),
      ),
      'should require suiteId when tms provider is testrail',
    )
  })

  it('should not error for null IDs when tms provider is null', () => {
    const config = withOverride((c) => {
      c.outputs.tms = { provider: null }
    })
    const result = deepValidateConfig(config)
    const tmsErrors = result.errors.filter((e) => e.path.startsWith('outputs.tms'))
    assert.equal(tmsErrors.length, 0, 'null IDs should be fine when provider is null')
  })

  it('should pass when tms provider=testrail with valid projectId and suiteId', () => {
    const config = withOverride((c) => {
      c.outputs.tms = { provider: 'testrail', testrail: { projectId: 42, suiteId: 7 } }
    })
    const result = deepValidateConfig(config)
    const tmsErrors = result.errors.filter((e) => e.path.startsWith('outputs.tms'))
    assert.equal(tmsErrors.length, 0, 'valid testrail tms config should pass')
  })

  it('should error when tms provider=qase but projectCode is missing', () => {
    const config = withOverride((c) => {
      c.outputs.tms = { provider: 'qase', qase: { projectCode: null } }
    })
    const result = deepValidateConfig(config)
    assert.equal(result.valid, false)
    assert.ok(
      result.errors.some(
        (e) => e.path === 'outputs.tms.qase.projectCode' && e.message.includes('required'),
      ),
      'should require projectCode when tms provider is qase',
    )
  })

  it('should pass when tms provider=qase with valid projectCode', () => {
    const config = withOverride((c) => {
      c.outputs.tms = { provider: 'qase', qase: { projectCode: 'PROJ' } }
    })
    const result = deepValidateConfig(config)
    const qaseErrors = result.errors.filter((e) => e.path.startsWith('outputs.tms.qase'))
    assert.equal(qaseErrors.length, 0, 'valid qase config should pass')
  })

  it('should pass when tms provider=local', () => {
    const config = withOverride((c) => {
      c.outputs.tms = { provider: 'local' }
    })
    const result = deepValidateConfig(config)
    const localErrors = result.errors.filter((e) => e.path.startsWith('outputs.tms'))
    assert.equal(localErrors.length, 0, 'local provider should pass with no extra requirements')
  })

  it('should error for invalid tms provider enum value', () => {
    const config = withOverride((c) => {
      c.outputs.tms = { provider: 'zephyr' }
    })
    const result = deepValidateConfig(config)
    assert.equal(result.valid, false)
    assert.ok(
      result.errors.some((e) => e.path === 'outputs.tms.provider' && e.message.includes('one of')),
      'should reject invalid tms provider value',
    )
  })

  it('should error when jira export enabled but no projectKey', () => {
    const config = withOverride((c) => {
      c.outputs.jira.enabled = true
      c.sources.jira.projectKey = null
    })
    const result = deepValidateConfig(config)
    assert.equal(result.valid, false)
    assert.ok(
      result.errors.some(
        (e) => e.path === 'sources.jira.projectKey' && e.message.includes('required'),
      ),
      'should require jira projectKey when export is enabled',
    )
  })
})

// ---------------------------------------------------------------------------
// deepValidateConfig — warnings
// ---------------------------------------------------------------------------

describe('deepValidateConfig — warnings', () => {
  it('should warn when testDir is non-standard', () => {
    const config = withOverride((c) => {
      c.project.testDir = 'integration'
    })
    const result = deepValidateConfig(config)
    assert.ok(
      result.warnings.some((w) => w.path === 'project.testDir' && w.message.includes('common')),
      'should warn about non-standard testDir',
    )
  })

  it('should not warn when testDir is a common name', () => {
    const config = withOverride((c) => {
      c.project.testDir = 'e2e'
    })
    const result = deepValidateConfig(config)
    const testDirWarnings = result.warnings.filter((w) => w.path === 'project.testDir')
    assert.equal(testDirWarnings.length, 0, 'common testDir should not produce warnings')
  })

  it('should warn when locatorPriority does not start with getByTestId', () => {
    const config = withOverride((c) => {
      c.preferences.locatorPriority = ['getByRole', 'getByTestId']
    })
    const result = deepValidateConfig(config)
    assert.ok(
      result.warnings.some(
        (w) => w.path === 'preferences.locatorPriority' && w.message.includes('getByTestId'),
      ),
      'should warn about locator priority',
    )
  })

  it('should not warn when locatorPriority starts with getByTestId', () => {
    const result = deepValidateConfig(validConfig)
    const locatorWarnings = result.warnings.filter((w) => w.path === 'preferences.locatorPriority')
    assert.equal(locatorWarnings.length, 0, 'correct locator order should not warn')
  })

  it('should warn when testMultiplier exceeds 10', () => {
    const config = withOverride((c) => {
      c.preferences.testMultiplier = 15
    })
    const result = deepValidateConfig(config)
    assert.ok(
      result.warnings.some(
        (w) => w.path === 'preferences.testMultiplier' && w.message.includes('excessive'),
      ),
      'should warn about high testMultiplier',
    )
  })

  it('should not warn when testMultiplier is 10 or below', () => {
    const config = withOverride((c) => {
      c.preferences.testMultiplier = 10
    })
    const result = deepValidateConfig(config)
    const multiplierWarnings = result.warnings.filter(
      (w) => w.path === 'preferences.testMultiplier',
    )
    assert.equal(multiplierWarnings.length, 0, 'testMultiplier 10 should not warn')
  })
})

// ---------------------------------------------------------------------------
// preferences.checkpointLevel
// ---------------------------------------------------------------------------

describe('preferences.checkpointLevel', () => {
  it('should accept "full" as a valid checkpointLevel', () => {
    const config = withOverride((c) => {
      c.preferences.checkpointLevel = 'full'
    })
    const result = deepValidateConfig(config)
    const levelErrors = result.errors.filter((e) => e.path === 'preferences.checkpointLevel')
    assert.equal(levelErrors.length, 0, '"full" should be valid')
  })

  it('should accept "standard" as a valid checkpointLevel', () => {
    const config = withOverride((c) => {
      c.preferences.checkpointLevel = 'standard'
    })
    const result = deepValidateConfig(config)
    const levelErrors = result.errors.filter((e) => e.path === 'preferences.checkpointLevel')
    assert.equal(levelErrors.length, 0, '"standard" should be valid')
  })

  it('should accept "fast" as a valid checkpointLevel', () => {
    const config = withOverride((c) => {
      c.preferences.checkpointLevel = 'fast'
    })
    const result = deepValidateConfig(config)
    const levelErrors = result.errors.filter((e) => e.path === 'preferences.checkpointLevel')
    assert.equal(levelErrors.length, 0, '"fast" should be valid')
  })

  it('should reject invalid checkpointLevel value', () => {
    const config = withOverride((c) => {
      c.preferences.checkpointLevel = 'turbo'
    })
    const result = deepValidateConfig(config)
    assert.equal(result.valid, false)
    assert.ok(
      result.errors.some(
        (e) => e.path === 'preferences.checkpointLevel' && e.message.includes('one of'),
      ),
      'should report enum error for invalid checkpointLevel',
    )
  })

  it('should accept config without checkpointLevel (optional)', () => {
    const config = withOverride((c) => {
      delete c.preferences.checkpointLevel
    })
    const result = deepValidateConfig(config)
    const levelErrors = result.errors.filter((e) => e.path === 'preferences.checkpointLevel')
    assert.equal(levelErrors.length, 0, 'missing checkpointLevel should be valid')
  })
})

// ---------------------------------------------------------------------------
// preferences.smokeVerify
// ---------------------------------------------------------------------------

describe('preferences.smokeVerify', () => {
  it('should accept "list" as a valid smokeVerify', () => {
    const config = withOverride((c) => {
      c.preferences.smokeVerify = 'list'
    })
    const result = deepValidateConfig(config)
    const errors = result.errors.filter((e) => e.path === 'preferences.smokeVerify')
    assert.equal(errors.length, 0, '"list" should be valid')
  })

  it('should accept "typecheck" as a valid smokeVerify', () => {
    const config = withOverride((c) => {
      c.preferences.smokeVerify = 'typecheck'
    })
    const result = deepValidateConfig(config)
    const errors = result.errors.filter((e) => e.path === 'preferences.smokeVerify')
    assert.equal(errors.length, 0, '"typecheck" should be valid')
  })

  it('should accept "run-subset" as a valid smokeVerify', () => {
    const config = withOverride((c) => {
      c.preferences.smokeVerify = 'run-subset'
    })
    const result = deepValidateConfig(config)
    const errors = result.errors.filter((e) => e.path === 'preferences.smokeVerify')
    assert.equal(errors.length, 0, '"run-subset" should be valid')
  })

  it('should reject invalid smokeVerify value', () => {
    const config = withOverride((c) => {
      c.preferences.smokeVerify = 'full-run'
    })
    const result = deepValidateConfig(config)
    assert.equal(result.valid, false)
    assert.ok(
      result.errors.some(
        (e) => e.path === 'preferences.smokeVerify' && e.message.includes('one of'),
      ),
      'should report enum error for invalid smokeVerify',
    )
  })

  it('should accept config without smokeVerify (optional)', () => {
    const config = withOverride((c) => {
      delete c.preferences.smokeVerify
    })
    const result = deepValidateConfig(config)
    const errors = result.errors.filter((e) => e.path === 'preferences.smokeVerify')
    assert.equal(errors.length, 0, 'missing smokeVerify should be valid')
  })
})

// ---------------------------------------------------------------------------
// validateField — individual field validation
// ---------------------------------------------------------------------------

describe('validateField', () => {
  it('should validate a valid string field', () => {
    const result = validateField('hello', { type: 'string', required: true }, 'test')
    assert.equal(result.errors.length, 0)
  })

  it('should error for required undefined field', () => {
    const result = validateField(undefined, { type: 'string', required: true }, 'test')
    assert.equal(result.errors.length, 1)
    assert.ok(result.errors[0].message.includes('required'))
  })

  it('should pass for optional undefined field', () => {
    const result = validateField(undefined, { type: 'string', required: false }, 'test')
    assert.equal(result.errors.length, 0)
  })

  it('should validate number min/max', () => {
    const schema = { type: 'number', required: true, min: 1, max: 10 }
    assert.equal(validateField(5, schema, 'n').errors.length, 0, 'in range')
    assert.equal(validateField(0, schema, 'n').errors.length, 1, 'below min')
    assert.equal(validateField(11, schema, 'n').errors.length, 1, 'above max')
  })

  it('should validate string minLength', () => {
    const schema = { type: 'string', required: true, minLength: 3 }
    assert.equal(validateField('abc', schema, 's').errors.length, 0, 'exact length')
    assert.equal(validateField('ab', schema, 's').errors.length, 1, 'too short')
  })

  it('should validate string maxLength', () => {
    const schema = { type: 'string', required: true, maxLength: 5 }
    assert.equal(validateField('hello', schema, 's').errors.length, 0, 'exact length')
    assert.equal(validateField('toolong', schema, 's').errors.length, 1, 'too long')
  })

  it('should validate string pattern', () => {
    const schema = { type: 'string', required: true, pattern: /^[A-Z]+$/ }
    assert.equal(validateField('ABC', schema, 's').errors.length, 0, 'matches')
    assert.equal(validateField('abc', schema, 's').errors.length, 1, 'no match')
  })

  it('should validate enum values', () => {
    const schema = { type: 'string', required: true, enum: ['a', 'b', 'c'] }
    assert.equal(validateField('a', schema, 'e').errors.length, 0, 'valid enum')
    assert.equal(validateField('d', schema, 'e').errors.length, 1, 'invalid enum')
  })

  it('should accept null for nullable fields', () => {
    const result = validateField(null, { type: 'string', nullable: true }, 'test')
    assert.equal(result.errors.length, 0, 'null should be accepted for nullable')
  })

  it('should reject null for non-nullable fields', () => {
    const result = validateField(null, { type: 'string', required: true }, 'test')
    assert.equal(result.errors.length, 1, 'null should be rejected for non-nullable')
    assert.ok(result.errors[0].message.includes('null'))
  })

  it('should validate custom validator functions', () => {
    const schema = {
      type: 'string',
      required: true,
      custom: (v) => (v.includes(' ') ? 'must not contain spaces' : null),
    }
    assert.equal(validateField('nospace', schema, 's').errors.length, 0, 'no spaces')
    assert.equal(validateField('has space', schema, 's').errors.length, 1, 'has spaces')
  })

  it('should reject Infinity as a number', () => {
    const schema = { type: 'number', required: true }
    const result = validateField(Number.POSITIVE_INFINITY, schema, 'n')
    assert.equal(result.errors.length, 1)
    assert.ok(result.errors[0].message.includes('finite'))
  })
})

// ---------------------------------------------------------------------------
// Nested object validation
// ---------------------------------------------------------------------------

describe('deepValidateConfig — nested object validation', () => {
  it('should validate nested boolean (sources.jira.enabled)', () => {
    const config = withOverride((c) => {
      c.sources.jira.enabled = 1
    })
    const result = deepValidateConfig(config)
    assert.equal(result.valid, false)
    assert.ok(
      result.errors.some((e) => e.path === 'sources.jira.enabled'),
      'should report type error for nested boolean',
    )
  })

  it('should reject project as an array', () => {
    const config = withOverride((c) => {
      c.project = [1, 2, 3]
    })
    const result = deepValidateConfig(config)
    assert.equal(result.valid, false)
    assert.ok(
      result.errors.some((e) => e.path === 'project' && e.message.includes('object')),
      'should reject array where object expected',
    )
  })
})

// ---------------------------------------------------------------------------
// Array validation
// ---------------------------------------------------------------------------

describe('deepValidateConfig — array validation', () => {
  it('should validate all items in locatorPriority', () => {
    const config = withOverride((c) => {
      c.preferences.locatorPriority = ['getByTestId', 'invalid', 'getByRole']
    })
    const result = deepValidateConfig(config)
    assert.equal(result.valid, false)
    assert.ok(
      result.errors.some((e) => e.path === 'preferences.locatorPriority[1]'),
      'should report error for invalid array item at index 1',
    )
  })

  it('should accept valid locator items', () => {
    const config = withOverride((c) => {
      c.preferences.locatorPriority = [
        'getByTestId',
        'getByRole',
        'getByLabel',
        'getByText',
        'getByPlaceholder',
        'getByAltText',
      ]
    })
    const result = deepValidateConfig(config)
    const locatorErrors = result.errors.filter((e) =>
      e.path.startsWith('preferences.locatorPriority'),
    )
    assert.equal(locatorErrors.length, 0, 'all valid locators should pass')
  })

  it('should accept empty locatorPriority array', () => {
    const config = withOverride((c) => {
      c.preferences.locatorPriority = []
    })
    const result = deepValidateConfig(config)
    const locatorErrors = result.errors.filter((e) =>
      e.path.startsWith('preferences.locatorPriority'),
    )
    assert.equal(locatorErrors.length, 0, 'empty array should be valid')
  })
})

// ---------------------------------------------------------------------------
// itemType validation (simple type gate for string[] fields)
// ---------------------------------------------------------------------------

describe('validateField — itemType validation', () => {
  const stringArraySchema = { type: 'array', required: false, itemType: 'string' }

  it('should accept an array of valid strings', () => {
    const result = validateField(['vue', 'react', 'angular'], stringArraySchema, 'deps')
    assert.equal(result.errors.length, 0)
  })

  it('should accept an empty array', () => {
    const result = validateField([], stringArraySchema, 'deps')
    assert.equal(result.errors.length, 0)
  })

  it('should reject a number item in a string array', () => {
    const result = validateField(['vue', 42], stringArraySchema, 'deps')
    assert.equal(result.errors.length, 1)
    assert.equal(result.errors[0].path, 'deps[1]')
    assert.ok(result.errors[0].message.includes('string'))
    assert.ok(result.errors[0].message.includes('number'))
  })

  it('should reject a boolean item in a string array', () => {
    const result = validateField(['vue', true], stringArraySchema, 'deps')
    assert.equal(result.errors.length, 1)
    assert.equal(result.errors[0].path, 'deps[1]')
    assert.ok(result.errors[0].message.includes('boolean'))
  })

  it('should reject a null item with a clear error message', () => {
    const result = validateField(['vue', null], stringArraySchema, 'deps')
    assert.equal(result.errors.length, 1)
    assert.equal(result.errors[0].path, 'deps[1]')
    assert.ok(result.errors[0].message.includes('null'), 'message should say null, not object')
    assert.equal(result.errors[0].value, null)
  })

  it('should reject an undefined item with a clear error message', () => {
    // eslint-disable-next-line no-sparse-arrays
    const result = validateField(['vue', undefined], stringArraySchema, 'deps')
    assert.equal(result.errors.length, 1)
    assert.equal(result.errors[0].path, 'deps[1]')
    assert.ok(result.errors[0].message.includes('undefined'))
  })

  it('should report errors for multiple invalid items', () => {
    const result = validateField([42, 'ok', null, true], stringArraySchema, 'deps')
    assert.equal(result.errors.length, 3, 'should flag items at index 0, 2, 3')
    const paths = result.errors.map((e) => e.path)
    assert.ok(paths.includes('deps[0]'))
    assert.ok(paths.includes('deps[2]'))
    assert.ok(paths.includes('deps[3]'))
  })
})

describe('deepValidateConfig — itemType on real config fields', () => {
  it('should accept valid string arrays in project.componentFileExtensions', () => {
    const config = withOverride((c) => {
      c.project.componentFileExtensions = ['.vue', '.tsx']
    })
    const result = deepValidateConfig(config)
    const extErrors = result.errors.filter((e) =>
      e.path.startsWith('project.componentFileExtensions'),
    )
    assert.equal(extErrors.length, 0, 'valid string arrays should pass')
  })
})

// ---------------------------------------------------------------------------
// Null acceptance
// ---------------------------------------------------------------------------

describe('deepValidateConfig — null value handling', () => {
  it('should accept null for sources.jira.projectKey', () => {
    const config = withOverride((c) => {
      c.sources.jira.projectKey = null
      c.outputs.jira.enabled = false // disable export to isolate schema check
    })
    const result = deepValidateConfig(config)
    const keyErrors = result.errors.filter((e) => e.path === 'sources.jira.projectKey')
    assert.equal(keyErrors.length, 0, 'null projectKey should be accepted')
  })

  it('should accept null for sources.confluence.spaceKey', () => {
    const config = withOverride((c) => {
      c.sources.confluence.spaceKey = null
    })
    const result = deepValidateConfig(config)
    const keyErrors = result.errors.filter((e) => e.path === 'sources.confluence.spaceKey')
    assert.equal(keyErrors.length, 0, 'null spaceKey should be accepted')
  })

  it('should accept null for e2e.framework', () => {
    const config = withOverride((c) => {
      c.e2e.framework = null
    })
    const result = deepValidateConfig(config)
    const fwErrors = result.errors.filter((e) => e.path === 'e2e.framework')
    assert.equal(fwErrors.length, 0, 'null framework should be accepted')
  })

  it('should accept null for e2e.configFile', () => {
    const config = withOverride((c) => {
      c.e2e.configFile = null
    })
    const result = deepValidateConfig(config)
    const cfErrors = result.errors.filter((e) => e.path === 'e2e.configFile')
    assert.equal(cfErrors.length, 0, 'null configFile should be accepted')
  })

  it('should accept config without project.componentFileExtensions (optional)', () => {
    const config = withOverride((c) => {
      delete c.project.componentFileExtensions
    })
    const result = deepValidateConfig(config)
    const extErrors = result.errors.filter((e) => e.path === 'project.componentFileExtensions')
    assert.equal(extErrors.length, 0, 'missing componentFileExtensions should be accepted')
  })
})

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('deepValidateConfig — edge cases', () => {
  it('should reject null config', () => {
    const result = deepValidateConfig(null)
    assert.equal(result.valid, false)
    assert.ok(result.errors.length > 0, 'null config should produce errors')
  })

  it('should reject array config', () => {
    const result = deepValidateConfig([])
    assert.equal(result.valid, false)
    assert.ok(result.errors.length > 0, 'array config should produce errors')
  })

  it('should reject string config', () => {
    const result = deepValidateConfig('not a config')
    assert.equal(result.valid, false)
  })

  it('should error for testDir with leading slash', () => {
    const config = withOverride((c) => {
      c.project.testDir = '/e2e'
    })
    const result = deepValidateConfig(config)
    assert.equal(result.valid, false)
    assert.ok(
      result.errors.some((e) => e.path === 'project.testDir' && e.message.includes('relative')),
      'should reject absolute testDir path',
    )
  })

  it('should include value in error objects', () => {
    const config = withOverride((c) => {
      c.version = 42
    })
    const result = deepValidateConfig(config)
    const versionError = result.errors.find((e) => e.path === 'version')
    assert.ok(versionError, 'should have version error')
    assert.equal(versionError.value, 42, 'error should include the invalid value')
  })
})

// ---------------------------------------------------------------------------
// Hint property on validation errors
// ---------------------------------------------------------------------------

describe('deepValidateConfig — hint enrichment', () => {
  it('should add hint containing "Add the" for missing required field', () => {
    const config = withOverride((c) => {
      delete c.version
    })
    const result = deepValidateConfig(config)
    const versionError = result.errors.find((e) => e.path === 'version')
    assert.ok(versionError, 'should have a version error')
    assert.ok(
      versionError.hint?.includes('Add the'),
      `hint should contain "Add the", got "${versionError.hint}"`,
    )
  })

  it('should add hint containing "Change the value" for wrong type', () => {
    const config = withOverride((c) => {
      c.version = 42
    })
    const result = deepValidateConfig(config)
    const versionError = result.errors.find((e) => e.path === 'version')
    assert.ok(versionError, 'should have a version error')
    assert.ok(
      versionError.hint?.includes('Change the value'),
      `hint should contain "Change the value", got "${versionError.hint}"`,
    )
  })

  it('should add hint containing "Check valid values" for invalid enum value', () => {
    const config = withOverride((c) => {
      c.e2e.framework = 'selenium'
    })
    const result = deepValidateConfig(config)
    const enumError = result.errors.find((e) => e.path === 'e2e.framework')
    assert.ok(enumError, 'should have an enum error')
    assert.ok(
      enumError.hint?.includes('Check valid values'),
      `hint should contain "Check valid values", got "${enumError.hint}"`,
    )
  })

  it('should produce string hints (not undefined) for known error patterns', () => {
    const config = withOverride((c) => {
      delete c.version
      c.project.testDir = 42
      c.e2e.framework = 'selenium'
    })
    const result = deepValidateConfig(config)
    for (const err of result.errors) {
      if (err.hint !== undefined) {
        assert.equal(typeof err.hint, 'string', `hint for "${err.path}" should be a string`)
        assert.ok(err.hint.length > 0, `hint for "${err.path}" should be non-empty`)
      }
    }
  })
})

// ---------------------------------------------------------------------------
// inputs.tms conditional validation
// ---------------------------------------------------------------------------

describe('deepValidateConfig — inputs.tms conditional validation', () => {
  it('should accept inputs.tms.provider: null', () => {
    const config = withOverride((c) => {
      c.inputs = { tms: { provider: null } }
    })
    const result = deepValidateConfig(config)
    const inputErrors = result.errors.filter((e) => e.path.startsWith('inputs'))
    assert.equal(inputErrors.length, 0, 'null provider should be valid')
  })

  it('should error when inputs.tms.provider=testrail but projectId missing', () => {
    const config = withOverride((c) => {
      c.inputs = { tms: { provider: 'testrail', testrail: { suiteId: 1 } } }
    })
    const result = deepValidateConfig(config)
    assert.ok(
      result.errors.some(
        (e) => e.path === 'inputs.tms.testrail.projectId' && e.message.includes('required'),
      ),
      'should require projectId when inputs tms provider is testrail',
    )
  })

  it('should error when inputs.tms.provider=testrail but suiteId missing', () => {
    const config = withOverride((c) => {
      c.inputs = { tms: { provider: 'testrail', testrail: { projectId: 1 } } }
    })
    const result = deepValidateConfig(config)
    assert.ok(
      result.errors.some(
        (e) => e.path === 'inputs.tms.testrail.suiteId' && e.message.includes('required'),
      ),
      'should require suiteId when inputs tms provider is testrail',
    )
  })

  it('should pass with valid inputs.tms testrail config', () => {
    const config = withOverride((c) => {
      c.inputs = { tms: { provider: 'testrail', testrail: { projectId: 1, suiteId: 42 } } }
    })
    const result = deepValidateConfig(config)
    const inputErrors = result.errors.filter((e) => e.path.startsWith('inputs'))
    assert.equal(inputErrors.length, 0, 'valid testrail inputs config should pass')
  })

  it('should error when inputs.tms.provider=qase but projectCode missing', () => {
    const config = withOverride((c) => {
      c.inputs = { tms: { provider: 'qase', qase: { projectCode: null } } }
    })
    const result = deepValidateConfig(config)
    assert.ok(
      result.errors.some(
        (e) => e.path === 'inputs.tms.qase.projectCode' && e.message.includes('required'),
      ),
      'should require projectCode when inputs tms provider is qase',
    )
  })

  it('should pass with valid inputs.tms qase config', () => {
    const config = withOverride((c) => {
      c.inputs = { tms: { provider: 'qase', qase: { projectCode: 'PROJ' } } }
    })
    const result = deepValidateConfig(config)
    const qaseErrors = result.errors.filter((e) => e.path.startsWith('inputs.tms.qase'))
    assert.equal(qaseErrors.length, 0, 'valid qase inputs config should pass')
  })

  it('should reject invalid inputs.tms.provider value', () => {
    const config = withOverride((c) => {
      c.inputs = { tms: { provider: 'github' } }
    })
    const result = deepValidateConfig(config)
    assert.ok(
      result.errors.some((e) => e.path === 'inputs.tms.provider' && e.message.includes('one of')),
      'should reject invalid inputs tms provider',
    )
  })

  it('should accept config without inputs key at all', () => {
    const result = deepValidateConfig(validConfig)
    const inputWarnings = result.warnings.filter((w) => w.path === 'inputs')
    assert.equal(inputWarnings.length, 0, 'missing inputs should not produce warnings')
  })

  it('should accept valid testrail config with optional sectionId', () => {
    const config = withOverride((c) => {
      c.inputs = {
        tms: { provider: 'testrail', testrail: { projectId: 1, suiteId: 42, sectionId: 101 } },
      }
    })
    const result = deepValidateConfig(config)
    const inputErrors = result.errors.filter((e) => e.path.startsWith('inputs'))
    assert.equal(inputErrors.length, 0, 'valid sectionId should pass')
  })

  it('should error when inputs.tms.testrail.sectionId is 0', () => {
    const config = withOverride((c) => {
      c.inputs = {
        tms: { provider: 'testrail', testrail: { projectId: 1, suiteId: 42, sectionId: 0 } },
      }
    })
    const result = deepValidateConfig(config)
    assert.ok(
      result.errors.some((e) => e.path === 'inputs.tms.testrail.sectionId'),
      'sectionId 0 should fail min:1 validation',
    )
  })

  it('should reject lowercase projectCode in inputs.tms.qase', () => {
    const config = withOverride((c) => {
      c.inputs = { tms: { provider: 'qase', qase: { projectCode: 'proj' } } }
    })
    const result = deepValidateConfig(config)
    assert.ok(
      result.errors.some(
        (e) => e.path === 'inputs.tms.qase.projectCode' && e.message.includes('pattern'),
      ),
      'should reject lowercase projectCode',
    )
  })

  it('should reject projectCode with special chars in inputs.tms.qase', () => {
    const config = withOverride((c) => {
      c.inputs = { tms: { provider: 'qase', qase: { projectCode: 'PROJ#1' } } }
    })
    const result = deepValidateConfig(config)
    assert.ok(
      result.errors.some((e) => e.path === 'inputs.tms.qase.projectCode'),
      'should reject projectCode with special chars',
    )
  })

  it('should accept valid qase config with optional suiteId', () => {
    const config = withOverride((c) => {
      c.inputs = { tms: { provider: 'qase', qase: { projectCode: 'PROJ', suiteId: 10 } } }
    })
    const result = deepValidateConfig(config)
    const qaseErrors = result.errors.filter((e) => e.path.startsWith('inputs.tms.qase'))
    assert.equal(qaseErrors.length, 0, 'valid qase config with suiteId should pass')
  })

  it('should allow both inputs.tms and outputs.tms with different providers', () => {
    const config = withOverride((c) => {
      c.inputs = { tms: { provider: 'testrail', testrail: { projectId: 1, suiteId: 42 } } }
      c.outputs.tms = { provider: 'qase', qase: { projectCode: 'PROJ' } }
    })
    const result = deepValidateConfig(config)
    const inputErrors = result.errors.filter((e) => e.path.startsWith('inputs'))
    const outputTmsErrors = result.errors.filter((e) => e.path.startsWith('outputs.tms'))
    assert.equal(inputErrors.length, 0, 'inputs should be valid')
    assert.equal(outputTmsErrors.length, 0, 'outputs.tms should be valid')
  })
})

// ---------------------------------------------------------------------------
// getLocatorsForFramework
// ---------------------------------------------------------------------------

describe('getLocatorsForFramework', () => {
  it('should return Playwright locators by default', () => {
    const locators = getLocatorsForFramework()
    assert.ok(locators.includes('getByTestId'), 'should include getByTestId')
    assert.ok(!locators.includes('cy.get'), 'should not include cy.get')
  })

  it('should return Playwright locators for playwright framework', () => {
    const locators = getLocatorsForFramework('playwright')
    assert.ok(locators.includes('getByTestId'), 'should include getByTestId')
    assert.ok(!locators.includes('cy.get'), 'should not include cy.get')
  })

  it('should return Cypress locators for cypress framework', () => {
    const locators = getLocatorsForFramework('cypress')
    assert.ok(locators.includes('cy.get'), 'should include cy.get')
    assert.ok(locators.includes('cy.findByTestId'), 'should include cy.findByTestId')
    assert.ok(locators.includes('cy.findByRole'), 'should include cy.findByRole')
    assert.ok(locators.includes('cy.findByLabelText'), 'should include cy.findByLabelText')
    assert.ok(locators.includes('cy.findByText'), 'should include cy.findByText')
    assert.ok(locators.includes('cy.contains'), 'should include cy.contains')
  })

  it('should not return Playwright locators for cypress', () => {
    const locators = getLocatorsForFramework('cypress')
    assert.ok(!locators.includes('getByTestId'), 'should not include getByTestId')
  })

  it('should return Playwright locators for null framework', () => {
    const locators = getLocatorsForFramework(null)
    assert.ok(locators.includes('getByTestId'), 'should include getByTestId')
  })
})

// ---------------------------------------------------------------------------
// deepValidateConfig — Cypress framework support
// ---------------------------------------------------------------------------

describe('deepValidateConfig — Cypress framework support', () => {
  it('should accept cypress as valid e2e.framework', () => {
    const config = withOverride((c) => {
      c.e2e.framework = 'cypress'
    })
    const result = deepValidateConfig(config)
    const fwErrors = result.errors.filter((e) => e.path === 'e2e.framework')
    assert.equal(fwErrors.length, 0, 'cypress should be a valid e2e.framework')
  })

  it('should accept cypress as valid outputs.automation.framework', () => {
    const config = withOverride((c) => {
      c.outputs.automation.framework = 'cypress'
    })
    const result = deepValidateConfig(config)
    const fwErrors = result.errors.filter((e) => e.path === 'outputs.automation.framework')
    assert.equal(fwErrors.length, 0, 'cypress should be a valid outputs.automation.framework')
  })

  it('should accept Cypress locators when framework is cypress', () => {
    const config = withOverride((c) => {
      c.e2e.framework = 'cypress'
      c.preferences.locatorPriority = ['cy.findByTestId', 'cy.findByRole']
    })
    const result = deepValidateConfig(config)
    assert.equal(result.valid, true, `unexpected errors: ${JSON.stringify(result.errors)}`)
  })

  it('should reject Playwright locators when framework is cypress', () => {
    const config = withOverride((c) => {
      c.e2e.framework = 'cypress'
      c.preferences.locatorPriority = ['getByTestId', 'getByRole']
    })
    const result = deepValidateConfig(config)
    assert.equal(result.valid, false)
    assert.ok(
      result.errors.some(
        (e) => e.path.startsWith('preferences.locatorPriority') && e.message.includes('cypress'),
      ),
      'should have locator errors mentioning "cypress"',
    )
  })

  it('should reject Cypress locators when framework is playwright', () => {
    const config = withOverride((c) => {
      c.e2e.framework = 'playwright'
      c.preferences.locatorPriority = ['cy.findByTestId']
    })
    const result = deepValidateConfig(config)
    assert.equal(result.valid, false)
  })

  it('should not warn when Cypress locatorPriority starts with cy.findByTestId', () => {
    const config = withOverride((c) => {
      c.e2e.framework = 'cypress'
      c.preferences.locatorPriority = ['cy.findByTestId', 'cy.findByRole']
    })
    const result = deepValidateConfig(config)
    const locatorWarnings = result.warnings.filter((w) => w.path === 'preferences.locatorPriority')
    assert.equal(locatorWarnings.length, 0, 'correct Cypress locator order should not warn')
  })

  it('should warn when Cypress locatorPriority does not start with cy.findByTestId', () => {
    const config = withOverride((c) => {
      c.e2e.framework = 'cypress'
      c.preferences.locatorPriority = ['cy.findByRole', 'cy.findByTestId']
    })
    const result = deepValidateConfig(config)
    assert.ok(
      result.warnings.some(
        (w) => w.path === 'preferences.locatorPriority' && w.message.includes('cy.findByTestId'),
      ),
      'should warn about locator priority recommending cy.findByTestId first',
    )
  })
})
