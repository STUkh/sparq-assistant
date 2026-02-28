// bin/lib/platform.mjs — Multi-platform support (Claude Code, Cursor, Codex, and beyond)

import {
  existsSync,
  lstatSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { join, relative } from 'node:path'
import {
  AGENTS_MD_BLOCK_END,
  AGENTS_MD_BLOCK_START,
  generateRuleContent,
  PKG_AGENTS_DIR,
  PKG_SKILLS_DIR,
} from './constants.mjs'
import { ensureDir, listDirs, listFiles } from './files.mjs'
import { dryRun, info, isDryRun, ok, warn } from './state.mjs'
import { tomlMergeMcpServers, tomlRemoveMcpSections } from './toml.mjs'

// ---------------------------------------------------------------------------
// Platform Registry
// ---------------------------------------------------------------------------

// Each entry describes one non-Claude AI platform that needs extras installed.
// To add a new platform: append one descriptor here — nothing else needs changing.
// All referenced functions are hoisted (function declarations), so forward refs are safe.
const PLATFORM_REGISTRY = [
  {
    id: 'cursor',
    markers: ['.cursor'],
    install: installCursorExtras,
    remove: removeCursorExtras,
    check: checkCursorExtras,
  },
  {
    id: 'codex',
    markers: ['.codex', '.agents'],
    install: installCodexExtras,
    remove: removeCodexExtras,
    check: checkCodexExtras,
  },
]
// claude = the base install (.claude/ canonical); always implicit, no extras, not in registry

// ---------------------------------------------------------------------------
// Platform Detection
// ---------------------------------------------------------------------------

/**
 * Detect all AI platforms present in the target project by scanning for
 * platform-specific directory markers. Returns an array of platform IDs found.
 * Returns an empty array when only Claude Code is in use (always implicit).
 *
 * @param {string} targetDir - Absolute path to the target project root
 * @returns {string[]} Array of detected platform IDs (e.g. ['cursor', 'codex'])
 */
export function detectPlatforms(targetDir) {
  return PLATFORM_REGISTRY.filter((d) => d.markers.some((m) => existsSync(join(targetDir, m)))).map(
    (d) => d.id,
  )
}

// ---------------------------------------------------------------------------
// AGENTS.md Generation
// ---------------------------------------------------------------------------

/**
 * Parse simple YAML frontmatter from markdown content.
 * Returns a plain object with key-value pairs, or null if no frontmatter found.
 */
function parseFrontmatter(content) {
  if (!content.startsWith('---')) return null
  const endIdx = content.indexOf('\n---', 3)
  if (endIdx === -1) return null
  const yaml = content.substring(4, endIdx).trim()
  const result = {}
  for (const line of yaml.split('\n')) {
    const match = line.match(/^(\w+):\s*(.+)$/)
    if (!match) continue
    let value = match[2].trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    result[match[1]] = value
  }
  return result
}

/**
 * Extract the first sentence from a description string.
 */
function firstSentence(description) {
  if (!description) return ''
  const match = description.match(/^(.+?\.)(?:\s|$)/)
  return match ? match[1] : description.substring(0, 80)
}

/**
 * Discover installed agents by reading frontmatter from sparq-*.md files.
 * Reads from targetDir/.claude/agents/ first, falls back to package source.
 * Returns array of [name, model, description] tuples.
 */
function discoverAgents(targetDir) {
  const targetAgentsDir = join(targetDir, '.claude', 'agents')
  const agentsDir =
    existsSync(targetAgentsDir) && listFiles(targetAgentsDir).some((f) => f.startsWith('sparq-'))
      ? targetAgentsDir
      : PKG_AGENTS_DIR

  const agents = []
  try {
    const files = listFiles(agentsDir).filter((f) => f.startsWith('sparq-') && f.endsWith('.md'))
    for (const file of files.sort()) {
      try {
        const content = readFileSync(join(agentsDir, file), 'utf-8')
        const fm = parseFrontmatter(content)
        if (!fm?.name) continue
        agents.push([fm.name, fm.model || 'sonnet', firstSentence(fm.description)])
      } catch {
        /* skip unreadable files */
      }
    }
  } catch {
    /* directory not readable */
  }

  return agents
}

/**
 * Discover installed skills by reading SKILL.md frontmatter.
 * Reads from targetDir/.claude/skills/ first, falls back to package source.
 * Excludes internal-audience skills and sparq-shared.
 * Returns array of [name, description] tuples.
 */
function discoverSkills(targetDir) {
  const targetSkillsDir = join(targetDir, '.claude', 'skills')
  const skillsDir =
    existsSync(targetSkillsDir) && listDirs(targetSkillsDir).some((d) => d.startsWith('sparq-'))
      ? targetSkillsDir
      : PKG_SKILLS_DIR

  const skills = []
  try {
    const dirs = listDirs(skillsDir).filter((d) => d.startsWith('sparq-') && d !== 'sparq-shared')
    for (const dir of dirs.sort()) {
      const skillMd = join(skillsDir, dir, 'SKILL.md')
      if (!existsSync(skillMd)) continue
      try {
        const content = readFileSync(skillMd, 'utf-8')
        const fm = parseFrontmatter(content)
        if (!fm?.name) continue
        if (fm.audience === 'internal') continue
        skills.push([`/${fm.name}`, firstSentence(fm.description)])
      } catch {
        /* skip unreadable files */
      }
    }
  } catch {
    /* directory not readable */
  }

  return skills
}

/**
 * Generate AGENTS.md content block with sentinel markers.
 *
 * @param {string} targetDir - Project root for agent/skill discovery
 * @returns {string} AGENTS.md content block
 */
function buildAgentsMdBlock(targetDir) {
  const agents = discoverAgents(targetDir)
  const skills = discoverSkills(targetDir)

  const agentLines = agents.map(([name, model, desc]) => `- **${name}** (${model}) — ${desc}`)

  const skillLines = skills.map(([name, desc]) => `- \`${name}\` — ${desc}`)

  return [
    AGENTS_MD_BLOCK_START,
    '# SparQ QA Assistant',
    '',
    'Config: `sparq.config.json` | Output: `.sparq/`',
    '',
    '## Agents',
    ...agentLines,
    '',
    '## Skills',
    ...skillLines,
    '',
    '## Selector Strategy',
    '- Priority: data-testid > role > label > text',
    "- Wrapped inputs: `.locator('input')` to drill into UI framework wrappers",
    "- Toasts/Dialogs: `getByRole('alert')`, `getByRole('dialog')`",
    '',
    '## Workflow',
    'Use `/sparq:start` (Claude Code/Cursor) or ask about SparQ (Codex) to begin.',
    AGENTS_MD_BLOCK_END,
    '',
  ].join('\n')
}

/**
 * Write or update AGENTS.md in the target directory.
 * Uses sentinel markers to safely insert/replace the SparQ block
 * without affecting other content in the file.
 *
 * @param {string} targetDir - Absolute path to the target project root
 */
export function generateAgentsMd(targetDir) {
  const agentsMdPath = join(targetDir, 'AGENTS.md')
  const block = buildAgentsMdBlock(targetDir)

  if (existsSync(agentsMdPath)) {
    const existing = readFileSync(agentsMdPath, 'utf-8')
    const startIdx = existing.indexOf(AGENTS_MD_BLOCK_START)
    const endIdx = existing.indexOf(AGENTS_MD_BLOCK_END)

    if (startIdx !== -1 && endIdx !== -1 && startIdx < endIdx) {
      // Replace existing block
      const before = existing.substring(0, startIdx)
      const after = existing.substring(endIdx + AGENTS_MD_BLOCK_END.length)
      const newContent = `${before}${block}${after}`
      dryRun(() => writeFileSync(agentsMdPath, newContent, 'utf-8'), 'update AGENTS.md')
      ok('AGENTS.md updated (SparQ block replaced)')
      return
    }

    // Append block to existing file
    const separator = existing.endsWith('\n') ? '\n' : '\n\n'
    dryRun(
      () => writeFileSync(agentsMdPath, `${existing}${separator}${block}`, 'utf-8'),
      'append SparQ block to AGENTS.md',
    )
    ok('AGENTS.md updated (SparQ block appended)')
    return
  }

  // Create new file
  dryRun(() => writeFileSync(agentsMdPath, block, 'utf-8'), 'create AGENTS.md')
  ok('AGENTS.md created')
}

/**
 * Remove the SparQ block from AGENTS.md.
 * If the file contains only the SparQ block, removes the entire file.
 *
 * @param {string} targetDir - Absolute path to the target project root
 */
export function removeAgentsMd(targetDir) {
  const agentsMdPath = join(targetDir, 'AGENTS.md')
  if (!existsSync(agentsMdPath)) return

  const content = readFileSync(agentsMdPath, 'utf-8')
  const startIdx = content.indexOf(AGENTS_MD_BLOCK_START)
  const endIdx = content.indexOf(AGENTS_MD_BLOCK_END)

  if (startIdx === -1 || endIdx === -1 || startIdx >= endIdx) {
    info('AGENTS.md has no SparQ sentinel markers — leaving file as-is')
    return
  }

  const before = content.substring(0, startIdx).trim()
  const after = content.substring(endIdx + AGENTS_MD_BLOCK_END.length).trim()

  if (!before && !after) {
    // File is entirely SparQ content — remove it
    dryRun(() => unlinkSync(agentsMdPath), 'remove AGENTS.md')
    ok('Removed AGENTS.md (was SparQ-only)')
    return
  }

  const newContent = `${before}${before && after ? '\n\n' : ''}${after}\n`
  dryRun(
    () => writeFileSync(agentsMdPath, newContent, 'utf-8'),
    'remove SparQ block from AGENTS.md',
  )
  ok('Removed SparQ block from AGENTS.md')
}

// ---------------------------------------------------------------------------
// Cursor Extras
// ---------------------------------------------------------------------------

/**
 * Install Cursor-specific extras:
 * - .cursor/mcp.json (merge SparQ servers, preserve pre-existing)
 * - .cursor/rules/sparq.mdc (MDC format rule file)
 */
function installCursorExtras(targetDir, options = {}) {
  const cursorDir = join(targetDir, '.cursor')
  if (!ensureDir(cursorDir)) return

  // 1. .cursor/mcp.json — merge SparQ servers, preserve existing
  installCursorMcp(targetDir, cursorDir, options.mcpServersAdded)

  // 2. .cursor/rules/sparq.mdc — MDC-wrapped rule content
  installCursorRule(cursorDir, options)
}

/**
 * Extract SparQ-owned servers from .mcp.json, filtered by mcpServersAdded.
 */
function extractSparqServers(targetDir, mcpServersAdded) {
  const sourceMcp = join(targetDir, '.mcp.json')
  if (!existsSync(sourceMcp)) return null

  const mcpData = JSON.parse(readFileSync(sourceMcp, 'utf-8'))
  if (!mcpData.mcpServers || Object.keys(mcpData.mcpServers).length === 0) return null

  const filterSet = mcpServersAdded?.length > 0 ? new Set(mcpServersAdded) : null
  const servers = {}
  for (const [name, config] of Object.entries(mcpData.mcpServers)) {
    if (!filterSet || filterSet.has(name)) servers[name] = config
  }
  return Object.keys(servers).length > 0 ? servers : null
}

/**
 * Load existing JSON MCP config, returning parsed object with mcpServers.
 */
function loadExistingJsonMcp(filePath, label) {
  if (!existsSync(filePath)) return { mcpServers: {} }
  try {
    const data = JSON.parse(readFileSync(filePath, 'utf-8'))
    if (!data.mcpServers) data.mcpServers = {}
    return data
  } catch {
    warn(`${label} is not valid JSON — will be recreated`)
    return { mcpServers: {} }
  }
}

function installCursorMcp(targetDir, cursorDir, mcpServersAdded) {
  try {
    const sparqServers = extractSparqServers(targetDir, mcpServersAdded)
    if (!sparqServers) {
      info('.cursor/mcp.json — no SparQ servers found in .mcp.json')
      return
    }

    const cursorMcpPath = join(cursorDir, 'mcp.json')
    const existing = loadExistingJsonMcp(cursorMcpPath, '.cursor/mcp.json')

    let added = 0
    let preserved = 0
    for (const [name, config] of Object.entries(sparqServers)) {
      if (name in existing.mcpServers) {
        preserved++
      } else {
        existing.mcpServers[name] = config
        added++
      }
    }

    if (added === 0) {
      if (preserved > 0) info(`.cursor/mcp.json unchanged (${preserved} servers already present)`)
      return
    }

    dryRun(
      () => writeFileSync(cursorMcpPath, `${JSON.stringify(existing, null, 2)}\n`, 'utf-8'),
      'write .cursor/mcp.json',
    )
    ok(`.cursor/mcp.json updated (${added} added, ${preserved} preserved)`)
  } catch (err) {
    warn(`Could not update .cursor/mcp.json: ${err.message}`)
  }
}

function installCursorRule(cursorDir, options) {
  const rulesDir = join(cursorDir, 'rules')
  if (!ensureDir(rulesDir)) return

  const ruleContent = generateRuleContent(options.techStack, options.e2eConfig)
  const mdcContent = [
    '---',
    'description: "SparQ QA Assistant — project configuration and selector strategy"',
    'alwaysApply: true',
    '---',
    ruleContent,
  ].join('\n')

  const mdcPath = join(rulesDir, 'sparq.mdc')
  dryRun(() => writeFileSync(mdcPath, mdcContent, 'utf-8'), 'write .cursor/rules/sparq.mdc')
  ok('.cursor/rules/sparq.mdc created')
}

/**
 * Remove Cursor-specific extras.
 * Only removes SparQ-added MCP servers, preserving pre-existing ones.
 */
function removeCursorExtras(targetDir, mcpServersAdded) {
  let removed = 0

  const cursorMcp = join(targetDir, '.cursor', 'mcp.json')
  if (existsSync(cursorMcp)) {
    removed += removeCursorMcpEntries(cursorMcp, mcpServersAdded)
  }

  const cursorRule = join(targetDir, '.cursor', 'rules', 'sparq.mdc')
  if (existsSync(cursorRule)) {
    dryRun(() => unlinkSync(cursorRule), 'remove .cursor/rules/sparq.mdc')
    ok('Removed .cursor/rules/sparq.mdc')
    removed++
  }

  return removed
}

function removeCursorMcpEntries(cursorMcpPath, mcpServersAdded) {
  if (!mcpServersAdded || mcpServersAdded.length === 0) {
    info('.cursor/mcp.json — no SparQ servers tracked, skipping')
    return 0
  }

  try {
    const mcpData = JSON.parse(readFileSync(cursorMcpPath, 'utf-8'))
    if (!mcpData.mcpServers) return 0

    let mcpRemoved = 0
    for (const name of mcpServersAdded) {
      if (name in mcpData.mcpServers) {
        delete mcpData.mcpServers[name]
        mcpRemoved++
      }
    }

    if (mcpRemoved === 0) return 0

    if (Object.keys(mcpData.mcpServers).length === 0) {
      // No servers remain — delete the file
      dryRun(() => unlinkSync(cursorMcpPath), 'remove .cursor/mcp.json')
      ok(`Removed .cursor/mcp.json (${mcpRemoved} SparQ server(s))`)
    } else {
      // Write back with remaining servers
      dryRun(
        () => writeFileSync(cursorMcpPath, `${JSON.stringify(mcpData, null, 2)}\n`, 'utf-8'),
        `remove ${mcpRemoved} SparQ MCP entries from .cursor/mcp.json`,
      )
      ok(`Removed ${mcpRemoved} SparQ server(s) from .cursor/mcp.json`)
    }
    return 1
  } catch (err) {
    warn(`Could not update .cursor/mcp.json: ${err.message}`)
    return 0
  }
}

/**
 * Check Cursor extras health.
 */
function checkCursorExtras(targetDir, issues) {
  const cursorMcp = join(targetDir, '.cursor', 'mcp.json')
  if (!existsSync(cursorMcp)) {
    issues.push('.cursor/mcp.json not found')
  }

  const cursorRule = join(targetDir, '.cursor', 'rules', 'sparq.mdc')
  if (!existsSync(cursorRule)) {
    issues.push('.cursor/rules/sparq.mdc not found')
  }
}

// ---------------------------------------------------------------------------
// Codex Extras
// ---------------------------------------------------------------------------

/**
 * Install Codex-specific extras:
 * - .codex/config.toml (merge SparQ servers, preserve pre-existing)
 * - .agents/skills/ symlinks to .claude/skills/
 */
function installCodexExtras(targetDir, options = {}) {
  // 1. .codex/config.toml — merge SparQ servers, preserve existing
  installCodexMcp(targetDir, options.mcpServersAdded)

  // 2. .agents/skills/ — symlinks to .claude/skills/sparq-*
  installCodexSkillLinks(targetDir)
}

/**
 * Convert full JSON MCP server config to TOML-friendly subset.
 * Only command, args, url, env are preserved — other properties
 * (headers, timeout, auth) are intentionally excluded.
 */
function toTomlFriendly(servers) {
  const result = {}
  for (const [name, config] of Object.entries(servers)) {
    const entry = {}
    if (config.command) entry.command = config.command
    if (config.args) entry.args = config.args
    if (config.url) entry.url = config.url
    if (config.env) entry.env = config.env
    result[name] = entry
  }
  return result
}

function installCodexMcp(targetDir, mcpServersAdded) {
  const codexDir = join(targetDir, '.codex')
  if (!ensureDir(codexDir)) return

  try {
    const sparqServers = extractSparqServers(targetDir, mcpServersAdded)
    if (!sparqServers) {
      info('.codex/config.toml — no SparQ servers found in .mcp.json')
      return
    }

    const tomlPath = join(codexDir, 'config.toml')
    const existingContent = existsSync(tomlPath) ? readFileSync(tomlPath, 'utf-8') : ''
    const tomlServers = toTomlFriendly(sparqServers)
    const { content, added, preserved } = tomlMergeMcpServers(existingContent, tomlServers)

    if (added.length === 0) {
      if (preserved.length > 0) {
        info(`.codex/config.toml unchanged (${preserved.length} servers already present)`)
      }
      return
    }

    dryRun(() => writeFileSync(tomlPath, content, 'utf-8'), 'write .codex/config.toml')
    ok(`.codex/config.toml updated (${added.length} added, ${preserved.length} preserved)`)
  } catch (err) {
    warn(`Could not update .codex/config.toml: ${err.message}`)
  }
}

/**
 * Check if a symlink already exists at linkPath.
 * Returns true if existing symlink found (skip re-creation).
 */
function isExistingSymlink(linkPath) {
  if (!existsSync(linkPath)) return false
  try {
    return lstatSync(linkPath).isSymbolicLink()
  } catch {
    return false
  }
}

function installCodexSkillLinks(targetDir) {
  const skillsSource = join(targetDir, '.claude', 'skills')
  if (!existsSync(skillsSource)) return

  const agentsSkillsDir = join(targetDir, '.agents', 'skills')
  if (!ensureDir(agentsSkillsDir)) return

  const sparqSkills = listDirs(skillsSource).filter((d) => d.startsWith('sparq-'))
  // Junctions work on Windows without Developer Mode but require absolute paths.
  // Unix/macOS uses relative 'dir' symlinks.
  const useJunction = process.platform === 'win32'
  let linked = 0

  for (const skill of sparqSkills) {
    const linkPath = join(agentsSkillsDir, skill)
    if (isExistingSymlink(linkPath)) continue

    const targetPath = useJunction
      ? join(skillsSource, skill)
      : relative(agentsSkillsDir, join(skillsSource, skill))
    try {
      dryRun(
        () => symlinkSync(targetPath, linkPath, useJunction ? 'junction' : 'dir'),
        `symlink .agents/skills/${skill} -> .claude/skills/${skill}`,
      )
      linked++
    } catch (err) {
      if (linked === 0) {
        warn(`Could not create symlink for ${skill}: ${err.message}`)
        info('Codex skill symlinks require symlink support (Unix/macOS, or Windows Dev Mode)')
      }
      break
    }
  }

  if (linked > 0) {
    ok(`.agents/skills/ created (${linked} symlink(s) to .claude/skills/)`)
  }
}

/**
 * Remove a single symlink or directory entry.
 */
function removeSkillEntry(entryPath, entryName) {
  try {
    const stat = lstatSync(entryPath)
    if (!stat.isSymbolicLink() && !stat.isDirectory()) return false
    dryRun(() => {
      if (stat.isSymbolicLink()) unlinkSync(entryPath)
      else rmSync(entryPath, { recursive: true, force: true })
    }, `remove .agents/skills/${entryName}`)
    ok(`Removed .agents/skills/${entryName}`)
    return true
  } catch {
    return false
  }
}

function removeCodexSkillLinks(agentsSkillsDir) {
  let removed = 0
  try {
    const entries = readdirSync(agentsSkillsDir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.name.startsWith('sparq-')) continue
      if (removeSkillEntry(join(agentsSkillsDir, entry.name), entry.name)) removed++
    }
  } catch {
    // Can't read directory
  }
  return removed
}

