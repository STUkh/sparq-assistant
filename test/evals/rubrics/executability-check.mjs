/**
 * Executability check rubric — validates generated test code is structurally runnable.
 * GAP 1.2 fix: catches code that looks right but cannot compile or execute.
 * Checks: import consistency, async/await usage, test nesting, page object instantiation.
 */

function isTestCode(content) {
  return (
    content.includes('test.describe') || content.includes("test('") || content.includes('test("')
  )
}

function checkImportConsistency(content) {
  const imports = [...content.matchAll(/import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/g)]
  if (imports.length === 0) return { pass: true }

  const findings = []
  for (const [, names, path] of imports) {
    // Flag bare package imports that should be relative
    if (path === '@playwright/test') {
      findings.push(`Import from '@playwright/test' should use project fixture index`)
    }
    // Flag imports from non-existent looking paths (absolute paths without node: prefix)
    if (path.startsWith('/') && !path.startsWith('/Users')) {
      findings.push(`Suspicious absolute import path: ${path}`)
    }
    // Check for duplicate imports from same source
    const importNames = names.split(',').map((n) => n.trim())
    const dupes = importNames.filter((n, i) => importNames.indexOf(n) !== i)
    if (dupes.length > 0) {
      findings.push(`Duplicate imports from '${path}': ${dupes.join(', ')}`)
    }
  }

  return { pass: findings.length === 0, findings }
}

function findNonAsyncTestCallbacks(content) {
  const findings = []
  const testBlocks = content.split(/test\s*\(\s*['"`]/)
  for (let i = 1; i < testBlocks.length; i++) {
    const block = testBlocks[i]
    if (block.includes('async')) continue
    if (/\.(click|fill|goto|navigate|type|press)\s*\(/.test(block)) {
      const name = block.match(/^([^'"`]+)/)?.[1] ?? `test #${i}`
      findings.push(`Test '${name}' uses async operations but callback is not async`)
    }
  }
  return findings
}

function checkAsyncAwait(content) {
  const findings = findNonAsyncTestCallbacks(content)
  return { pass: findings.length === 0, findings }
}

function checkTestNesting(content) {
  const describes = (content.match(/test\.describe\s*\(/g) || []).length
  const tests = (content.match(/test\s*\(\s*['"`]/g) || []).length
  if (tests === 0) return { pass: false, findings: ['No test() blocks found in spec file'] }
  if (describes === 0 && tests > 0) {
    return { pass: false, findings: ['Tests not wrapped in test.describe() block'] }
  }
  return { pass: true }
}

function checkPageObjectUsage(content) {
  const findings = []
  // Check for page object instantiation without page parameter
  const badInstantiation = content.match(/new \w+Page\(\s*\)/g)
  if (badInstantiation) {
    findings.push(`Page object instantiated without page parameter: ${badInstantiation[0]}`)
  }

  // Check for direct page.locator when page objects should be used
  const directLocators = (content.match(/page\.locator\s*\(/g) || []).length
  const pageObjects = (content.match(/new \w+Page\s*\(/g) || []).length
  if (directLocators > 5 && pageObjects === 0) {
    findings.push(`${directLocators} direct page.locator() calls — consider using page objects`)
  }

  return { pass: findings.length === 0, findings }
}

export function evaluate(content, _checks = [], _options = {}) {
  if (!isTestCode(content)) {
    return { score: 0, maxScore: 0, findings: [], skipped: true }
  }

  const findings = []
  let score = 0

  const importResult = checkImportConsistency(content)
  if (importResult.pass) {
    score++
  } else {
    findings.push(...importResult.findings)
  }

  const asyncResult = checkAsyncAwait(content)
  if (asyncResult.pass) {
    score++
  } else {
    findings.push(...asyncResult.findings)
  }

  const nestingResult = checkTestNesting(content)
  if (nestingResult.pass) {
    score++
  } else {
    findings.push(...nestingResult.findings)
  }

  const poResult = checkPageObjectUsage(content)
  if (poResult.pass) {
    score++
  } else {
    findings.push(...poResult.findings)
  }

  return { score, maxScore: 4, findings }
}
