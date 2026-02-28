// test/unit/sarif.test.mjs — Unit tests for buildSarifReport

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildSarifReport } from '../../bin/lib/sarif.mjs'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeResult(filePath, rubricId, findings) {
  return { filePath, rubricId, findings }
}

// ---------------------------------------------------------------------------
// Schema & structure
// ---------------------------------------------------------------------------

describe('buildSarifReport — schema and structure', () => {
  it('should return an object with $schema and version fields', () => {
    const report = buildSarifReport([], '1.0.0')
    assert.equal(
      report.$schema,
      'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json',
    )
    assert.equal(report.version, '2.1.0')
  })

  it('should have version === "2.1.0"', () => {
    const report = buildSarifReport([], '1.0.0')
    assert.equal(report.version, '2.1.0')
  })

  it('should have runs array with exactly one run', () => {
    const report = buildSarifReport([], '1.0.0')
    assert.ok(Array.isArray(report.runs), 'runs should be an array')
    assert.equal(report.runs.length, 1, 'should have exactly one run')
  })

  it('should have tool.driver.name === "sparq-lint"', () => {
    const report = buildSarifReport([], '1.0.0')
    assert.equal(report.runs[0].tool.driver.name, 'sparq-lint')
  })

  it('should embed the provided toolVersion in driver.version', () => {
    const report = buildSarifReport([], '3.7.2')
    assert.equal(report.runs[0].tool.driver.version, '3.7.2')
  })

  it('should include an informationUri on the driver', () => {
    const report = buildSarifReport([], '1.0.0')
    assert.ok(
      typeof report.runs[0].tool.driver.informationUri === 'string',
      'informationUri should be a string',
    )
    assert.ok(
      report.runs[0].tool.driver.informationUri.startsWith('https://'),
      'informationUri should be an https URL',
    )
  })
})

// ---------------------------------------------------------------------------
// Empty results
// ---------------------------------------------------------------------------

describe('buildSarifReport — empty results', () => {
  it('should produce 0 SARIF results when given empty input', () => {
    const report = buildSarifReport([], '1.0.0')
    assert.equal(report.runs[0].results.length, 0)
  })

  it('should produce 0 rules when given empty input', () => {
    const report = buildSarifReport([], '1.0.0')
    assert.equal(report.runs[0].tool.driver.rules.length, 0)
  })
})

// ---------------------------------------------------------------------------
// Severity mapping
// ---------------------------------------------------------------------------

describe('buildSarifReport — severity mapping', () => {
  it('should map critical → error', () => {
    const results = [
      makeResult('src/login.spec.ts', 'flaky-test-detection', [
        { severity: 'critical', message: 'Uses page.waitForTimeout()' },
      ]),
    ]
    const report = buildSarifReport(results, '1.0.0')
    assert.equal(report.runs[0].results[0].level, 'error')
  })

  it('should map warning → warning', () => {
    const results = [
      makeResult('src/login.spec.ts', 'locator-quality', [
        { severity: 'warning', message: 'Prefer data-testid over XPath' },
      ]),
    ]
    const report = buildSarifReport(results, '1.0.0')
    assert.equal(report.runs[0].results[0].level, 'warning')
  })

  it('should map info → note', () => {
    const results = [
      makeResult('src/login.spec.ts', 'naming-conventions', [
        { severity: 'info', message: 'Consider prefixing spec files with feature name' },
      ]),
    ]
    const report = buildSarifReport(results, '1.0.0')
    assert.equal(report.runs[0].results[0].level, 'note')
  })
})

// ---------------------------------------------------------------------------
// ruleId format
// ---------------------------------------------------------------------------

describe('buildSarifReport — ruleId format', () => {
  it('should prefix rubricId with "rubric/" in ruleId', () => {
    const results = [
      makeResult('src/login.spec.ts', 'flaky-test-detection', [
        { severity: 'warning', message: 'Hard-coded sleep detected' },
      ]),
    ]
    const report = buildSarifReport(results, '1.0.0')
    assert.equal(report.runs[0].results[0].ruleId, 'rubric/flaky-test-detection')
  })
})

