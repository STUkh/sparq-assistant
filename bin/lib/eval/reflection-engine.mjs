// bin/lib/eval/reflection-engine.mjs — deterministic reflection generation from eval runs

import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { atomicWriteSync } from '../commands/eval-reflect.mjs'
import { PKG_ROOT } from '../constants.mjs'
import { getScenarioPipeline } from './metadata.mjs'

const DATA_DIR = join(PKG_ROOT, 'test', 'evals', 'data')
const REFLECTIONS_DIR = join(DATA_DIR, 'reflections')

function nowStamp(date = new Date()) {
  const p = (n, len = 2) => String(n).padStart(len, '0')
  return (
    `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}` +
    `-${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`
  )
}

function casePercentage(result) {
  if (typeof result.percentage === 'number') return result.percentage
  if (result.maxScore > 0) return Math.round((result.score / result.maxScore) * 100)
  return 0
}

function normalizeText(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function inferSectionFromFinding(text) {
  const lower = normalizeText(text)
  if (lower.includes('req-')) return 'constants'
  if (lower.includes('tc-') || lower.includes('coverage matrix')) return 'done_criteria'
  if (lower.includes('has_section')) return 'done_criteria'
  if (lower.includes('@playwright/test') || lower.includes('playwright')) return 'constants'
  if (lower.includes('handoff')) return 'handoff'
  if (lower.includes('progress')) return 'progress_signals'
  return 'rules'
}

function inferFixText(text) {
  const lower = normalizeText(text)
  if (lower.includes('req-')) {
    return 'Add explicit REQ ID format examples and enforcement in constants.'
  }
  if (lower.includes('tc-')) {
    return 'Add explicit TC ID format checks and examples in done criteria.'
  }
  if (lower.includes('@playwright/test') || lower.includes('playwright')) {
    return 'Add import convention constraints for Playwright fixture usage.'
  }
  if (lower.includes('handoff')) {
    return 'Tighten handoff schema checklist and required fields in handoff section.'
  }
  if (lower.includes('progress')) {
    return 'Add mandatory progress signal checkpoints with exact [sparq] markers.'
  }
  return 'Clarify rules with concrete examples and measurable done criteria.'
}

function selectAgentForFinding(result, finding) {
  const pipeline = getScenarioPipeline(result.scenario) ?? []
  if (pipeline.length === 0) return 'orchestrator'

  const lower = normalizeText(finding.text)
  if (result.scenario === 'S1') {
    if (lower.includes('tc-') || lower.includes('coverage matrix')) return 'manual-test-writer'
    return 'requirements-analyst'
  }
  if (result.scenario === 'S1+S2') {
    if (lower.includes('playwright') || lower.includes('spec') || lower.includes('assert')) {
      return 'automation-engineer'
    }
    if (lower.includes('tc-') || lower.includes('coverage matrix')) return 'manual-test-writer'
    return 'requirements-analyst'
  }

  // Most scenarios map cleanly to the final pipeline agent output quality.
  return pipeline[pipeline.length - 1].agent
}

function collectCaseFindings(result, passThreshold) {
  const findings = []

  if (result.status !== 'evaluated') {
    findings.push({
      rubric: 'status',
      text: `Case was not evaluated (${result.status})`,
      severity: 'high',
    })
    return findings
  }

  for (const rubricResult of result.rubricResults ?? []) {
    for (const finding of rubricResult.findings ?? []) {
      findings.push({ rubric: rubricResult.rubric, text: finding, severity: 'medium' })
    }
  }

  for (const skipped of result.skippedRubrics ?? []) {
    findings.push({
      rubric: skipped.rubric,
      text: `Rubric skipped (${skipped.reason ?? 'unknown'})`,
      severity: skipped.kind === 'model_required' ? 'high' : 'low',
    })
  }

  const pct = casePercentage(result)
  if (pct < passThreshold && findings.length === 0) {
    findings.push({
      rubric: 'threshold',
      text: `Case score below threshold (${pct}% < ${passThreshold}%)`,
      severity: 'high',
    })
  }

  return findings
}

function rankFixes(entries) {
  const grouped = new Map()

  for (const entry of entries) {
    const section = inferSectionFromFinding(entry.text)
    const key = `${entry.agent}::${section}::${normalizeText(entry.text)}`
    const current = grouped.get(key) ?? {
      id: null,
      agent: entry.agent,
      section,
      text: entry.text,
      suggestion: inferFixText(entry.text),
      count: 0,
      cases: new Set(),
      rubrics: new Set(),
    }
    current.count += 1
    current.cases.add(entry.caseName)
    current.rubrics.add(entry.rubric)
    grouped.set(key, current)
  }

  const ranked = [...grouped.values()]
    .map((item, idx) => ({
      id: `fix-${idx + 1}`,
      agent: item.agent,
      section: item.section,
      text: item.text,
      suggestion: item.suggestion,
      count: item.count,
      cases: [...item.cases],
      rubrics: [...item.rubrics],
    }))
    .sort((a, b) => b.count - a.count || a.agent.localeCompare(b.agent))

  return ranked.map((item, idx) => ({ ...item, id: `fix-${idx + 1}` }))
}

function buildReflectionMarkdown(data) {
  const lines = []
  lines.push(`# Eval Reflection — ${data.timestamp}`)
  lines.push('')
  lines.push('## Metadata')
  lines.push(`- Run: ${data.runFile ?? 'unknown'}`)
  lines.push(`- Model: ${data.modelKey}`)
  lines.push(`- Strict: ${data.strict ? 'true' : 'false'}`)
  lines.push(`- Cases: ${data.failingCases}/${data.totalCases} failing`)
  lines.push('')
  lines.push('## Summary')
  lines.push(`- Failing cases: ${data.failingCases}/${data.totalCases}`)
  lines.push(`- Findings extracted: ${data.findingCount}`)
  lines.push(`- Actionable fix groups: ${data.rankedFixes.length}`)
  lines.push('')
  lines.push('## Priority Fixes')

  if (data.rankedFixes.length === 0) {
    lines.push('1. **none** — no actionable findings detected')
  } else {
    data.rankedFixes.slice(0, 12).forEach((fix, index) => {
      lines.push(
        `${index + 1}. **${fix.agent}** <${fix.section}> — ${fix.suggestion} (affects ${fix.cases.length} case(s))`,
      )
    })
  }

  lines.push('')
  lines.push('## Per-Case Analysis')

  for (const section of data.perCase) {
    lines.push(`### ${section.caseName} (${section.percentage}%)`)
    if (section.findings.length === 0) {
      lines.push(
        '- No rubric findings captured; investigate generated outputs and policy failures.',
      )
      lines.push('')
      continue
    }

    for (const finding of section.findings) {
      lines.push(
        `- ${finding.rubric}: ${finding.text} -> ${finding.agent} <${finding.section}> — ${finding.suggestion}`,
      )
    }
    lines.push('')
  }

  return lines.join('\n')
}

export function buildReflectionFromRun(report, options = {}) {
  const { passThreshold = 75 } = options
  const rows = []
  const perCase = []

  for (const result of report.results ?? []) {
    const findings = collectCaseFindings(result, passThreshold)
    const percentage = casePercentage(result)
    const mappedFindings = findings.map((finding) => {
      const agent = selectAgentForFinding(result, finding)
      const section = inferSectionFromFinding(finding.text)
      return {
        ...finding,
        agent,
        section,
        suggestion: inferFixText(finding.text),
      }
    })

    perCase.push({
      caseName: result.caseName ?? result.caseFile ?? 'unknown-case',
      percentage,
      findings: mappedFindings,
    })

    for (const finding of mappedFindings) {
      rows.push({
        caseName: result.caseName ?? result.caseFile ?? 'unknown-case',
        percentage,
        ...finding,
      })
    }
  }

  const failingCases = perCase.filter(
    (item) => item.percentage < passThreshold || item.findings.length > 0,
  )
  const rankedFixes = rankFixes(rows)

  return {
    timestamp: nowStamp(),
    runFile: report.runFile ?? null,
    modelKey: report.modelKey ?? 'unknown',
    strict: report.policy?.strict ?? true,
    totalCases: report.results?.length ?? 0,
    failingCases: failingCases.length,
    findingCount: rows.length,
    perCase,
    rankedFixes,
  }
}

export function saveReflection(reflection, options = {}) {
  const dataDir = options.dataDir ?? DATA_DIR
  const reflectionsDir = join(dataDir, 'reflections')
  mkdirSync(reflectionsDir, { recursive: true })

  const filename = `${reflection.timestamp}.md`
  const path = join(reflectionsDir, filename)
  const content = buildReflectionMarkdown(reflection)
  atomicWriteSync(path, content)

  return { filename, path, content }
}

export function generateReflection(report, options = {}) {
  const reflection = buildReflectionFromRun(report, options)
  const persisted = saveReflection(reflection, options)
  return {
    ...reflection,
    reflectionFile: persisted.filename,
    reflectionPath: persisted.path,
    reflectionContent: persisted.content,
  }
}

export function getReflectionsDir() {
  return REFLECTIONS_DIR
}
