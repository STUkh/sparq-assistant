// bin/lib/eval/prompt-editor.mjs — safe idempotent prompt edits for tune operations

import { existsSync, readFileSync } from 'node:fs'
import { basename } from 'node:path'
import { atomicWriteSync } from '../commands/eval-reflect.mjs'
import { TUNE_BUDGET } from '../constants.mjs'

function normalizeSectionTag(section) {
  const cleaned = String(section ?? '')
    .trim()
    .replace(/[<>]/g, '')
  return cleaned || 'rules'
}

function hasRequiredSections(content) {
  return content.includes('<done_criteria>') && content.includes('<references>')
}

function lineCount(content) {
  return content.split('\n').length
}

export function insertIntoSection(content, tag, line, marker) {
  if (marker && content.includes(marker)) {
    return { content, changed: false, reason: 'already-applied' }
  }

  const openTag = `<${tag}>`
  const closeTag = `</${tag}>`
  const openIndex = content.indexOf(openTag)
  const closeIndex = content.indexOf(closeTag)

  if (openIndex < 0 || closeIndex < 0 || closeIndex < openIndex) {
    const appended = `${content.trimEnd()}\n\n<${tag}>\n${line}\n</${tag}>\n`
    return { content: appended, changed: true, reason: 'section-created' }
  }

  const before = content.slice(0, closeIndex).replace(/\s*$/, '')
  const after = content.slice(closeIndex)
  const updated = `${before}\n${line}\n${after}`
  return { content: updated, changed: true, reason: 'line-inserted' }
}

function applyOpsToContent(content, ops) {
  let updated = content
  const applied = []

  for (const op of ops) {
    const tag = normalizeSectionTag(op.section)
    const result = insertIntoSection(updated, tag, op.line, op.marker)
    updated = result.content
    if (result.changed) {
      applied.push({
        fixId: op.fixId,
        marker: op.marker,
        section: tag,
        reason: result.reason,
      })
    }
  }

  return { updated, applied }
}

export function validateEditedPrompt(content, options = {}) {
  const maxLines = Number(options.maxLines ?? TUNE_BUDGET.agentTotalMax)
  const lines = lineCount(content)

  if (!hasRequiredSections(content)) {
    return {
      valid: false,
      error: 'Required sections missing after edit (<done_criteria> and <references>)',
      lines,
    }
  }

  if (lines > maxLines) {
    return {
      valid: false,
      error: `Prompt exceeds line budget (${lines} > ${maxLines})`,
      lines,
    }
  }

  return { valid: true, lines }
}

export function applyTunePlan(plan, options = {}) {
  const tunedFiles = []
  const appliedFixIds = []
  const skipped = []

  for (const [file, ops] of plan.byFile.entries()) {
    if (!existsSync(file)) {
      skipped.push({ file, reason: 'missing-file' })
      continue
    }

    const original = readFileSync(file, 'utf-8')
    const { updated, applied } = applyOpsToContent(original, ops)
    if (applied.length === 0) {
      skipped.push({ file, reason: 'no-op' })
      continue
    }

    const validation = validateEditedPrompt(updated, options)
    if (!validation.valid) {
      throw new Error(`${basename(file)}: ${validation.error}`)
    }

    atomicWriteSync(file, updated)
    tunedFiles.push(file)
    for (const item of applied) appliedFixIds.push(item.fixId)
  }

  return {
    tunedFiles,
    tunedFileCount: tunedFiles.length,
    appliedFixIds: [...new Set(appliedFixIds)],
    skipped,
  }
}
