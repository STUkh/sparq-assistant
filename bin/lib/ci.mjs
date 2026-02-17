// bin/lib/ci.mjs — CI workflow template generation

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ensureDir, toForwardSlash } from './files.mjs'
import { dryRun, info, warn } from './state.mjs'

// ---------------------------------------------------------------------------
// CI Provider Registry
// ---------------------------------------------------------------------------

export const CI_PROVIDERS = {
  github: { name: 'GitHub Actions', outputPath: '.github/workflows/e2e.yml' },
  gitlab: { name: 'GitLab CI', outputPath: '.gitlab-ci.yml' },
  azure: { name: 'Azure Pipelines', outputPath: 'azure-pipelines-e2e.yml' },
}

// ---------------------------------------------------------------------------
// GitHub Actions Workflow Builder
// ---------------------------------------------------------------------------

/**
 * Build a GitHub Actions workflow YAML string for running Playwright E2E tests.
 * @param {object} options
 * @param {string} [options.testDir='e2e'] - E2E test directory
 * @param {string} [options.configFile='playwright.config.ts'] - Playwright config file
 * @param {number} [options.nodeVersion=22] - Node.js version for CI
 * @returns {string} YAML workflow content
 */
export function buildGitHubWorkflow(options = {}) {
  const { testDir = 'e2e', configFile = 'playwright.config.ts', nodeVersion = 22 } = options

  // Using template literal for the YAML to keep it readable and maintainable.
  // Each line is carefully indented to produce valid GitHub Actions YAML.
  return `name: E2E Tests (SparQ Generated)

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  e2e-tests:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '${nodeVersion}'
          cache: npm

      - run: npm ci

      - name: Install Playwright browsers
        run: npx playwright install --with-deps chromium

      - name: Run E2E tests
        run: npx playwright test --config=${configFile}

      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-results
          path: ${testDir === 'e2e' ? 'test-results/' : `${testDir}/test-results/`}
          retention-days: 7

      - name: Upload Playwright report
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 7
`
}

// ---------------------------------------------------------------------------
// GitLab CI Builder
// ---------------------------------------------------------------------------

/**
 * Build a GitLab CI YAML string for running Playwright E2E tests.
 */
export function buildGitLabCi(options = {}) {
  const { testDir = 'e2e', configFile = 'playwright.config.ts', nodeVersion = 22 } = options

  return `stages:
  - test

e2e-tests:
  stage: test
  image: node:${nodeVersion}
  timeout: 30m
  before_script:
    - npm ci
    - npx playwright install --with-deps chromium
  script:
    - npx playwright test --config=${configFile}
  artifacts:
    when: always
    paths:
      - ${testDir === 'e2e' ? 'test-results/' : `${testDir}/test-results/`}
      - playwright-report/
    expire_in: 7 days
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
    - if: $CI_COMMIT_BRANCH == "main"
    - if: $CI_COMMIT_BRANCH == "develop"
`
}

// ---------------------------------------------------------------------------
// Azure Pipelines Builder
// ---------------------------------------------------------------------------

/**
 * Build an Azure Pipelines YAML string for running Playwright E2E tests.
 */
export function buildAzurePipeline(options = {}) {
  const { testDir = 'e2e', configFile = 'playwright.config.ts', nodeVersion = 22 } = options

  return `trigger:
  branches:
    include:
      - main
      - develop

pr:
  branches:
    include:
      - main

pool:
  vmImage: 'ubuntu-latest'

steps:
  - task: NodeTool@0
    inputs:
      versionSpec: '${nodeVersion}'
    displayName: 'Use Node.js ${nodeVersion}'

  - script: npm ci
    displayName: 'Install dependencies'

  - script: npx playwright install --with-deps chromium
    displayName: 'Install Playwright browsers'

  - script: npx playwright test --config=${configFile}
    displayName: 'Run E2E tests'

  - task: PublishTestResults@2
    condition: always()
    inputs:
      testResultsFormat: 'JUnit'
      testResultsFiles: '${testDir === 'e2e' ? 'test-results/' : `${testDir}/test-results/`}**/*.xml'
    displayName: 'Publish test results'

  - publish: playwright-report/
    artifact: playwright-report
    condition: failed()
    displayName: 'Upload Playwright report'
`
}

// ---------------------------------------------------------------------------
// Provider → Builder Map
// ---------------------------------------------------------------------------

const CI_BUILDERS = {
  github: buildGitHubWorkflow,
  gitlab: buildGitLabCi,
  azure: buildAzurePipeline,
}

// ---------------------------------------------------------------------------
// Config Reader
// ---------------------------------------------------------------------------

/**
 * Read sparq.config.json from the target directory and extract CI-relevant defaults.
 * Returns an object with testDir and configFile, or empty object if config is unavailable.
 */
function readSparqConfig(targetDir) {
  const configPath = join(targetDir, 'sparq.config.json')
  if (!existsSync(configPath)) return {}

  try {
    const raw = readFileSync(configPath, 'utf-8')
    const config = JSON.parse(raw)
    const defaults = {}

    if (config.project?.testDir || config.e2e?.testDir) {
      defaults.testDir = config.project?.testDir || config.e2e?.testDir
    }
    if (config.e2e?.configFile) {
      defaults.configFile = config.e2e.configFile
    }

    return defaults
  } catch {
    return {}
  }
}

// ---------------------------------------------------------------------------
// Main Generator
// ---------------------------------------------------------------------------

/**
 * Generate a CI workflow template file in the target directory.
 * @param {string} targetDir - Project root directory
 * @param {object} [options={}]
 * @param {string} [options.provider='github'] - CI provider key
 * @param {string} [options.testDir] - E2E test directory
 * @param {string} [options.configFile] - Playwright config file
 * @returns {{ created: boolean, path?: string, reason?: string }}
 */
export function generateCiTemplate(targetDir, options = {}) {
  const { provider = 'github' } = options

  // Validate provider
  const providerConfig = CI_PROVIDERS[provider]
  if (!providerConfig) {
    return { created: false, reason: `Unsupported CI provider: ${provider}` }
  }

  const builder = CI_BUILDERS[provider]
  if (!builder) {
    return { created: false, reason: `No builder available for ${providerConfig.name}` }
  }

  // Resolve defaults: explicit options > sparq.config.json > built-in defaults
  const configDefaults = readSparqConfig(targetDir)
  const testDir = options.testDir || configDefaults.testDir || 'e2e'
  const configFile = options.configFile || configDefaults.configFile || 'playwright.config.ts'

  const outputPath = join(targetDir, providerConfig.outputPath)
  const displayPath = toForwardSlash(providerConfig.outputPath)

  // Do not overwrite existing workflow files
  if (existsSync(outputPath)) {
    warn(`CI workflow already exists: ${displayPath} (skipped)`)
    return { created: false, reason: `File already exists: ${displayPath}` }
  }

  // Build workflow content
  const content = builder({ testDir, configFile })

  // Ensure parent directories exist (only for nested paths like .github/workflows/)
  const pathSegments = providerConfig.outputPath.split('/')
  if (pathSegments.length > 1) {
    const parentDir = join(targetDir, ...pathSegments.slice(0, -1))
    if (!ensureDir(parentDir)) {
      return {
        created: false,
        reason: `Cannot create directory: ${toForwardSlash(pathSegments.slice(0, -1).join('/'))}`,
      }
    }
  }

  // Write the workflow file
  dryRun(() => writeFileSync(outputPath, content, 'utf-8'), `write CI workflow to ${displayPath}`)
  info(`Created CI workflow: ${displayPath}`)

  return { created: true, path: providerConfig.outputPath }
}
