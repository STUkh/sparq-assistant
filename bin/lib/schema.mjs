// bin/lib/schema.mjs — Deep config schema validation for sparq.config.json

// ---------------------------------------------------------------------------
// Type Helpers
// ---------------------------------------------------------------------------

const SEMVER_PATTERN = /^\d+\.\d+\.\d+$/
const JIRA_KEY_PATTERN = /^[A-Z][A-Z0-9_-]*$/
const CONFLUENCE_KEY_PATTERN = /^[A-Z][A-Z0-9_-]*$/

const VALID_FRAMEWORKS = ['playwright', 'cypress', 'webdriverio', 'none', null]
const VALID_TEST_CASE_FORMATS = ['markdown', 'xml', 'both']
const VALID_AUTOMATION_FRAMEWORKS = ['playwright', 'cypress']
const VALID_LOCATORS = [
  'getByTestId',
  'getByRole',
  'getByLabel',
  'getByText',
  'getByPlaceholder',
  'getByAltText',
]
const VALID_CYPRESS_LOCATORS = [
  'cy.get',
  'cy.findByTestId',
  'cy.findByRole',
  'cy.findByLabelText',
  'cy.findByText',
  'cy.contains',
]
const COMMON_TEST_DIRS = ['e2e', 'tests', 'test', 'specs', 'cypress']

export function getLocatorsForFramework(framework) {
  if (framework === 'cypress') return VALID_CYPRESS_LOCATORS
  return VALID_LOCATORS
}

// ---------------------------------------------------------------------------
// Schema Definition
// ---------------------------------------------------------------------------

/**
 * Declarative schema definition for sparq.config.json.
 * Each leaf describes type, constraints, and validation rules.
 */
