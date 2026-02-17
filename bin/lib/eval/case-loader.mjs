// bin/lib/eval/case-loader.mjs — eval case parsing and discovery

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'

function extractScalar(raw, key) {
  const match = raw.match(new RegExp(`^${key}:\\s*"?([^"\\n]+)"?`, 'm'))
  return match?.[1]?.trim() ?? null
}

function extractStringList(raw, key) {
  const pattern = new RegExp(`^${key}:\\s*\\n((?:[ \\t]+- .+\\n?)+)`, 'm')
  const block = raw.match(pattern)
  if (!block) return []
  return [...block[1].matchAll(/- (.+)/g)].map((m) => m[1].trim().replace(/^"(.+)"$/, '$1'))
}

function extractExpectedOutputs(raw) {
  const outputs = []
  const outputBlocks = raw.split(/\n\s+- path:/)
  for (let idx = 1; idx < outputBlocks.length; idx++) {
    const block = `- path:${outputBlocks[idx]}`
    const path = block.match(/path:\s*"([^"]+)"/)?.[1]
    if (!path) continue
    const checks = extractChecks(block)
    outputs.push({ path, checks })
  }
  return outputs
}

function unescapeYamlDoubleQuoted(str) {
  return str.replace(/\\(.)/g, (_, ch) => {
    if (ch === 'n') return '\n'
    if (ch === 't') return '\t'
    return ch
  })
}

function isBoolOrNum(val) {
  if (val === 'true') return true
  if (val === 'false') return false
  if (/^\d+$/.test(val)) return Number(val)
  return val
}

function extractChecks(block) {
  const checks = []
  const checkLines = [
    ...block.matchAll(
      /- (has_section|has_pattern|no_pattern|min_count|min_test_count|has_severity_counts|has_tms_id):\s*(.+)/g,
    ),
  ]
  for (const [, key, val] of checkLines) {
    const trimmed = val.trim()
    const dqMatch = trimmed.match(/^"(.+)"$/)
    const sqMatch = trimmed.match(/^'(.+)'$/)
    const cleaned = dqMatch ? unescapeYamlDoubleQuoted(dqMatch[1]) : sqMatch ? sqMatch[1] : trimmed
    checks.push({ [key]: isBoolOrNum(cleaned) })
  }
  return checks
}

function extractFixtureMap(raw) {
  const fixturesBlock = raw.match(/^\s+fixtures:\s*\n((?:\s+\w+:.+\n?)*)/m)
  if (!fixturesBlock) return {}
  const fixtures = {}
  for (const [, key, val] of fixturesBlock[1].matchAll(/(\w+):\s*(.+)/g)) {
    const cleaned = val
      .trim()
      .replace(/^"(.+)"$/, '$1')
      .replace(/^'(.+)'$/, '$1')
    fixtures[key] = cleaned === 'null' ? null : cleaned
  }
  return fixtures
}

function extractMcpErrors(raw) {
  const errorsBlock = raw.match(/^\s+mcp_errors:\s*\n((?:\s+- .+\n(?:\s+\w+:.+\n?)*)*)/m)
  if (!errorsBlock) return []
  const errors = []
  const entries = errorsBlock[1].split(/\n\s+- source:/)
  for (let i = 0; i < entries.length; i++) {
    const entry = i === 0 ? entries[i] : `source:${entries[i]}`
    const source = entry.match(/source:\s*(\w+)/)?.[1]
    const error = entry.match(/error:\s*"?([^"\n]+)"?/)?.[1]
    const code = entry.match(/code:\s*(\d+)/)?.[1]
    if (source) {
      errors.push({ source, error: error ?? 'Unknown error', code: code ? Number(code) : 500 })
    }
  }
  return errors
}

function extractRefactorArgs(raw) {
  const from = raw.match(/rename_from:\s*"?([^"\n]+)"?/)?.[1]?.trim()
  const to = raw.match(/rename_to:\s*"?([^"\n]+)"?/)?.[1]?.trim()
  if (!from && !to) return null
  return { rename_from: from, rename_to: to }
}

function parseInput(raw) {
  return {
    type: extractScalar(raw, '  type') ?? extractScalar(raw, 'type'),
    identifier: extractScalar(raw, '  identifier') ?? extractScalar(raw, 'identifier'),
    fixtures: extractFixtureMap(raw),
    mcp_errors: extractMcpErrors(raw),
    mode: extractScalar(raw, '  mode'),
    refactor_args: extractRefactorArgs(raw),
  }
}

export function parseEvalCase(filePath) {
  const raw = readFileSync(filePath, 'utf-8')
  return {
    name: extractScalar(raw, 'name') ?? basename(filePath, '.yaml'),
    scenario: extractScalar(raw, 'scenario') ?? 'unknown',
    input: parseInput(raw),
    expected_outputs: extractExpectedOutputs(raw),
    rubrics: extractStringList(raw, 'rubrics'),
  }
}

export function listEvalCaseFiles(casesDir, options = {}) {
  const { all = false, caseName = null } = options
  if (all) {
    return readdirSync(casesDir)
      .filter((f) => f.endsWith('.yaml'))
      .sort()
      .map((f) => join(casesDir, f))
  }
  if (!caseName) return []
  const file = join(casesDir, `${caseName}.yaml`)
  return existsSync(file) ? [file] : []
}
