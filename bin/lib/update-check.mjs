// bin/lib/update-check.mjs — Non-blocking npm version check with 24h cache

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { request } from 'node:https'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { VERSION } from './constants.mjs'
import { style } from './state.mjs'

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const NPM_REGISTRY_URL = 'https://registry.npmjs.org'
const DEFAULT_TIMEOUT_MS = 5_000
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1_000

let _cacheDir = join(homedir(), '.sparq-assistant')
let _cacheFile = join(_cacheDir, 'update-check.json')

/** @internal — override cache dir for test isolation */
export function _setCacheDir(dir) {
  _cacheDir = dir
  _cacheFile = join(dir, 'update-check.json')
}

/** @internal — reset cache dir to default */
export function _resetCacheDir() {
  _cacheDir = join(homedir(), '.sparq-assistant')
  _cacheFile = join(_cacheDir, 'update-check.json')
}

// ---------------------------------------------------------------------------
// Semver Comparison
// ---------------------------------------------------------------------------

/**
 * Compare two semver version strings (major.minor.patch).
 * Returns -1 if a < b, 0 if a === b, 1 if a > b.
 * Returns 0 for any malformed input (safe fallback).
 */
export function compareVersions(a, b) {
  const parse = (v) => {
    const parts = String(v ?? '')
      .split('.')
      .map(Number)
    if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n) || n < 0)) return null
    return parts
  }
  const pa = parse(a)
  const pb = parse(b)
  if (!pa || !pb) return 0
  for (let i = 0; i < 3; i++) {
    if (pa[i] < pb[i]) return -1
    if (pa[i] > pb[i]) return 1
  }
  return 0
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

/**
 * Read the cached update check result.
 * Returns { lastChecked, latestVersion, currentAtCheck } or null.
 */
export function readCache() {
  try {
    if (!existsSync(_cacheFile)) return null
    const data = JSON.parse(readFileSync(_cacheFile, 'utf-8'))
    if (typeof data.lastChecked !== 'number' || typeof data.latestVersion !== 'string') return null
    return data
  } catch {
    return null
  }
}

/**
 * Write the update check result to cache.
 * Silently ignores write failures (e.g., permissions).
 */
export function writeCache(latestVersion, currentVersion) {
  try {
    if (!existsSync(_cacheDir)) mkdirSync(_cacheDir, { recursive: true })
    const data = JSON.stringify(
      { lastChecked: Date.now(), latestVersion, currentAtCheck: currentVersion },
      null,
      2,
    )
    writeFileSync(_cacheFile, `${data}\n`, 'utf-8')
  } catch {
    // Cache write failure is not critical
  }
}

// ---------------------------------------------------------------------------
// Registry Fetch
// ---------------------------------------------------------------------------

/**
 * Fetch the latest published version from the npm registry.
 * Returns the version string, or null on any failure.
 */
export function fetchLatestVersion(
  packageName = 'sparq-assistant',
  timeoutMs = DEFAULT_TIMEOUT_MS,
) {
  return new Promise((resolve) => {
    const url = `${NPM_REGISTRY_URL}/${packageName}/latest`
    const req = request(
      url,
      { timeout: timeoutMs, headers: { Accept: 'application/json' } },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume()
          resolve(null)
          return
        }
        let body = ''
        res.setEncoding('utf-8')
        res.on('data', (chunk) => {
          body += chunk
        })
        res.on('end', () => {
          try {
            const json = JSON.parse(body)
            resolve(typeof json.version === 'string' ? json.version : null)
          } catch {
            resolve(null)
          }
        })
      },
    )
    req.on('error', () => resolve(null))
    req.on('timeout', () => {
      req.destroy()
      resolve(null)
    })
    req.on('socket', (socket) => socket.unref())
    req.end()
  })
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Check for a newer version on npm, respecting the 24-hour cache interval.
 * Fire-and-forget — never throws, never delays the CLI.
 */
export async function checkForUpdate(currentVersion = VERSION) {
  try {
    const cached = readCache()
    if (cached && Date.now() - cached.lastChecked < CHECK_INTERVAL_MS) return

    const latest = await fetchLatestVersion()
    if (!latest) return

    writeCache(latest, currentVersion)
  } catch {
    // Update check must never crash the CLI
  }
}

/**
 * Display a one-line update notification if a newer version is cached.
 * Call after the command has completed — never before or during.
 */
export function showUpdateNotification(currentVersion = VERSION, { command } = {}) {
  if (command === 'update') return

  try {
    const cached = readCache()
    if (!cached) return

    const { latestVersion } = cached
    if (!latestVersion || compareVersions(currentVersion, latestVersion) >= 0) return

    console.log()
    console.log(
      `  ${style.yellow('Update available!')} ` +
        `${style.dim(currentVersion)} ${style.dim('\u2192')} ${style.green(latestVersion)}`,
    )
    console.log(`  Run ${style.cyan('npx sparq-assistant@latest update')} to update`)
  } catch {
    // Notification display must never crash the CLI
  }
}
