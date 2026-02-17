// bin/lib/config.mjs — Config generation + migration

import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { MAX_MIGRATION_ITERATIONS, VERSION } from './constants.mjs'
import { toForwardSlash } from './files.mjs'
import { dryRun, info, isDryRun, ok, style, warn } from './state.mjs'
import { validateConfig } from './validate.mjs'

// ---------------------------------------------------------------------------
// Config Version Migrations (#1 fix infinite loop, #2 fix version reset)
// ---------------------------------------------------------------------------

/**
 * Sequential config migrations keyed by source version.
 * Each entry transforms a config from that version to the next.
 */
export const MIGRATIONS = {
  // Fresh start at v1.0.0 — generateConfig() produces the current schema.
  // Add future migrations here as: '1.0.0': { target: '1.1.0', migrate(config) { ... } }
}

/**
 * Migrate a config object through sequential version migrations.
 * Applies all migrations from config.version up to the current package version.
 * Uses a visited-versions Set and max-iterations guard to prevent infinite loops.
 */
export function migrateConfig(config) {
  let currentVersion = config.version || '1.0.0'
  const visited = new Set()
  let iterations = 0
  const originalVersion = config.version

  try {
    while (MIGRATIONS[currentVersion]) {
      if (visited.has(currentVersion)) {
        throw new Error(`Migration cycle detected at version ${currentVersion}`)
      }
      if (iterations >= MAX_MIGRATION_ITERATIONS) {
        throw new Error(`Migration exceeded maximum iterations (${MAX_MIGRATION_ITERATIONS})`)
      }
      visited.add(currentVersion)
      iterations++

      const migration = MIGRATIONS[currentVersion]
      info(`Migrating config from v${currentVersion} to v${migration.target}...`)
      config = migration.migrate(config)
      currentVersion = migration.target
    }

    config.version = VERSION
  } catch (err) {
    config.version = originalVersion
    throw err
  }

  // Validate migrated config
  const validation = validateConfig(config)
  if (!validation.valid) {
    warn('Post-migration validation issues:')
    for (const err of validation.errors) warn(`  ${err}`)
  }

  return config
}

/**
 * Build the outputs.tms config object from gathered values.
 */
function buildTmsConfig(gathered) {
  const tms = { provider: gathered.tmsProvider ?? null }
  if (gathered.tmsProvider === 'testrail') {
    tms.testrail = {
      projectId: gathered.testRailProjectId ?? null,
      suiteId: gathered.testRailSuiteId ?? null,
    }
  }
  if (gathered.tmsProvider === 'qase') {
    tms.qase = { projectCode: gathered.qaseProjectCode ?? null }
  }
  if (gathered.tmsProvider === 'local') {
    tms.local = {
      outputDir: gathered.tmsLocalOutputDir ?? '.sparq/tms-export',
      format: gathered.tmsLocalFormat ?? 'json',
    }
  }
  return tms
}

/**
 * Generate sparq.config.json from gathered values.
 */
export function generateConfig(targetDir, gathered, e2eConfig, techStack) {
  const configPath = join(targetDir, 'sparq.config.json')

  // Default to Playwright when no E2E framework detected
  if (!e2eConfig.detected && !e2eConfig.framework) {
    e2eConfig.framework = 'playwright'
    info('No E2E framework detected. Defaulting to Playwright.')
  }

  const config = {
    version: VERSION,
    project: {
      testDir: gathered.testDir,
      sourceRoot: techStack.sourceRoot || 'src',
      routeDiscoveryPattern: techStack.routeDiscoveryPattern || '**/route*/**/*.ts',
      componentFileExtensions: techStack.componentFileExtensions,
    },
    sources: {
      jira: {
        enabled: gathered.jiraEnabled,
        projectKey: gathered.jiraKey || null,
      },
      confluence: {
        enabled: gathered.confluenceEnabled,
        spaceKey: gathered.confluenceSpace || null,
      },
      figma: {
        enabled: gathered.figmaEnabled,
      },
      local: {
        enabled: gathered.localEnabled,
        requirementsDir: 'docs/specs',
      },
    },
    e2e: e2eConfig,
    outputs: {
      testCases: {
        format: 'both',
        outputDir: '.sparq/test-cases',
      },
      automation: {
        framework: e2eConfig.framework || 'playwright',
      },
      tms: buildTmsConfig(gathered),
      jira: {
        enabled: gathered.jiraExportEnabled,
        createSubTask: false,
      },
      confluence: {
        enabled: gathered.confluenceExportEnabled,
        spaceKey: null,
        parentPageTitle: null,
      },
    },
    preferences: {
      interactiveMode: true,
      locatorPriority:
        e2eConfig.framework === 'cypress'
          ? ['cy.findByTestId', 'cy.findByRole', 'cy.findByLabelText', 'cy.findByText']
          : ['getByTestId', 'getByRole', 'getByLabel', 'getByText'],
      testMultiplier: 5,
      checkpointLevel: 'full',
      maxClarifications: 2,
      modelTier: gathered.modelTier || 'premium',
    },
  }

  dryRun(
    () => writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf-8'),
    `write sparq.config.json to ${toForwardSlash(configPath)}`,
  )

  if (isDryRun()) {
    info('Generated config preview:')
    console.log(`\n${style.dim(JSON.stringify(config, null, 2))}\n`)
  }

  ok('sparq.config.json created')

  const validation = validateConfig(config)
  if (validation.valid) {
    ok('Config schema validation passed')
  } else {
    warn('Config schema validation found issues:')
    for (const err of validation.errors) warn(`  ${err}`)
  }

  return config
}
