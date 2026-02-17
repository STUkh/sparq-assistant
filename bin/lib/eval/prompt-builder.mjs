// bin/lib/eval/prompt-builder.mjs — prompt assembly for eval pipeline

import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { PKG_ROOT } from '../constants.mjs'

const EVALS_DIR = join(PKG_ROOT, 'test', 'evals')

const SOURCE_TO_TOOL = Object.freeze({
  jira: 'mcp__atlassian__jira_get_issue',
  confluence: 'mcp__atlassian__confluence_get_page',
  figma: 'mcp__figma__get_design_context',
  local: 'filesystem read',
  state: 'filesystem read (.sparq/state/)',
  testrail_sections: 'mcp__testrail__get_sections',
  testrail_cases: 'mcp__testrail__get_cases',
  qase_suites: 'mcp__qase__list_suites',
  qase_cases: 'mcp__qase__list_cases',
  conventions: 'project conventions (filesystem read)',
  existing_spec: 'existing test file (filesystem read)',
})

export function extractAgentReferences(agentContent) {
  const refsBlock = agentContent.match(/<references>([\s\S]*?)<\/references>/)
  if (!refsBlock) return []

  const paths = []
  for (const [, path] of refsBlock[1].matchAll(/- [`']?([^`'\n]+\.(?:md|json))[`']?/g)) {
    const cleaned = path
      .replace(/^\.\/?/, '')
      .trim()
      .split(/\s+--/)[0]
      .trim()
    paths.push(cleaned)
  }

  return paths
}

export function buildSystemPrompt(agentName) {
  const agentPath = join(PKG_ROOT, 'claude', 'agents', `sparq-${agentName}.md`)
  if (!existsSync(agentPath)) throw new Error(`Agent file not found: ${agentPath}`)

  const agentContent = readFileSync(agentPath, 'utf-8')
  const refs = extractAgentReferences(agentContent)
  const refContents = []

  for (const refPath of refs) {
    const fullPath = join(PKG_ROOT, refPath.startsWith('.claude') ? refPath : `.claude/${refPath}`)
    const altPath = join(PKG_ROOT, refPath)
    const resolvedPath = existsSync(fullPath) ? fullPath : existsSync(altPath) ? altPath : null
    if (!resolvedPath) continue
    refContents.push(`\n\n--- Reference: ${refPath} ---\n${readFileSync(resolvedPath, 'utf-8')}`)
  }

  return agentContent + refContents.join('')
}

function buildFixtureSection(fixtures) {
  const parts = []
  if (Object.keys(fixtures).length === 0) return parts

  parts.push('\n## Mock MCP Data')
  parts.push('Use this data as if you had called the MCP tools.\n')

  for (const [source, fixturePath] of Object.entries(fixtures)) {
    if (fixturePath === null) {
      parts.push(`### ${source}: UNAVAILABLE (no data)\n`)
      continue
    }

    const fullPath = resolve(EVALS_DIR, fixturePath)
    if (!existsSync(fullPath)) {
      parts.push(`### ${source}: fixture not found (${fixturePath})\n`)
      continue
    }

    const content = readFileSync(fullPath, 'utf-8')
    const toolName = SOURCE_TO_TOOL[source] ?? source
    parts.push(`### ${source} (simulated ${toolName} response)`)
    parts.push('```')
    parts.push(content)
    parts.push('```\n')
  }

  return parts
}

export function buildUserMessage(evalCase) {
  const { input } = evalCase
  const parts = []

  parts.push('You are being evaluated on your ability to generate QA testing artifacts.')
  parts.push('Generate all output artifacts in a single response.\n')
  parts.push('## Task')
  parts.push(`- Scenario: ${evalCase.scenario}`)
  parts.push(`- Input type: ${input.type}`)
  parts.push(`- Identifier: ${input.identifier}`)

  if (input.mode) parts.push(`- Mode: ${input.mode}`)
  if (input.refactor_args) {
    parts.push(`- Refactor from: "${input.refactor_args.rename_from}"`)
    parts.push(`- Refactor to: "${input.refactor_args.rename_to}"`)
  }

  parts.push(...buildFixtureSection(input.fixtures))

  if (input.mcp_errors.length > 0) {
    parts.push('\n## MCP Errors (simulate these failures)')
    for (const err of input.mcp_errors) {
      parts.push(`- **${err.source}**: ${err.error} (HTTP ${err.code})`)
    }
    parts.push('Handle these errors using your fallback strategies.\n')
  }

  parts.push('\n## Output Format')
  parts.push('Generate each artifact separated by delimiters:')
  parts.push('```')
  parts.push('--- ARTIFACT: {file-path} ---')
  parts.push('{content}')
  parts.push('--- END ARTIFACT ---')
  parts.push('```')
  parts.push('\nGenerate artifacts for these expected output paths:')
  for (const out of evalCase.expected_outputs) {
    parts.push(`- ${out.path}`)
  }

  return parts.join('\n')
}