// ---------------------------------------------------------------------------
// Physical locations
// ---------------------------------------------------------------------------

describe('buildSarifReport — physical locations', () => {
  it('should set physicalLocation.artifactLocation.uri to the filePath', () => {
    const results = [
      makeResult('e2e/checkout.spec.ts', 'assertion-detection', [
        { severity: 'warning', message: 'Missing assertion' },
      ]),
    ]
    const report = buildSarifReport(results, '1.0.0')
    const loc = report.runs[0].results[0].locations[0].physicalLocation.artifactLocation.uri
    assert.equal(loc, 'e2e/checkout.spec.ts')
  })

  it('should produce correct uri for each file when multiple files are present', () => {
    const results = [
      makeResult('e2e/login.spec.ts', 'flaky-test-detection', [
        { severity: 'critical', message: 'Sleep detected' },
      ]),
      makeResult('e2e/checkout.spec.ts', 'assertion-detection', [
        { severity: 'warning', message: 'Missing assertion' },
      ]),
    ]
    const report = buildSarifReport(results, '1.0.0')
    const uris = report.runs[0].results.map(
      (r) => r.locations[0].physicalLocation.artifactLocation.uri,
    )
    assert.ok(uris.includes('e2e/login.spec.ts'), 'Should include login.spec.ts uri')
    assert.ok(uris.includes('e2e/checkout.spec.ts'), 'Should include checkout.spec.ts uri')
  })
})

// ---------------------------------------------------------------------------
// Rules deduplication
// ---------------------------------------------------------------------------

describe('buildSarifReport — rules deduplication', () => {
  it('should produce one rule for the same rubricId across two files', () => {
    const results = [
      makeResult('e2e/login.spec.ts', 'flaky-test-detection', [
        { severity: 'critical', message: 'Sleep detected' },
      ]),
      makeResult('e2e/checkout.spec.ts', 'flaky-test-detection', [
        { severity: 'warning', message: 'Retry logic missing' },
      ]),
    ]
    const report = buildSarifReport(results, '1.0.0')
    assert.equal(report.runs[0].tool.driver.rules.length, 1, 'Should have exactly one rule')
    assert.equal(report.runs[0].tool.driver.rules[0].id, 'rubric/flaky-test-detection')
  })

  it('should produce two results (one per file) for same rubric across two files', () => {
    const results = [
      makeResult('e2e/login.spec.ts', 'flaky-test-detection', [
        { severity: 'critical', message: 'Sleep detected' },
      ]),
      makeResult('e2e/checkout.spec.ts', 'flaky-test-detection', [
        { severity: 'warning', message: 'Retry logic missing' },
      ]),
    ]
    const report = buildSarifReport(results, '1.0.0')
    assert.equal(report.runs[0].results.length, 2, 'Should have two results')
  })

  it('should produce separate rules for different rubricIds', () => {
    const results = [
      makeResult('e2e/login.spec.ts', 'flaky-test-detection', [
        { severity: 'critical', message: 'Sleep detected' },
      ]),
      makeResult('e2e/login.spec.ts', 'locator-quality', [
        { severity: 'warning', message: 'Prefer data-testid' },
      ]),
    ]
    const report = buildSarifReport(results, '1.0.0')
    assert.equal(report.runs[0].tool.driver.rules.length, 2, 'Should have two distinct rules')
    const ruleIds = report.runs[0].tool.driver.rules.map((r) => r.id)
    assert.ok(ruleIds.includes('rubric/flaky-test-detection'))
    assert.ok(ruleIds.includes('rubric/locator-quality'))
  })
})

// ---------------------------------------------------------------------------
// Rule shape
// ---------------------------------------------------------------------------

