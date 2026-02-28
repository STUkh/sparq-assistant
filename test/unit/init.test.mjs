import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { after, afterEach, before, beforeEach, describe, it } from 'node:test'
import { gatherConfig } from '../../bin/lib/commands/init.mjs'
import {
  cleanTempDir,
  createMockProject,
  createTempDir,
  readJsonFile,
  readTextFile,
  runCli,
} from '../helpers/setup.mjs'

// ---------------------------------------------------------------------------
// gatherConfig — non-interactive mode (direct function tests)
// ---------------------------------------------------------------------------

describe('gatherConfig', () => {
  describe('non-interactive mode', () => {
    let tempDir
    let config

    before(async () => {
      tempDir = createTempDir()
      createMockProject(tempDir, { name: 'gather-config-test', withGit: true })
      config = await gatherConfig(tempDir, true, false)
    })

    after(() => {
      cleanTempDir(tempDir)
    })

    it('should return config with expected shape', () => {
      assert.ok(config.projectName, 'Config should have projectName')
      assert.ok('jiraKey' in config, 'Config should have jiraKey')
      assert.ok('testDir' in config, 'Config should have testDir')
      assert.ok('tmsProvider' in config, 'Config should have tmsProvider')
      assert.ok('checkpointLevel' in config, 'Config should have checkpointLevel')
      assert.ok('figmaEnabled' in config, 'Config should have figmaEnabled')
      assert.ok('jiraEnabled' in config, 'Config should have jiraEnabled')
      assert.ok('confluenceEnabled' in config, 'Config should have confluenceEnabled')
      assert.ok('localEnabled' in config, 'Config should have localEnabled')
    })

    it('should use directory basename as projectName', () => {
      assert.equal(config.projectName, basename(tempDir))
    })

    it('should default jiraKey to empty when Jira is disabled', () => {
      assert.equal(config.jiraKey, '')
    })

    it('should default testDir to e2e', () => {
      assert.equal(config.testDir, 'e2e')
    })

    it('should default tmsProvider to null', () => {
      assert.equal(config.tmsProvider, null)
    })

    it('should default checkpointLevel to full', () => {
      assert.equal(config.checkpointLevel, 'full')
    })

    it('should use local-first integration defaults', () => {
      assert.equal(config.figmaEnabled, false, 'Figma should be disabled')
      assert.equal(config.jiraEnabled, false, 'Jira should be disabled')
      assert.equal(config.confluenceEnabled, false, 'Confluence should be disabled')
      assert.equal(config.localEnabled, true, 'Local should be enabled')
    })

    it('should sanitize project name', async () => {
      const dirWithSpecialChars = createTempDir()
      createMockProject(dirWithSpecialChars, { name: 'test', withGit: true })
      try {
        const result = await gatherConfig(dirWithSpecialChars, true, false)
        assert.ok(typeof result.projectName === 'string', 'projectName should be a string')
        assert.ok(!result.projectName.includes('/'), 'projectName should not contain slashes')
        assert.ok(!result.projectName.includes('\\'), 'projectName should not contain backslashes')
      } finally {
        cleanTempDir(dirWithSpecialChars)
      }
    })
  })
})

// ---------------------------------------------------------------------------
// cmdInit via CLI subprocess — successful non-interactive init
// ---------------------------------------------------------------------------

