// bin/lib/lock.mjs — Exclusive concurrency lock for write operations

import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const LOCK_FILE_NAME = '.lock'
const LOCK_TIMEOUT_MS = 10 * 60 * 1000 // 10 minutes

/**
 * Check whether a process with the given PID is still running.
 */
function isPidAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

/**
 * Try to read and parse the lock file. Removes it if corrupt.
 * Returns the parsed data on success, null otherwise.
 */
function readLockData(lockPath) {
  try {
    return JSON.parse(readFileSync(lockPath, 'utf-8'))
  } catch {
    try {
      unlinkSync(lockPath)
    } catch {
      /* ignore */
    }
    return null
  }
}

/**
 * Remove the lock file, ignoring errors.
 */
function tryUnlink(lockPath) {
  try {
    unlinkSync(lockPath)
  } catch {
    /* ignore */
  }
}

/**
 * Acquire the .sparq/.lock file for the current process.
 * Creates .sparq/ if it does not exist.
 *
 * Returns { acquired: true } on success.
 * Returns { acquired: false, pid, ageMs } if another live process holds the lock.
 */
export function acquireLock(targetDir) {
  const sparqDir = join(targetDir, '.sparq')
  const lockPath = join(sparqDir, LOCK_FILE_NAME)

  if (!existsSync(sparqDir)) {
    try {
      mkdirSync(sparqDir, { recursive: true })
    } catch {
      // Cannot create .sparq/ — skip locking; the command will fail on its own
      return { acquired: true }
    }
  }

  if (existsSync(lockPath)) {
    const lockData = readLockData(lockPath)
    if (lockData) {
      const ageMs = Date.now() - new Date(lockData.acquired).getTime()
      if (isPidAlive(lockData.pid) && ageMs < LOCK_TIMEOUT_MS) {
        return { acquired: false, pid: lockData.pid, ageMs }
      }
      tryUnlink(lockPath)
    }
  }

  try {
    writeFileSync(
      lockPath,
      JSON.stringify({ pid: process.pid, acquired: new Date().toISOString() }),
      'utf-8',
    )
    return { acquired: true }
  } catch {
    // Cannot write lock — proceed without it rather than blocking the user
    return { acquired: true }
  }
}

/**
 * Release the lock if it is owned by the current process.
 * Safe to call even if .sparq/ was removed (e.g. after uninstall).
 */
export function releaseLock(targetDir) {
  const lockPath = join(targetDir, '.sparq', LOCK_FILE_NAME)
  if (!existsSync(lockPath)) return
  try {
    const lockData = JSON.parse(readFileSync(lockPath, 'utf-8'))
    if (lockData.pid === process.pid) {
      unlinkSync(lockPath)
    }
  } catch {
    tryUnlink(lockPath)
  }
}

/**
 * Force-remove the lock regardless of owner.
 * Used by `sparq clean --type lock`.
 *
 * Only removes the lock when the owning process is confirmed dead.
 * If the lock is held by a live process this function returns false and
 * leaves the lock untouched — the caller must tell the user to wait.
 *
 * Returns true if the lock was removed, false otherwise.
 */
export function forceReleaseLock(targetDir) {
  const lockPath = join(targetDir, '.sparq', LOCK_FILE_NAME)
  if (!existsSync(lockPath)) return false

  try {
    const lockData = JSON.parse(readFileSync(lockPath, 'utf-8'))
    // Refuse to force-release a lock held by a live process
    if (lockData?.pid && isPidAlive(lockData.pid)) {
      return false
    }
  } catch {
    // Corrupt or unreadable lock — safe to remove
  }

  try {
    unlinkSync(lockPath)
    return true
  } catch {
    return false
  }
}
