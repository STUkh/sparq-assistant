import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { after, afterEach, before, beforeEach, describe, it } from 'node:test'
import { cmdUninstall } from '../../bin/lib/commands/uninstall.mjs'
import {
  AGENT_NAMES,
  SPARQ_CLAUDE_BLOCK_END,
  SPARQ_CLAUDE_BLOCK_START,
} from '../../bin/lib/constants.mjs'
import { resetState, setDryRun } from '../../bin/lib/state.mjs'
import {
  cleanTempDir,
  createMockProject,
  createOutputCapture,
  createTempDir,
  runCli,
} from '../helpers/setup.mjs'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const capture = createOutputCapture()

/**
 * Create a fresh SparQ installation in a temp directory.
 */
async function initProject(opts = {}) {
  const tempDir = createTempDir()
  createMockProject(tempDir, {
    name: opts.name || 'uninstall-test',
    dependencies: { vue: '^3.4.0' },
    devDependencies: { '@playwright/test': '^1.40.0' },
    withGit: true,
  })
  const { exitCode } = await runCli(['init', '--non-interactive', tempDir])
  assert.equal(exitCode, 0, 'Init should succeed')
  return tempDir
}

// ---------------------------------------------------------------------------
// cmdUninstall
// ---------------------------------------------------------------------------

