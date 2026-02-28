// Structured findings with severity levels for eval rubrics.
// Backward-compatible: rubrics can still return plain strings (normalized to 'warning').

export const SEVERITY = Object.freeze({
  critical: 'critical',
  warning: 'warning',
  info: 'info',
})

/**
 * Create a structured finding with severity.
 * @param {string} message - Human-readable finding description
 * @param {'critical'|'warning'|'info'} severity - Finding severity level
 * @returns {{ message: string, severity: string }}
 */
export function finding(message, severity = 'warning') {
  return { message, severity }
}

/**
 * Normalize a finding to structured format. Supports both legacy string findings
 * and already-structured findings.
 * @param {string|{ message: string, severity?: string }} f - Finding to normalize
 * @returns {{ message: string, severity: string }}
 */
export function normalizeFinding(f) {
  if (typeof f === 'string') return { message: f, severity: 'warning' }
  return { message: f.message, severity: f.severity ?? 'warning' }
}
