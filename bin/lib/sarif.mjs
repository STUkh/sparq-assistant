// bin/lib/sarif.mjs — Pure SARIF 2.1.0 report builder (zero I/O)

// ---------------------------------------------------------------------------
// Severity mapping
// ---------------------------------------------------------------------------

const SEVERITY_MAP = Object.freeze({
  critical: 'error',
  warning: 'warning',
  info: 'note',
})

// ---------------------------------------------------------------------------
// Rule derivation
// ---------------------------------------------------------------------------

/**
 * Derive unique SARIF rules from results.
 * @param {Array<{rubricId: string}>} results
 * @returns {Array<{id: string, name: string, shortDescription: {text: string}}>}
 */
function deriveRules(results) {
  const seen = new Set()
  const rules = []

  for (const { rubricId } of results) {
    const ruleId = `rubric/${rubricId}`
    if (seen.has(ruleId)) continue
    seen.add(ruleId)

    // Convert kebab-case rubric id to PascalCase name (e.g. flaky-test-detection → FlakyTestDetection)
    const name = rubricId
      .split('-')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join('')

    rules.push({
      id: ruleId,
      name,
      shortDescription: { text: `SparQ lint rubric: ${rubricId}` },
    })
  }

  return rules
}

// ---------------------------------------------------------------------------
// Result conversion
// ---------------------------------------------------------------------------

/**
 * Convert a flat list of per-file, per-rubric findings into SARIF result objects.
 * @param {Array<{filePath: string, rubricId: string, findings: Array<{severity: string, message: string}>}>} results
 * @returns {Array<object>}
 */
function convertResults(results) {
  const sarifResults = []

  for (const { filePath, rubricId, findings } of results) {
    const ruleId = `rubric/${rubricId}`
    for (const finding of findings) {
      const severity = typeof finding === 'string' ? 'warning' : (finding.severity ?? 'warning')
      const message = typeof finding === 'string' ? finding : finding.message
      sarifResults.push({
        ruleId,
        level: SEVERITY_MAP[severity] ?? 'warning',
        message: { text: message },
        locations: [
          {
            physicalLocation: {
              artifactLocation: {
                uri: filePath,
              },
            },
          },
        ],
      })
    }
  }

  return sarifResults
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build a SARIF 2.1.0 report object from lint results.
 * Pure function — zero I/O. All file writes must happen in the caller.
 *
 * @param {Array<{filePath: string, rubricId: string, findings: Array<{severity: string, message: string}>}>} results
 *   Each element represents one rubric run against one file.
 * @param {string} toolVersion - The version string to embed in the SARIF tool driver.
 * @returns {object} SARIF 2.1.0 JSON object
 */
export function buildSarifReport(results, toolVersion) {
  const rules = deriveRules(results)
  const sarifResults = convertResults(results)

  return {
    $schema:
      'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json',
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: 'sparq-lint',
            version: toolVersion,
            informationUri: 'https://github.com/STUkh/sparq-assistant',
            rules,
          },
        },
        results: sarifResults,
      },
    ],
  }
}