export const CONFIG_SCHEMA = {
  version: {
    type: 'string',
    required: true,
    pattern: SEMVER_PATTERN,
    patternDescription: 'semantic version (e.g., "1.0.0")',
  },
  project: {
    type: 'object',
    required: true,
    properties: {
      testDir: {
        type: 'string',
        required: false,
        minLength: 1,
        custom: (value) => {
          if (typeof value === 'string' && (value.startsWith('/') || value.startsWith('\\'))) {
            return 'must be a relative path (no leading path separators)'
          }
          if (typeof value === 'string' && value.includes('..')) {
            return 'must not contain ".." (path traversal not allowed)'
          }
          return null
        },
      },
      sourceRoot: {
        type: 'string',
        required: false,
      },
      routeDiscoveryPattern: {
        type: 'string',
        required: false,
      },
      componentFileExtensions: {
        type: 'array',
        required: false,
        itemType: 'string',
      },
    },
  },
  inputs: {
    type: 'object',
    required: false,
    properties: {
      tms: {
        type: 'object',
        required: false,
        properties: {
          provider: {
            type: 'string',
            required: false,
            nullable: true,
            enum: ['testrail', 'qase', null],
          },
          testrail: {
            type: 'object',
            required: false,
            properties: {
              projectId: { type: 'number', required: false, nullable: true, min: 1 },
              suiteId: { type: 'number', required: false, nullable: true, min: 1 },
              sectionId: { type: 'number', required: false, nullable: true, min: 1 },
            },
          },
          qase: {
            type: 'object',
            required: false,
            properties: {
              projectCode: {
                type: 'string',
                required: false,
                nullable: true,
                pattern: /^[A-Z][A-Z0-9_-]*$/,
                patternDescription:
                  'uppercase letters/digits/hyphens starting with a letter (e.g., "PROJ")',
              },
              suiteId: { type: 'number', required: false, nullable: true, min: 1 },
            },
          },
        },
      },
    },
  },
  sources: {
    type: 'object',
    required: true,
    properties: {
      jira: {
        type: 'object',
        required: false,
        properties: {
          enabled: {
            type: 'boolean',
            required: false,
          },
          projectKey: {
            type: 'string',
            required: false,
            nullable: true,
            pattern: JIRA_KEY_PATTERN,
            patternDescription:
              'uppercase letters/digits/hyphens starting with a letter (e.g., "EP")',
          },
        },
      },
      confluence: {
        type: 'object',
        required: false,
        properties: {
          enabled: {
            type: 'boolean',
            required: false,
          },
          spaceKey: {
            type: 'string',
            required: false,
            nullable: true,
            pattern: CONFLUENCE_KEY_PATTERN,
            patternDescription:
              'uppercase letters/digits/hyphens starting with a letter (e.g., "TEAM")',
          },
        },
      },
      figma: {
        type: 'object',
        required: false,
        properties: {
          enabled: {
            type: 'boolean',
            required: false,
          },
        },
      },
      local: {
        type: 'object',
        required: false,
        properties: {
          enabled: {
            type: 'boolean',
            required: false,
          },
          requirementsDir: {
            type: 'string',
            required: false,
          },
        },
      },
    },
  },
  e2e: {
    type: 'object',
    required: false,
    properties: {
      detected: {
        type: 'boolean',
        required: false,
      },
      framework: {
        type: 'string',
        required: false,
        nullable: true,
        enum: VALID_FRAMEWORKS,
      },
      configFile: {
        type: 'string',
        required: false,
        nullable: true,
      },
      structure: {
        type: 'object',
        required: false,
        properties: {
          pages: { type: 'string', required: false, nullable: true },
          components: { type: 'string', required: false, nullable: true },
          steps: { type: 'string', required: false, nullable: true },
          fixtures: { type: 'string', required: false, nullable: true },
          specs: { type: 'string', required: false, nullable: true },
        },
      },
      hasAbstractPage: { type: 'boolean', required: false },
      baseClass: { type: 'string', required: false, nullable: true },
      hasFixtureIndex: { type: 'boolean', required: false },
      fixtureIndex: { type: 'string', required: false, nullable: true },
    },
  },
  outputs: {
    type: 'object',
    required: false,
    properties: {
      testCases: {
        type: 'object',
        required: false,
        properties: {
          format: {
            type: 'string',
            required: false,
            enum: VALID_TEST_CASE_FORMATS,
          },
          outputDir: {
            type: 'string',
            required: false,
          },
        },
      },
      automation: {
        type: 'object',
        required: false,
        properties: {
          framework: {
            type: 'string',
            required: false,
            enum: VALID_AUTOMATION_FRAMEWORKS,
          },
        },
      },
      tms: {
        type: 'object',
        required: false,
        properties: {
          provider: {
            type: 'string',
            required: false,
            nullable: true,
            enum: ['testrail', 'qase', 'local', null],
          },
          testrail: {
            type: 'object',
            required: false,
            properties: {
              projectId: {
                type: 'number',
                required: false,
                nullable: true,
                min: 1,
              },
              suiteId: {
                type: 'number',
                required: false,
                nullable: true,
                min: 1,
              },
            },
          },
          qase: {
            type: 'object',
            required: false,
            properties: {
              projectCode: {
                type: 'string',
                required: false,
                nullable: true,
                pattern: /^[A-Z][A-Z0-9_-]*$/,
                patternDescription:
                  'uppercase letters/digits/hyphens starting with a letter (e.g., "PROJ")',
              },
            },
          },
          local: {
            type: 'object',
            required: false,
            properties: {
              outputDir: {
                type: 'string',
                required: false,
              },
              format: {
                type: 'string',
                required: false,
                enum: ['json', 'markdown'],
              },
            },
          },
        },
      },
      jira: {
        type: 'object',
        required: false,
        properties: {
          enabled: {
            type: 'boolean',
            required: false,
          },
          createSubTask: {
            type: 'boolean',
            required: false,
          },
        },
      },
      confluence: {
        type: 'object',
        required: false,
        properties: {
          enabled: {
            type: 'boolean',
            required: false,
          },
          spaceKey: {
            type: 'string',
            required: false,
            nullable: true,
            pattern: CONFLUENCE_KEY_PATTERN,
            patternDescription:
              'uppercase letters/digits/hyphens starting with a letter (e.g., "TEAM")',
          },
          parentPageTitle: {
            type: 'string',
            required: false,
            nullable: true,
          },
        },
      },
    },
  },
  refresh: {
    type: 'object',
    required: false,
    properties: {
      preserveDeprecated: { type: 'boolean', required: false },
      autoApplyLowSeverity: { type: 'boolean', required: false },
    },
  },
  preferences: {
    type: 'object',
    required: false,
    properties: {
      interactiveMode: {
        type: 'boolean',
        required: false,
      },
      locatorPriority: {
        type: 'array',
        required: false,
        items: {
          type: 'string',
          enum: [...VALID_LOCATORS, ...VALID_CYPRESS_LOCATORS],
        },
      },
      testMultiplier: {
        type: 'number',
        required: false,
        min: 1,
        max: 20,
      },
      checkpointLevel: {
        type: 'string',
        required: false,
        enum: ['full', 'standard', 'fast'],
      },
      smokeVerify: {
        type: 'string',
        required: false,
        enum: ['list', 'typecheck', 'run-subset'],
      },
      maxClarifications: {
        type: 'number',
        required: false,
        min: 1,
        max: 5,
      },
      modelTier: {
        type: 'string',
        required: false,
        enum: ['premium', 'balanced', 'economy'],
      },
    },
  },
}