function removeCodexExtras(targetDir, mcpServersAdded) {
  let removed = 0

  const codexToml = join(targetDir, '.codex', 'config.toml')
  if (existsSync(codexToml)) {
    removed += removeCodexMcpEntries(codexToml, mcpServersAdded)
  }

  const agentsSkillsDir = join(targetDir, '.agents', 'skills')
  if (existsSync(agentsSkillsDir)) {
    removed += removeCodexSkillLinks(agentsSkillsDir)
    cleanEmptyDir(agentsSkillsDir)
    cleanEmptyDir(join(targetDir, '.agents'))
  }

  return removed
}

function removeCodexMcpEntries(codexTomlPath, mcpServersAdded) {
  if (!mcpServersAdded || mcpServersAdded.length === 0) {
    info('.codex/config.toml — no SparQ servers tracked, skipping')
    return 0
  }

  try {
    const content = readFileSync(codexTomlPath, 'utf-8')
    const cleaned = tomlRemoveMcpSections(content, mcpServersAdded)

    if (!cleaned || !cleaned.trim()) {
      // No content remains — delete the file
      dryRun(() => unlinkSync(codexTomlPath), 'remove .codex/config.toml')
      ok('Removed .codex/config.toml (all SparQ servers removed)')
      return 1
    }

    if (cleaned !== content) {
      dryRun(
        () => writeFileSync(codexTomlPath, cleaned, 'utf-8'),
        'remove SparQ MCP entries from .codex/config.toml',
      )
      ok('Removed SparQ server(s) from .codex/config.toml')
      return 1
    }

    return 0
  } catch (err) {
    warn(`Could not update .codex/config.toml: ${err.message}`)
    return 0
  }
}