describe('buildSarifReport — rule shape', () => {
  it('should produce rules with id, name, and shortDescription.text', () => {
    const results = [
      makeResult('e2e/login.spec.ts', 'flaky-test-detection', [
        { severity: 'warning', message: 'Issue found' },
      ]),
    ]
    const report = buildSarifReport(results, '1.0.0')
    const rule = report.runs[0].tool.driver.rules[0]
    assert.ok(typeof rule.id === 'string' && rule.id.length > 0, 'rule must have id')
    assert.ok(typeof rule.name === 'string' && rule.name.length > 0, 'rule must have name')
    assert.ok(
      typeof rule.shortDescription?.text === 'string',
      'rule must have shortDescription.text',
    )
  })

  it('should convert kebab-case rubricId to PascalCase rule name', () => {
    const results = [
      makeResult('e2e/login.spec.ts', 'flaky-test-detection', [
        { severity: 'warning', message: 'Issue found' },
      ]),
    ]
    const report = buildSarifReport(results, '1.0.0')
    assert.equal(report.runs[0].tool.driver.rules[0].name, 'FlakyTestDetection')
  })
})

// ---------------------------------------------------------------------------
// Multiple findings per file
// ---------------------------------------------------------------------------

describe('buildSarifReport — multiple findings per rubric entry', () => {
  it('should produce one SARIF result per finding (not per rubric entry)', () => {
    const results = [
      makeResult('e2e/login.spec.ts', 'flaky-test-detection', [
        { severity: 'critical', message: 'Sleep detected' },
        { severity: 'warning', message: 'Retry missing' },
        { severity: 'info', message: 'Consider flake retry' },
      ]),
    ]
    const report = buildSarifReport(results, '1.0.0')
    assert.equal(report.runs[0].results.length, 3)
  })
})

// ---------------------------------------------------------------------------
// Message text
// ---------------------------------------------------------------------------

describe('buildSarifReport — message text', () => {
  it('should embed finding message as message.text in SARIF result', () => {
    const results = [
      makeResult('e2e/login.spec.ts', 'flaky-test-detection', [
        { severity: 'warning', message: 'page.waitForTimeout() is a flaky pattern' },
      ]),
    ]
    const report = buildSarifReport(results, '1.0.0')
    assert.equal(report.runs[0].results[0].message.text, 'page.waitForTimeout() is a flaky pattern')
  })
})

// ---------------------------------------------------------------------------
// E2a — Path normalization
// ---------------------------------------------------------------------------

describe('buildSarifReport — path normalization', () => {
  it('passes filePath through as-is (callers responsible for forward-slash normalization)', () => {
    const results = [
      makeResult('e2e/login.spec.ts', 'flaky-test-detection', [
        { severity: 'warning', message: 'Issue found' },
      ]),
    ]
    const report = buildSarifReport(results, '1.0.0')
    const uri = report.runs[0].results[0].locations[0].physicalLocation.artifactLocation.uri
    assert.equal(uri, 'e2e/login.spec.ts', 'uri must equal the provided filePath exactly')
  })

  it('preserves backslashes in filePath when given Windows-style path (no normalization in sarif.mjs)', () => {
    const windowsPath = 'e2e\\checkout.spec.ts'
    const results = [
      makeResult(windowsPath, 'assertion-detection', [
        { severity: 'warning', message: 'Missing assertion' },
      ]),
    ]
    const report = buildSarifReport(results, '1.0.0')
    const uri = report.runs[0].results[0].locations[0].physicalLocation.artifactLocation.uri
    assert.equal(
      uri,
      windowsPath,
      'sarif.mjs passes filePath verbatim — caller must normalize Windows paths',
    )
  })
})

// ---------------------------------------------------------------------------
// E2b — String findings (plain string format)
// ---------------------------------------------------------------------------

