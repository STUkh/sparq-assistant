// bin/lib/tune-engine.mjs — Deterministic tune engine for model tier optimization (Layer 1)

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { atomicWriteSync } from './atomic-write.mjs'
import { AGENT_NAMES, MODEL_TIER_MAP, TUNE_BUDGET } from './constants.mjs'
import { insertIntoSection } from './eval/prompt-editor.mjs'
import { dryRun } from './state.mjs'
import { getEnhancementsForAgent } from './tune-catalog-user.mjs'

// ---------------------------------------------------------------------------
// YAML Frontmatter Helpers
// ---------------------------------------------------------------------------

function parseModelFromFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/)
  if (!match) return null
  const fm = match[1]
  const modelMatch = fm.match(/^model:\s*(\S+)/m)
  return modelMatch ? modelMatch[1] : null
}

function replaceModelInFrontmatter(content, newModel) {
  return content.replace(/^(---\n[\s\S]*?)model:\s*\S+([\s\S]*?\n---)/, `$1model: ${newModel}$2`)
}

// ---------------------------------------------------------------------------
// Marker Removal
// ---------------------------------------------------------------------------

function removeTierMarkers(content) {
  // Remove lines containing [sparq:tier:*] markers
  const lines = content.split('\n')
  const filtered = lines.filter((line) => !line.includes('[sparq:tier:'))
  return filtered.join('\n')
}

function removeModelGuidance(content) {
  // Remove <model_guidance tier="...">...</model_guidance> blocks
  return content.replace(/<model_guidance\s+tier="[^"]*">[\s\S]*?<\/model_guidance>\n?/g, '')
}

// ---------------------------------------------------------------------------
// Budget Validation
// ---------------------------------------------------------------------------

function lineCount(content) {
  return content.split('\n').length
}

function validateBudget(content) {
  const lines = lineCount(content)
  if (lines > TUNE_BUDGET.agentTotalMax) {
    return {
      valid: false,
      lines,
      error: `Agent exceeds ${TUNE_BUDGET.agentTotalMax} line budget (${lines} lines)`,
    }
  }
  return { valid: true, lines }
}

// ---------------------------------------------------------------------------
// Agent Path Helpers
// ---------------------------------------------------------------------------

function agentShortName(filename) {
  return filename.replace(/^sparq-/, '').replace(/\.md$/, '')
}

function agentDir(projectDir) {
  return join(projectDir, '.claude', 'agents')
}

function tuneDir(projectDir) {
  return join(projectDir, '.sparq', 'tune')
}

function refineCountPath(projectDir) {
  return join(tuneDir(projectDir), 'refine-count.json')
}

// ---------------------------------------------------------------------------
// Layer 1: Apply Pre-Authored Enhancements
// ---------------------------------------------------------------------------

export function applyLayerOne(projectDir, targetTier) {
  const agentsDir = agentDir(projectDir)
  const results = []

  for (const filename of AGENT_NAMES) {
    const filePath = join(agentsDir, filename)
    if (!existsSync(filePath)) {
      results.push({ agent: filename, status: 'skipped', reason: 'file-missing' })
      continue
    }

    const shortName = agentShortName(filename)
    const enhancements = getEnhancementsForAgent(shortName, targetTier)
    if (enhancements.length === 0) {
      results.push({ agent: filename, status: 'skipped', reason: 'no-enhancements' })
      continue
    }

    let content = readFileSync(filePath, 'utf-8')
    let addedCount = 0

    for (const entry of enhancements) {
      const result = insertIntoSection(content, entry.section, entry.content, entry.marker)
      if (result.changed) {
        content = result.content
        addedCount++
      }
    }

    if (addedCount === 0) {
      results.push({ agent: filename, status: 'skipped', reason: 'already-applied' })
      continue
    }

    const budget = validateBudget(content)
    if (!budget.valid) {
      results.push({ agent: filename, status: 'error', reason: budget.error })
      continue
    }

    dryRun(() => atomicWriteSync(filePath, content), `apply Layer 1 to ${filename}`)
    results.push({
      agent: filename,
      status: 'applied',
      linesAdded: addedCount,
      totalLines: budget.lines,
    })
  }

  return results
}

