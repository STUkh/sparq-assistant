// bin/lib/commands/audit.mjs — Audit command handler

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  auditPromptMaturity,
  formatAuditReport,
  generatePromptFiles,
  updateRuleFileReferences,
} from '../audit.mjs'
import { emoji, fail, heading, info, ok, style } from '../state.mjs'

function loadConfig(targetDir) {
  const configPath = join(targetDir, 'sparq.config.json')
  if (!existsSync(configPath)) return null
  try {
    return JSON.parse(readFileSync(configPath, 'utf-8'))
  } catch {
    return null
  }
}

function passesGate(level, strict) {
  return strict ? level >= 3 : true
}

export async function cmdAudit(targetDir, { fix = false, json = false, strict = false } = {}) {
  const result = auditPromptMaturity(targetDir)

  if (result.targetDirMissing) {
    fail(`Target directory does not exist: ${targetDir}`)
    return false
  }

  if (json) {
    console.log(JSON.stringify(result, null, 2))
    return passesGate(result.level, strict)
  }

  formatAuditReport(result)

  if (!fix) return passesGate(result.level, strict)

  if (result.level >= 4) {
    ok('Prompt architecture is production-ready — no supplementary prompts needed.')
    return true
  }

  heading(`${emoji.audit}Generating supplementary prompts`)

  const config = loadConfig(targetDir)
  if (!config) {
    info('No sparq.config.json found — using defaults for prompt generation.')
  }

  const generated = generatePromptFiles(targetDir, result, config)

  if (generated.length === 0) {
    info('No additional prompts needed for current gaps.')
    return passesGate(result.level, strict)
  }

  updateRuleFileReferences(targetDir, generated)

  console.log('')
  ok(`Generated ${generated.length} supplementary prompt(s) in .sparq/prompts/`)
  console.log(
    `  ${style.dim('These prompts guide your AI coding assistant on testing architecture.')}`,
  )
  console.log(`  ${style.dim('Re-run audit to verify improved maturity level.')}`)
  console.log('')

  // Show post-fix recommendation
  const postResult = auditPromptMaturity(targetDir)
  if (postResult.level > result.level) {
    ok(
      `Maturity improved: ${result.levelName} (${result.level}) → ${postResult.levelName} (${postResult.level})`,
    )
  }
  return passesGate(postResult.level, strict)
}
