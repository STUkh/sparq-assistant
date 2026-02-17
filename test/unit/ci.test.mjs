import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'
import {
  buildAzurePipeline,
  buildGitHubWorkflow,
  buildGitLabCi,
  CI_PROVIDERS,
  generateCiTemplate,
} from '../../bin/lib/ci.mjs'
import { setDryRun } from '../../bin/lib/state.mjs'
import { cleanTempDir, createTempDir } from '../helpers/setup.mjs'

describe('CI workflow generation', () => {
  let tempDir

  beforeEach(() => {
    tempDir = createTempDir()
  })

  afterEach(() => {
    setDryRun(false)
    cleanTempDir(tempDir)
  })

  // -------------------------------------------------------------------------
  // CI_PROVIDERS
  // -------------------------------------------------------------------------

  describe('CI_PROVIDERS', () => {
    it('should have github, gitlab, and azure providers', () => {
      assert.ok('github' in CI_PROVIDERS, 'Should have github provider')
      assert.ok('gitlab' in CI_PROVIDERS, 'Should have gitlab provider')
      assert.ok('azure' in CI_PROVIDERS, 'Should have azure provider')
    })

    it('should have correct output paths for each provider', () => {
      assert.equal(
        CI_PROVIDERS.github.outputPath,
        '.github/workflows/e2e.yml',
        'GitHub Actions path should be .github/workflows/e2e.yml',
      )
      assert.equal(
        CI_PROVIDERS.gitlab.outputPath,
        '.gitlab-ci.yml',
        'GitLab CI path should be .gitlab-ci.yml',
      )
      assert.equal(
        CI_PROVIDERS.azure.outputPath,
        'azure-pipelines-e2e.yml',
        'Azure Pipelines path should be azure-pipelines-e2e.yml',
      )
    })

    it('should have human-readable name for each provider', () => {
      assert.equal(CI_PROVIDERS.github.name, 'GitHub Actions')
      assert.equal(CI_PROVIDERS.gitlab.name, 'GitLab CI')
      assert.equal(CI_PROVIDERS.azure.name, 'Azure Pipelines')
    })
  })

  // -------------------------------------------------------------------------
  // buildGitHubWorkflow
  // -------------------------------------------------------------------------

  describe('buildGitHubWorkflow', () => {
    it('should return a valid YAML string with correct structure', () => {
      const yaml = buildGitHubWorkflow()
      assert.equal(typeof yaml, 'string', 'Should return a string')
      assert.ok(
        yaml.startsWith('name: E2E Tests (SparQ Generated)'),
        'Should start with the workflow name',
      )
      assert.ok(yaml.includes('on:'), 'Should contain trigger section')
      assert.ok(yaml.includes('jobs:'), 'Should contain jobs section')
      assert.ok(yaml.includes('e2e-tests:'), 'Should contain e2e-tests job')
    })

    it('should contain all required steps', () => {
      const yaml = buildGitHubWorkflow()
      assert.ok(yaml.includes('actions/checkout@v4'), 'Should include checkout step')
      assert.ok(yaml.includes('actions/setup-node@v4'), 'Should include setup-node step')
      assert.ok(yaml.includes('npm ci'), 'Should include npm ci step')
      assert.ok(
        yaml.includes('npx playwright install --with-deps chromium'),
        'Should include Playwright browser install step',
      )
      assert.ok(yaml.includes('npx playwright test'), 'Should include Playwright test step')
      assert.ok(yaml.includes('actions/upload-artifact@v4'), 'Should include upload-artifact step')
    })

    it('should upload test results always and report on failure only', () => {
      const yaml = buildGitHubWorkflow()
      // The "Upload test results" step uses if: always()
      assert.ok(yaml.includes('if: always()'), 'Should upload test results always')
      // The "Upload Playwright report" step uses if: failure()
      assert.ok(yaml.includes('if: failure()'), 'Should upload report on failure only')
    })

    it('should use default values when no options provided', () => {
      const yaml = buildGitHubWorkflow()
      assert.ok(yaml.includes("node-version: '22'"), 'Should default to Node.js 22')
      assert.ok(
        yaml.includes('--config=playwright.config.ts'),
        'Should default to playwright.config.ts',
      )
    })

    it('should use custom testDir and configFile', () => {
      const yaml = buildGitHubWorkflow({
        testDir: 'tests/e2e',
        configFile: 'e2e.config.ts',
      })
      assert.ok(yaml.includes('--config=e2e.config.ts'), 'Should use custom config file')
      assert.ok(
        yaml.includes('tests/e2e/test-results/'),
        'Should use custom test directory for results path',
      )
    })

    it('should use custom nodeVersion', () => {
      const yaml = buildGitHubWorkflow({ nodeVersion: 20 })
      assert.ok(yaml.includes("node-version: '20'"), 'Should use custom Node.js version')
    })

    it('should include trigger configuration for push and pull_request', () => {
      const yaml = buildGitHubWorkflow()
      assert.ok(yaml.includes('push:'), 'Should trigger on push')
      assert.ok(yaml.includes('pull_request:'), 'Should trigger on pull_request')
      assert.ok(yaml.includes('branches: [main, develop]'), 'Push should target main and develop')
      assert.ok(yaml.includes('branches: [main]'), 'PR should target main')
    })

    it('should set timeout-minutes on the job', () => {
      const yaml = buildGitHubWorkflow()
      assert.ok(yaml.includes('timeout-minutes: 30'), 'Should set 30 minute timeout')
    })

    it('should configure npm cache in setup-node', () => {
      const yaml = buildGitHubWorkflow()
      assert.ok(yaml.includes('cache: npm'), 'Should enable npm caching')
    })

    it('should set retention-days on artifact uploads', () => {
      const yaml = buildGitHubWorkflow()
      assert.ok(yaml.includes('retention-days: 7'), 'Should set 7-day retention')
    })
  })

  // -------------------------------------------------------------------------
  // buildGitLabCi
  // -------------------------------------------------------------------------

  describe('buildGitLabCi', () => {
    it('should return valid GitLab CI YAML', () => {
      const yaml = buildGitLabCi()
      assert.equal(typeof yaml, 'string')
      assert.ok(yaml.includes('stages:'), 'Should contain stages section')
      assert.ok(yaml.includes('e2e-tests:'), 'Should contain e2e-tests job')
      assert.ok(yaml.includes('image: node:22'), 'Should default to Node.js 22')
    })

    it('should contain required CI steps', () => {
      const yaml = buildGitLabCi()
      assert.ok(yaml.includes('npm ci'), 'Should include npm ci')
      assert.ok(
        yaml.includes('npx playwright install --with-deps chromium'),
        'Should install Playwright',
      )
      assert.ok(yaml.includes('npx playwright test'), 'Should run Playwright tests')
    })

    it('should configure artifacts and rules', () => {
      const yaml = buildGitLabCi()
      assert.ok(yaml.includes('artifacts:'), 'Should have artifacts section')
      assert.ok(yaml.includes('expire_in: 7 days'), 'Should set artifact expiry')
      assert.ok(yaml.includes('rules:'), 'Should have rules section')
      assert.ok(yaml.includes('merge_request_event'), 'Should trigger on merge requests')
    })

    it('should use custom options', () => {
      const yaml = buildGitLabCi({
        testDir: 'tests/e2e',
        configFile: 'custom.config.ts',
        nodeVersion: 20,
      })
      assert.ok(yaml.includes('image: node:20'), 'Should use custom Node version')
      assert.ok(yaml.includes('--config=custom.config.ts'), 'Should use custom config')
      assert.ok(yaml.includes('tests/e2e/test-results/'), 'Should use custom test dir')
    })

    it('should set timeout', () => {
      const yaml = buildGitLabCi()
      assert.ok(yaml.includes('timeout: 30m'), 'Should set 30 minute timeout')
    })
  })

  // -------------------------------------------------------------------------
  // buildAzurePipeline
  // -------------------------------------------------------------------------

  describe('buildAzurePipeline', () => {
    it('should return valid Azure Pipelines YAML', () => {
      const yaml = buildAzurePipeline()
      assert.equal(typeof yaml, 'string')
      assert.ok(yaml.includes('trigger:'), 'Should contain trigger section')
      assert.ok(yaml.includes('pool:'), 'Should contain pool section')
      assert.ok(yaml.includes('steps:'), 'Should contain steps section')
    })

    it('should configure Node.js setup', () => {
      const yaml = buildAzurePipeline()
      assert.ok(yaml.includes('NodeTool@0'), 'Should use NodeTool task')
      assert.ok(yaml.includes("versionSpec: '22'"), 'Should default to Node.js 22')
    })

    it('should contain required build steps', () => {
      const yaml = buildAzurePipeline()
      assert.ok(yaml.includes('npm ci'), 'Should include npm ci')
      assert.ok(
        yaml.includes('npx playwright install --with-deps chromium'),
        'Should install Playwright',
      )
      assert.ok(yaml.includes('npx playwright test'), 'Should run Playwright tests')
    })

    it('should publish test results and report', () => {
      const yaml = buildAzurePipeline()
      assert.ok(yaml.includes('PublishTestResults@2'), 'Should publish test results')
      assert.ok(yaml.includes('condition: always()'), 'Should publish results always')
      assert.ok(yaml.includes('condition: failed()'), 'Should upload report on failure')
    })

    it('should use custom options', () => {
      const yaml = buildAzurePipeline({
        testDir: 'tests/e2e',
        configFile: 'custom.config.ts',
        nodeVersion: 20,
      })
      assert.ok(yaml.includes("versionSpec: '20'"), 'Should use custom Node version')
      assert.ok(yaml.includes('--config=custom.config.ts'), 'Should use custom config')
      assert.ok(yaml.includes('tests/e2e/test-results/'), 'Should use custom test dir')
    })

    it('should trigger on main and develop branches', () => {
      const yaml = buildAzurePipeline()
      assert.ok(yaml.includes('- main'), 'Should trigger on main')
      assert.ok(yaml.includes('- develop'), 'Should trigger on develop')
    })
  })

  // -------------------------------------------------------------------------
  // generateCiTemplate
  // -------------------------------------------------------------------------

  describe('generateCiTemplate', () => {
    it('should create workflow file at correct path', () => {
      const result = generateCiTemplate(tempDir)
      assert.equal(result.created, true, 'Should report created: true')
      assert.equal(
        result.path,
        '.github/workflows/e2e.yml',
        'Should return the relative output path',
      )
      const fullPath = join(tempDir, '.github', 'workflows', 'e2e.yml')
      assert.ok(existsSync(fullPath), 'Workflow file should exist on disk')
    })

    it('should create parent directories if needed', () => {
      // tempDir has no .github/workflows/ directory yet
      assert.ok(!existsSync(join(tempDir, '.github')), '.github should not exist before generation')
      generateCiTemplate(tempDir)
      assert.ok(
        existsSync(join(tempDir, '.github', 'workflows')),
        '.github/workflows/ should be created',
      )
    })

    it('should NOT overwrite existing workflow file', () => {
      // Create the file first
      const workflowDir = join(tempDir, '.github', 'workflows')
      mkdirSync(workflowDir, { recursive: true })
      const existingContent = '# existing workflow - do not overwrite\n'
      writeFileSync(join(workflowDir, 'e2e.yml'), existingContent, 'utf-8')

      const result = generateCiTemplate(tempDir)
      assert.equal(result.created, false, 'Should report created: false')

      // Verify original content is preserved
      const content = readFileSync(join(workflowDir, 'e2e.yml'), 'utf-8')
      assert.equal(content, existingContent, 'Original file content should be preserved')
    })

    it('should return created:false with reason when file exists', () => {
      const workflowDir = join(tempDir, '.github', 'workflows')
      mkdirSync(workflowDir, { recursive: true })
      writeFileSync(join(workflowDir, 'e2e.yml'), '# existing\n', 'utf-8')

      const result = generateCiTemplate(tempDir)
      assert.equal(result.created, false)
      assert.ok(
        typeof result.reason === 'string' && result.reason.length > 0,
        'Should provide a reason string',
      )
      assert.ok(
        result.reason.includes('already exists'),
        'Reason should mention file already exists',
      )
    })

    it('should return created:false for unsupported provider', () => {
      const result = generateCiTemplate(tempDir, { provider: 'jenkins' })
      assert.equal(result.created, false)
      assert.ok(result.reason.includes('Unsupported'), 'Should mention unsupported provider')
    })

    it('should create gitlab CI file at correct path', () => {
      const result = generateCiTemplate(tempDir, { provider: 'gitlab' })
      assert.equal(result.created, true, 'Should create GitLab CI file')
      assert.equal(result.path, '.gitlab-ci.yml')
      assert.ok(existsSync(join(tempDir, '.gitlab-ci.yml')), 'GitLab CI file should exist')
    })

    it('should create azure pipelines file at correct path', () => {
      const result = generateCiTemplate(tempDir, { provider: 'azure' })
      assert.equal(result.created, true, 'Should create Azure Pipelines file')
      assert.equal(result.path, 'azure-pipelines-e2e.yml')
      assert.ok(
        existsSync(join(tempDir, 'azure-pipelines-e2e.yml')),
        'Azure Pipelines file should exist',
      )
    })

    it('should read defaults from sparq.config.json when available', () => {
      // Write a sparq.config.json with custom defaults
      const config = {
        version: '1.0.0',
        project: {
          name: 'test-project',
          testDir: 'tests/integration',
        },
        e2e: {
          configFile: 'custom-pw.config.ts',
        },
      }
      writeFileSync(join(tempDir, 'sparq.config.json'), JSON.stringify(config, null, 2), 'utf-8')

      generateCiTemplate(tempDir)

      const fullPath = join(tempDir, '.github', 'workflows', 'e2e.yml')
      const content = readFileSync(fullPath, 'utf-8')
      assert.ok(
        content.includes('--config=custom-pw.config.ts'),
        'Should use configFile from sparq.config.json',
      )
      assert.ok(
        content.includes('tests/integration/test-results/'),
        'Should use testDir from sparq.config.json',
      )
    })

    it('should prefer explicit options over sparq.config.json defaults', () => {
      // Write config with one set of values
      const config = {
        version: '1.0.0',
        project: { name: 'test', testDir: 'from-config' },
        e2e: { configFile: 'from-config.ts' },
      }
      writeFileSync(join(tempDir, 'sparq.config.json'), JSON.stringify(config, null, 2), 'utf-8')

      // Call with explicit overrides
      generateCiTemplate(tempDir, {
        testDir: 'from-option',
        configFile: 'from-option.config.ts',
      })

      const fullPath = join(tempDir, '.github', 'workflows', 'e2e.yml')
      const content = readFileSync(fullPath, 'utf-8')
      assert.ok(
        content.includes('--config=from-option.config.ts'),
        'Should prefer explicit configFile over config default',
      )
      assert.ok(
        content.includes('from-option/test-results/'),
        'Should prefer explicit testDir over config default',
      )
    })

    it('should use built-in defaults when no config file exists', () => {
      generateCiTemplate(tempDir)

      const fullPath = join(tempDir, '.github', 'workflows', 'e2e.yml')
      const content = readFileSync(fullPath, 'utf-8')
      assert.ok(
        content.includes('--config=playwright.config.ts'),
        'Should fall back to default configFile',
      )
      assert.ok(content.includes('test-results/'), 'Should fall back to default test results path')
    })

    it('should write valid workflow content to the file', () => {
      generateCiTemplate(tempDir)

      const fullPath = join(tempDir, '.github', 'workflows', 'e2e.yml')
      const content = readFileSync(fullPath, 'utf-8')
      assert.ok(
        content.startsWith('name: E2E Tests (SparQ Generated)'),
        'File should contain valid workflow YAML',
      )
      assert.ok(content.includes('jobs:'), 'File should contain jobs section')
    })
  })

  // -------------------------------------------------------------------------
  // Dry-run mode
  // -------------------------------------------------------------------------

  describe('dry-run mode', () => {
    it('should not create any files in dry-run mode', () => {
      setDryRun(true)
      const result = generateCiTemplate(tempDir)
      assert.equal(result.created, true, 'Should report created: true (dry-run still returns it)')

      // In dry-run mode, ensureDir and writeFileSync are wrapped in dryRun() —
      // the action callback is not executed, so no files are actually written
      const fullPath = join(tempDir, '.github', 'workflows', 'e2e.yml')
      assert.ok(!existsSync(fullPath), 'Workflow file should NOT be created in dry-run mode')
    })

    it('should not create directories in dry-run mode', () => {
      setDryRun(true)
      generateCiTemplate(tempDir)
      assert.ok(
        !existsSync(join(tempDir, '.github')),
        '.github directory should NOT be created in dry-run mode',
      )
    })
  })

  // -------------------------------------------------------------------------
  // Generated YAML content validation
  // -------------------------------------------------------------------------

  describe('generated YAML content', () => {
    it('should contain all required step names', () => {
      const yaml = buildGitHubWorkflow()
      const requiredSteps = [
        'Install Playwright browsers',
        'Run E2E tests',
        'Upload test results',
        'Upload Playwright report',
      ]
      for (const step of requiredSteps) {
        assert.ok(yaml.includes(step), `Should contain step: ${step}`)
      }
    })

    it('should produce a complete workflow with no truncation', () => {
      const yaml = buildGitHubWorkflow()
      // Verify it ends with a complete artifact upload block (last line is newline)
      assert.ok(yaml.endsWith('\n'), 'YAML should end with a newline')
      // Verify the last meaningful content is the retention-days for the report
      assert.ok(
        yaml.includes('retention-days: 7'),
        'Should include retention-days in final artifact block',
      )
    })
  })
})
