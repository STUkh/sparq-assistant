// bin/lib/validate.mjs — Input validation + config validation

import { existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { deepValidateConfig } from './schema.mjs'
import { fail, info, warn } from './state.mjs'

// ---------------------------------------------------------------------------
// Path Traversal Validation (#12)
// ---------------------------------------------------------------------------

/**
 * Validate that a target directory is safe for operations.
 */
export function validateTargetDir(targetDir) {
  if (!existsSync(targetDir)) {
    fail(`Target directory does not exist: ${targetDir}`)
    info('To fix: create the directory or check the path.')
    return false
  }
  try {
    const st = statSync(targetDir)
    if (!st.isDirectory()) {
      fail(`Target path is not a directory: ${targetDir}`)
      info('To fix: provide a directory path, not a file.')
      return false
    }
  } catch (err) {
    fail(`Cannot access target directory: ${err.message}`)
    info('To fix: check file permissions or run with appropriate access.')
    return false
  }
  if (!existsSync(join(targetDir, 'package.json')) && !existsSync(join(targetDir, '.git'))) {
    warn('Target directory does not appear to be a project root.')
  }
  return true
}

// ---------------------------------------------------------------------------
// Input Validation (#14, #15)
// ---------------------------------------------------------------------------

/**
 * Sanitize a project name: strip control chars, enforce max length, no path separators.
 */
export function sanitizeProjectName(name) {
  // Strip control characters
  // biome-ignore lint/suspicious/noControlCharactersInRegex: intentional control char sanitization
  let sanitized = name.replace(/[\x00-\x1F\x7F]/g, '')
  // Remove path separators
  sanitized = sanitized.replace(/[/\\]/g, '')
  // Enforce max length
  if (sanitized.length > 200) sanitized = sanitized.slice(0, 200)
  return sanitized
}

/**
 * Validate a Jira project key.
 */
export function isValidJiraKey(key) {
  return /^[A-Z][A-Z0-9_-]*$/.test(key)
}

/**
 * Validate a Confluence space key.
 */
export function isValidConfluenceKey(key) {
  return /^[A-Z][A-Z0-9_-]*$/.test(key)
}

/**
 * Validate a TestRail ID is a finite positive integer.
 */
export function parseTestRailId(raw) {
  if (!raw) return null
  const num = Number(raw)
  if (!Number.isFinite(num) || !Number.isInteger(num) || num <= 0) return null
  return num
}

/**
 * Validate a Qase project code.
 */
export function isValidQaseProjectCode(code) {
  return /^[A-Z][A-Z0-9_-]*$/.test(code)
}

// ---------------------------------------------------------------------------
// Config Schema Validation — delegates to deepValidateConfig (schema.mjs)
// ---------------------------------------------------------------------------

/**
 * Validate a sparq.config.json object against the full schema.
 * Delegates to deepValidateConfig() and flattens structured errors
 * to simple strings for backward compatibility.
 */
export function validateConfig(config) {
  const result = deepValidateConfig(config)
  const errors = result.errors.map((e) => `${e.path}: ${e.message}`)
  return { valid: errors.length === 0, errors }
}
