// bin/lib/commands/tune.mjs — CLI tune command for model tier optimization

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { MODEL_TIER_MAP, TUNE_BUDGET } from '../constants.mjs'
import { confirm, toForwardSlash } from '../files.mjs'
import { dryRun, emoji, fail, info, isDryRun, ok, style, warn } from '../state.mjs'
import {
  applyLayerOne,
  checkBudget,
  detectCurrentTier,
  getTuneStatus,
  revertToDefault,
  updateAgentModels,
} from '../tune-engine.mjs'

// ---------------------------------------------------------------------------
// Config Update
// ---------------------------------------------------------------------------

function updateConfigTier(targetDir, tier) {
  const configPath = join(targetDir, 'sparq.config.json')
  if (!existsSync(configPath)) {
    warn('sparq.config.json not found — cannot update model tier')
    return false
  }

  let config
  try {
    config = JSON.parse(readFileSync(configPath, 'utf-8'))
  } catch {
    warn('sparq.config.json is not valid JSON — cannot update model tier')
    return false
  }
  if (!config || typeof config !== 'object') {
    warn('sparq.config.json has invalid structure — cannot update model tier')
    return false
  }
  if (!config.preferences) config.preferences = {}
  config.preferences.modelTier = tier

  dryRun(
    () => writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf-8'),
    `update preferences.modelTier to "${tier}" in ${toForwardSlash(configPath)}`,
  )

  return true
}

// ---------------------------------------------------------------------------
// Subcommands
// ---------------------------------------------------------------------------

function reportBudgetWarnings(targetDir) {
  const budgets = checkBudget(targetDir)
  const tight = budgets.filter((b) => !b.canFitLayerOne)
  if (tight.length === 0) return

  warn('Some agents lack headroom for Layer 1 enhancements:')
  for (const b of tight) {
    warn(`  ${b.agent}: ${b.lines} lines (${b.headroom} headroom, need ${TUNE_BUDGET.layerOneMax})`)
  }
  info('Consider running /sparq:optimize on those agents first')
}

function applyLayerOneAndModels(targetDir, tier) {
  info('Applying Layer 1 pre-authored enhancements...')
  const results = applyLayerOne(targetDir, tier)
  for (const r of results) {
    if (r.status === 'applied') {
      ok(`  ${r.agent}: +${r.linesAdded} lines (${r.totalLines} total)`)
    } else if (r.status === 'error') {
      warn(`  ${r.agent}: ${r.reason}`)
    }
  }

  info('Updating agent model fields...')
  const modelResults = updateAgentModels(targetDir, tier)
  for (const r of modelResults) {
    if (r.changed) ok(`  ${r.agent}: ${r.from} → ${r.model}`)
  }
}

async function cmdTuneApply(targetDir, tier, { force, nonInteractive } = {}) {
  if (!MODEL_TIER_MAP[tier]) {
    fail(`Unknown tier: "${tier}". Must be one of: premium, balanced, economy`)
    process.exit(2)
  }

  const currentTier = detectCurrentTier(targetDir)
  if (currentTier === tier) {
    info(`Already on "${tier}" tier. Nothing to change.`)
    return
  }

  console.log(`\n  ${style.boldCyan(`${emoji.tune || emoji.config}Model Tier Optimization`)}\n`)
  info(`Switching from "${currentTier}" to "${tier}" tier`)

  reportBudgetWarnings(targetDir)

  if (!force && !nonInteractive && !isDryRun()) {
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    const proceed = await confirm(rl, 'This will modify all agent files. Continue?', true)
    rl.close()
    if (!proceed) {
      info('Tune cancelled.')
      return
    }
  }

  if (currentTier !== 'premium') {
    info('Removing previous tier enhancements...')
    revertToDefault(targetDir)
  }

  if (tier !== 'premium') {
    applyLayerOneAndModels(targetDir, tier)
  }

  const configUpdated = updateConfigTier(targetDir, tier)
  if (configUpdated) {
    ok(`preferences.modelTier set to "${tier}"`)
  } else {
    warn('Tier enhancements applied but not persisted — sparq.config.json not found')
    info('Run `npx sparq-assistant init` to create config')
  }

  console.log('')
  if (tier !== 'premium') {
    info('Layer 1 (pre-authored) applied. For AI-powered model guidance (Layer 2):')
    info(`  Run ${style.cyan('/sparq:tune')} in Claude Code`)
  }
  ok(`Tier "${tier}" configured`)
}

