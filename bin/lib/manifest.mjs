// bin/lib/manifest.mjs — File manifest / checksums

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { AGENT_NAMES } from './constants.mjs'
import { collectFiles, ensureDir, hashFile, toForwardSlash } from './files.mjs'
import { dryRun } from './state.mjs'

// ---------------------------------------------------------------------------
// File Manifest (Checksums)
// ---------------------------------------------------------------------------

/**
 * Hash all files in a directory and add them to the manifest under a key prefix.
 */
function hashDirFiles(manifest, dir, prefix) {
  if (!existsSync(dir)) return
  const files = collectFiles(dir)
  for (const relPath of files) {
    const h = hashFile(join(dir, relPath))
    if (h) manifest[`${prefix}/${relPath}`] = h
  }
}

/**
 * Build a manifest of SHA-256 hashes for all installed files. (#8, #21 handle null hash, forward-slash keys)
 */
export function buildManifest(targetDir) {
  const manifest = {}
  const claudeDir = join(targetDir, '.claude')

  // Hash agents (uses AGENT_NAMES list, not directory scan)
  const agentsDir = join(claudeDir, 'agents')
  for (const name of AGENT_NAMES) {
    const filePath = join(agentsDir, name)
    if (existsSync(filePath)) {
      const h = hashFile(filePath)
      if (h) manifest[`.claude/agents/${name}`] = h
    }
  }

  // Hash skills and templates via directory scan
  hashDirFiles(manifest, join(claudeDir, 'skills'), '.claude/skills')
  hashDirFiles(manifest, join(claudeDir, 'templates'), '.claude/templates')

  return manifest
}

/**
 * Write the manifest file to .sparq/.manifest.json.
 */
export function writeManifest(targetDir, manifest) {
  const manifestPath = join(targetDir, '.sparq', '.manifest.json')
  dryRun(
    () => {
      ensureDir(join(targetDir, '.sparq'))
      writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf-8')
    },
    `write manifest to ${toForwardSlash(manifestPath)}`,
  )
}

/**
 * Read the existing manifest from .sparq/.manifest.json.
 * Returns file hash entries plus optional `mcpServersAdded: string[]`
 * (added by init/update to track which MCP servers SparQ installed).
 */
export function readManifest(targetDir) {
  const manifestPath = join(targetDir, '.sparq', '.manifest.json')
  if (!existsSync(manifestPath)) return null

  try {
    return JSON.parse(readFileSync(manifestPath, 'utf-8'))
  } catch {
    return null
  }
}

/**
 * Check which installed files have been modified by the user (hash mismatch with manifest). (#8 handle null hash)
 */
export function getModifiedFiles(targetDir, manifest) {
  const modified = []

  for (const [relPath, savedHash] of Object.entries(manifest)) {
    const absPath = join(targetDir, relPath)
    if (!existsSync(absPath)) continue

    const currentHash = hashFile(absPath)
    if (currentHash === null || currentHash !== savedHash) {
      modified.push(relPath)
    }
  }

  return modified
}
