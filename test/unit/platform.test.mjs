import assert from 'node:assert/strict'
import { existsSync, lstatSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { AGENTS_MD_BLOCK_END, AGENTS_MD_BLOCK_START } from '../../bin/lib/constants.mjs'
import {
  checkPlatformExtras,
  detectPlatforms,
  generateAgentsMd,
  installPlatformExtras,
  removeAgentsMd,
  removePlatformExtras,
} from '../../bin/lib/platform.mjs'
import { resetState, setDryRun } from '../../bin/lib/state.mjs'
import { cleanTempDir, createOutputCapture, createTempDir } from '../helpers/setup.mjs'

const capture = createOutputCapture()

describe('platform — detectPlatforms', () => {
  let tempDir

  beforeEach(() => {
    tempDir = createTempDir()
    capture.start()
  })

  afterEach(() => {
    capture.stop()
    cleanTempDir(tempDir)
    resetState()
  })

  it('returns empty array when no platform markers found', () => {
    const result = detectPlatforms(tempDir)
    assert.deepEqual(result, [])
  })

  it('detects cursor when .cursor/ directory is present', () => {
    mkdirSync(join(tempDir, '.cursor'), { recursive: true })
    const result = detectPlatforms(tempDir)
    assert.deepEqual(result, ['cursor'])
  })

  it('detects codex when .codex/ directory is present', () => {
    mkdirSync(join(tempDir, '.codex'), { recursive: true })
    const result = detectPlatforms(tempDir)
    assert.deepEqual(result, ['codex'])
  })

  it('detects codex when .agents/ directory is present', () => {
    mkdirSync(join(tempDir, '.agents'), { recursive: true })
    const result = detectPlatforms(tempDir)
    assert.deepEqual(result, ['codex'])
  })

  it('detects multiple platforms simultaneously when both .cursor/ and .codex/ are present', () => {
    mkdirSync(join(tempDir, '.cursor'), { recursive: true })
    mkdirSync(join(tempDir, '.codex'), { recursive: true })
    const result = detectPlatforms(tempDir)
    assert.ok(result.includes('cursor'), 'should detect cursor')
    assert.ok(result.includes('codex'), 'should detect codex')
    assert.equal(result.length, 2)
  })

  it('detects cursor and codex when .cursor/ and .agents/ are present', () => {
    mkdirSync(join(tempDir, '.cursor'), { recursive: true })
    mkdirSync(join(tempDir, '.agents'), { recursive: true })
    const result = detectPlatforms(tempDir)
    assert.ok(result.includes('cursor'))
    assert.ok(result.includes('codex'))
    assert.equal(result.length, 2)
  })
})

describe('platform — generateAgentsMd', () => {
  let tempDir

  beforeEach(() => {
    tempDir = createTempDir()
    capture.start()
  })

  afterEach(() => {
    capture.stop()
    cleanTempDir(tempDir)
    resetState()
  })

  it('creates AGENTS.md with sentinel markers', () => {
    generateAgentsMd(tempDir)
    const content = readFileSync(join(tempDir, 'AGENTS.md'), 'utf-8')
    assert.ok(content.includes(AGENTS_MD_BLOCK_START))
    assert.ok(content.includes(AGENTS_MD_BLOCK_END))
  })

  it('includes agent summaries', () => {
    generateAgentsMd(tempDir)
    const content = readFileSync(join(tempDir, 'AGENTS.md'), 'utf-8')
    assert.ok(content.includes('sparq-orchestrator'))
    assert.ok(content.includes('sparq-requirements-analyst'))
    assert.ok(content.includes('sparq-automation-engineer'))
  })

  it('replaces existing SparQ block in AGENTS.md', () => {
    const initial = `# My Project\n\n${AGENTS_MD_BLOCK_START}\nOld content\n${AGENTS_MD_BLOCK_END}\n\n# Other section\n`
    writeFileSync(join(tempDir, 'AGENTS.md'), initial)
    generateAgentsMd(tempDir)
    const content = readFileSync(join(tempDir, 'AGENTS.md'), 'utf-8')
    assert.ok(content.includes('# My Project'))
    assert.ok(content.includes('# Other section'))
    assert.ok(!content.includes('Old content'))
    assert.ok(content.includes('sparq-orchestrator'))
  })

  it('appends block to existing AGENTS.md without markers', () => {
    writeFileSync(join(tempDir, 'AGENTS.md'), '# Existing Agents\n\nSome other agents.\n')
    generateAgentsMd(tempDir)
    const content = readFileSync(join(tempDir, 'AGENTS.md'), 'utf-8')
    assert.ok(content.includes('# Existing Agents'))
    assert.ok(content.includes(AGENTS_MD_BLOCK_START))
    assert.ok(content.includes('sparq-orchestrator'))
  })

  it('skips write in dry-run mode', () => {
    setDryRun(true)
    generateAgentsMd(tempDir)
    assert.ok(!existsSync(join(tempDir, 'AGENTS.md')))
  })
})

describe('platform — removeAgentsMd', () => {
  let tempDir

  beforeEach(() => {
    tempDir = createTempDir()
    capture.start()
  })

  afterEach(() => {
    capture.stop()
    cleanTempDir(tempDir)
    resetState()
  })

  it('removes file when only SparQ content', () => {
    generateAgentsMd(tempDir)
    assert.ok(existsSync(join(tempDir, 'AGENTS.md')))
    removeAgentsMd(tempDir)
    assert.ok(!existsSync(join(tempDir, 'AGENTS.md')))
  })

  it('preserves non-SparQ content', () => {
    const content = `# My Agents\n\n${AGENTS_MD_BLOCK_START}\nSparQ stuff\n${AGENTS_MD_BLOCK_END}\n\n# Other\n`
    writeFileSync(join(tempDir, 'AGENTS.md'), content)
    removeAgentsMd(tempDir)
    const result = readFileSync(join(tempDir, 'AGENTS.md'), 'utf-8')
    assert.ok(result.includes('# My Agents'))
    assert.ok(result.includes('# Other'))
    assert.ok(!result.includes(AGENTS_MD_BLOCK_START))
  })

  it('does nothing when file does not exist', () => {
    removeAgentsMd(tempDir) // Should not throw
  })

  it('leaves file as-is when no sentinel markers', () => {
    writeFileSync(join(tempDir, 'AGENTS.md'), '# Just a file\n')
    removeAgentsMd(tempDir)
    const result = readFileSync(join(tempDir, 'AGENTS.md'), 'utf-8')
    assert.equal(result, '# Just a file\n')
  })
})

describe('platform — installPlatformExtras (cursor)', () => {
  let tempDir

  beforeEach(() => {
    tempDir = createTempDir()
    capture.start()
    // Create minimal project structure
    mkdirSync(join(tempDir, '.claude', 'skills', 'sparq-start'), { recursive: true })
    writeFileSync(join(tempDir, '.claude', 'skills', 'sparq-start', 'SKILL.md'), '# Skill')
    writeFileSync(
      join(tempDir, '.mcp.json'),
      JSON.stringify({
        mcpServers: {
          playwright: { command: 'npx', args: ['-y', '@anthropic-ai/some-mcp@latest'] },
        },
      }),
    )
  })

  afterEach(() => {
    capture.stop()
    cleanTempDir(tempDir)
    resetState()
  })

  it('creates .cursor/mcp.json', () => {
    installPlatformExtras(tempDir, ['cursor'])
    assert.ok(existsSync(join(tempDir, '.cursor', 'mcp.json')))
    const mcpData = JSON.parse(readFileSync(join(tempDir, '.cursor', 'mcp.json'), 'utf-8'))
    assert.ok(mcpData.mcpServers.playwright)
  })

  it('creates .cursor/rules/sparq.mdc', () => {
    installPlatformExtras(tempDir, ['cursor'])
    assert.ok(existsSync(join(tempDir, '.cursor', 'rules', 'sparq.mdc')))
    const content = readFileSync(join(tempDir, '.cursor', 'rules', 'sparq.mdc'), 'utf-8')
    assert.ok(content.includes('alwaysApply: true'))
    assert.ok(content.includes('SparQ QA Assistant'))
  })

  it('does nothing for empty platforms array', () => {
    installPlatformExtras(tempDir, [])
    assert.ok(!existsSync(join(tempDir, '.cursor')))
    assert.ok(!existsSync(join(tempDir, '.codex')))
  })
})

describe('platform — installPlatformExtras (codex)', () => {
  let tempDir

  beforeEach(() => {
    tempDir = createTempDir()
    capture.start()
    // Create minimal project structure
    mkdirSync(join(tempDir, '.claude', 'skills', 'sparq-start'), { recursive: true })
    writeFileSync(join(tempDir, '.claude', 'skills', 'sparq-start', 'SKILL.md'), '# Skill')
    mkdirSync(join(tempDir, '.claude', 'skills', 'sparq-generate'), { recursive: true })
    writeFileSync(join(tempDir, '.claude', 'skills', 'sparq-generate', 'SKILL.md'), '# Skill')
    writeFileSync(
      join(tempDir, '.mcp.json'),
      JSON.stringify({
        mcpServers: {
          playwright: { command: 'npx', args: ['-y', '@anthropic-ai/some-mcp@latest'] },
        },
      }),
    )
  })

  afterEach(() => {
    capture.stop()
    cleanTempDir(tempDir)
    resetState()
  })

  it('creates .codex/config.toml', () => {
    installPlatformExtras(tempDir, ['codex'])
    assert.ok(existsSync(join(tempDir, '.codex', 'config.toml')))
    const content = readFileSync(join(tempDir, '.codex', 'config.toml'), 'utf-8')
    assert.ok(content.includes('[mcp_servers.playwright]'))
    assert.ok(content.includes('command = "npx"'))
  })

  it('creates .agents/skills/ symlinks', () => {
    installPlatformExtras(tempDir, ['codex'])
    const linkPath = join(tempDir, '.agents', 'skills', 'sparq-start')
    assert.ok(existsSync(linkPath))
    const stat = lstatSync(linkPath)
    assert.ok(stat.isSymbolicLink())
  })

  it('creates symlinks for multiple skills', () => {
    installPlatformExtras(tempDir, ['codex'])
    assert.ok(existsSync(join(tempDir, '.agents', 'skills', 'sparq-start')))
    assert.ok(existsSync(join(tempDir, '.agents', 'skills', 'sparq-generate')))
  })
})

describe('platform — removePlatformExtras', () => {
  let tempDir

  beforeEach(() => {
    tempDir = createTempDir()
    capture.start()
    mkdirSync(join(tempDir, '.claude', 'skills', 'sparq-start'), { recursive: true })
    writeFileSync(join(tempDir, '.claude', 'skills', 'sparq-start', 'SKILL.md'), '# Skill')
    writeFileSync(
      join(tempDir, '.mcp.json'),
      JSON.stringify({ mcpServers: { playwright: { command: 'npx' } } }),
    )
  })

  afterEach(() => {
    capture.stop()
    cleanTempDir(tempDir)
    resetState()
  })

  it('removes cursor extras when mcpServersAdded provided', () => {
    installPlatformExtras(tempDir, ['cursor'], { mcpServersAdded: ['playwright'] })
    assert.ok(existsSync(join(tempDir, '.cursor', 'mcp.json')))
    const removed = removePlatformExtras(tempDir, ['cursor'], ['playwright'])
    assert.ok(removed >= 1)
    assert.ok(!existsSync(join(tempDir, '.cursor', 'mcp.json')))
  })

  it('removes codex extras when mcpServersAdded provided', () => {
    installPlatformExtras(tempDir, ['codex'], { mcpServersAdded: ['playwright'] })
    assert.ok(existsSync(join(tempDir, '.codex', 'config.toml')))
    const removed = removePlatformExtras(tempDir, ['codex'], ['playwright'])
    assert.ok(removed >= 1)
    assert.ok(!existsSync(join(tempDir, '.codex', 'config.toml')))
  })

  it('returns 0 for empty platforms array', () => {
    const removed = removePlatformExtras(tempDir, [])
    assert.equal(removed, 0)
  })
})

describe('platform — cursor MCP merge safety', () => {
  let tempDir

  beforeEach(() => {
    tempDir = createTempDir()
    capture.start()
    writeFileSync(
      join(tempDir, '.mcp.json'),
      JSON.stringify({
        mcpServers: {
          playwright: { command: 'npx', args: ['-y', '@anthropic-ai/some-mcp@latest'] },
          atlassian: { url: 'https://mcp.atlassian.com' },
        },
      }),
    )
  })

  afterEach(() => {
    capture.stop()
    cleanTempDir(tempDir)
    resetState()
  })

  it('preserves pre-existing cursor servers during install', () => {
    mkdirSync(join(tempDir, '.cursor'), { recursive: true })
    writeFileSync(
      join(tempDir, '.cursor', 'mcp.json'),
      JSON.stringify({
        mcpServers: { 'my-custom-server': { command: 'my-cmd' } },
      }),
    )
    installPlatformExtras(tempDir, ['cursor'], { mcpServersAdded: ['playwright'] })
    const result = JSON.parse(readFileSync(join(tempDir, '.cursor', 'mcp.json'), 'utf-8'))
    assert.ok(result.mcpServers['my-custom-server'], 'pre-existing server preserved')
    assert.ok(result.mcpServers.playwright, 'SparQ server added')
  })

  it('does not overwrite existing server with same name', () => {
    mkdirSync(join(tempDir, '.cursor'), { recursive: true })
    writeFileSync(
      join(tempDir, '.cursor', 'mcp.json'),
      JSON.stringify({
        mcpServers: { playwright: { command: 'custom-pw' } },
      }),
    )
    installPlatformExtras(tempDir, ['cursor'], { mcpServersAdded: ['playwright'] })
    const result = JSON.parse(readFileSync(join(tempDir, '.cursor', 'mcp.json'), 'utf-8'))
    assert.equal(result.mcpServers.playwright.command, 'custom-pw')
  })

  it('removes only SparQ servers during uninstall', () => {
    mkdirSync(join(tempDir, '.cursor'), { recursive: true })
    writeFileSync(
      join(tempDir, '.cursor', 'mcp.json'),
      JSON.stringify({
        mcpServers: {
          playwright: { command: 'npx' },
          'my-custom-server': { command: 'my-cmd' },
        },
      }),
    )
    removePlatformExtras(tempDir, ['cursor'], ['playwright'])
    const result = JSON.parse(readFileSync(join(tempDir, '.cursor', 'mcp.json'), 'utf-8'))
    assert.ok(result.mcpServers['my-custom-server'], 'user server preserved')
    assert.ok(!result.mcpServers.playwright, 'SparQ server removed')
  })

  it('deletes cursor mcp.json when no servers remain', () => {
    mkdirSync(join(tempDir, '.cursor'), { recursive: true })
    writeFileSync(
      join(tempDir, '.cursor', 'mcp.json'),
      JSON.stringify({ mcpServers: { playwright: { command: 'npx' } } }),
    )
    removePlatformExtras(tempDir, ['cursor'], ['playwright'])
    assert.ok(!existsSync(join(tempDir, '.cursor', 'mcp.json')))
  })

  it('skips cursor MCP removal when mcpServersAdded is empty', () => {
    mkdirSync(join(tempDir, '.cursor'), { recursive: true })
    writeFileSync(
      join(tempDir, '.cursor', 'mcp.json'),
      JSON.stringify({ mcpServers: { playwright: { command: 'npx' } } }),
    )
    removePlatformExtras(tempDir, ['cursor'], [])
    assert.ok(existsSync(join(tempDir, '.cursor', 'mcp.json')))
    const result = JSON.parse(readFileSync(join(tempDir, '.cursor', 'mcp.json'), 'utf-8'))
    assert.ok(result.mcpServers.playwright, 'server untouched')
  })

  it('recovers from invalid JSON in .cursor/mcp.json during install', () => {
    mkdirSync(join(tempDir, '.cursor'), { recursive: true })
    writeFileSync(join(tempDir, '.cursor', 'mcp.json'), '{broken json')
    installPlatformExtras(tempDir, ['cursor'], { mcpServersAdded: ['playwright'] })
    const result = JSON.parse(readFileSync(join(tempDir, '.cursor', 'mcp.json'), 'utf-8'))
    assert.ok(result.mcpServers.playwright, 'server added after recovery')
  })

  it('handles missing .mcp.json gracefully during cursor install', () => {
    // Remove the .mcp.json that beforeEach created
    const mcpPath = join(tempDir, '.mcp.json')
    if (existsSync(mcpPath)) unlinkSync(mcpPath)
    installPlatformExtras(tempDir, ['cursor'], { mcpServersAdded: ['playwright'] })
    // No .cursor/mcp.json should be created when source is missing
    assert.ok(!existsSync(join(tempDir, '.cursor', 'mcp.json')))
  })

  it('installs multiple SparQ servers to cursor', () => {
    installPlatformExtras(tempDir, ['cursor'], {
      mcpServersAdded: ['playwright', 'atlassian'],
    })
    const result = JSON.parse(readFileSync(join(tempDir, '.cursor', 'mcp.json'), 'utf-8'))
    assert.ok(result.mcpServers.playwright, 'playwright added')
    assert.ok(result.mcpServers.atlassian, 'atlassian added')
  })

  it('handles corrupted .cursor/mcp.json during uninstall gracefully', () => {
    mkdirSync(join(tempDir, '.cursor'), { recursive: true })
    writeFileSync(join(tempDir, '.cursor', 'mcp.json'), '{invalid')
    const removed = removePlatformExtras(tempDir, ['cursor'], ['playwright'])
    // Should not throw, just warn and return 0 for MCP removal
    assert.ok(removed >= 0)
  })

  it('skips cursor MCP removal when mcpServersAdded is null', () => {
    mkdirSync(join(tempDir, '.cursor'), { recursive: true })
    writeFileSync(
      join(tempDir, '.cursor', 'mcp.json'),
      JSON.stringify({ mcpServers: { playwright: { command: 'npx' } } }),
    )
    removePlatformExtras(tempDir, ['cursor'], null)
    assert.ok(existsSync(join(tempDir, '.cursor', 'mcp.json')))
  })
})

describe('platform — codex MCP merge safety', () => {
  let tempDir

  beforeEach(() => {
    tempDir = createTempDir()
    capture.start()
    mkdirSync(join(tempDir, '.claude', 'skills', 'sparq-start'), { recursive: true })
    writeFileSync(join(tempDir, '.claude', 'skills', 'sparq-start', 'SKILL.md'), '# Skill')
    writeFileSync(
      join(tempDir, '.mcp.json'),
      JSON.stringify({
        mcpServers: {
          playwright: { command: 'npx', args: ['-y', '@anthropic-ai/some-mcp@latest'] },
        },
      }),
    )
  })

  afterEach(() => {
    capture.stop()
    cleanTempDir(tempDir)
    resetState()
  })

  it('preserves pre-existing codex TOML sections during install', () => {
    mkdirSync(join(tempDir, '.codex'), { recursive: true })
    writeFileSync(
      join(tempDir, '.codex', 'config.toml'),
      '[mcp_servers.my-custom]\ncommand = "my-cmd"\n',
    )
    installPlatformExtras(tempDir, ['codex'], { mcpServersAdded: ['playwright'] })
    const content = readFileSync(join(tempDir, '.codex', 'config.toml'), 'utf-8')
    assert.ok(content.includes('[mcp_servers.my-custom]'), 'pre-existing section preserved')
    assert.ok(content.includes('[mcp_servers.playwright]'), 'SparQ section added')
  })

  it('handles missing .mcp.json gracefully during codex install', () => {
    const mcpPath = join(tempDir, '.mcp.json')
    if (existsSync(mcpPath)) unlinkSync(mcpPath)
    installPlatformExtras(tempDir, ['codex'], { mcpServersAdded: ['playwright'] })
    assert.ok(!existsSync(join(tempDir, '.codex', 'config.toml')))
  })

  it('preserves non-MCP TOML content during codex uninstall', () => {
    mkdirSync(join(tempDir, '.codex'), { recursive: true })
    writeFileSync(
      join(tempDir, '.codex', 'config.toml'),
      [
        '[settings]',
        'verbose = true',
        '',
        '[mcp_servers.playwright]',
        'command = "npx"',
        '',
        '[mcp_servers.my-custom]',
        'command = "my-cmd"',
        '',
      ].join('\n'),
    )
    removePlatformExtras(tempDir, ['codex'], ['playwright'])
    const content = readFileSync(join(tempDir, '.codex', 'config.toml'), 'utf-8')
    assert.ok(content.includes('[settings]'), 'non-MCP settings preserved')
    assert.ok(content.includes('verbose = true'), 'non-MCP values preserved')
    assert.ok(content.includes('[mcp_servers.my-custom]'), 'user server preserved')
    assert.ok(!content.includes('[mcp_servers.playwright]'), 'SparQ server removed')
  })
})

describe('platform — checkPlatformExtras', () => {
  let tempDir

  beforeEach(() => {
    tempDir = createTempDir()
    capture.start()
  })

  afterEach(() => {
    capture.stop()
    cleanTempDir(tempDir)
    resetState()
  })

  it('reports missing AGENTS.md', () => {
    const result = checkPlatformExtras(tempDir, [])
    assert.equal(result.ok, false)
    assert.ok(result.issues.some((i) => i.includes('AGENTS.md')))
  })

  it('passes when AGENTS.md has sentinel markers', () => {
    generateAgentsMd(tempDir)
    const result = checkPlatformExtras(tempDir, [])
    assert.equal(result.ok, true)
  })

  it('reports missing sentinel markers in AGENTS.md', () => {
    writeFileSync(join(tempDir, 'AGENTS.md'), '# No markers')
    const result = checkPlatformExtras(tempDir, [])
    assert.ok(result.issues.some((i) => i.includes('sentinel markers')))
  })

  it('reports missing cursor extras', () => {
    generateAgentsMd(tempDir)
    const result = checkPlatformExtras(tempDir, ['cursor'])
    assert.equal(result.ok, false)
    assert.ok(result.issues.some((i) => i.includes('.cursor/mcp.json')))
  })

  it('reports missing codex extras', () => {
    generateAgentsMd(tempDir)
    const result = checkPlatformExtras(tempDir, ['codex'])
    assert.equal(result.ok, false)
    assert.ok(result.issues.some((i) => i.includes('.codex/config.toml')))
  })

  it('passes when cursor extras are installed', () => {
    generateAgentsMd(tempDir)
    mkdirSync(join(tempDir, '.claude', 'skills', 'sparq-start'), { recursive: true })
    writeFileSync(join(tempDir, '.claude', 'skills', 'sparq-start', 'SKILL.md'), '# Skill')
    writeFileSync(
      join(tempDir, '.mcp.json'),
      JSON.stringify({ mcpServers: { playwright: { command: 'npx' } } }),
    )
    installPlatformExtras(tempDir, ['cursor'])
    const result = checkPlatformExtras(tempDir, ['cursor'])
    assert.equal(result.ok, true)
    assert.equal(result.issues.length, 0)
  })

  it('passes when codex extras are installed', () => {
    generateAgentsMd(tempDir)
    mkdirSync(join(tempDir, '.claude', 'skills', 'sparq-start'), { recursive: true })
    writeFileSync(join(tempDir, '.claude', 'skills', 'sparq-start', 'SKILL.md'), '# Skill')
    writeFileSync(
      join(tempDir, '.mcp.json'),
      JSON.stringify({ mcpServers: { playwright: { command: 'npx' } } }),
    )
    installPlatformExtras(tempDir, ['codex'])
    const result = checkPlatformExtras(tempDir, ['codex'])
    assert.equal(result.ok, true)
    assert.equal(result.issues.length, 0)
  })
})

describe('platform — dynamic discovery', () => {
  let tempDir

  beforeEach(() => {
    tempDir = createTempDir()
    capture.start()
  })

  afterEach(() => {
    capture.stop()
    cleanTempDir(tempDir)
    resetState()
  })

  it('discovers custom agent from target directory', () => {
    const agentsDir = join(tempDir, '.claude', 'agents')
    mkdirSync(agentsDir, { recursive: true })
    writeFileSync(
      join(agentsDir, 'sparq-custom-agent.md'),
      '---\nname: sparq-custom-agent\nmodel: opus\ndescription: "A custom test agent."\n---\n# Custom\n',
    )
    generateAgentsMd(tempDir)
    const content = readFileSync(join(tempDir, 'AGENTS.md'), 'utf-8')
    assert.ok(content.includes('sparq-custom-agent'))
    assert.ok(content.includes('opus'))
  })

  it('discovers custom skill from target directory', () => {
    const skillDir = join(tempDir, '.claude', 'skills', 'sparq-custom-skill')
    mkdirSync(skillDir, { recursive: true })
    writeFileSync(
      join(skillDir, 'SKILL.md'),
      '---\nname: sparq:custom-skill\ndescription: "A custom skill for testing."\naudience: qa\n---\n# Custom\n',
    )
    generateAgentsMd(tempDir)
    const content = readFileSync(join(tempDir, 'AGENTS.md'), 'utf-8')
    assert.ok(content.includes('/sparq:custom-skill'))
    assert.ok(content.includes('A custom skill for testing.'))
  })

  it('excludes internal-audience skills from AGENTS.md', () => {
    const skillDir = join(tempDir, '.claude', 'skills', 'sparq-internal-tool')
    mkdirSync(skillDir, { recursive: true })
    writeFileSync(
      join(skillDir, 'SKILL.md'),
      '---\nname: sparq:internal-tool\ndescription: "An internal skill."\naudience: internal\n---\n# Internal\n',
    )
    // Also add a public skill so discovery doesn't fall back to package dir
    const pubDir = join(tempDir, '.claude', 'skills', 'sparq-public-tool')
    mkdirSync(pubDir, { recursive: true })
    writeFileSync(
      join(pubDir, 'SKILL.md'),
      '---\nname: sparq:public-tool\ndescription: "A public skill."\naudience: qa\n---\n# Public\n',
    )
    generateAgentsMd(tempDir)
    const content = readFileSync(join(tempDir, 'AGENTS.md'), 'utf-8')
    assert.ok(!content.includes('sparq:internal-tool'))
    assert.ok(content.includes('sparq:public-tool'))
  })

  it('excludes sparq-shared directory from skills', () => {
    const sharedDir = join(tempDir, '.claude', 'skills', 'sparq-shared')
    mkdirSync(sharedDir, { recursive: true })
    writeFileSync(
      join(sharedDir, 'SKILL.md'),
      '---\nname: sparq:shared\ndescription: "Shared references."\n---\n# Shared\n',
    )
    const pubDir = join(tempDir, '.claude', 'skills', 'sparq-pub')
    mkdirSync(pubDir, { recursive: true })
    writeFileSync(
      join(pubDir, 'SKILL.md'),
      '---\nname: sparq:pub\ndescription: "Public."\naudience: qa\n---\n# Pub\n',
    )
    generateAgentsMd(tempDir)
    const content = readFileSync(join(tempDir, 'AGENTS.md'), 'utf-8')
    assert.ok(!content.includes('sparq:shared'))
    assert.ok(content.includes('sparq:pub'))
  })

  it('skips agent files without valid frontmatter', () => {
    const agentsDir = join(tempDir, '.claude', 'agents')
    mkdirSync(agentsDir, { recursive: true })
    writeFileSync(join(agentsDir, 'sparq-no-frontmatter.md'), '# No Frontmatter\nJust text.')
    writeFileSync(
      join(agentsDir, 'sparq-valid.md'),
      '---\nname: sparq-valid\nmodel: sonnet\ndescription: "Valid agent."\n---\n# Valid\n',
    )
    generateAgentsMd(tempDir)
    const content = readFileSync(join(tempDir, 'AGENTS.md'), 'utf-8')
    assert.ok(!content.includes('sparq-no-frontmatter'))
    assert.ok(content.includes('sparq-valid'))
  })

  it('defaults model to sonnet when not specified', () => {
    const agentsDir = join(tempDir, '.claude', 'agents')
    mkdirSync(agentsDir, { recursive: true })
    writeFileSync(
      join(agentsDir, 'sparq-no-model.md'),
      '---\nname: sparq-no-model\ndescription: "No model."\n---\n# Agent\n',
    )
    generateAgentsMd(tempDir)
    const content = readFileSync(join(tempDir, 'AGENTS.md'), 'utf-8')
    assert.ok(content.includes('sparq-no-model'))
    assert.ok(content.includes('(sonnet)'))
  })
})

describe('platform — multi-platform install and check', () => {
  let tempDir

  beforeEach(() => {
    tempDir = createTempDir()
    capture.start()
    mkdirSync(join(tempDir, '.claude', 'skills', 'sparq-start'), { recursive: true })
    writeFileSync(join(tempDir, '.claude', 'skills', 'sparq-start', 'SKILL.md'), '# Skill')
    writeFileSync(
      join(tempDir, '.mcp.json'),
      JSON.stringify({ mcpServers: { playwright: { command: 'npx' } } }),
    )
  })

  afterEach(() => {
    capture.stop()
    cleanTempDir(tempDir)
    resetState()
  })

  it('installs cursor and codex extras when both are provided', () => {
    installPlatformExtras(tempDir, ['cursor', 'codex'])
    assert.ok(existsSync(join(tempDir, '.cursor', 'mcp.json')))
    assert.ok(existsSync(join(tempDir, '.cursor', 'rules', 'sparq.mdc')))
    assert.ok(existsSync(join(tempDir, '.codex', 'config.toml')))
  })

  it('removes cursor and codex extras when both are provided', () => {
    installPlatformExtras(tempDir, ['cursor', 'codex'], { mcpServersAdded: ['playwright'] })
    const removed = removePlatformExtras(tempDir, ['cursor', 'codex'], ['playwright'])
    assert.ok(removed >= 2)
    assert.ok(!existsSync(join(tempDir, '.cursor', 'mcp.json')))
    assert.ok(!existsSync(join(tempDir, '.codex', 'config.toml')))
  })

  it('checkPlatformExtras reports issues for both platforms when neither is installed', () => {
    generateAgentsMd(tempDir)
    const result = checkPlatformExtras(tempDir, ['cursor', 'codex'])
    assert.equal(result.ok, false)
    assert.ok(result.issues.some((i) => i.includes('.cursor/mcp.json')))
    assert.ok(result.issues.some((i) => i.includes('.codex/config.toml')))
  })
})
