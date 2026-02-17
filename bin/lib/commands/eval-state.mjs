// bin/lib/commands/eval-state.mjs — Eval state management for eval loop safety

import { execSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { PKG_ROOT } from '../constants.mjs'
import { atomicWriteSync } from './eval-reflect.mjs'

const AGENTS_DIR = join(PKG_ROOT, 'claude', 'agents')
const DATA_DIR = join(PKG_ROOT, 'test', 'evals', 'data')
const TUNE_DIR = join(DATA_DIR, 'tune-history')

// ---------------------------------------------------------------------------
// GAP 6.1: Git stash rollback checkpoint
// ---------------------------------------------------------------------------

export function createCheckpoint() {
  try {
    const status = execSync('git status --porcelain -- claude/agents/', {
      encoding: 'utf-8',
      timeout: 3000,
      cwd: PKG_ROOT,
    }).trim()
    if (!status) return { success: true, empty: true }
    execSync('git stash push -m "sparq-eval-tune-checkpoint" -- claude/agents/', {
      encoding: 'utf-8',
      timeout: 5000,
      cwd: PKG_ROOT,
    })
    return { success: true, empty: false }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

export function restoreCheckpoint() {
  try {
    const list = execSync('git stash list', {
      encoding: 'utf-8',
      timeout: 3000,
      cwd: PKG_ROOT,
    })
    if (!list.includes('sparq-eval-tune-checkpoint')) {
      return {
        success: false,
        error: 'No tune checkpoint found in git stash',
      }
    }
    execSync('git stash pop', {
      encoding: 'utf-8',
      timeout: 5000,
      cwd: PKG_ROOT,
    })
    return { success: true }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

// ---------------------------------------------------------------------------
// GAP 4.4: Agent file existence validation
// ---------------------------------------------------------------------------

export function validateAgentFiles(agentNames) {
  const valid = []
  const missing = []
  const warnings = []
  for (const name of agentNames) {
    const normalized = name.startsWith('sparq-') ? name : `sparq-${name}`
    const filename = normalized.endsWith('.md') ? normalized : `${normalized}.md`
    const fullPath = join(AGENTS_DIR, filename)
    if (existsSync(fullPath)) {
      valid.push(filename)
    } else {
      missing.push(filename)
      warnings.push(`Agent file not found: ${filename} — fixes for this agent will be skipped`)
    }
  }
  return { valid, missing, warnings }
}

// ---------------------------------------------------------------------------
// GAP 4.2: Fix traceability — save and load tune records
// ---------------------------------------------------------------------------

export function saveTuneRecord(record, options = {}) {
  const dir = options.tuneDir ?? TUNE_DIR
  mkdirSync(dir, { recursive: true })
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const filename = `${ts}-tune.json`
  const payload = {
    timestamp: new Date().toISOString(),
    reflectionSource: record.reflectionSource ?? null,
    modelTier: record.modelTier ?? 'unknown',
    fixes: (record.fixes ?? []).map((f) => ({
      agent: f.agent,
      section: f.section,
      technique: f.technique,
      rubricChecks: f.rubricChecks ?? [],
      expectedDelta: f.expectedDelta ?? null,
      finding: f.finding ?? '',
    })),
  }
  atomicWriteSync(join(dir, filename), JSON.stringify(payload, null, 2))
  return { filename, path: join(dir, filename) }
}

export function loadTuneHistory(options = {}) {
  const dir = options.tuneDir ?? TUNE_DIR
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => f.endsWith('-tune.json'))
    .sort()
    .map((f) => {
      try {
        return JSON.parse(readFileSync(join(dir, f), 'utf-8'))
      } catch {
        return null
      }
    })
    .filter(Boolean)
}

// ---------------------------------------------------------------------------
// GAP 3.2: Protected sections — track tune-modified agent sections
// ---------------------------------------------------------------------------

export function getProtectedSections(options = {}) {
  const history = loadTuneHistory(options)
  if (history.length === 0) return {}
  const protections = {}
  for (const record of history) {
    for (const fix of record.fixes) {
      if (!protections[fix.agent]) protections[fix.agent] = new Set()
      protections[fix.agent].add(fix.section)
    }
  }
  const result = {}
  for (const [agent, sections] of Object.entries(protections)) {
    result[agent] = [...sections]
  }
  return result
}

// ---------------------------------------------------------------------------
// GAP 3.3: Optimize gate — enforce re-eval after optimize
// ---------------------------------------------------------------------------

export function checkOptimizeGate(options = {}) {
  const dataDir = options.dataDir ?? DATA_DIR
  const markerPath = join(dataDir, '.optimize-pending')
  if (existsSync(markerPath)) {
    const marker = readFileSync(markerPath, 'utf-8').trim()
    return {
      needsReeval: true,
      reason: `Agents optimized at ${marker} — re-eval required before committing`,
    }
  }
  return { needsReeval: false }
}

export function setOptimizeMarker(options = {}) {
  const dataDir = options.dataDir ?? DATA_DIR
  mkdirSync(dataDir, { recursive: true })
  writeFileSync(join(dataDir, '.optimize-pending'), new Date().toISOString(), 'utf-8')
}

export function clearOptimizeMarker(options = {}) {
  const dataDir = options.dataDir ?? DATA_DIR
  const markerPath = join(dataDir, '.optimize-pending')
  try {
    if (existsSync(markerPath)) unlinkSync(markerPath)
  } catch {}
}
