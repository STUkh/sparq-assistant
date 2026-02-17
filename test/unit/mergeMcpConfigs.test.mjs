import assert from 'node:assert/strict'
import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'
import {
  cleanTempDir,
  createMockProject,
  createTempDir,
  readJsonFile,
  runCli,
} from '../helpers/setup.mjs'

describe('MCP config merging via init', () => {
  let tempDir

  beforeEach(() => {
    tempDir = createTempDir()
    createMockProject(tempDir, {
      dependencies: { vue: '^3.4.0' },
      withGit: true,
    })
  })

  afterEach(() => {
    cleanTempDir(tempDir)
  })

  it('should create .mcp.json when no existing .mcp.json exists', async () => {
    await runCli(['init', '--non-interactive', tempDir])

    assert.ok(existsSync(join(tempDir, '.mcp.json')), '.mcp.json should be created during init')
  })

  it('should include only required MCP servers in .mcp.json', async () => {
    await runCli(['init', '--non-interactive', tempDir])

    const mcpConfig = readJsonFile(tempDir, '.mcp.json')
    assert.ok(mcpConfig.mcpServers, '.mcp.json should have mcpServers key')

    // Default non-interactive init only installs playwright (conditional MCP)
    assert.ok(
      'playwright' in mcpConfig.mcpServers,
      'MCP server "playwright" should be present in .mcp.json',
    )
  })

  it('should preserve existing MCP servers when merging', async () => {
    // Create a pre-existing .mcp.json with a custom server
    const existingMcp = {
      mcpServers: {
        'my-custom-server': {
          type: 'stdio',
          command: 'node',
          args: ['my-server.js'],
        },
      },
    }
    writeFileSync(join(tempDir, '.mcp.json'), JSON.stringify(existingMcp, null, 2))

    await runCli(['init', '--non-interactive', tempDir])

    const mcpConfig = readJsonFile(tempDir, '.mcp.json')

    // Custom server should be preserved
    assert.ok(
      'my-custom-server' in mcpConfig.mcpServers,
      'Pre-existing custom server should be preserved',
    )

    // SparQ servers should be added (playwright always included)
    assert.ok('playwright' in mcpConfig.mcpServers, 'Playwright server should be added')
  })

  it('should not overwrite existing server with same name', async () => {
    // Create .mcp.json with a custom playwright server config
    const existingMcp = {
      mcpServers: {
        playwright: {
          type: 'stdio',
          command: 'custom-playwright',
          args: ['--custom'],
        },
      },
    }
    writeFileSync(join(tempDir, '.mcp.json'), JSON.stringify(existingMcp, null, 2))

    await runCli(['init', '--non-interactive', tempDir])

    const mcpConfig = readJsonFile(tempDir, '.mcp.json')

    // The existing playwright config should be preserved, not overwritten
    assert.equal(
      mcpConfig.mcpServers.playwright.command,
      'custom-playwright',
      'Existing server config should be preserved (not overwritten)',
    )
  })

  it('should produce identical .mcp.json when running init twice (idempotent)', async () => {
    await runCli(['init', '--non-interactive', tempDir])
    const mcpAfterFirst = readJsonFile(tempDir, '.mcp.json')

    await runCli(['init', '--non-interactive', tempDir])
    const mcpAfterSecond = readJsonFile(tempDir, '.mcp.json')

    assert.deepEqual(
      mcpAfterSecond,
      mcpAfterFirst,
      '.mcp.json should be unchanged after second init',
    )
  })

  it('should handle invalid JSON in existing .mcp.json gracefully', async () => {
    // Write invalid JSON
    writeFileSync(join(tempDir, '.mcp.json'), '{ this is not valid json !!!')

    const { stdout, exitCode } = await runCli(['init', '--non-interactive', tempDir])

    // Should not crash
    assert.equal(exitCode, 0, 'Init should complete successfully despite invalid .mcp.json')

    // Should create a valid .mcp.json
    const mcpConfig = readJsonFile(tempDir, '.mcp.json')
    assert.ok(mcpConfig.mcpServers, 'Should create valid .mcp.json with mcpServers')

    // The CLI saves a .mcp.json.broken backup
    assert.ok(
      stdout.includes('not valid JSON') || stdout.includes('.broken'),
      'Should warn about invalid JSON',
    )
  })

  it('should create .mcp.json.broken backup for invalid JSON', async () => {
    writeFileSync(join(tempDir, '.mcp.json'), '{ invalid json content }')

    await runCli(['init', '--non-interactive', tempDir])

    assert.ok(
      existsSync(join(tempDir, '.mcp.json.broken')),
      'Should create .mcp.json.broken backup',
    )
  })
})