// ---------------------------------------------------------------------------
// Field Validation — Sub-validators
// ---------------------------------------------------------------------------

/**
 * Check type conformance. Returns a type error entry or null.
 */
function checkType(value, schema, path) {
  if (schema.type === 'array' && !Array.isArray(value)) {
    return { path, message: `must be an array, got ${typeof value}`, value }
  }
  if (schema.type === 'object') {
    const actual = Array.isArray(value) ? 'array' : typeof value
    if (typeof value !== 'object' || Array.isArray(value)) {
      return { path, message: `must be an object, got ${actual}`, value }
    }
  }
  if (schema.type !== 'array' && schema.type !== 'object' && typeof value !== schema.type) {
    return { path, message: `must be of type ${schema.type}, got ${typeof value}`, value }
  }
  return null
}

/**
 * Validate string-specific constraints (minLength, maxLength, pattern).
 */
function checkStringConstraints(value, schema, path, errors) {
  if (schema.minLength !== undefined && value.length < schema.minLength) {
    errors.push({
      path,
      message: `must have at least ${schema.minLength} character(s), got ${value.length}`,
      value,
    })
  }
  if (schema.maxLength !== undefined && value.length > schema.maxLength) {
    errors.push({
      path,
      message: `must have at most ${schema.maxLength} character(s), got ${value.length}`,
      value,
    })
  }
  if (schema.pattern && !schema.pattern.test(value)) {
    const desc = schema.patternDescription || schema.pattern.toString()
    errors.push({ path, message: `must match pattern: ${desc}`, value })
  }
}

/**
 * Validate number-specific constraints (min, max, finite).
 */
function checkNumberConstraints(value, schema, path, errors) {
  if (schema.min !== undefined && value < schema.min) {
    errors.push({ path, message: `must be >= ${schema.min}, got ${value}`, value })
  }
  if (schema.max !== undefined && value > schema.max) {
    errors.push({ path, message: `must be <= ${schema.max}, got ${value}`, value })
  }
  if (!Number.isFinite(value)) {
    errors.push({ path, message: 'must be a finite number', value })
  }
}

/**
 * Validate enum constraint.
 */
function checkEnum(value, schema, path, errors) {
  if (schema.enum === undefined) return
  if (schema.enum.includes(value)) return
  const allowed = schema.enum.map((v) => (v === null ? 'null' : `"${v}"`)).join(', ')
  errors.push({ path, message: `must be one of [${allowed}], got "${value}"`, value })
}

/**
 * Describe the actual type of a value for error messages.
 * Distinguishes null/undefined from typeof results.
 */
function describeType(value) {
  if (value === null) return 'null'
  if (value === undefined) return 'undefined'
  return typeof value
}

/**
 * Validate each element of an array against a simple type string (e.g., 'string').
 * Produces one error per non-conforming element with an accurate type description.
 */
function checkItemType(value, expectedType, path, errors) {
  for (let i = 0; i < value.length; i++) {
    const item = value[i]
    if (item === null || item === undefined || typeof item !== expectedType) {
      errors.push({
        path: `${path}[${i}]`,
        message: `must be of type ${expectedType}, got ${describeType(item)}`,
        value: item,
      })
    }
  }
}

