// bin/lib/permissions.mjs — Claude settings.local.json permission generation

import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ensureDir, toForwardSlash } from './files.mjs'
import { dryRun, getVerbosity, info, isDryRun, ok, style, warn } from './state.mjs'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PERMISSION_DESCRIPTIONS = {
  'Bash(node:*)': 'Run Node.js scripts for test verification',
  'Bash(npx playwright test:*)': 'Execute Playwright tests',
  'Bash(npx cypress run:*)': 'Execute Cypress tests',
  'Bash(npx playwright screenshot:*)': 'Take browser screenshots via Playwright CLI',
  'Bash(npx playwright codegen:*)': 'Generate test code via Playwright codegen',
  'Bash(npx playwright open:*)': 'Open browser via Playwright CLI',
  'Bash(npx playwright install:*)': 'Install Playwright browsers',
  'Bash(npx tsc:*)': 'Run TypeScript compiler checks',
  'Read(.sparq/**)': 'Read SparQ output artifacts',
  'Write(.sparq/**)': 'Write SparQ output artifacts',
  'Read(.claude/**)': 'Read agent and skill definitions',
  'Read(sparq.config.json)': 'Read project configuration',
}

const SETTINGS_REL_PATH = '.claude/settings.local.json'
const SETTINGS_BACKUP_SUFFIX = '.bak'

const BASE_PERMISSIONS = Object.freeze([
  'Bash(node:*)',
  'Bash(npx playwright test:*)',
  'Bash(npx tsc:*)',
  'Read(.sparq/**)',
  'Write(.sparq/**)',
  'Read(.claude/**)',
  'Read(sparq.config.json)',
])

/**
 * Maps feature names to their MCP permission patterns.
 * Multiple features may map to the same pattern (e.g., jira + confluence -> atlassian).
 */
const FEATURE_MCP_MAP = Object.freeze({
  jira: 'mcp__atlassian__*',
  confluence: 'mcp__atlassian__*',
  figma: 'mcp__figma__*',
  testrail: 'mcp__testrail__*',
  qase: 'mcp__qase__*',
})

const FEATURE_CLI_PERMISSIONS = Object.freeze({
  'playwright-cli': [
    'Bash(npx playwright screenshot:*)',
    'Bash(npx playwright codegen:*)',
    'Bash(npx playwright open:*)',
    'Bash(npx playwright install:*)',
  ],
})

// ---------------------------------------------------------------------------
// Permission Rule Builder
// ---------------------------------------------------------------------------

/**
 * Add MCP and CLI permissions for a single feature to the permissions array.
 *
 * @param {string} feature - a single feature name
 * @param {string[]} permissions - mutable array to append permissions to
 */
function addFeaturePermissions(feature, permissions) {
  const mcpPattern = FEATURE_MCP_MAP[feature]
  if (mcpPattern && !permissions.includes(mcpPattern)) {
    permissions.push(mcpPattern)
  }
  const cliPerms = FEATURE_CLI_PERMISSIONS[feature]
  if (cliPerms) {
    for (const perm of cliPerms) {
      if (!permissions.includes(perm)) permissions.push(perm)
    }
  }
}

export function buildPermissionRules(features = [], options = {}) {
  const permissions = [...BASE_PERMISSIONS]

  if (options.framework === 'cypress') {
    const cypressPerm = 'Bash(npx cypress run:*)'
    if (!permissions.includes(cypressPerm)) permissions.push(cypressPerm)
  }

  for (const feature of features) {
    addFeaturePermissions(feature, permissions)
  }

  return permissions
}

// ---------------------------------------------------------------------------
// Settings Merger
// ---------------------------------------------------------------------------

/**
 * Merge SparQ permissions into existing settings, preserving user entries.
 *
 * @param {object} existing - parsed JSON from existing settings file (or {})
 * @param {string[]} sparqPermissions - permission strings to add
 * @returns {object} merged settings object
 */
