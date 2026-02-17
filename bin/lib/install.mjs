// bin/lib/install.mjs — Shared install operations

import {
  appendFileSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { generateRuleContent, PKG_MCP_DIR, SPARQ_RULE_FILE } from './constants.mjs'
import { copyDirRecursive, toForwardSlash } from './files.mjs'
import { dryRun, fail, getVerbosity, info, isDryRun, ok, warn } from './state.mjs'

// ---------------------------------------------------------------------------
// Install & Report Helper (#27)
// ---------------------------------------------------------------------------

/**
 * Copy a directory and report results with a label prefix.
 */
export function installAndReport(srcDir, destDir, label, { merge = true, exclude } = {}) {
  const result = copyDirRecursive(srcDir, destDir, { merge, exclude })
  for (const f of result.copied) ok(`${label}/${f}`)
  if (merge) {
    for (const f of result.skipped) warn(`${label}/${f} (already exists, skipped)`)
  }
  for (const e of result.errors) fail(e)
  if (result.copied.length === 0 && result.skipped.length === 0 && result.errors.length === 0) {
    info(`No ${label} files found in package.`)
  }
  return { copied: result.copied.length, errors: result.errors.length }
}

// ---------------------------------------------------------------------------
// MCP Config Merge
// ---------------------------------------------------------------------------

/**
 * Load the target .mcp.json, returning a parsed object. Handles invalid JSON (#25).
 */
function loadTargetMcp(targetMcpPath) {
  if (!existsSync(targetMcpPath)) return { mcpServers: {} }

  try {
    const parsed = JSON.parse(readFileSync(targetMcpPath, 'utf-8'))
    if (!parsed.mcpServers) parsed.mcpServers = {}
    return parsed
  } catch {
    warn('.mcp.json exists but is not valid JSON — saving to .mcp.json.broken')
    try {
      if (!isDryRun()) copyFileSync(targetMcpPath, `${targetMcpPath}.broken`)
    } catch (err) {
      if (getVerbosity() === 'verbose') info(`[debug] backup broken .mcp.json: ${err.message}`)
    }
    return { mcpServers: {} }
  }
}

/**
 * Merge servers from a single MCP config file into the target.
 * When serverFilter is provided, only servers whose names are in the filter are merged.
 * Newly added server names are pushed into addedNames for tracking.
 */
function mergeServersFromFile(file, targetMcp, serverFilter, addedNames) {
  let added = 0
  let preserved = 0
  try {
    const data = JSON.parse(readFileSync(join(PKG_MCP_DIR, file), 'utf-8'))
    const servers = data.mcpServers || data
    for (const [name, config] of Object.entries(servers)) {
      if (serverFilter && !serverFilter.includes(name)) continue
      if (name in targetMcp.mcpServers) {
        preserved++
        warn(`MCP server '${name}' already exists (preserved)`)
      } else {
        targetMcp.mcpServers[name] = config
        added++
        addedNames.push(name)
        ok(`MCP server '${name}' added`)
      }
    }
  } catch (err) {
    fail(`Failed to parse MCP config ${file}: ${err.message}`)
  }
  return { added, preserved }
}

/**
 * Write the merged MCP config, backing up first (#24).
 * Cleans up .bak file after successful write.
 */
function writeMcpConfig(targetMcpPath, targetMcp, added, preserved) {
  if (added === 0) {
    if (preserved > 0) info(`.mcp.json unchanged (${preserved} servers already present)`)
    return
  }

  const bakPath = `${targetMcpPath}.bak`

  try {
    if (existsSync(targetMcpPath) && !isDryRun()) {
      try {
        copyFileSync(targetMcpPath, bakPath)
      } catch (err) {
        if (getVerbosity() === 'verbose') info(`[debug] backup .mcp.json: ${err.message}`)
      }
    }
    dryRun(
      () => writeFileSync(targetMcpPath, `${JSON.stringify(targetMcp, null, 2)}\n`, 'utf-8'),
      `write .mcp.json to ${toForwardSlash(targetMcpPath)}`,
    )
    ok(`.mcp.json updated (${added} added, ${preserved} preserved)`)

    // Clean up backup after successful write
    if (!isDryRun() && existsSync(bakPath)) {
      try {
        unlinkSync(bakPath)
      } catch {
        // Non-critical — leave the backup file
      }
    }
  } catch (err) {
    fail(`Failed to write .mcp.json: ${err.message}`)
  }
}

/**
 * Merge MCP JSON files from the package mcp/ directory into the target .mcp.json.
 * (#24) Backs up .mcp.json before merge (cleaned up on success).
 * (#25) Handles invalid JSON gracefully.
 * (#26) Skips write if no changes.
 *
 * @param {string} targetMcpPath - Path to the target .mcp.json file
 * @param {string[]|null} serverFilter - When provided, only merge servers whose names are in this list
 * @returns {string[]} Names of servers that were actually added (not preserved)
 */
export function mergeMcpConfigs(targetMcpPath, serverFilter = null) {
  const addedNames = []
  const targetMcp = loadTargetMcp(targetMcpPath)

  if (!existsSync(PKG_MCP_DIR)) {
    info('No MCP config files found in package.')
    return addedNames
  }

  let mcpFiles
  try {
    mcpFiles = readdirSync(PKG_MCP_DIR).filter((f) => f.endsWith('.json'))
  } catch (err) {
    fail(`Failed to read MCP directory: ${err.message}`)
    return addedNames
  }

  if (mcpFiles.length === 0) {
    info('No MCP config files found in package.')
    return addedNames
  }

  let added = 0
  let preserved = 0
  for (const file of mcpFiles) {
    const counts = mergeServersFromFile(file, targetMcp, serverFilter, addedNames)
    added += counts.added
    preserved += counts.preserved
  }

  writeMcpConfig(targetMcpPath, targetMcp, added, preserved)
  return addedNames
}

// ---------------------------------------------------------------------------
// Rule File Installation (replaces CLAUDE.md injection)
// ---------------------------------------------------------------------------

/**
 * Install the SparQ rule file to .claude/rules/sparq.md.
 * Claude Code auto-discovers skills and agents from .claude/ directories.
 * The rule file provides project stack context and selector strategy.
 *
 * @param {string} targetDir - Target project directory
 * @param {object} [techStack] - Detected tech stack (framework, extensions, etc.)
 * @param {object} [e2eConfig] - Detected E2E setup (framework, structure, etc.)
 */
export function installRuleFile(targetDir, techStack, e2eConfig) {
  const rulesDir = join(targetDir, '.claude', 'rules')
  const rulePath = join(rulesDir, SPARQ_RULE_FILE)
  const content = generateRuleContent(techStack, e2eConfig)

  if (existsSync(rulePath)) {
    // Always regenerate to reflect latest detection results
    try {
      dryRun(() => {
        writeFileSync(rulePath, content, 'utf-8')
      }, `update .claude/rules/${SPARQ_RULE_FILE}`)
      ok('.claude/rules/sparq.md updated')
    } catch (err) {
      fail(`Failed to update rule file: ${err.message}`)
    }
    return
  }

  try {
    dryRun(() => {
      mkdirSync(rulesDir, { recursive: true })
      writeFileSync(rulePath, content, 'utf-8')
    }, `write .claude/rules/${SPARQ_RULE_FILE}`)
    ok('.claude/rules/sparq.md created')
  } catch (err) {
    fail(`Failed to create rule file: ${err.message}`)
    info('You can manually create .claude/rules/sparq.md.')
  }
}

/**
 * Ensure .gitignore contains .sparq/ entry.
 */
export function ensureGitignore(gitignorePath) {
  try {
    if (existsSync(gitignorePath)) {
      const content = readFileSync(gitignorePath, 'utf-8')
      const lines = content.split('\n').map((l) => l.trim())
      if (lines.includes('.sparq/') || lines.includes('.sparq')) {
        info('.gitignore already includes .sparq/ (skipped)')
        return
      }
      const separator = content.endsWith('\n') ? '' : '\n'
      dryRun(
        () =>
          appendFileSync(
            gitignorePath,
            `${separator}\n# SparQ QA Assistant output\n.sparq/\n`,
            'utf-8',
          ),
        `add .sparq/ to ${toForwardSlash(gitignorePath)}`,
      )
      ok('.sparq/ added to .gitignore')
    } else {
      dryRun(
        () => writeFileSync(gitignorePath, '# SparQ QA Assistant output\n.sparq/\n', 'utf-8'),
        `create .gitignore at ${toForwardSlash(gitignorePath)}`,
      )
      ok('.gitignore created with .sparq/ entry')
    }
  } catch (err) {
    fail(`Failed to update .gitignore: ${err.message}`)
    info('Manually add `.sparq/` to your .gitignore file.')
  }
}

/**
 * Read the package's MCP config files to get the list of server names that SparQ installs.
 */
export function getSparqMcpServerNames() {
  if (!existsSync(PKG_MCP_DIR)) return []

  const names = new Set()
  try {
    const mcpFiles = readdirSync(PKG_MCP_DIR).filter((f) => f.endsWith('.json'))
    for (const file of mcpFiles) {
      try {
        const data = JSON.parse(readFileSync(join(PKG_MCP_DIR, file), 'utf-8'))
        const servers = data.mcpServers || data
        for (const name of Object.keys(servers)) names.add(name)
      } catch {
        // Skip malformed files
      }
    }
  } catch {
    // Can't read MCP dir
  }
  return [...names]
}
