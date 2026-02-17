// bin/lib/backup.mjs — Backup / restore

import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { MAX_RECURSION_DEPTH } from './constants.mjs'
import { toForwardSlash } from './files.mjs'
import { fail, getVerbosity, info, ok, warn } from './state.mjs'

/**
 * Back up installed files to a backup directory for rollback support. (#11 per-file try/catch)
 */
export function createBackup(targetDir, backupDir) {
  const claudeDir = join(targetDir, '.claude')
  if (!existsSync(claudeDir)) return false

  try {
    if (existsSync(backupDir)) {
      rmSync(backupDir, { recursive: true, force: true })
    }
    mkdirSync(backupDir, { recursive: true })

    const dirsToBackup = [
      [join(claudeDir, 'agents'), join(backupDir, 'agents')],
      [join(claudeDir, 'skills'), join(backupDir, 'skills')],
      [join(claudeDir, 'templates'), join(backupDir, 'templates')],
    ]

    for (const [src, dest] of dirsToBackup) {
      if (existsSync(src)) {
        copyDirForBackup(src, dest)
      }
    }

    return true
  } catch (err) {
    warn(`Could not create backup: ${err.message}`)
    return false
  }
}

/**
 * Copy a single file entry for backup, returning 1 on failure, 0 on success.
 */
function copyBackupEntry(srcPath, destPath) {
  try {
    copyFileSync(srcPath, destPath)
    return 0
  } catch (err) {
    if (getVerbosity() === 'verbose') info(`[debug] backup copy failed: ${err.message}`)
    return 1
  }
}

/**
 * Simple recursive directory copy for backup purposes. (#11 per-file error handling, #10 depth+symlink)
 */
export function copyDirForBackup(srcDir, destDir, _depth = 0) {
  if (_depth > MAX_RECURSION_DEPTH) {
    warn(`Maximum recursion depth exceeded during backup at ${toForwardSlash(srcDir)}`)
    return
  }

  mkdirSync(destDir, { recursive: true })

  let entries
  try {
    entries = readdirSync(srcDir, { withFileTypes: true })
  } catch (err) {
    warn(`Cannot read ${toForwardSlash(srcDir)} for backup: ${err.message}`)
    return
  }

  let failures = 0

  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue

    const srcPath = join(srcDir, entry.name)
    const destPath = join(destDir, entry.name)

    if (entry.isDirectory()) {
      copyDirForBackup(srcPath, destPath, _depth + 1)
    } else if (entry.isFile()) {
      failures += copyBackupEntry(srcPath, destPath)
    }
  }

  if (failures > 0) {
    warn(`Backup: ${failures} file(s) failed to copy from ${toForwardSlash(srcDir)}`)
  }
}

/**
 * Restore files from backup directory after a failed update.
 */
export function restoreBackup(targetDir, backupDir) {
  if (!existsSync(backupDir)) return

  const claudeDir = join(targetDir, '.claude')

  try {
    const dirsToRestore = [
      [join(backupDir, 'agents'), join(claudeDir, 'agents')],
      [join(backupDir, 'skills'), join(claudeDir, 'skills')],
      [join(backupDir, 'templates'), join(claudeDir, 'templates')],
    ]

    for (const [src, dest] of dirsToRestore) {
      if (existsSync(src)) {
        copyDirForBackup(src, dest)
      }
    }

    ok('Files restored from backup')
  } catch (err) {
    fail(`Restore from backup failed: ${err.message}`)
    info(`Manual backup is available at: ${toForwardSlash(backupDir)}`)
  }
}

/**
 * Remove the backup directory after a successful update.
 */
export function cleanupBackup(backupDir) {
  try {
    if (existsSync(backupDir)) {
      rmSync(backupDir, { recursive: true, force: true })
    }
  } catch (err) {
    if (getVerbosity() === 'verbose') info(`[debug] cleanup backup: ${err.message}`)
  }
}
