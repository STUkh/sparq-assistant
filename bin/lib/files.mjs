// bin/lib/files.mjs — FS utilities + prompts

import { createHash } from 'node:crypto'
import {
  copyFileSync,
  existsSync,
  globSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
} from 'node:fs'
import { join, relative } from 'node:path'
import { MAX_RECURSION_DEPTH } from './constants.mjs'
import { dryRun, fail, style, warn } from './state.mjs'

// ---------------------------------------------------------------------------
// Utility Functions
// ---------------------------------------------------------------------------

/**
 * Normalize a path to use forward slashes (for cross-platform consistency). (#21, #22)
 */
export function toForwardSlash(p) {
  return p.replace(/\\/g, '/')
}

/**
 * Recursively copy a directory tree.
 * When `merge` is true, existing files are skipped.
 * When `merge` is false, existing files are overwritten.
 * Returns { copied: string[], skipped: string[], errors: string[] } relative to destDir.
 * (#10) maxDepth limits recursion, symlinks are skipped.
 */
/**
 * Copy a single file entry, respecting merge mode.
 */
function copyFileEntry(srcPath, destPath, relPath, merge, copied, skipped, errors) {
  if (merge && existsSync(destPath)) {
    skipped.push(relPath)
    return
  }
  try {
    dryRun(
      () => copyFileSync(srcPath, destPath),
      `copy ${toForwardSlash(srcPath)} -> ${toForwardSlash(destPath)}`,
    )
    copied.push(relPath)
  } catch (err) {
    errors.push(`Failed to copy ${relPath}: ${err.message}`)
  }
}

export function copyDirRecursive(srcDir, destDir, { merge = true, exclude, _depth = 0 } = {}) {
  const copied = []
  const skipped = []
  const errors = []

  if (_depth > MAX_RECURSION_DEPTH) {
    errors.push(`Maximum recursion depth (${MAX_RECURSION_DEPTH}) exceeded at ${srcDir}`)
    return { copied, skipped, errors }
  }

  if (!existsSync(srcDir)) return { copied, skipped, errors }

  try {
    dryRun(
      () => mkdirSync(destDir, { recursive: true }),
      `create directory ${toForwardSlash(destDir)}`,
    )
  } catch (err) {
    errors.push(`Failed to create directory ${toForwardSlash(destDir)}: ${err.message}`)
    return { copied, skipped, errors }
  }

  let entries
  try {
    entries = readdirSync(srcDir, { withFileTypes: true })
  } catch (err) {
    errors.push(`Failed to read directory ${toForwardSlash(srcDir)}: ${err.message}`)
    return { copied, skipped, errors }
  }

  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue
    if (_depth === 0 && exclude?.has(entry.name)) continue

    const srcPath = join(srcDir, entry.name)
    const destPath = join(destDir, entry.name)

    if (entry.isDirectory()) {
      const sub = copyDirRecursive(srcPath, destPath, { merge, _depth: _depth + 1 })
      copied.push(...sub.copied)
      skipped.push(...sub.skipped)
      errors.push(...sub.errors)
    } else if (entry.isFile()) {
      copyFileEntry(
        srcPath,
        destPath,
        toForwardSlash(relative(destDir, destPath)),
        merge,
        copied,
        skipped,
        errors,
      )
    }
  }

  return { copied, skipped, errors }
}

/**
 * Prompt the user for input via readline.
 */
export function prompt(rl, question, defaultValue) {
  const suffix =
    defaultValue !== undefined && defaultValue !== '' ? ` ${style.dim(`(${defaultValue})`)}` : ''
  return new Promise((resolve) => {
    rl.question(`  ${question}${suffix}: `, (answer) => {
      resolve(answer.trim() || (defaultValue !== undefined ? String(defaultValue) : ''))
    })
  })
}

/**
 * Ask a yes/no question. Returns boolean. (#7 fix duplicate condition)
 */
export async function confirm(rl, question, defaultYes = true) {
  const hint = defaultYes ? 'Y/n' : 'y/N'
  const answer = await prompt(rl, question, hint)
  const lower = answer.toLowerCase()

  // If the user just pressed Enter, the answer will be the hint itself or empty
  if (lower === '' || lower === hint.toLowerCase()) return defaultYes

  return lower === 'y' || lower === 'yes'
}

/**
 * Check Node.js version meets minimum requirement.
 */
export function checkNodeVersion(minMajor = 22) {
  const major = parseInt(process.versions.node.split('.')[0], 10)
  return major >= minMajor
}

/**
 * Ensure a directory exists. Returns true if successful, false otherwise. (#19 remove TOCTOU)
 */
export function ensureDir(dir) {
  try {
    dryRun(() => mkdirSync(dir, { recursive: true }), `create directory ${toForwardSlash(dir)}`)
    return true
  } catch (err) {
    fail(`Cannot create directory ${toForwardSlash(dir)}: ${err.message}`)
    return false
  }
}

/**
 * List files in a directory filtered by extension (non-recursive).
 */
export function listFiles(dir, ext) {
  if (!existsSync(dir)) return []
  try {
    return readdirSync(dir).filter((f) => (ext ? f.endsWith(ext) : true))
  } catch {
    return []
  }
}

/**
 * List subdirectory names in a directory.
 */
export function listDirs(dir) {
  if (!existsSync(dir)) return []
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
  } catch {
    return []
  }
}

/**
 * Compute SHA-256 hash of a file's contents. (#8 error handling)
 */
export function hashFile(filePath) {
  try {
    const content = readFileSync(filePath)
    return createHash('sha256').update(content).digest('hex')
  } catch {
    return null
  }
}

/**
 * Recursively collect all file paths relative to a directory.
 * Uses fs.globSync to replace manual recursion. Skips symlinks.
 */
export function collectFiles(dir) {
  if (!existsSync(dir)) return []
  try {
    return globSync('**/*', { cwd: dir })
      .filter((rel) => {
        const abs = join(dir, rel)
        const stat = lstatSync(abs)
        return stat.isFile() && !stat.isSymbolicLink()
      })
      .map(toForwardSlash)
  } catch (err) {
    warn(`Cannot scan directory ${toForwardSlash(dir)}: ${err.message}`)
    return []
  }
}
