// bin/lib/config.mjs — Config generation + migration

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
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

    // Only stamp the package version if at least one migration actually ran;
    // avoids overwriting the version when config is already current.
    if (iterations > 0) config.version = VERSION
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
 * Build the viewports config object from gathered values.
 */
function buildViewportsConfig(gathered) {
  return {
    enabled: gathered.viewportsEnabled ?? false,
    presets: gathered.viewportPresets ?? [],
    custom: [],
  }
}

/**
 * Build the locator priority list based on framework.
 */
function buildLocatorPriority(framework) {
  return framework === 'cypress'
    ? ['cy.findByTestId', 'cy.findByRole', 'cy.findByLabelText', 'cy.findByText']
    : ['getByTestId', 'getByRole', 'getByLabel', 'getByText']
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
  if (gathered.tmsProvider === 'zephyr') {
    tms.zephyr = {
      projectKey: gathered.zephyrProjectKey ?? null,
      folderId: gathered.zephyrFolderId ?? null,
    }
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
      locatorPriority: buildLocatorPriority(e2eConfig.framework),
      testMultiplier: 5,
      checkpointLevel: 'full',
      maxClarifications: 2,
      modelTier: gathered.modelTier || 'premium',
      batchApproval: gathered.batchApproval ?? false,
    },
    viewports: buildViewportsConfig(gathered),
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

// ---------------------------------------------------------------------------
// Workspace Config Resolution
// ---------------------------------------------------------------------------

/**
 * Deep-merge two plain objects. Target (workspace) wins on key conflicts.
 * Arrays are replaced (not concatenated). `workspaces` key is always omitted
 * from the result — it is root-only.
 *
 * @param {object} base - Root config object
 * @param {object} override - Workspace override object (wins on conflicts)
 * @returns {object} Merged config without `workspaces`
 */
function deepMerge(base, override) {
  const result = {}

  const allKeys = new Set([...Object.keys(base), ...Object.keys(override)])
  for (const key of allKeys) {
    if (key === 'workspaces') continue // workspaces is root-only — never merge down

    const baseVal = base[key]
    const overrideVal = override[key]

    if (overrideVal === undefined) {
      result[key] = baseVal
    } else if (baseVal === undefined) {
      result[key] = overrideVal
    } else if (
      overrideVal !== null &&
      typeof overrideVal === 'object' &&
      !Array.isArray(overrideVal) &&
      baseVal !== null &&
      typeof baseVal === 'object' &&
      !Array.isArray(baseVal)
    ) {
      result[key] = deepMerge(baseVal, overrideVal)
    } else {
      result[key] = overrideVal
    }
  }

  return result
}

/**
 * Adjust root config `paths` to point into the workspace directory when no
 * workspace-level config file exists. Sets `project.sourceRoot` to
 * `{workspacePath}/src` (unless root already scoped it there) and leaves
 * other paths alone so callers can override as needed.
 *
 * @param {object} config - Root config (not mutated)
 * @param {string} workspacePath - Relative path from repo root (e.g., "packages/web")
 * @returns {object} Adjusted config
 */
function adjustPathsForWorkspace(config, workspacePath) {
  const adjusted = deepMerge(config, {})

  // Only adjust sourceRoot when it is still the generic default ('src')
  const currentSourceRoot = config.project?.sourceRoot ?? 'src'
  if (currentSourceRoot === 'src') {
    adjusted.project = {
      ...(adjusted.project ?? {}),
      sourceRoot: `${workspacePath}/src`,
    }
  }

  return adjusted
}

/**
 * Resolve the effective config for a given workspace path.
 *
 * Resolution order:
 * 1. If `{workspacePath}/sparq.config.json` exists, deep-merge root config
 *    with workspace override (workspace wins on conflicts).
 * 2. Otherwise return root config with `paths.sourceRoot` adjusted to the
 *    workspace directory (when still at the generic 'src' default).
 *
 * The `workspaces` array is always stripped from the result — it is a
 * root-only concern and sub-configs must not inherit it.
 *
 * @param {object} rootConfig - Parsed root sparq.config.json
 * @param {string} workspacePath - Relative path to the workspace from repo root (e.g., "packages/web")
 * @returns {object} Effective config for the workspace
 */
export function resolveWorkspaceConfig(rootConfig, workspacePath) {
  const wsConfigPath = join(workspacePath, 'sparq.config.json')

  if (existsSync(wsConfigPath)) {
    let wsConfig = {}
    try {
      wsConfig = JSON.parse(readFileSync(wsConfigPath, 'utf-8'))
    } catch {
      warn(`Could not parse workspace config at ${wsConfigPath} — using root config`)
      return adjustPathsForWorkspace(rootConfig, workspacePath)
    }
    return deepMerge(rootConfig, wsConfig)
  }

  return adjustPathsForWorkspace(rootConfig, workspacePath)
}