describe('buildSarifReport — string findings (plain string format)', () => {
  it('assigns warning level to plain string findings', () => {
    const results = [
      makeResult('e2e/login.spec.ts', 'flaky-test-detection', ['Hard-coded sleep detected']),
    ]
    const report = buildSarifReport(results, '1.0.0')
    assert.equal(report.runs[0].results.length, 1, 'Should produce one SARIF result')
    assert.equal(
      report.runs[0].results[0].level,
      'warning',
      'Plain string defaults to warning level',
    )
    assert.equal(
      report.runs[0].results[0].message.text,
      'Hard-coded sleep detected',
      'Should embed the string as message.text',
    )
  })

  it('handles mixed string and object findings in the same rubric entry', () => {
    const results = [
      makeResult('e2e/login.spec.ts', 'flaky-test-detection', [
        'Hard-coded sleep detected',
        { severity: 'critical', message: 'Missing await on navigation' },
      ]),
    ]
    const report = buildSarifReport(results, '1.0.0')
    assert.equal(report.runs[0].results.length, 2, 'Should produce 2 SARIF results')
    const levels = report.runs[0].results.map((r) => r.level)
    assert.ok(levels.includes('warning'), 'String finding must become warning level')
    assert.ok(levels.includes('error'), 'Critical object finding must become error level')
  })
})

// ---------------------------------------------------------------------------
// E2c — Empty findings array
// ---------------------------------------------------------------------------

describe('buildSarifReport — empty findings array', () => {
  it('produces 0 SARIF results when findings array is empty', () => {
    const results = [makeResult('e2e/login.spec.ts', 'flaky-test-detection', [])]
    const report = buildSarifReport(results, '1.0.0')
    assert.equal(
      report.runs[0].results.length,
      0,
      'Empty findings array must produce 0 SARIF result entries',
    )
  })

  it('still registers a rule even when findings array is empty', () => {
    const results = [makeResult('e2e/login.spec.ts', 'flaky-test-detection', [])]
    const report = buildSarifReport(results, '1.0.0')
    assert.equal(
      report.runs[0].tool.driver.rules.length,
      1,
      'Rule must be registered even with empty findings',
    )
    assert.equal(report.runs[0].tool.driver.rules[0].id, 'rubric/flaky-test-detection')
  })
})

// ---------------------------------------------------------------------------
// E2d — Rule help text quality
//
// sarif.mjs sets shortDescription.text to `SparQ lint rubric: ${rubricId}`
// (e.g. "SparQ lint rubric: flaky-test-detection"). The text always contains
// the kebab-case rubricId verbatim, satisfying both non-empty and traceability
// requirements below.
// ---------------------------------------------------------------------------

describe('buildSarifReport — rule help text quality', () => {
  it('produces non-empty shortDescription.text for every rule', () => {
    const results = [
      makeResult('e2e/login.spec.ts', 'flaky-test-detection', [
        { severity: 'warning', message: 'Issue' },
      ]),
      makeResult('e2e/login.spec.ts', 'locator-quality', [{ severity: 'info', message: 'Note' }]),
    ]
    const report = buildSarifReport(results, '1.0.0')
    for (const rule of report.runs[0].tool.driver.rules) {
      assert.ok(
        typeof rule.shortDescription?.text === 'string' && rule.shortDescription.text.length > 0,
        `Rule ${rule.id} must have non-empty shortDescription.text`,
      )
    }
  })

  it('includes the rubricId fragment in shortDescription.text for traceability', () => {
    const results = [
      makeResult('e2e/login.spec.ts', 'flaky-test-detection', [
        { severity: 'warning', message: 'Issue' },
      ]),
    ]
    const report = buildSarifReport(results, '1.0.0')
    const rule = report.runs[0].tool.driver.rules[0]
    // shortDescription.text is "SparQ lint rubric: flaky-test-detection" —
    // the kebab-case rubricId appears verbatim; PascalCase form is in rule.name only.
    assert.ok(
      rule.shortDescription.text.includes('flaky-test-detection') ||
        rule.shortDescription.text.includes('FlakyTestDetection'),
      `shortDescription.text must reference the rubricId, got: "${rule.shortDescription.text}"`,
    )
  })
})