describe('cmdInit via CLI subprocess', () => {
  describe('successful non-interactive init', () => {
    let tempDir
    let result

    before(async () => {
      tempDir = createTempDir()
      createMockProject(tempDir, {
        name: 'init-unit-test',
        dependencies: { vue: '^3.4.0', primevue: '^4.0.0' },
        devDependencies: { '@playwright/test': '^1.40.0', typescript: '^5.3.0' },
        withGit: true,
      })
      result = await runCli(['init', '--non-interactive', tempDir])
    })

    after(() => {
      cleanTempDir(tempDir)
    })

    it('should exit 0', () => {
      assert.equal(result.exitCode, 0, 'Init should exit 0')
    })

    it('should create .claude/ directory', () => {
      assert.ok(existsSync(join(tempDir, '.claude')), '.claude/ should exist')
    })

    it('should install agent files', () => {
      const agentsDir = join(tempDir, '.claude', 'agents')
      assert.ok(existsSync(agentsDir), '.claude/agents/ should exist')

      const expectedAgents = [
        'sparq-orchestrator.md',
        'sparq-requirements-analyst.md',
        'sparq-manual-test-writer.md',
        'sparq-automation-engineer.md',
        'sparq-test-validator.md',
      ]
      for (const agent of expectedAgents) {
        assert.ok(existsSync(join(agentsDir, agent)), `Agent ${agent} should be installed`)
      }
    })

    it('should install skill directories', () => {
      const skillsDir = join(tempDir, '.claude', 'skills')
      assert.ok(existsSync(skillsDir), '.claude/skills/ should exist')
      assert.ok(
        existsSync(join(skillsDir, 'sparq-analyze')),
        'sparq-analyze skill should be installed',
      )
      assert.ok(
        existsSync(join(skillsDir, 'sparq-shared')),
        'sparq-shared skill should be installed',
      )
    })

    it('should install template files', () => {
      const templatesDir = join(tempDir, '.claude', 'templates')
      assert.ok(existsSync(templatesDir), '.claude/templates/ should exist')
      const templates = readdirSync(templatesDir)
      assert.ok(templates.length > 0, 'Templates directory should not be empty')
    })

    it('should generate sparq.config.json with valid structure', () => {
      const config = readJsonFile(tempDir, 'sparq.config.json')
      assert.ok(config, 'sparq.config.json should exist')
      assert.ok(config.version, 'Config should have version')
      assert.ok(config.project, 'Config should have project section')
      assert.ok(config.sources, 'Config should have sources section')
      assert.equal(config.techStack, undefined, 'Config should NOT have techStack section')
      assert.equal(config.project.testDir, 'e2e', 'Default testDir should be e2e')
    })

    it('should create .sparq/ output directories', () => {
      assert.ok(existsSync(join(tempDir, '.sparq')), '.sparq/ should exist')
      assert.ok(
        existsSync(join(tempDir, '.sparq', 'requirements')),
        '.sparq/requirements/ should exist',
      )
      assert.ok(
        existsSync(join(tempDir, '.sparq', 'test-cases')),
        '.sparq/test-cases/ should exist',
      )
      assert.ok(existsSync(join(tempDir, '.sparq', 'coverage')), '.sparq/coverage/ should exist')
      assert.ok(
        existsSync(join(tempDir, '.sparq', 'validation')),
        '.sparq/validation/ should exist',
      )
    })

    it('should create .mcp.json with MCP servers', () => {
      const mcpConfig = readJsonFile(tempDir, '.mcp.json')
      assert.ok(mcpConfig, '.mcp.json should exist')
      assert.ok(mcpConfig.mcpServers, '.mcp.json should have mcpServers')
    })

    it('should create .claude/rules/sparq.md', () => {
      const rulePath = join(tempDir, '.claude', 'rules', 'sparq.md')
      assert.ok(existsSync(rulePath), '.claude/rules/sparq.md should exist')
      const content = readTextFile(tempDir, join('.claude', 'rules', 'sparq.md'))
      assert.ok(
        content.includes('SparQ') || content.includes('sparq'),
        'Rule file should contain SparQ reference',
      )
    })

    it('should add .sparq/ to .gitignore', () => {
      const gitignore = readTextFile(tempDir, '.gitignore')
      assert.ok(gitignore, '.gitignore should exist')
      assert.ok(gitignore.includes('.sparq'), '.gitignore should contain .sparq entry')
    })

    it('should create manifest', () => {
      const manifest = readJsonFile(tempDir, join('.sparq', '.manifest.json'))
      assert.ok(manifest, '.sparq/.manifest.json should exist')
      assert.ok(Object.keys(manifest).length > 0, 'Manifest should track installed files')
    })

    it('should create settings.local.json', () => {
      const settings = readJsonFile(tempDir, join('.claude', 'settings.local.json'))
      assert.ok(settings, 'settings.local.json should exist')
      assert.ok(settings.permissions, 'settings.local.json should have permissions')
      assert.ok(Array.isArray(settings.permissions.allow), 'permissions.allow should be an array')
    })
  })

  // -------------------------------------------------------------------------
  // Conflict detection
  // -------------------------------------------------------------------------

  describe('conflict detection', () => {
    let tempDir

    before(async () => {
      tempDir = createTempDir()
      createMockProject(tempDir, {
        name: 'conflict-test',
        dependencies: { vue: '^3.4.0' },
        withGit: true,
      })
      // Create a non-sparq agent file before init
      const agentsDir = join(tempDir, '.claude', 'agents')
      mkdirSync(agentsDir, { recursive: true })
      writeFileSync(join(agentsDir, 'custom-agent.md'), '# Custom Agent', 'utf-8')

      await runCli(['init', '--non-interactive', tempDir])
    })

    after(() => {
      cleanTempDir(tempDir)
    })

    it('should preserve non-sparq content in .claude/', () => {
      const customAgent = join(tempDir, '.claude', 'agents', 'custom-agent.md')
      assert.ok(existsSync(customAgent), 'Non-sparq agent file should be preserved')

      const content = readFileSync(customAgent, 'utf-8')
      assert.equal(content, '# Custom Agent', 'Non-sparq agent content should be unchanged')
    })
  })

  // -------------------------------------------------------------------------
  // Error handling
  // -------------------------------------------------------------------------

  describe('error handling', () => {
    let tempDir

    beforeEach(() => {
      tempDir = createTempDir()
    })

    afterEach(() => {
      cleanTempDir(tempDir)
    })

    it('should fail when target directory does not exist', async () => {
      const nonexistent = join(tempDir, 'does-not-exist')
      const { exitCode, stdout, stderr } = await runCli(['init', '--non-interactive', nonexistent])

      assert.notEqual(exitCode, 0, 'Init should fail for non-existent directory')

      const output = stdout + stderr
      assert.ok(
        output.includes('does not exist') || output.includes('not found'),
        'Should report directory does not exist',
      )
    })

    it('should fail with non-zero exit code on invalid target', async () => {
      // Use a file path instead of a directory
      const filePath = join(tempDir, 'not-a-dir.txt')
      writeFileSync(filePath, 'hello', 'utf-8')

      const { exitCode } = await runCli(['init', '--non-interactive', filePath])

      assert.notEqual(exitCode, 0, 'Init should fail when target is a file')
    })
  })
})