export function mergeSettings(existing, sparqPermissions) {
  const merged = { ...existing }

  if (!merged.permissions) {
    merged.permissions = { allow: [...sparqPermissions] }
    return merged
  }

  merged.permissions = { ...merged.permissions }

  if (!Array.isArray(merged.permissions.allow)) {
    merged.permissions.allow = [...sparqPermissions]
    return merged
  }

  // Append SparQ permissions that aren't already present, then deduplicate
  const combined = [...merged.permissions.allow]
  for (const perm of sparqPermissions) {
    if (!combined.includes(perm)) {
      combined.push(perm)
    }
  }
  merged.permissions.allow = combined

  return merged
}

// ---------------------------------------------------------------------------
// Main Generator
// ---------------------------------------------------------------------------

/**
 * Generate or update `.claude/settings.local.json` in the target project
 * with scoped permissions for SparQ operations.
 *
 * @param {string} targetDir - absolute path to the target project root
 * @param {object} [options] - configuration options
 * @param {string[]} [options.features] - enabled feature names (defaults to [])
 * @returns {{ created: boolean, merged: boolean, path: string }}
 */
// --- Permission generation helpers (extracted for complexity reduction) ---

function readExistingSettings(settingsPath, displayPath) {
  if (!existsSync(settingsPath)) return { existing: {}, fileExists: false }
  try {
    return { existing: JSON.parse(readFileSync(settingsPath, 'utf-8')), fileExists: true }
  } catch {
    warn(`${displayPath} exists but is not valid JSON — will be backed up and replaced`)
    return { existing: {}, fileExists: true }
  }
}

function writeWithBackup(settingsPath, content, fileExists, displayPath) {
  const backupPath = `${settingsPath}${SETTINGS_BACKUP_SUFFIX}`
  if (fileExists) {
    dryRun(() => {
      writeFileSync(backupPath, readFileSync(settingsPath, 'utf-8'))
    }, `backup ${displayPath} -> ${displayPath}${SETTINGS_BACKUP_SUFFIX}`)
  }
  dryRun(() => {
    writeFileSync(settingsPath, content)
  }, `write ${displayPath}`)
  if (fileExists && !isDryRun()) {
    try {
      if (existsSync(backupPath)) unlinkSync(backupPath)
    } catch {
      // Non-critical — leave the backup file
    }
  }
}

function reportPermissionResult(fileExists, sparqPermissions, displayPath) {
  if (fileExists) {
    info(`Merged SparQ permissions into ${displayPath}`)
  } else {
    ok(`Created ${displayPath} with SparQ permissions`)
  }
  info(
    'This file grants Claude Code permission to read/write .sparq/ data, ' +
      'run E2E framework/TypeScript commands, and access configured MCP servers.',
  )
  if (getVerbosity() === 'verbose') {
    for (const perm of sparqPermissions) {
      const desc = PERMISSION_DESCRIPTIONS[perm]
      if (desc) info(`  ${style.dim(perm)} — ${desc}`)
    }
  }
}

// --- Main generator ---

export function generatePermissions(targetDir, options = {}) {
  const { features = [], framework } = options
  const settingsPath = join(targetDir, SETTINGS_REL_PATH)
  const settingsDir = join(targetDir, '.claude')
  const displayPath = toForwardSlash(SETTINGS_REL_PATH)
  const result = { created: false, merged: false, path: settingsPath }

  const sparqPermissions = buildPermissionRules(features, { framework })
  if (!ensureDir(settingsDir)) return result

  const { existing, fileExists } = readExistingSettings(settingsPath, displayPath)
  const merged = mergeSettings(existing, sparqPermissions)
  const content = `${JSON.stringify(merged, null, 2)}\n`

  writeWithBackup(settingsPath, content, fileExists, displayPath)

  result[fileExists ? 'merged' : 'created'] = true
  reportPermissionResult(fileExists, sparqPermissions, displayPath)

  return result
}
