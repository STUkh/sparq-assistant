import assert from 'node:assert/strict'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { after, afterEach, before, beforeEach, describe, it } from 'node:test'
import { cmdDoctor } from '../../bin/lib/commands/doctor.mjs'
import { AGENT_NAMES } from '../../bin/lib/constants.mjs'
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

// ---------------------------------------------------------------------------
// cmdDoctor
// ---------------------------------------------------------------------------

describe('cmdDoctor', () => {
  beforeEach(() => {
    capture.start()
    resetState()
  })

  afterEach(() => {
    capture.stop()
  })

  // -------------------------------------------------------------------------
  // Valid installation
  // -------------------------------------------------------------------------

  describe('with valid installation', () => {
    let tempDir

    before(async () => {
      tempDir = createTempDir()
      createMockProject(tempDir, {
        name: 'doctor-unit-test',
        dependencies: { vue: '^3.4.0' },
        devDependencies: { '@playwright/test': '^1.40.0', typescript: '^5.3.0' },
        withGit: true,
      })
      const { exitCode } = await runCli(['init', '--non-interactive', tempDir])
      assert.equal(exitCode, 0, 'Init should succeed')
    })

    after(() => {
      cleanTempDir(tempDir)
    })

    it('should return true for a complete valid installation', async () => {
      const result = await cmdDoctor(tempDir)
      assert.equal(result, true)
    })

    it('should report no warnings for fresh installation', async () => {
      await cmdDoctor(tempDir)
      const text = capture.text()
      // A fresh install should have all checks passing — no FAIL markers
      assert.ok(!text.includes('[FAIL]'), 'Should have no FAIL markers')
    })
  })

  // -------------------------------------------------------------------------
  // Missing files
  // -------------------------------------------------------------------------

  describe('missing files', () => {
    let tempDir

    before(async () => {
      tempDir = createTempDir()
      createMockProject(tempDir, {
        name: 'doctor-missing-test',
        dependencies: { vue: '^3.4.0' },
        devDependencies: { '@playwright/test': '^1.40.0' },
        withGit: true,
      })
      await runCli(['init', '--non-interactive', tempDir])
    })

    after(() => {
      cleanTempDir(tempDir)
    })

    it('should detect missing agent files', async () => {
      const agentPath = join(tempDir, '.claude', 'agents', AGENT_NAMES[0])
      const backup = readFileSync(agentPath)
      unlinkSync(agentPath)

      const result = await cmdDoctor(tempDir)

      assert.equal(result, false)
      assert.ok(capture.text().includes(`Agent missing: ${AGENT_NAMES[0]}`))

      // Restore for other tests
      writeFileSync(agentPath, backup)
    })

    it('should detect missing skill directories', async () => {
      const skillsDir = join(tempDir, '.claude', 'skills')
      const skillDirs = existsSync(skillsDir)
        ? readdirSync(skillsDir).filter(
            (d) => d.startsWith('sparq-') && statSync(join(skillsDir, d)).isDirectory(),
          )
        : []

      // Remove the first skill directory if one exists
      if (skillDirs.length > 0) {
        const firstSkill = skillDirs[0]
        const skillPath = join(skillsDir, firstSkill)
        rmSync(skillPath, { recursive: true, force: true })

        const result = await cmdDoctor(tempDir)

        assert.equal(result, false)
        assert.ok(capture.text().includes(`Skill missing: ${firstSkill}`))
      }
    })

    it('should detect missing sparq.config.json', async () => {
      const configPath = join(tempDir, 'sparq.config.json')
      const backup = readFileSync(configPath, 'utf-8')
      unlinkSync(configPath)

      const result = await cmdDoctor(tempDir)

      assert.equal(result, false)
      assert.ok(capture.text().includes('sparq.config.json not found'))

      writeFileSync(configPath, backup)
    })
  })

  // -------------------------------------------------------------------------
  // Invalid config
  // -------------------------------------------------------------------------

  describe('invalid config', () => {
    let tempDir

    before(async () => {
      tempDir = createTempDir()
      createMockProject(tempDir, {
        name: 'doctor-config-test',
        dependencies: { vue: '^3.4.0' },
        devDependencies: { '@playwright/test': '^1.40.0' },
        withGit: true,
      })
      await runCli(['init', '--non-interactive', tempDir])
    })

    after(() => {
      cleanTempDir(tempDir)
    })

    it('should detect invalid JSON in sparq.config.json', async () => {
      const configPath = join(tempDir, 'sparq.config.json')
      const backup = readFileSync(configPath, 'utf-8')
      writeFileSync(configPath, '{ broken json !!!')

      const result = await cmdDoctor(tempDir)

      assert.equal(result, false)
      assert.ok(capture.text().includes('not valid JSON'))

      writeFileSync(configPath, backup)
    })

    it('should detect config schema validation errors', async () => {
      const configPath = join(tempDir, 'sparq.config.json')
      const backup = readFileSync(configPath, 'utf-8')
      writeFileSync(configPath, JSON.stringify({ version: 'bad' }))

      await cmdDoctor(tempDir)
      const text = capture.text()
      // Missing required fields should produce warnings or errors
      assert.ok(
        text.includes('Config') || text.includes('Schema') || text.includes('Missing'),
        'Should report config validation issues',
      )

      writeFileSync(configPath, backup)
    })
  })

  // -------------------------------------------------------------------------
  // MCP checks
  // -------------------------------------------------------------------------

  describe('MCP checks', () => {
    let tempDir

    before(async () => {
      tempDir = createTempDir()
      createMockProject(tempDir, {
        name: 'doctor-mcp-test',
        dependencies: { vue: '^3.4.0' },
        devDependencies: { '@playwright/test': '^1.40.0' },
        withGit: true,
      })
      await runCli(['init', '--non-interactive', tempDir])
    })

    after(() => {
      cleanTempDir(tempDir)
    })

    it('should detect missing .mcp.json', async () => {
      const mcpPath = join(tempDir, '.mcp.json')
      const backup = readFileSync(mcpPath, 'utf-8')
      unlinkSync(mcpPath)

      const result = await cmdDoctor(tempDir)

      assert.equal(result, false)
      assert.ok(capture.text().includes('MCP server missing'))

      writeFileSync(mcpPath, backup)
    })

    it('should detect missing MCP server entries', async () => {
      const mcpPath = join(tempDir, '.mcp.json')
      const backup = readFileSync(mcpPath, 'utf-8')
      writeFileSync(mcpPath, JSON.stringify({ mcpServers: {} }))

      const result = await cmdDoctor(tempDir)

      assert.equal(result, false)
      const text = capture.text()
      // Default non-interactive config only requires playwright
      assert.ok(
        text.includes('MCP server missing: playwright'),
        'Should report missing playwright MCP server',
      )

      writeFileSync(mcpPath, backup)
    })
  })

  // -------------------------------------------------------------------------
  // Gitignore checks
  // -------------------------------------------------------------------------

  describe('gitignore checks', () => {
    let tempDir

    before(async () => {
      tempDir = createTempDir()
      createMockProject(tempDir, {
        name: 'doctor-gitignore-test',
        dependencies: { vue: '^3.4.0' },
        devDependencies: { '@playwright/test': '^1.40.0' },
        withGit: true,
      })
      await runCli(['init', '--non-interactive', tempDir])
    })

    after(() => {
      cleanTempDir(tempDir)
    })

    it('should detect missing .gitignore', async () => {
      const gitignorePath = join(tempDir, '.gitignore')
      const backup = readFileSync(gitignorePath, 'utf-8')
      unlinkSync(gitignorePath)

      const result = await cmdDoctor(tempDir)

      assert.equal(result, false)
      assert.ok(capture.text().includes('.gitignore not found'))

      writeFileSync(gitignorePath, backup)
    })

    it('should detect .gitignore without .sparq/ entry', async () => {
      const gitignorePath = join(tempDir, '.gitignore')
      const backup = readFileSync(gitignorePath, 'utf-8')
      writeFileSync(gitignorePath, 'node_modules/\n')

      await cmdDoctor(tempDir)

      assert.ok(capture.text().includes('.gitignore missing .sparq/ entry'))

      writeFileSync(gitignorePath, backup)
    })
  })

  // -------------------------------------------------------------------------
  // Output directory checks
  // -------------------------------------------------------------------------

  describe('output directory checks', () => {
    let tempDir

    before(async () => {
      tempDir = createTempDir()
      createMockProject(tempDir, {
        name: 'doctor-outdir-test',
        dependencies: { vue: '^3.4.0' },
        devDependencies: { '@playwright/test': '^1.40.0' },
        withGit: true,
      })
      await runCli(['init', '--non-interactive', tempDir])
    })

    after(() => {
      cleanTempDir(tempDir)
    })

    it('should warn for missing .sparq/ subdirectories', async () => {
      const reqDir = join(tempDir, '.sparq', 'requirements')
      rmSync(reqDir, { recursive: true, force: true })

      await cmdDoctor(tempDir)

      const text = capture.text()
      assert.ok(
        text.includes('.sparq/requirements') && text.includes('not found'),
        'Should warn about missing .sparq/requirements',
      )

      // Restore
      mkdirSync(reqDir, { recursive: true })
    })
  })

  // -------------------------------------------------------------------------
  // Permissions checks
  // -------------------------------------------------------------------------

  describe('permissions checks', () => {
    let tempDir

    before(async () => {
      tempDir = createTempDir()
      createMockProject(tempDir, {
        name: 'doctor-perms-test',
        dependencies: { vue: '^3.4.0' },
        devDependencies: { '@playwright/test': '^1.40.0' },
        withGit: true,
      })
      await runCli(['init', '--non-interactive', tempDir])
    })

    after(() => {
      cleanTempDir(tempDir)
    })

    it('should warn when settings.local.json is missing', async () => {
      const settingsPath = join(tempDir, '.claude', 'settings.local.json')
      const backup = existsSync(settingsPath) ? readFileSync(settingsPath, 'utf-8') : null
      if (existsSync(settingsPath)) unlinkSync(settingsPath)

      await cmdDoctor(tempDir)

      assert.ok(capture.text().includes('settings.local.json not found'))

      if (backup) writeFileSync(settingsPath, backup)
    })
  })

  // -------------------------------------------------------------------------
  // Auto-fix with --fix
  // -------------------------------------------------------------------------

  describe('auto-fix with --fix', () => {
    let tempDir

    before(async () => {
      tempDir = createTempDir()
      createMockProject(tempDir, {
        name: 'doctor-fix-test',
        dependencies: { vue: '^3.4.0' },
        devDependencies: { '@playwright/test': '^1.40.0' },
        withGit: true,
      })
      await runCli(['init', '--non-interactive', tempDir])
    })

    after(() => {
      cleanTempDir(tempDir)
    })

    it('should restore missing agent file with fix', async () => {
      const agentPath = join(tempDir, '.claude', 'agents', AGENT_NAMES[0])
      unlinkSync(agentPath)

      await cmdDoctor(tempDir, { fix: true })

      assert.ok(existsSync(agentPath), 'Agent file should be restored after --fix')
    })

    it('should create missing output directory with fix', async () => {
      const reqDir = join(tempDir, '.sparq', 'requirements')
      rmSync(reqDir, { recursive: true, force: true })

      await cmdDoctor(tempDir, { fix: true })

      assert.ok(existsSync(reqDir), 'Output directory should be recreated after --fix')
    })

    it('should add .sparq/ to .gitignore with fix', async () => {
      const gitignorePath = join(tempDir, '.gitignore')
      writeFileSync(gitignorePath, 'node_modules/\n')

      await cmdDoctor(tempDir, { fix: true })

      const content = readFileSync(gitignorePath, 'utf-8')
      assert.ok(content.includes('.sparq/'), '.gitignore should contain .sparq/ after --fix')
    })
  })

  // -------------------------------------------------------------------------
  // Return value
  // -------------------------------------------------------------------------

  describe('return value', () => {
    let tempDir

    before(async () => {
      tempDir = createTempDir()
      createMockProject(tempDir, {
        name: 'doctor-return-test',
        dependencies: { vue: '^3.4.0' },
        devDependencies: { '@playwright/test': '^1.40.0' },
        withGit: true,
      })
      await runCli(['init', '--non-interactive', tempDir])
    })

    after(() => {
      cleanTempDir(tempDir)
    })

    it('should return true when all checks pass', async () => {
      const result = await cmdDoctor(tempDir)
      assert.equal(result, true)
    })

    it('should return false when critical checks fail', async () => {
      const agentPath = join(tempDir, '.claude', 'agents', AGENT_NAMES[0])
      const backup = readFileSync(agentPath)
      unlinkSync(agentPath)

      const result = await cmdDoctor(tempDir)

      assert.equal(result, false)

      writeFileSync(agentPath, backup)
    })
  })

  // -------------------------------------------------------------------------
  // E2E setup checks
  // -------------------------------------------------------------------------

  describe('E2E setup checks', () => {
    let tempDir

    before(async () => {
      tempDir = createTempDir()
      createMockProject(tempDir, {
        name: 'doctor-e2e-test',
        dependencies: { vue: '^3.4.0' },
        devDependencies: { '@playwright/test': '^1.40.0' },
        withGit: true,
      })
      await runCli(['init', '--non-interactive', tempDir])
    })

    after(() => {
      cleanTempDir(tempDir)
    })

    it('should pass E2E checks when e2e/ directory exists with structure', async () => {
      mkdirSync(join(tempDir, 'e2e', 'specs'), { recursive: true })
      mkdirSync(join(tempDir, 'e2e', 'pages'), { recursive: true })
      writeFileSync(join(tempDir, 'playwright.config.ts'), 'export default {}')

      await cmdDoctor(tempDir)

      const text = capture.text()
      assert.ok(
        !text.includes('E2E directory not found') || text.includes('e2e/'),
        'Should not fail on E2E directory check when it exists',
      )
    })
  })

  // -------------------------------------------------------------------------
  // Auto-fix: generate permissions
  // -------------------------------------------------------------------------

  describe('auto-fix: generate permissions', () => {
    let tempDir

    before(async () => {
      tempDir = createTempDir()
      createMockProject(tempDir, {
        name: 'doctor-fixperms-test',
        dependencies: { vue: '^3.4.0' },
        devDependencies: { '@playwright/test': '^1.40.0' },
        withGit: true,
      })
      await runCli(['init', '--non-interactive', tempDir])
    })

    after(() => {
      cleanTempDir(tempDir)
    })

    it('should regenerate settings.local.json with --fix', async () => {
      const settingsPath = join(tempDir, '.claude', 'settings.local.json')
      if (existsSync(settingsPath)) unlinkSync(settingsPath)

      await cmdDoctor(tempDir, { fix: true })

      assert.ok(existsSync(settingsPath), 'settings.local.json should be recreated after --fix')
    })
  })

  // -------------------------------------------------------------------------
  // Deep MCP health checks
  // -------------------------------------------------------------------------

  describe('deep MCP health checks', () => {
    let tempDir

    before(async () => {
      tempDir = createTempDir()
      createMockProject(tempDir, {
        name: 'doctor-deep-test',
        dependencies: { vue: '^3.4.0' },
        devDependencies: { '@playwright/test': '^1.40.0' },
        withGit: true,
      })
      await runCli(['init', '--non-interactive', tempDir])
    })

    after(() => {
      cleanTempDir(tempDir)
    })

    it('should check MCP server structure in deep mode', async () => {
      await cmdDoctor(tempDir, { deep: true })

      assert.ok(capture.text().includes('MCP Health'), 'Deep mode should show MCP Health section')
    })

    it('should warn about placeholder credentials in deep mode', async () => {
      const mcpPath = join(tempDir, '.mcp.json')
      const mcpData = JSON.parse(readFileSync(mcpPath, 'utf-8'))
      if (!mcpData.mcpServers) mcpData.mcpServers = {}
      if (!mcpData.mcpServers.testrail) mcpData.mcpServers.testrail = {}
      mcpData.mcpServers.testrail.command = 'npx'
      mcpData.mcpServers.testrail.env = {
        TESTRAIL_BASE_URL: 'https://yourteam.testrail.io',
        TESTRAIL_USERNAME: 'your-email@example.com',
        TESTRAIL_API_KEY: 'your-api-key',
      }
      writeFileSync(mcpPath, JSON.stringify(mcpData, null, 2))

      await cmdDoctor(tempDir, { deep: true })

      assert.ok(capture.text().includes('placeholder'), 'Should warn about placeholder credentials')
    })
  })

  // -------------------------------------------------------------------------
  // No installation at all
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

    it('should return false when .claude/ directory is missing', async () => {
      const result = await cmdDoctor(tempDir)
      assert.equal(result, false)
    })

    it('should report .claude/ not found', async () => {
      await cmdDoctor(tempDir)
      assert.ok(capture.text().includes('.claude/ directory not found'))
    })
  })

  // -------------------------------------------------------------------------
  // Dry-run mode with --fix
  // -------------------------------------------------------------------------

  describe('dry-run mode with --fix', () => {
    let tempDir

    before(async () => {
      tempDir = createTempDir()
      createMockProject(tempDir, {
        name: 'doctor-dryrun-test',
        dependencies: { vue: '^3.4.0' },
        devDependencies: { '@playwright/test': '^1.40.0' },
        withGit: true,
      })
      await runCli(['init', '--non-interactive', tempDir])
    })

    after(() => {
      cleanTempDir(tempDir)
    })

    it('should not modify files in dry-run mode', async () => {
      const agentPath = join(tempDir, '.claude', 'agents', AGENT_NAMES[0])
      unlinkSync(agentPath)

      setDryRun(true)
      await cmdDoctor(tempDir, { fix: true })
      setDryRun(false)

      assert.ok(!existsSync(agentPath), 'Agent should NOT be restored in dry-run mode')
      assert.ok(
        capture.text().includes('Would apply') || capture.text().includes('dry-run'),
        'Should indicate dry-run mode',
      )
    })
  })
})