/**
 * Validate array items.
 * Two modes:
 *   - `items` (object): full sub-schema per element — delegates to validateField recursively
 *   - `itemType` (string): lightweight type gate via checkItemType
 */
function checkArrayItems(value, schema, path, errors, warnings) {
  if (schema.type !== 'array') return
  if (schema.items) {
    for (let i = 0; i < value.length; i++) {
      const itemResult = validateField(value[i], schema.items, `${path}[${i}]`)
      errors.push(...itemResult.errors)
      warnings.push(...itemResult.warnings)
    }
  } else if (schema.itemType) {
    checkItemType(value, schema.itemType, path, errors)
  }
}

/**
 * Validate nested object properties recursively.
 */
function checkObjectProperties(value, schema, path, errors, warnings) {
  if (schema.type !== 'object' || !schema.properties) return
  for (const [key, propSchema] of Object.entries(schema.properties)) {
    const propResult = validateField(value[key], propSchema, `${path}.${key}`)
    errors.push(...propResult.errors)
    warnings.push(...propResult.warnings)
  }
}

/**
 * Run custom validator function if present.
 */
function checkCustom(value, schema, path, errors) {
  if (typeof schema.custom !== 'function') return
  const customError = schema.custom(value)
  if (customError) errors.push({ path, message: customError, value })
}

// ---------------------------------------------------------------------------
// Field Validation — Main
// ---------------------------------------------------------------------------

/**
 * Validate a single value against its schema definition.
 *
 * @param {*} value - The value to validate
 * @param {object} schema - The schema definition for this field
 * @param {string} path - Dot-separated path for error messages (e.g., "project.name")
 * @returns {{ errors: Array<{path: string, message: string, value: *}>, warnings: Array<{path: string, message: string, value: *}> }}
 */
export function validateField(value, schema, path) {
  const errors = []
  const warnings = []
  const result = { errors, warnings }

  // Handle null for nullable fields
  if (value === null) {
    if (!schema.nullable) errors.push({ path, message: 'must not be null', value })
    return result
  }

  // Handle undefined / missing
  if (value === undefined) {
    if (schema.required) errors.push({ path, message: 'is required', value })
    return result
  }

  // Type checking — bail early on type mismatch
  const typeError = checkType(value, schema, path)
  if (typeError) {
    errors.push(typeError)
    return result
  }

  // Constraint and recursive checks (delegated to reduce complexity)
  if (schema.type === 'string') checkStringConstraints(value, schema, path, errors)
  if (schema.type === 'number') checkNumberConstraints(value, schema, path, errors)
  checkEnum(value, schema, path, errors)
  checkArrayItems(value, schema, path, errors, warnings)
  checkObjectProperties(value, schema, path, errors, warnings)
  checkCustom(value, schema, path, errors)

  return result
}

// ---------------------------------------------------------------------------
// Hint Enrichment
// ---------------------------------------------------------------------------

/**
 * Enrich validation errors with actionable `.hint` strings based on the
 * error message pattern. Mutates the error objects in place.
 *
 * @param {Array<{path: string, message: string, value: *}>} errors
 * @returns {Array<{path: string, message: string, value: *, hint?: string}>}
 */
const HINT_MATCHERS = [
  ['is required', (err) => `Add the "${err.path.split('.').pop()}" field to sparq.config.json.`],
  [
    'must be of type',
    (err) => {
      const m = err.message.match(/must be (?:of type |a )(\w+)/)
      return m ? `Change the value at "${err.path}" to a ${m[1]}.` : null
    },
  ],
  [
    'must be a',
    (err) => {
      const m = err.message.match(/must be (?:of type |a )(\w+)/)
      return m ? `Change the value at "${err.path}" to a ${m[1]}.` : null
    },
  ],
  ['must be one of', (err) => `Check valid values for "${err.path}" in the config documentation.`],
  ['must match pattern', (err) => `Check the format requirements for "${err.path}".`],
  ['must be >=', (err) => `Adjust the value at "${err.path}" to be within the allowed range.`],
  ['must be <=', (err) => `Adjust the value at "${err.path}" to be within the allowed range.`],
  ['at least', (err) => `Adjust the value at "${err.path}" to be within the allowed range.`],
  ['at most', (err) => `Adjust the value at "${err.path}" to be within the allowed range.`],
]

