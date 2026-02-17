// bin/lib/eval/tune-catalog.mjs — deterministic finding-to-fix mapping catalog

import { join } from 'node:path'
import { PKG_ROOT } from '../constants.mjs'

function normalize(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function resolveSection(fix) {
  if (fix.section) return fix.section

  const lower = normalize(fix.text)
  if (lower.includes('req-')) return 'constants'
  if (lower.includes('tc-') || lower.includes('coverage matrix')) return 'done_criteria'
  if (lower.includes('handoff')) return 'handoff'
  if (lower.includes('progress')) return 'progress_signals'
  return 'rules'
}

function resolveAgentName(agent) {
  if (!agent) return null
  if (agent.startsWith('sparq-')) return agent.replace(/^sparq-/, '')
  return agent
}

function ensureBullet(text) {
  if (!text) return null
  return text.startsWith('- ') ? text : `- ${text}`
}

function lineForFix(fix) {
  const lower = normalize(fix.text)

  if (lower.includes('@playwright/test')) {
    return 'Never import directly from @playwright/test; use the project fixture index import pattern.'
  }
  if (lower.includes('req-')) {
    return 'Enforce REQ IDs: REQ-{feature}-{NNN} (example: REQ-login-001).'
  }
  if (lower.includes('tc-')) {
    return 'Enforce TC IDs: TC-{feature}-{HP|VE|SEC|EC|A11Y}-{NNN} and validate per section.'
  }
  if (lower.includes('coverage matrix')) {
    return 'Output must include a Coverage Matrix mapping every REQ ID to one or more TC IDs.'
  }
  if (lower.includes('handoff')) {
    return 'Handoff must include version, from, to, scenario, phase, status, and report counts/artifacts.'
  }
  if (lower.includes('progress')) {
    return 'Emit required [sparq] progress signals at phase start, major milestone, and completion.'
  }

  return (
    fix.suggestion ??
    'Add explicit constraints with concrete examples and measurable done criteria.'
  )
}

function operationForFix(fix) {
  const agent = resolveAgentName(fix.agent)
  if (!agent) return null

  const section = resolveSection(fix)
  const marker = `[sparq:auto:${fix.id}]`
  const lineText = lineForFix(fix)
  const line = ensureBullet(`${marker} ${lineText}`)

  return {
    fixId: fix.id,
    agent,
    file: join(PKG_ROOT, 'claude', 'agents', `sparq-${agent}.md`),
    section,
    marker,
    line,
    sourceText: fix.text,
    rubrics: fix.rubrics ?? [],
    expectedDelta: Math.max(1, fix.count ?? 1),
  }
}

export function buildTunePlan(reflection, options = {}) {
  const maxOps = Math.max(1, Number(options.maxOperations ?? 8) || 8)
  const rankedFixes = reflection?.rankedFixes ?? []

  const operations = []
  const seen = new Set()
  for (const fix of rankedFixes) {
    if (operations.length >= maxOps) break
    const op = operationForFix(fix)
    if (!op) continue

    const dedupeKey = `${op.file}::${op.section}::${op.marker}`
    if (seen.has(dedupeKey)) continue
    seen.add(dedupeKey)
    operations.push(op)
  }

  const byFile = new Map()
  for (const op of operations) {
    const list = byFile.get(op.file) ?? []
    list.push(op)
    byFile.set(op.file, list)
  }

  return {
    operations,
    files: [...byFile.keys()],
    byFile,
  }
}
