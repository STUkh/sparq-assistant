// bin/lib/hooks.mjs — Hook installation and health checks

import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { PKG_ROOT } from './constants.mjs'
import { ensureDir, toForwardSlash } from './files.mjs'
import { dryRun, info, isDryRun, ok, warn } from './state.mjs'

const PKG_HOOKS_DIR = join(PKG_ROOT, 'claude', 'hooks')
const SETTINGS_REL_PATH = '.claude/settings.local.json'

const HOOK_FILES = Object.freeze(['sparq-stop-guard.mjs', 'sparq-pre-compact.mjs'])

const SPARQ_HOOK_CONFIG = Object.freeze({
  Stop: [
    {
      hooks: [{ type: 'command', command: 'node .claude/hooks/sparq-stop-guard.mjs', timeout: 10 }],
    },
  ],
  PreCompact: [
    {
      matcher: 'auto',
      hooks: [
        { type: 'command', command: 'node .claude/hooks/sparq-pre-compact.mjs', timeout: 10 },
      ],
    },
  ],
})

/**
 * Install or update SparQ hook scripts and merge config into settings.local.json.
 *
 * @param {string} targetDir - absolute path to the target project root
 * @param {object} [options]
 * @param {boolean} [options.update] - if true, overwrite existing scripts
 * @returns {{ installed: string[], merged: boolean, skipped: string[] }}
 */
export function installHooks(targetDir, options = {}) {
  const hooksDir = join(targetDir, '.claude', 'hooks')
  const result = { installed: [], merged: false, skipped: [] }

  // 1. Ensure hooks directory exists
  if (!ensureDir(hooksDir)) return result

  // 2. Copy hook scripts
  for (const file of HOOK_FILES) {
    const src = join(PKG_HOOKS_DIR, file)
    const dest = join(hooksDir, file)

    if (existsSync(dest) && !options.update) {
      result.skipped.push(file)
      continue
    }

    dryRun(() => {
      copyFileSync(src, dest)
    }, `copy ${file} -> .claude/hooks/${file}`)

    result.installed.push(file)
  }

  // 3. Merge hook config into settings.local.json
  const settingsPath = join(targetDir, SETTINGS_REL_PATH)
  const merged = mergeHookSettings(settingsPath)
  result.merged = merged

  // 4. Report
  if (result.installed.length > 0) {
    ok(`Installed ${result.installed.length} hook script(s) to .claude/hooks/`)
    for (const file of result.installed) {
      info(`  ${toForwardSlash(file)}`)
    }
  }
  if (result.skipped.length > 0) {
    for (const file of result.skipped) {
      info(`  ${toForwardSlash(file)} (exists, skipped)`)
    }
  }
  if (merged) {
    info('Merged hook configuration into .claude/settings.local.json')
  }

  return result
}

/**
 * Merge SparQ hook entries into settings.local.json, preserving existing hooks.
 */
function mergeHookSettings(settingsPath) {
  let existing = {}
  if (existsSync(settingsPath)) {
    try {
      existing = JSON.parse(readFileSync(settingsPath, 'utf-8'))
    } catch {
      warn('.claude/settings.local.json is not valid JSON — hooks will be appended')
      existing = {}
    }
  }

  if (!existing.hooks) existing.hooks = {}

  let changed = false
  for (const [event, entries] of Object.entries(SPARQ_HOOK_CONFIG)) {
    if (!existing.hooks[event]) {
      existing.hooks[event] = entries
      changed = true
      continue
    }

    // Check if SparQ hook already registered (by command path)
    for (const entry of entries) {
      const sparqCommand = entry.hooks?.[0]?.command || entry.command
      const alreadyRegistered = existing.hooks[event].some((e) => {
        const cmd = e.hooks?.[0]?.command || e.command
        return cmd === sparqCommand
      })
      if (!alreadyRegistered) {
        existing.hooks[event].push(entry)
        changed = true
      }
    }
  }

  if (changed && !isDryRun()) {
    writeFileSync(settingsPath, `${JSON.stringify(existing, null, 2)}\n`)
  }

  return changed
}

/**
 * Check hooks installation health.
 *
 * @param {string} targetDir - absolute path to the target project root
 * @returns {{ ok: boolean, issues: string[] }}
 */
export function checkHooks(targetDir) {
  const issues = []
  const hooksDir = join(targetDir, '.claude', 'hooks')

  // Check hooks directory
  if (!existsSync(hooksDir)) {
    issues.push('.claude/hooks/ directory not found')
    return { ok: false, issues }
  }

  // Check script files
  for (const file of HOOK_FILES) {
    if (!existsSync(join(hooksDir, file))) {
      issues.push(`.claude/hooks/${file} not found`)
    }
  }

  // Check settings.local.json has hook entries
  const settingsPath = join(targetDir, SETTINGS_REL_PATH)
  if (existsSync(settingsPath)) {
    try {
      const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'))
      if (!settings.hooks?.Stop) {
        issues.push('Stop hook not configured in .claude/settings.local.json')
      }
      if (!settings.hooks?.PreCompact) {
        issues.push('PreCompact hook not configured in .claude/settings.local.json')
      }
    } catch {
      issues.push('.claude/settings.local.json is not valid JSON')
    }
  } else {
    issues.push('.claude/settings.local.json not found')
  }

  return { ok: issues.length === 0, issues }
}