function addHints(errors) {
  for (const err of errors) {
    for (const [pattern, hintFn] of HINT_MATCHERS) {
      if (err.message.includes(pattern)) {
        err.hint = hintFn(err) || `Check the type of "${err.path}" in sparq.config.json.`
        break
      }
    }
  }
  return errors
}

// ---------------------------------------------------------------------------
// Deep Config Validation
// ---------------------------------------------------------------------------

/**
 * Perform deep validation of a sparq.config.json object against CONFIG_SCHEMA.
 * Goes beyond basic checks — validates types, patterns, ranges, enums,
 * conditional requirements, and produces warnings for non-blocking issues.
 *
 * @param {object} config - The config object to validate
 * @returns {{ valid: boolean, errors: Array<{path: string, message: string, value: *}>, warnings: Array<{path: string, message: string, value: *}> }}
 */
export function deepValidateConfig(config) {
  const errors = []
  const warnings = []

  // Guard: config must be a non-null object
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    errors.push({ path: '(root)', message: 'config must be a non-null object', value: config })
    return { valid: false, errors, warnings }
  }

  // Validate each top-level field against the schema
  for (const [key, fieldSchema] of Object.entries(CONFIG_SCHEMA)) {
    const result = validateField(config[key], fieldSchema, key)
    errors.push(...result.errors)
    warnings.push(...result.warnings)
  }

  // Detect unknown top-level properties
  const knownKeys = new Set(Object.keys(CONFIG_SCHEMA))
  for (const key of Object.keys(config)) {
    if (!knownKeys.has(key)) {
      warnings.push({ path: key, message: `unknown property (not in schema)` })
    }
  }

  // Conditional validations
  validateConditionalRules(config, errors)

  // Advisory warnings
  collectWarnings(config, warnings)

  // Enrich errors with actionable hints
  addHints(errors)

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  }
}

// ---------------------------------------------------------------------------
// Conditional Validation Rules
// ---------------------------------------------------------------------------

/**
 * Validate cross-field dependencies and conditional requirements.
 */
function validateConditionalRules(config, errors) {
  checkTmsConditional(config, errors)
  checkInputTmsConditional(config, errors)
  checkJiraExportConditional(config, errors)
  checkConfluenceExportConditional(config, errors)
  checkLocatorFrameworkConsistency(config, errors)
}

/**
 * TMS: provider-specific fields required when provider is set.
 */
function checkTmsConditional(config, errors) {
  const provider = config.outputs?.tms?.provider
  if (!provider) return

  if (provider === 'testrail') {
    const projectId = config.outputs.tms.testrail?.projectId
    const suiteId = config.outputs.tms.testrail?.suiteId
    if (projectId === null || projectId === undefined) {
      errors.push({
        path: 'outputs.tms.testrail.projectId',
        message: 'is required when TMS provider is "testrail"',
        value: projectId ?? null,
      })
    }
    if (suiteId === null || suiteId === undefined) {
      errors.push({
        path: 'outputs.tms.testrail.suiteId',
        message: 'is required when TMS provider is "testrail"',
        value: suiteId ?? null,
      })
    }
  }

  if (provider === 'qase') {
    const projectCode = config.outputs.tms.qase?.projectCode
    if (!projectCode) {
      errors.push({
        path: 'outputs.tms.qase.projectCode',
        message: 'is required when TMS provider is "qase"',
        value: projectCode ?? null,
      })
    }
  }
  // 'local' provider has no strict requirements — defaults apply
}

/**
 * Input TMS: provider-specific fields required when inputs.tms.provider is set.
 */
