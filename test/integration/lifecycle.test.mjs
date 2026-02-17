import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { after, before, describe, it } from 'node:test'
import {
  cleanTempDir,
  createMockProject,
  createTempDir,
  readJsonFile,
  readTextFile,
  runCli,
} from '../helpers/setup.mjs'

describe(
  'Full lifecycle: init -> doctor -> update -> doctor -> uninstall',
  { concurrency: false },
  () => {
    let tempDir

    before(() => {
      tempDir = createTempDir()
      createMockProject(tempDir, {
        name: 'lifecycle-test',
        dependencies: {
          vue: '^3.4.0',
          primevue: '^4.0.0',
          pinia: '^2.1.0',
        },
        devDependencies: {
          '@playwright/test': '^1.40.0',
          typescript: '^5.3.0',
        },
        withGit: true,
      })
    })

    after(() => {
      cleanTempDir(tempDir)
    })

    it('Step 1: init --non-interactive should create all files', async () => {
      const { exitCode } = await runCli(['init', '--non-interactive', tempDir])

      assert.equal(exitCode, 0, 'Init should exit 0')

      // Verify essential files exist
      assert.ok(existsSync(join(tempDir, '.claude', 'agents')), '.claude/agents/ should exist')
      assert.ok(existsSync(join(tempDir, '.claude', 'skills')), '.claude/skills/ should exist')
      assert.ok(
        existsSync(join(tempDir, '.claude', 'templates')),
        '.claude/templates/ should exist',
      )
      assert.ok(existsSync(join(tempDir, 'sparq.config.json')), 'sparq.config.json should exist')
      assert.ok(existsSync(join(tempDir, '.mcp.json')), '.mcp.json should exist')
      assert.ok(
        existsSync(join(tempDir, '.claude', 'rules', 'sparq.md')),
        '.claude/rules/sparq.md should exist',
      )
      assert.ok(
        existsSync(join(tempDir, '.sparq', '.manifest.json')),
        '.sparq/.manifest.json should exist',
      )

      // Verify output directories
      assert.ok(
        existsSync(join(tempDir, '.sparq', 'requirements')),
        '.sparq/requirements/ should exist',
      )
      assert.ok(
        existsSync(join(tempDir, '.sparq', 'test-cases')),
        '.sparq/test-cases/ should exist',
      )
      assert.ok(existsSync(join(tempDir, '.sparq', 'coverage')), '.sparq/coverage/ should exist')

      // Verify all 5 agents
      const agents = [
        'sparq-orchestrator.md',
        'sparq-requirements-analyst.md',
        'sparq-manual-test-writer.md',
        'sparq-automation-engineer.md',
        'sparq-test-validator.md',
      ]
      for (const agent of agents) {
        assert.ok(
          existsSync(join(tempDir, '.claude', 'agents', agent)),
          `Agent ${agent} should exist`,
        )
      }

      // Verify playwright-best-practices installed (not cypress)
      assert.ok(
        existsSync(join(tempDir, '.claude', 'skills', 'sparq-playwright-best-practices')),
        'sparq-playwright-best-practices skill should be installed for Playwright projects',
      )
      assert.ok(
        !existsSync(join(tempDir, '.claude', 'skills', 'sparq-cypress-best-practices')),
        'sparq-cypress-best-practices should NOT be installed for Playwright projects',
      )

      // Verify config content
      const config = readJsonFile(tempDir, 'sparq.config.json')
      assert.ok(config.version, 'Config should have a version')
      assert.ok(config.project, 'Config should have a project section')
      assert.ok(config.sources, 'Config should have a sources section')
      assert.equal(config.techStack, undefined, 'Config should NOT have a techStack section')
      assert.ok(
        config.project.componentFileExtensions,
        'project should have componentFileExtensions',
      )
    })

    it('Step 2: doctor should pass all checks on fresh install', async () => {
      const { stdout, exitCode } = await runCli(['doctor', tempDir])

      assert.equal(exitCode, 0, 'Doctor should exit 0 on valid installation')
      assert.ok(stdout.includes('checks passed'), 'Should show checks passed summary')
    })

    it('Step 3: update should complete without errors', async () => {
      const { stdout, exitCode } = await runCli(['update', '--non-interactive', '--force', tempDir])

      assert.equal(exitCode, 0, 'Update should exit 0')
      assert.ok(
        stdout.includes('Update complete') || stdout.includes('updated'),
        'Should report update completion',
      )

      // Config should still exist
      assert.ok(
        existsSync(join(tempDir, 'sparq.config.json')),
        'sparq.config.json should be preserved',
      )

      // Manifest should be updated
      assert.ok(
        existsSync(join(tempDir, '.sparq', '.manifest.json')),
        'Manifest should still exist',
      )
    })

    it('Step 4: doctor should still pass after update', async () => {
      const { stdout, exitCode } = await runCli(['doctor', tempDir])

      assert.equal(exitCode, 0, 'Doctor should still pass after update')
      assert.ok(stdout.includes('checks passed'), 'Should show checks passed')
    })

    it('Step 5: uninstall --force should remove all SparQ files', async () => {
      const { stdout, exitCode } = await runCli([
        'uninstall',
        '--force',
        '--non-interactive',
        tempDir,
      ])

      assert.equal(exitCode, 0, 'Uninstall should exit 0')
      assert.ok(
        stdout.includes('Uninstall complete') || stdout.includes('removed'),
        'Should report uninstall completion',
      )

      // SparQ-specific files should be removed
      assert.ok(
        !existsSync(join(tempDir, 'sparq.config.json')),
        'sparq.config.json should be removed',
      )
      assert.ok(!existsSync(join(tempDir, '.sparq')), '.sparq/ directory should be removed')

      // Agent files should be removed
      assert.ok(
        !existsSync(join(tempDir, '.claude', 'agents', 'sparq-orchestrator.md')),
        'Agent files should be removed',
      )

      // SparQ skill directories should be removed
      assert.ok(
        !existsSync(join(tempDir, '.claude', 'skills', 'sparq-analyze')),
        'Skill directories should be removed',
      )
    })

    it('Step 6: non-SparQ files should be preserved after uninstall', async () => {
      // package.json and .gitignore should still exist
      assert.ok(existsSync(join(tempDir, 'package.json')), 'package.json should be preserved')
      assert.ok(existsSync(join(tempDir, '.gitignore')), '.gitignore should be preserved')
      assert.ok(existsSync(join(tempDir, '.git')), '.git/ directory should be preserved')

      // .gitignore should not contain .sparq/ anymore
      const gitignore = readTextFile(tempDir, '.gitignore')
      if (gitignore) {
        const sparqLines = gitignore
          .split('\n')
          .filter((l) => l.trim() === '.sparq/' || l.trim() === '.sparq')
        assert.equal(sparqLines.length, 0, '.sparq/ should be removed from .gitignore')
      }
    })
  },
)
