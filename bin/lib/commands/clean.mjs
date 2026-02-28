// bin/lib/commands/clean.mjs — Clean stale artifacts from .sparq/

import { existsSync, readdirSync, rmdirSync, statSync, unlinkSync } from 'node:fs'
import { join, relative } from 'node:path'
import { createInterface } from 'node:readline'
import { MAX_RECURSION_DEPTH } from '../constants.mjs'
import { confirm, toForwardSlash } from '../files.mjs'
import { forceReleaseLock } from '../lock.mjs'
import {
  checkInterrupted,
  dryRun,
  emoji,
  fail,
  heading,
  info,
  isDryRun,
  ok,
  style,
  warn,
} from '../state.mjs'
import { validateTargetDir } from '../validate.mjs'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PROTECTED_FILES = ['.manifest.json']

const PROTECTED_DIRS = ['.backup', 'plans']

const TRACKING_REGISTRY = 'tracking/test-registry.json'

const MS_PER_DAY = 86_400_000

// ---------------------------------------------------------------------------
// Artifact type mapping
// ---------------------------------------------------------------------------

const TYPE_MAP = {
  requirements: 'requirements',
  'test-cases': 'test-cases',
  automation: 'automation',
  coverage: 'coverage',
  validation: 'validation',
  refresh: 'refresh',
  tracking: 'tracking',
  plans: 'plans',
}

const VALID_TYPES = [...new Set(Object.values(TYPE_MAP)), 'lock']

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Format a byte count into a human-readable string.
 */