function checkInputTmsConditional(config, errors) {
  const provider = config.inputs?.tms?.provider
  if (!provider) return

  if (provider === 'testrail') {
    const projectId = config.inputs.tms.testrail?.projectId
    const suiteId = config.inputs.tms.testrail?.suiteId
    if (projectId === null || projectId === undefined) {
      errors.push({
        path: 'inputs.tms.testrail.projectId',
        message: 'is required when inputs TMS provider is "testrail"',
        value: projectId ?? null,
      })
    }
    if (suiteId === null || suiteId === undefined) {
      errors.push({
        path: 'inputs.tms.testrail.suiteId',
        message: 'is required when inputs TMS provider is "testrail"',
        value: suiteId ?? null,
      })
    }
  }

  if (provider === 'qase') {
    const projectCode = config.inputs.tms.qase?.projectCode
    if (!projectCode) {
      errors.push({
        path: 'inputs.tms.qase.projectCode',
        message: 'is required when inputs TMS provider is "qase"',
        value: projectCode ?? null,
      })
    }
  }
}

/**
 * Jira export: requires sources.jira.projectKey.
 */
function checkJiraExportConditional(config, errors) {
  if (config.outputs?.jira?.enabled !== true) return
  if (!config.sources?.jira?.projectKey) {
    errors.push({
      path: 'sources.jira.projectKey',
      message: 'is required when outputs.jira.enabled is true',
      value: config.sources?.jira?.projectKey ?? null,
    })
  }
}

/**
 * Confluence export: requires a space key from either outputs or sources.
 */
function checkConfluenceExportConditional(config, errors) {
  if (config.outputs?.confluence?.enabled !== true) return
  const outputKey = config.outputs.confluence.spaceKey
  const sourceKey = config.sources?.confluence?.spaceKey
  if (!outputKey && !sourceKey) {
    errors.push({
      path: 'outputs.confluence.spaceKey',
      message:
        'outputs.confluence.spaceKey or sources.confluence.spaceKey is required when Confluence export is enabled',
      value: null,
    })
  }
}

/**
 * Locator/framework consistency: locatorPriority entries must match the active framework.
 */
function checkLocatorFrameworkConsistency(config, errors) {
  const framework = config.e2e?.framework || config.outputs?.automation?.framework
  const priority = config.preferences?.locatorPriority
  if (!Array.isArray(priority) || !framework || framework === 'none') return

  const validSet = framework === 'cypress' ? VALID_CYPRESS_LOCATORS : VALID_LOCATORS
  for (let i = 0; i < priority.length; i++) {
    if (!validSet.includes(priority[i])) {
      errors.push({
        path: `preferences.locatorPriority[${i}]`,
        message: `"${priority[i]}" is not a valid locator for framework "${framework}". Valid: ${validSet.join(', ')}`,
        value: priority[i],
      })
    }
  }
}

// ---------------------------------------------------------------------------
// Warning Collection
// ---------------------------------------------------------------------------

/**
 * Collect non-blocking warnings for config best practices.
 */
function collectWarnings(config, warnings) {
  // Non-standard testDir
  if (
    typeof config.project?.testDir === 'string' &&
    !COMMON_TEST_DIRS.includes(config.project.testDir)
  ) {
    warnings.push({
      path: 'project.testDir',
      message: `"${config.project.testDir}" is not a common test directory name (expected one of: ${COMMON_TEST_DIRS.join(', ')})`,
      value: config.project.testDir,
    })
  }

  // Locator priority best practice: recommended first locator depends on framework
  if (Array.isArray(config.preferences?.locatorPriority)) {
    const priority = config.preferences.locatorPriority
    const framework = config.e2e?.framework || config.outputs?.automation?.framework
    if (priority.length > 0) {
      const isCypress = framework === 'cypress'
      const recommended = isCypress ? 'cy.findByTestId' : 'getByTestId'
      if (priority[0] !== recommended) {
        warnings.push({
          path: 'preferences.locatorPriority',
          message: `${recommended} is recommended as the first locator strategy for reliability`,
          value: priority,
        })
      }
    }
  }

  // High test multiplier
  if (typeof config.preferences?.testMultiplier === 'number') {
    if (config.preferences.testMultiplier > 10) {
      warnings.push({
        path: 'preferences.testMultiplier',
        message: `value ${config.preferences.testMultiplier} may generate excessive tests (recommended: 1-10)`,
        value: config.preferences.testMultiplier,
      })
    }
  }
}
