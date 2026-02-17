// bin/lib/barrel.mjs — Barrel export utilities for index.ts management

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { toForwardSlash } from './files.mjs'
import { EXPORT_RE } from './merge.mjs'
import { dryRun, warn } from './state.mjs'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Convert a filename (without .ts extension) to a PascalCase export name.
 * Splits on dots, hyphens, and underscores, then PascalCases each segment.
 *
 * Examples:
 *   login.page.ts        -> LoginPage
 *   user-profile.page.ts -> UserProfilePage
 *   auth.fixture.ts      -> AuthFixture
 *   login.steps.ts       -> LoginSteps
 *   my_helper.util.ts    -> MyHelperUtil
 */
export function filenameToExportName(filename) {
  const withoutExt = filename.replace(/\.ts$/, '')
  return withoutExt
    .split(/[.\-_]/)
    .filter(Boolean)
    .map((seg) => seg.charAt(0).toUpperCase() + seg.slice(1).toLowerCase())
    .join('')
}

/**
 * Build an export line for a barrel index.
 *   LoginPage -> export { LoginPage } from './login.page'
 */
export function buildExportLine(exportName, fileBasename) {
  const importPath = `./${fileBasename.replace(/\.ts$/, '')}`
  return `export { ${exportName} } from '${importPath}'`
}

/**
 * Update or create a barrel export file (index.ts).
 * Reads the existing file (if any), appends export lines for new files,
 * deduplicates, and writes back. Only adds exports for .ts files that
 * are NOT .spec.ts files.
 *
 * Returns the list of newly added export names.
 */
export function updateBarrelExport(indexPath, newFiles) {
  const added = []

  // Filter to .ts files that are not spec files
  const exportable = newFiles.filter((f) => f.endsWith('.ts') && !f.endsWith('.spec.ts'))
  if (exportable.length === 0) return added

  // Read existing content
  let existingContent = ''
  if (existsSync(indexPath)) {
    try {
      existingContent = readFileSync(indexPath, 'utf-8')
    } catch (err) {
      warn(`Cannot read ${toForwardSlash(indexPath)}: ${err.message}`)
      existingContent = ''
    }
  }

  // Parse existing export names to avoid duplicates
  const existingExports = new Set()
  for (const line of existingContent.split('\n')) {
    const match = line.match(EXPORT_RE)
    if (match) existingExports.add(match[1])
  }

  // Build new export lines
  const newLines = []
  for (const file of exportable) {
    const exportName = filenameToExportName(file)
    if (existingExports.has(exportName)) {
      warn(`Barrel export collision: '${exportName}' already exists, skipping ${file}`)
      continue
    }
    newLines.push(buildExportLine(exportName, file))
    added.push(exportName)
  }

  if (newLines.length === 0) return added

  newLines.sort()

  // Assemble final content: existing (trimmed) + new lines + trailing newline
  const trimmed = existingContent.trimEnd()
  const combined = trimmed ? `${trimmed}\n${newLines.join('\n')}\n` : `${newLines.join('\n')}\n`

  dryRun(
    () => writeFileSync(indexPath, combined, 'utf-8'),
    `update barrel export ${toForwardSlash(indexPath)}`,
  )

  return added
}