export function formatSize(bytes) {
  if (bytes === 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

/**
 * Extract the artifact type from a relative path under .sparq/.
 * Returns the first path segment mapped to a known type, or 'unknown'.
 */
export function getArtifactType(relativePath) {
  if (typeof relativePath !== 'string') return 'unknown'
  const normalized = toForwardSlash(relativePath)
  const firstSegment = normalized.split('/')[0]
  return TYPE_MAP[firstSegment] || 'unknown'
}

/**
 * Check whether a relative path (under .sparq/) is a protected file or directory.
 */
function isProtected(relativePath, includeTrackingRegistry) {
  const normalized = toForwardSlash(relativePath)

  for (const protectedFile of PROTECTED_FILES) {
    if (normalized === protectedFile) return true
  }

  for (const protectedDir of PROTECTED_DIRS) {
    if (normalized === protectedDir || normalized.startsWith(`${protectedDir}/`)) return true
  }

  // tracking/test-registry.json is protected unless --all with explicit confirmation
  if (!includeTrackingRegistry && normalized === TRACKING_REGISTRY) return true

  return false
}

/**
 * Recursively collect file entries from a directory.
 */
function collectEntries(dir, baseDir, entries = [], _depth = 0) {
  if (_depth > MAX_RECURSION_DEPTH) return entries
  let items
  try {
    items = readdirSync(dir, { withFileTypes: true })
  } catch {
    return entries
  }

  for (const item of items) {
    const fullPath = join(dir, item.name)
    const relPath = relative(baseDir, fullPath)

    if (item.isSymbolicLink()) continue

    if (item.isDirectory()) {
      collectEntries(fullPath, baseDir, entries, _depth + 1)
    } else if (item.isFile()) {
      try {
        const st = statSync(fullPath)
        const normalizedPath = toForwardSlash(relPath)
        entries.push({
          path: fullPath,
          relativePath: normalizedPath,
          size: st.size,
          mtime: st.mtime,
          type: getArtifactType(normalizedPath),
        })
      } catch {
        // Skip files we cannot stat
      }
    }
  }
}

/**
 * Scan .sparq/ for artifact files, excluding protected paths.
 * Returns an array of { path, relativePath, size, mtime, type } objects.
 */
export function scanArtifacts(sparqDir, options = {}) {
  const { type = null, olderThan = null, includeTrackingRegistry = false } = options
  const entries = []

  if (!existsSync(sparqDir)) return entries

  collectEntries(sparqDir, sparqDir, entries)

  // Filter out protected paths
  const filtered = entries.filter((e) => !isProtected(e.relativePath, includeTrackingRegistry))

  // Filter by artifact type
  const byType = type ? filtered.filter((e) => e.type === type) : filtered

  // Filter by age
  if (olderThan !== null && olderThan > 0) {
    const cutoff = Date.now() - olderThan * MS_PER_DAY
    return byType.filter((e) => e.mtime.getTime() < cutoff)
  }

  return byType
}

// ---------------------------------------------------------------------------
// Command: clean — internal helpers
// ---------------------------------------------------------------------------

/**
 * Display a summary of artifacts to be deleted.
 */
function displaySummary(artifacts, totalSize) {
  const typeCounts = {}
  for (const artifact of artifacts) {
    typeCounts[artifact.type] = (typeCounts[artifact.type] || 0) + 1
  }

  console.log()
  info(`Found ${style.bold(String(artifacts.length))} artifact(s) (${formatSize(totalSize)}):`)
  for (const [artifactType, count] of Object.entries(typeCounts).sort()) {
    console.log(`    ${style.dim(artifactType)}: ${count} file(s)`)
  }
  info(
    `${style.dim('Protected (excluded): .manifest.json, .backup/, plans/. Use --all to include tracking data.')}`,
  )
  console.log()

  const hasRegistry = artifacts.some((a) => a.relativePath === TRACKING_REGISTRY)
  if (hasRegistry) {
    warn('This will delete tracking/test-registry.json — test traceability data will be lost.')
  }
}

/**
 * Prompt user for confirmation before deleting artifacts.
 * Returns true if deletion should proceed.
 */
async function confirmDeletion(force, nonInteractive, artifacts, totalSize) {
  if (force) return true

  if (nonInteractive) {
    fail('Destructive operation requires --force in non-interactive mode.')
    return false
  }

  if (isDryRun()) return true

  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const proceed = await confirm(
    rl,
    `Delete ${artifacts.length} artifact(s) (${formatSize(totalSize)})?`,
    false,
  )
  rl.close()

  if (!proceed) {
    info('Clean cancelled.')
    return false
  }
  return true
}

/**
 * Delete the given artifacts and report results.
 */
function deleteArtifacts(artifacts, totalSize, sparqDir) {
  let deleted = 0
  let errorCount = 0

  for (const artifact of artifacts) {
    checkInterrupted()
    try {
      dryRun(() => unlinkSync(artifact.path), `delete ${artifact.relativePath}`)
      deleted++
    } catch (err) {
      if (err.code === 'ENOENT') {
        deleted++
        continue
      }
      warn(`Failed to delete ${toForwardSlash(artifact.relativePath)}: ${err.message}`)
      errorCount++
    }
  }

  // Clean up empty directories left behind
  if (!isDryRun()) {
    cleanEmptyDirs(sparqDir)
  }

  // Report results
  console.log()
  if (errorCount > 0) {
    warn(`Deleted ${deleted} artifact(s), ${errorCount} error(s).`)
  } else {
    ok(`Deleted ${deleted} artifact(s) (${formatSize(totalSize)}).`)
  }

  if (isDryRun()) {
    info('Dry run — no files were actually deleted.')
  }
}

// ---------------------------------------------------------------------------
// Command: clean
// ---------------------------------------------------------------------------

/**
 * Handle `--type lock`: remove the concurrency lock file when safe to do so.
 */
function handleLockTypeClean(targetDir) {
  const removed = forceReleaseLock(targetDir)
  if (removed) {
    ok('Lock file removed.')
  } else if (!existsSync(join(targetDir, '.sparq', '.lock'))) {
    info('No lock file found — nothing to remove.')
  } else {
    fail('Lock is held by a running SparQ process — cannot force-remove a live lock.')
    info('Wait for the process to finish, or terminate it first.')
  }
}

/**
 * Remove stale artifacts from .sparq/ output directories.
 */
export async function cmdClean(targetDir, options = {}) {
  const {
    all = false,
    olderThan = null,
    type = null,
    force = false,
    nonInteractive = false,
  } = options

  if (!validateTargetDir(targetDir)) return

  if (olderThan !== null && (!Number.isFinite(olderThan) || olderThan <= 0)) {
    fail(`--older-than must be a positive number (got ${options.olderThan ?? 'invalid'})`)
    return
  }

  // Validate type filter if provided
  if (type && !VALID_TYPES.includes(type)) {
    fail(`Unknown artifact type: "${type}". Valid types: ${VALID_TYPES.join(', ')}`)
    return
  }

  heading(`${emoji.clean}SparQ QA Assistant — Clean`)

  // Special case: --type lock removes the concurrency lock file when safe
  if (type === 'lock') {
    handleLockTypeClean(targetDir)
    return
  }

  const sparqDir = join(targetDir, '.sparq')
  if (!existsSync(sparqDir)) {
    info('No .sparq/ directory found — nothing to clean.')
    return
  }

  checkInterrupted()

  // When --all is used, include tracking registry (with explicit confirmation)
  const artifacts = scanArtifacts(sparqDir, {
    type,
    olderThan,
    includeTrackingRegistry: all,
  })

  if (artifacts.length === 0) {
    info('No artifacts match the specified criteria.')
    return
  }

  checkInterrupted()

  const totalSize = artifacts.reduce((sum, a) => sum + a.size, 0)
  displaySummary(artifacts, totalSize)

  const proceed = await confirmDeletion(force, nonInteractive, artifacts, totalSize)
  if (!proceed) return

  checkInterrupted()
  deleteArtifacts(artifacts, totalSize, sparqDir)
}

/**
 * Remove empty directories recursively (bottom-up), but never remove
 * .sparq/ itself or protected directories.
 */
function cleanEmptyDirs(dir, _depth = 0) {
  if (_depth > MAX_RECURSION_DEPTH) return
  let items
  try {
    items = readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }

  for (const item of items) {
    if (item.isDirectory() && !item.isSymbolicLink()) {
      const subDir = join(dir, item.name)

      // Skip protected directories
      if (PROTECTED_DIRS.includes(item.name)) continue

      cleanEmptyDirs(subDir, _depth + 1)

      // After cleaning children, check if directory is now empty
      try {
        rmdirSync(subDir)
      } catch {
        // Directory not actually empty — skip
      }
    }
  }
}