// ---------------------------------------------------------------------------
// Model Field Updates
// ---------------------------------------------------------------------------

export function updateAgentModels(projectDir, targetTier) {
  const agentsDir = agentDir(projectDir)
  const tierMap = MODEL_TIER_MAP[targetTier]
  if (!tierMap) return []

  const results = []

  for (const filename of AGENT_NAMES) {
    const filePath = join(agentsDir, filename)
    if (!existsSync(filePath)) continue

    const shortName = agentShortName(filename)
    const newModel = tierMap[shortName]
    if (!newModel) continue

    let content = readFileSync(filePath, 'utf-8')
    const currentModel = parseModelFromFrontmatter(content)

    if (currentModel === newModel) {
      results.push({ agent: filename, model: newModel, changed: false })
      continue
    }

    content = replaceModelInFrontmatter(content, newModel)
    dryRun(() => atomicWriteSync(filePath, content), `update model to ${newModel} in ${filename}`)
    results.push({ agent: filename, model: newModel, changed: true, from: currentModel })
  }

  return results
}

// ---------------------------------------------------------------------------
// Revert to Premium
// ---------------------------------------------------------------------------

export function revertToDefault(projectDir) {
  const agentsDir = agentDir(projectDir)
  const results = []

  for (const filename of AGENT_NAMES) {
    const filePath = join(agentsDir, filename)
    if (!existsSync(filePath)) continue

    let content = readFileSync(filePath, 'utf-8')
    const original = content

    content = removeTierMarkers(content)
    content = removeModelGuidance(content)

    // Clean up any double blank lines left by removal
    content = content.replace(/\n{3,}/g, '\n\n')

    const shortName = agentShortName(filename)
    const premiumModel = MODEL_TIER_MAP.premium[shortName]
    if (premiumModel) {
      content = replaceModelInFrontmatter(content, premiumModel)
    }

    if (content !== original) {
      dryRun(() => atomicWriteSync(filePath, content), `revert ${filename} to premium`)
      results.push({ agent: filename, status: 'reverted' })
    } else {
      results.push({ agent: filename, status: 'unchanged' })
    }
  }

  // Intentionally preserve refine counts — prevents bypass via revert/apply cycling

  return results
}

// ---------------------------------------------------------------------------
// Tier Detection
// ---------------------------------------------------------------------------

export function detectCurrentTier(projectDir) {
  const configPath = join(projectDir, 'sparq.config.json')
  if (!existsSync(configPath)) return 'premium'

  try {
    const config = JSON.parse(readFileSync(configPath, 'utf-8'))
    return config.preferences?.modelTier || 'premium'
  } catch {
    return 'premium'
  }
}

// ---------------------------------------------------------------------------
// Budget Checking
// ---------------------------------------------------------------------------

export function checkBudget(projectDir) {
  const agentsDir = agentDir(projectDir)
  const results = []

  for (const filename of AGENT_NAMES) {
    const filePath = join(agentsDir, filename)
    if (!existsSync(filePath)) continue

    const content = readFileSync(filePath, 'utf-8')
    const lines = lineCount(content)
    const headroom = TUNE_BUDGET.agentTotalMax - lines

    results.push({
      agent: filename,
      lines,
      headroom,
      canFitLayerOne: headroom >= TUNE_BUDGET.layerOneMax,
      canFitLayerTwo: headroom >= TUNE_BUDGET.layerOneMax + TUNE_BUDGET.layerTwoMax,
    })
  }

  return results
}

// ---------------------------------------------------------------------------
// Layer 2 Guidance Cache
// ---------------------------------------------------------------------------

export function getCachedGuidance(projectDir, agentShortName, tier) {
  const cachePath = join(tuneDir(projectDir), `${agentShortName}-${tier}.md`)
  if (!existsSync(cachePath)) return null
  return readFileSync(cachePath, 'utf-8')
}