describe('cmdUninstall', () => {
  beforeEach(() => {
    capture.start()
    resetState()
  })

  afterEach(() => {
    capture.stop()
  })

  // -------------------------------------------------------------------------
  // No installation
  // -------------------------------------------------------------------------

  describe('no installation', () => {
    let tempDir

    beforeEach(() => {
      tempDir = createTempDir()
      mkdirSync(tempDir, { recursive: true })
      writeFileSync(join(tempDir, 'package.json'), '{"name":"empty"}')
    })

    afterEach(() => {
      cleanTempDir(tempDir)
    })

    it('should handle gracefully when no .claude/ or config exists', async () => {
      await cmdUninstall(tempDir, { force: true, nonInteractive: true })

      assert.ok(
        capture.text().includes('No SparQ installation found'),
        'Should report no installation found',
      )
    })
  })

  // -------------------------------------------------------------------------
  // Agent removal
  // -------------------------------------------------------------------------

  describe('agent removal', () => {
    let tempDir

    before(async () => {
      tempDir = await initProject({ name: 'uninstall-agents' })
    })

    after(() => {
      cleanTempDir(tempDir)
    })

    it('should remove all sparq agent files', async () => {
      // Confirm agents exist before uninstall
      const agentsDir = join(tempDir, '.claude', 'agents')
      for (const name of AGENT_NAMES) {
        assert.ok(existsSync(join(agentsDir, name)), `Agent ${name} should exist before uninstall`)
      }

      await cmdUninstall(tempDir, { force: true, nonInteractive: true })

      for (const name of AGENT_NAMES) {
        assert.ok(!existsSync(join(agentsDir, name)), `Agent ${name} should be removed`)
      }
    })
  })

  describe('agent removal preserves non-sparq files', () => {
    let tempDir

    before(async () => {
      tempDir = await initProject({ name: 'uninstall-agents-preserve' })
      // Add a non-sparq agent file
      writeFileSync(join(tempDir, '.claude', 'agents', 'custom-agent.md'), '# Custom Agent')
    })

    after(() => {
      cleanTempDir(tempDir)
    })

    it('should not remove non-sparq files in .claude/agents/', async () => {
      await cmdUninstall(tempDir, { force: true, nonInteractive: true })

      const customPath = join(tempDir, '.claude', 'agents', 'custom-agent.md')
      assert.ok(existsSync(customPath), 'Non-sparq agent file should be preserved')
    })
  })

  describe('agent removal with missing agents directory', () => {
    let tempDir

    before(async () => {
      tempDir = createTempDir()
      mkdirSync(tempDir, { recursive: true })
      writeFileSync(join(tempDir, 'package.json'), '{"name":"test"}')
      // Create .claude/ but not agents/
      mkdirSync(join(tempDir, '.claude'), { recursive: true })
      writeFileSync(join(tempDir, 'sparq.config.json'), '{}')
    })

    after(() => {
      cleanTempDir(tempDir)
    })

    it('should handle missing agents directory', async () => {
      // Should not throw
      await cmdUninstall(tempDir, { force: true, nonInteractive: true })
    })
  })

  // -------------------------------------------------------------------------
  // Skill removal
  // -------------------------------------------------------------------------

  describe('skill removal', () => {
    let tempDir

    before(async () => {
      tempDir = await initProject({ name: 'uninstall-skills' })
    })

    after(() => {
      cleanTempDir(tempDir)
    })

    it('should remove sparq-prefixed skill directories', async () => {
      const skillsDir = join(tempDir, '.claude', 'skills')
      const sparqSkills = readdirSync(skillsDir).filter(
        (d) =>
          d.startsWith('sparq-') &&
          d !== 'sparq-shared' &&
          statSync(join(skillsDir, d)).isDirectory(),
      )
      assert.ok(sparqSkills.length > 0, 'Should have sparq skill dirs before uninstall')

      await cmdUninstall(tempDir, { force: true, nonInteractive: true })

      // sparq-shared may remain as an empty shell — uninstall removes its files
      // but other sparq-* skill dirs should be fully removed
      const remaining = existsSync(skillsDir)
        ? readdirSync(skillsDir).filter(
            (d) =>
              d.startsWith('sparq-') &&
              d !== 'sparq-shared' &&
              statSync(join(skillsDir, d)).isDirectory(),
          )
        : []
      assert.equal(
        remaining.length,
        0,
        'All sparq skill dirs (except sparq-shared) should be removed',
      )
    })
  })

  describe('skill removal preserves non-sparq skills', () => {
    let tempDir

    before(async () => {
      tempDir = await initProject({ name: 'uninstall-skills-preserve' })
      // Add a non-sparq skill directory
      mkdirSync(join(tempDir, '.claude', 'skills', 'custom-skill'), { recursive: true })
      writeFileSync(
        join(tempDir, '.claude', 'skills', 'custom-skill', 'SKILL.md'),
        '# Custom Skill',
      )
    })

    after(() => {
      cleanTempDir(tempDir)
    })

    it('should not remove non-sparq skill directories', async () => {
      await cmdUninstall(tempDir, { force: true, nonInteractive: true })

      assert.ok(
        existsSync(join(tempDir, '.claude', 'skills', 'custom-skill')),
        'Non-sparq skill directory should be preserved',
      )
    })
  })

  // -------------------------------------------------------------------------
  // Template removal
  // -------------------------------------------------------------------------

  describe('template removal', () => {
    let tempDir

    before(async () => {
      tempDir = await initProject({ name: 'uninstall-templates' })
    })

    after(() => {
      cleanTempDir(tempDir)
    })

    it('should remove template files', async () => {
      const templatesDir = join(tempDir, '.claude', 'templates')
      assert.ok(existsSync(templatesDir), 'Templates directory should exist before uninstall')

      await cmdUninstall(tempDir, { force: true, nonInteractive: true })

      // Templates should be removed (directory may remain if empty cleanup handles it)
      if (existsSync(templatesDir)) {
        const remaining = readdirSync(templatesDir)
        assert.equal(remaining.length, 0, 'Templates directory should be empty after uninstall')
      }
    })
  })

  // -------------------------------------------------------------------------
  // Config removal
  // -------------------------------------------------------------------------

  describe('config removal', () => {
    let tempDir

    before(async () => {
      tempDir = await initProject({ name: 'uninstall-config' })
    })

    after(() => {
      cleanTempDir(tempDir)
    })

    it('should remove sparq.config.json', async () => {
      assert.ok(existsSync(join(tempDir, 'sparq.config.json')), 'Config should exist before')

      await cmdUninstall(tempDir, { force: true, nonInteractive: true })

      assert.ok(!existsSync(join(tempDir, 'sparq.config.json')), 'Config should be removed')
    })
  })

  // -------------------------------------------------------------------------
  // Output directory removal
  // -------------------------------------------------------------------------

  describe('output directory removal', () => {
    let tempDir

    before(async () => {
      tempDir = await initProject({ name: 'uninstall-outdir' })
    })

    after(() => {
      cleanTempDir(tempDir)
    })

    it('should remove .sparq/ directory', async () => {
      assert.ok(existsSync(join(tempDir, '.sparq')), '.sparq/ should exist before uninstall')

      await cmdUninstall(tempDir, { force: true, nonInteractive: true })

      assert.ok(!existsSync(join(tempDir, '.sparq')), '.sparq/ should be removed')
    })
  })

  // -------------------------------------------------------------------------
  // Rule file removal
  // -------------------------------------------------------------------------

  describe('rule file removal', () => {
    let tempDir

    afterEach(() => {
      cleanTempDir(tempDir)
    })

    it('should remove .claude/rules/sparq.md', async () => {
      tempDir = await initProject({ name: 'uninstall-rule-file' })
      const rulePath = join(tempDir, '.claude', 'rules', 'sparq.md')
      assert.ok(existsSync(rulePath), 'Rule file should exist after init')

      await cmdUninstall(tempDir, { force: true, nonInteractive: true })

      assert.ok(!existsSync(rulePath), 'Rule file should be removed after uninstall')
    })
  })

  // -------------------------------------------------------------------------
  // Legacy CLAUDE.md cleanup (backward-compat migration)
  // -------------------------------------------------------------------------

  describe('legacy CLAUDE.md cleanup', () => {
    let tempDir

    afterEach(() => {
      cleanTempDir(tempDir)
    })

    it('should remove legacy SparQ block between markers', async () => {
      tempDir = createTempDir()
      mkdirSync(tempDir, { recursive: true })
      writeFileSync(join(tempDir, 'package.json'), '{"name":"test"}')
      mkdirSync(join(tempDir, '.claude'), { recursive: true })
      writeFileSync(join(tempDir, 'sparq.config.json'), '{}')
      // Simulate legacy CLAUDE.md with SparQ block
      const legacyContent = `# My Project\n\n${SPARQ_CLAUDE_BLOCK_START}\n## SparQ QA Assistant\nOld content\n${SPARQ_CLAUDE_BLOCK_END}\n`
      writeFileSync(join(tempDir, 'CLAUDE.md'), legacyContent)

      await cmdUninstall(tempDir, { force: true, nonInteractive: true })

      if (existsSync(join(tempDir, 'CLAUDE.md'))) {
        const after = readFileSync(join(tempDir, 'CLAUDE.md'), 'utf-8')
        assert.ok(!after.includes(SPARQ_CLAUDE_BLOCK_START), 'sparq-start marker should be removed')
        assert.ok(!after.includes(SPARQ_CLAUDE_BLOCK_END), 'sparq-end marker should be removed')
      }
    })

    it('should preserve content before and after legacy SparQ block', async () => {
      tempDir = createTempDir()
      mkdirSync(tempDir, { recursive: true })
      writeFileSync(join(tempDir, 'package.json'), '{"name":"test"}')
      mkdirSync(join(tempDir, '.claude'), { recursive: true })
      writeFileSync(join(tempDir, 'sparq.config.json'), '{}')
      const legacyContent = `# My Project\n\nThis is my project.\n\n${SPARQ_CLAUDE_BLOCK_START}\n## SparQ\nOld\n${SPARQ_CLAUDE_BLOCK_END}\n\n## My Custom Section\n\nCustom content here.\n`
      writeFileSync(join(tempDir, 'CLAUDE.md'), legacyContent)

      await cmdUninstall(tempDir, { force: true, nonInteractive: true })

      if (existsSync(join(tempDir, 'CLAUDE.md'))) {
        const after = readFileSync(join(tempDir, 'CLAUDE.md'), 'utf-8')
        assert.ok(after.includes('My Project'), 'Content before SparQ block should be preserved')
        assert.ok(
          after.includes('My Custom Section'),
          'Content after SparQ block should be preserved',
        )
      }
    })

    it('should handle CLAUDE.md without SparQ block', async () => {
      tempDir = createTempDir()
      mkdirSync(tempDir, { recursive: true })
      writeFileSync(join(tempDir, 'package.json'), '{"name":"test"}')
      mkdirSync(join(tempDir, '.claude'), { recursive: true })
      writeFileSync(join(tempDir, 'sparq.config.json'), '{}')
      writeFileSync(join(tempDir, 'CLAUDE.md'), '# My Project\n\nNo SparQ here.\n')

      await cmdUninstall(tempDir, { force: true, nonInteractive: true })

      const after = readFileSync(join(tempDir, 'CLAUDE.md'), 'utf-8')
      assert.ok(after.includes('My Project'), 'Original content should be preserved')
    })

    it('should handle missing CLAUDE.md', async () => {
      tempDir = createTempDir()
      mkdirSync(tempDir, { recursive: true })
      writeFileSync(join(tempDir, 'package.json'), '{"name":"test"}')
      mkdirSync(join(tempDir, '.claude'), { recursive: true })
      writeFileSync(join(tempDir, 'sparq.config.json'), '{}')

      // Should not throw
      await cmdUninstall(tempDir, { force: true, nonInteractive: true })
    })
  })

  // -------------------------------------------------------------------------
  // MCP cleanup
  // -------------------------------------------------------------------------

  describe('MCP cleanup', () => {
    let tempDir

    afterEach(() => {
      cleanTempDir(tempDir)
    })

    it('should remove SparQ-added server entries from .mcp.json', async () => {
      tempDir = await initProject({ name: 'uninstall-mcp' })
      const mcpPath = join(tempDir, '.mcp.json')
      assert.ok(existsSync(mcpPath), '.mcp.json should exist')

      await cmdUninstall(tempDir, { force: true, nonInteractive: true })

      if (existsSync(mcpPath)) {
        const mcpData = JSON.parse(readFileSync(mcpPath, 'utf-8'))
        const servers = mcpData.mcpServers || {}
        // Default non-interactive init only adds playwright
        assert.ok(!('playwright' in servers), 'playwright server should be removed')
      }
    })

    it('should preserve non-SparQ servers in .mcp.json', async () => {
      tempDir = await initProject({ name: 'uninstall-mcp-preserve' })
      const mcpPath = join(tempDir, '.mcp.json')
      const mcpData = JSON.parse(readFileSync(mcpPath, 'utf-8'))
      mcpData.mcpServers['my-custom-server'] = { command: 'node', args: ['server.js'] }
      writeFileSync(mcpPath, JSON.stringify(mcpData, null, 2))

      await cmdUninstall(tempDir, { force: true, nonInteractive: true })

      assert.ok(existsSync(mcpPath), '.mcp.json should still exist')
      const afterData = JSON.parse(readFileSync(mcpPath, 'utf-8'))
      assert.ok('my-custom-server' in afterData.mcpServers, 'Custom server should be preserved')
    })

    it('should preserve pre-existing MCP servers not added by SparQ', async () => {
      tempDir = createTempDir()
      createMockProject(tempDir, {
        name: 'uninstall-mcp-preexisting',
        dependencies: { vue: '^3.4.0' },
        devDependencies: { '@playwright/test': '^1.40.0' },
        withGit: true,
      })
      // Pre-existing playwright server before SparQ init
      writeFileSync(
        join(tempDir, '.mcp.json'),
        JSON.stringify({
          mcpServers: {
            playwright: { command: 'npx', args: ['@anthropic/mcp-playwright'] },
          },
        }),
      )

      const { exitCode } = await runCli(['init', '--non-interactive', tempDir])
      assert.equal(exitCode, 0, 'Init should succeed')

      await cmdUninstall(tempDir, { force: true, nonInteractive: true })

      // Pre-existing playwright should NOT be removed
      if (existsSync(join(tempDir, '.mcp.json'))) {
        const afterData = JSON.parse(readFileSync(join(tempDir, '.mcp.json'), 'utf-8'))
        assert.ok(
          'playwright' in (afterData.mcpServers || {}),
          'Pre-existing playwright server should be preserved',
        )
      }
    })

    it('should handle missing .mcp.json', async () => {
      tempDir = createTempDir()
      mkdirSync(tempDir, { recursive: true })
      writeFileSync(join(tempDir, 'package.json'), '{"name":"test"}')
      mkdirSync(join(tempDir, '.claude'), { recursive: true })
      writeFileSync(join(tempDir, 'sparq.config.json'), '{}')

      // Should not throw
      await cmdUninstall(tempDir, { force: true, nonInteractive: true })
    })
  })

  // -------------------------------------------------------------------------
  // Gitignore cleanup
  // -------------------------------------------------------------------------

  describe('gitignore cleanup', () => {
    let tempDir

    afterEach(() => {
      cleanTempDir(tempDir)
    })

    it('should remove .sparq/ entry from .gitignore', async () => {
      tempDir = await initProject({ name: 'uninstall-gitignore' })
      const gitignorePath = join(tempDir, '.gitignore')
      const before = readFileSync(gitignorePath, 'utf-8')
      assert.ok(
        before.includes('.sparq'),
        '.gitignore should contain .sparq entry before uninstall',
      )

      await cmdUninstall(tempDir, { force: true, nonInteractive: true })

      const after = readFileSync(gitignorePath, 'utf-8')
      const sparqLines = after
        .split('\n')
        .filter((l) => l.trim() === '.sparq/' || l.trim() === '.sparq')
      assert.equal(sparqLines.length, 0, '.sparq/ should be removed from .gitignore')
    })

    it('should preserve other entries', async () => {
      tempDir = await initProject({ name: 'uninstall-gitignore-preserve' })
      const gitignorePath = join(tempDir, '.gitignore')

      await cmdUninstall(tempDir, { force: true, nonInteractive: true })

      const after = readFileSync(gitignorePath, 'utf-8')
      assert.ok(after.includes('node_modules'), 'node_modules/ entry should be preserved')
    })

    it('should handle missing .gitignore', async () => {
      tempDir = createTempDir()
      mkdirSync(tempDir, { recursive: true })
      writeFileSync(join(tempDir, 'package.json'), '{"name":"test"}')
      mkdirSync(join(tempDir, '.claude'), { recursive: true })
      writeFileSync(join(tempDir, 'sparq.config.json'), '{}')

      // Should not throw
      await cmdUninstall(tempDir, { force: true, nonInteractive: true })
    })
  })

  // -------------------------------------------------------------------------
  // Empty directory cleanup
  // -------------------------------------------------------------------------

  describe('empty directory cleanup', () => {
    let tempDir

    afterEach(() => {
      cleanTempDir(tempDir)
    })

    it('should leave .claude/ dir intact when it still has content', async () => {
      tempDir = await initProject({ name: 'uninstall-empty-dirs' })

      await cmdUninstall(tempDir, { force: true, nonInteractive: true })

      // .claude/ should still exist because settings.local.json remains
      assert.ok(
        existsSync(join(tempDir, '.claude')),
        '.claude/ should still exist when non-SparQ content remains',
      )
    })

    it('should not remove .claude/ when non-SparQ content remains', async () => {
      tempDir = await initProject({ name: 'uninstall-claude-keep' })
      // Add non-sparq content in .claude/
      writeFileSync(join(tempDir, '.claude', 'my-custom-config.json'), '{}')

      await cmdUninstall(tempDir, { force: true, nonInteractive: true })

      assert.ok(existsSync(join(tempDir, '.claude')), '.claude/ should still exist')
      assert.ok(
        existsSync(join(tempDir, '.claude', 'my-custom-config.json')),
        'Custom file should be preserved',
      )
    })
  })

  // -------------------------------------------------------------------------
  // Dry-run mode
  // -------------------------------------------------------------------------

  describe('dry-run mode', () => {
    let tempDir

    before(async () => {
      tempDir = await initProject({ name: 'uninstall-dryrun' })
    })

    after(() => {
      cleanTempDir(tempDir)
    })

    it('should not remove files in dry-run mode', async () => {
      setDryRun(true)

      await cmdUninstall(tempDir, { force: true, nonInteractive: true })

      setDryRun(false)

      // All files should still exist
      assert.ok(existsSync(join(tempDir, 'sparq.config.json')), 'Config should still exist')
      assert.ok(existsSync(join(tempDir, '.sparq')), '.sparq/ should still exist')
      for (const name of AGENT_NAMES) {
        assert.ok(
          existsSync(join(tempDir, '.claude', 'agents', name)),
          `Agent ${name} should still exist`,
        )
      }
      assert.ok(capture.text().includes('dry-run'), 'Should indicate dry-run mode in output')
    })
  })

  // -------------------------------------------------------------------------
  // Full uninstall completeness
  // -------------------------------------------------------------------------

  describe('full uninstall completeness', () => {
    let tempDir

    before(async () => {
      tempDir = await initProject({ name: 'uninstall-complete' })
    })

    after(() => {
      cleanTempDir(tempDir)
    })

    it('should report item count in completion message', async () => {
      await cmdUninstall(tempDir, { force: true, nonInteractive: true })

      assert.ok(
        capture.text().includes('Uninstall complete'),
        'Should show uninstall complete message',
      )
      assert.ok(capture.text().includes('item(s) removed'), 'Should report number of items removed')
    })
  })

  // -------------------------------------------------------------------------
  // Uninstall with only config present (partial installation)
  // -------------------------------------------------------------------------

  describe('partial installation', () => {
    let tempDir

    afterEach(() => {
      cleanTempDir(tempDir)
    })

    it('should uninstall when only sparq.config.json exists', async () => {
      tempDir = createTempDir()
      mkdirSync(tempDir, { recursive: true })
      writeFileSync(join(tempDir, 'package.json'), '{"name":"test"}')
      writeFileSync(join(tempDir, 'sparq.config.json'), '{"version":"1.0.0"}')

      await cmdUninstall(tempDir, { force: true, nonInteractive: true })

      assert.ok(!existsSync(join(tempDir, 'sparq.config.json')), 'Config should be removed')
      assert.ok(capture.text().includes('Uninstall complete'), 'Should complete successfully')
    })
  })
})