async function cmdTuneRevert(targetDir, { force, nonInteractive } = {}) {
  const currentTier = detectCurrentTier(targetDir)
  if (currentTier === 'premium') {
    info('Already on "premium" tier. Nothing to revert.')
    return
  }

  info(`Current tier: "${currentTier}"`)

  if (!force && !nonInteractive && !isDryRun()) {
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    const proceed = await confirm(rl, 'Revert all agents to premium defaults?', true)
    rl.close()
    if (!proceed) {
      info('Revert cancelled.')
      return
    }
  }

  info('Reverting all tier enhancements and restoring premium defaults...')
  const results = revertToDefault(targetDir)

  for (const r of results) {
    if (r.status === 'reverted') {
      ok(`  ${r.agent}: restored to premium`)
    }
  }

  const configUpdated = updateConfigTier(targetDir, 'premium')
  if (configUpdated) {
    ok(`Reverted from "${currentTier}" to premium tier`)
  } else {
    warn('Agent files reverted but config not persisted — sparq.config.json not found')
    info('Run `npx sparq-assistant init` to create config')
  }
}

function cmdTuneStatus(targetDir) {
  const status = getTuneStatus(targetDir)

  console.log(`\n  ${style.boldCyan(`${emoji.config || ''}Model Tier Status`)}\n`)
  console.log(`  Tier: ${style.bold(status.currentTier)}`)
  if (status.currentTier !== 'premium') {
    console.log(`  Refine rounds: ${status.refineCount}/${status.maxRefineRounds}`)
  }
  console.log('')

  if (status.agents.length === 0) {
    warn('No agents found. Run `npx sparq-assistant init` to install agents.')
  } else {
    for (const agent of status.agents) {
      const l1 = agent.hasLayerOne ? style.green('L1') : style.dim('--')
      const l2 = agent.hasLayerTwo ? style.green(`L2:${agent.guidanceTier}`) : style.dim('--')
      console.log(
        `  ${agent.agent.padEnd(35)} model: ${style.cyan(agent.model || '?')}  ${l1}  ${l2}  (${agent.lines} lines)`,
      )
    }
  }
  console.log('')
}

// ---------------------------------------------------------------------------
// Main Export
// ---------------------------------------------------------------------------

export async function cmdTune(options = {}) {
  const { targetDir, subcommand, tier, force, nonInteractive } = options

  if (!subcommand) {
    info('Usage: sparq tune <apply|revert|status> [options]')
    info('')
    info('  sparq tune apply <tier>   Apply Layer 1 enhancements for a model tier')
    info('  sparq tune revert         Restore all agents to premium defaults')
    info('  sparq tune status         Show current tier and agent status')
    info('')
    info('Tiers: premium (default), balanced (all sonnet), economy (all haiku)')
    return
  }

  switch (subcommand) {
    case 'apply':
      if (!tier) {
        fail('Missing tier argument. Usage: sparq tune apply <premium|balanced|economy>')
        process.exit(2)
      }
      await cmdTuneApply(targetDir, tier, { force, nonInteractive })
      break
    case 'revert':
      await cmdTuneRevert(targetDir, { force, nonInteractive })
      break
    case 'status':
      cmdTuneStatus(targetDir)
      break
    default:
      fail(`Unknown tune subcommand: "${subcommand}". Use: apply, revert, or status`)
      process.exit(2)
  }
}