export function saveCachedGuidance(projectDir, agentShort, tier, guidance) {
  const dir = tuneDir(projectDir)
  const cachePath = join(dir, `${agentShort}-${tier}.md`)
  dryRun(() => {
    mkdirSync(dir, { recursive: true })
    writeFileSync(cachePath, guidance, 'utf-8')
  }, `save cached guidance for ${agentShort} (${tier})`)
}

export function applyCachedGuidance(projectDir, tier) {
  const agentsDir = agentDir(projectDir)
  const results = []

  for (const filename of AGENT_NAMES) {
    const shortName = agentShortName(filename)
    const cached = getCachedGuidance(projectDir, shortName, tier)
    if (!cached) continue

    const filePath = join(agentsDir, filename)
    if (!existsSync(filePath)) continue

    let content = readFileSync(filePath, 'utf-8')

    // Don't re-apply if guidance already present
    if (content.includes(`<model_guidance tier="${tier}">`)) {
      results.push({ agent: filename, status: 'already-present' })
      continue
    }

    const guidanceBlock = `\n<model_guidance tier="${tier}">\n${cached.trim()}\n</model_guidance>\n`
    content = `${content.trimEnd()}\n${guidanceBlock}`

    const budget = validateBudget(content)
    if (!budget.valid) {
      results.push({ agent: filename, status: 'skipped', reason: 'over-budget' })
      continue
    }

    dryRun(() => atomicWriteSync(filePath, content), `apply cached guidance to ${filename}`)
    results.push({ agent: filename, status: 'applied', totalLines: budget.lines })
  }

  return results
}

// ---------------------------------------------------------------------------
// Refine Round Tracking
// ---------------------------------------------------------------------------

export function getRefineCount(projectDir, tier) {
  const path = refineCountPath(projectDir)
  if (!existsSync(path)) return 0

  try {
    const data = JSON.parse(readFileSync(path, 'utf-8'))
    return data[tier] ?? 0
  } catch {
    return 0
  }
}

export function incrementRefineCount(projectDir, tier) {
  const countPath = refineCountPath(projectDir)
  const dir = tuneDir(projectDir)

  let data = {}
  if (existsSync(countPath)) {
    try {
      data = JSON.parse(readFileSync(countPath, 'utf-8'))
    } catch {
      data = {}
    }
  }

  data[tier] = (data[tier] ?? 0) + 1
  dryRun(() => {
    mkdirSync(dir, { recursive: true })
    atomicWriteSync(countPath, `${JSON.stringify(data, null, 2)}\n`)
  }, `increment refine count for ${tier} to ${data[tier]}`)
  return data[tier]
}

export function resetRefineCount(projectDir) {
  const countPath = refineCountPath(projectDir)
  if (existsSync(countPath)) {
    dryRun(() => writeFileSync(countPath, '{}\n', 'utf-8'), 'reset refine counts')
  }
}

// ---------------------------------------------------------------------------
// Status Report
// ---------------------------------------------------------------------------

export function getTuneStatus(projectDir) {
  const agentsDir = agentDir(projectDir)
  const currentTier = detectCurrentTier(projectDir)
  const agents = []

  for (const filename of AGENT_NAMES) {
    const filePath = join(agentsDir, filename)
    if (!existsSync(filePath)) continue

    const content = readFileSync(filePath, 'utf-8')
    const model = parseModelFromFrontmatter(content)
    const hasLayerOne = content.includes('[sparq:tier:')
    const guidanceMatch = content.match(/<model_guidance\s+tier="([^"]*)"/)
    const hasLayerTwo = !!guidanceMatch
    const guidanceTier = guidanceMatch ? guidanceMatch[1] : null

    agents.push({
      agent: filename,
      model,
      hasLayerOne,
      hasLayerTwo,
      guidanceTier,
      lines: lineCount(content),
    })
  }

  const refineCount = getRefineCount(projectDir, currentTier)

  return { currentTier, refineCount, maxRefineRounds: TUNE_BUDGET.maxRefineRounds, agents }
}