/**
 * Remove a directory if it exists and is empty.
 */
function cleanEmptyDir(dirPath) {
  if (!existsSync(dirPath)) return
  try {
    const entries = readdirSync(dirPath)
    if (entries.length === 0) {
      if (!isDryRun()) rmSync(dirPath, { force: true })
    }
  } catch {
    // Not empty or not accessible — leave it
  }
}

/**
 * Check Codex extras health.
 */
function checkCodexExtras(targetDir, issues) {
  const codexToml = join(targetDir, '.codex', 'config.toml')
  if (!existsSync(codexToml)) {
    issues.push('.codex/config.toml not found')
  }

  const agentsSkillsDir = join(targetDir, '.agents', 'skills')
  if (!existsSync(agentsSkillsDir)) {
    issues.push('.agents/skills/ directory not found')
  } else {
    // Check that at least one sparq-* entry exists (may be directories or symlinks)
    try {
      const entries = readdirSync(agentsSkillsDir, { withFileTypes: true })
      const sparqEntries = entries.filter(
        (e) => e.name.startsWith('sparq-') && (e.isDirectory() || e.isSymbolicLink()),
      )
      if (sparqEntries.length === 0) {
        issues.push('.agents/skills/ contains no sparq-* entries')
      }
    } catch {
      issues.push('.agents/skills/ is not readable')
    }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Install platform-specific extras for all detected platforms after the canonical .claude/ install.
 * Claude Code: no extras needed (canonical install is sufficient).
 * Cursor: .cursor/mcp.json (merged), .cursor/rules/sparq.mdc
 * Codex: .codex/config.toml (merged), .agents/skills/ symlinks
 *
 * @param {string} targetDir - Absolute path to the target project root
 * @param {string[]} platforms - Array of detected platform IDs (from detectPlatforms())
 * @param {object} [options] - Additional context
 * @param {object} [options.techStack] - Detected tech stack
 * @param {object} [options.e2eConfig] - Detected E2E config
 * @param {string[]} [options.mcpServersAdded] - Server names SparQ added to .mcp.json
 */
export function installPlatformExtras(targetDir, platforms, options = {}) {
  for (const entry of PLATFORM_REGISTRY) {
    if (platforms.includes(entry.id)) {
      entry.install(targetDir, options)
    }
  }
  // Claude: no extras needed
}

/**
 * Remove platform-specific extras for all specified platforms.
 * Only removes SparQ-added MCP servers, preserving pre-existing ones.
 *
 * @param {string} targetDir - Absolute path to the target project root
 * @param {string[]} platforms - Array of platform IDs to clean up
 * @param {string[]} [mcpServersAdded] - Server names SparQ added (from manifest)
 * @returns {number} Number of items removed
 */
export function removePlatformExtras(targetDir, platforms, mcpServersAdded = []) {
  let total = 0
  for (const entry of PLATFORM_REGISTRY) {
    if (platforms.includes(entry.id)) {
      total += entry.remove(targetDir, mcpServersAdded)
    }
  }
  return total
}

/**
 * Check platform-specific extras health for all detected platforms.
 *
 * @param {string} targetDir - Absolute path to the target project root
 * @param {string[]} platforms - Array of detected platform IDs (from detectPlatforms())
 * @returns {{ ok: boolean, issues: string[] }}
 */
export function checkPlatformExtras(targetDir, platforms) {
  const issues = []

  // AGENTS.md check (universal — all installs)
  const agentsMdPath = join(targetDir, 'AGENTS.md')
  if (!existsSync(agentsMdPath)) {
    issues.push('AGENTS.md not found')
  } else {
    const content = readFileSync(agentsMdPath, 'utf-8')
    if (!content.includes(AGENTS_MD_BLOCK_START)) {
      issues.push('AGENTS.md missing SparQ sentinel markers')
    }
  }

  // Platform-specific checks
  for (const entry of PLATFORM_REGISTRY) {
    if (platforms.includes(entry.id)) {
      entry.check(targetDir, issues)
    }
  }

  return { ok: issues.length === 0, issues }
}
