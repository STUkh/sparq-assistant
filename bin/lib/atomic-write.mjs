// bin/lib/atomic-write.mjs — Atomic file write utility (tmp + rename pattern)

import { copyFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'

/**
 * Write data to a file atomically using a tmp+rename pattern.
 * Falls back to copy+unlink on cross-device (EXDEV) errors.
 */
export function atomicWriteSync(filePath, data) {
  const tmpPath = `${filePath}.tmp`
  writeFileSync(tmpPath, data, 'utf-8')
  try {
    renameSync(tmpPath, filePath)
  } catch (err) {
    if (err.code === 'EXDEV') {
      copyFileSync(tmpPath, filePath)
      unlinkSync(tmpPath)
    } else {
      try {
        unlinkSync(tmpPath)
      } catch {} // ignore cleanup failure; preserve original error
      throw err
    }
  }
}
