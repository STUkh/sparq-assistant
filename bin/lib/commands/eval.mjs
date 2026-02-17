// bin/lib/commands/eval.mjs — thin CLI wrapper for eval workflow runtime

import {
  listAvailableEvalCases,
  runEvalWorkflow as runEvalWorkflowImpl,
} from '../eval/workflow.mjs'
import { fail, heading, info, style } from '../state.mjs'
import { auditPrompts, showTrends } from './eval-reflect.mjs'

export const runEvalWorkflow = runEvalWorkflowImpl

function handleAudit() {
  heading('SparQ Eval — Prompt Audit')
  auditPrompts()
}

function handleTrends(modelKey) {
  heading('SparQ Eval — Score Trends')
  showTrends(modelKey === 'mock' ? null : modelKey)
}

function handleUsage() {
  heading('SparQ Eval Runner')
  info('Usage: sparq eval [case-name] [--all] [--model <name>] [--strict] [--allow-skips]')
  info('       sparq eval --model haiku s6-bug-regression')
  info('       sparq eval --model claude-3-haiku-20240307 s6-bug-regression')
  info('       sparq eval --model opus --yes --all')
  console.log()
  info('Shortcuts: mock (default), haiku, sonnet, opus, local')
  info('Or pass a full claude-* model ID (e.g. claude-3-haiku-20240307)')
  console.log()
  info('Environment:')
  info('  ANTHROPIC_API_KEY       Required for Anthropic models')
  info('  SPARQ_LOCAL_MODEL_URL   Required for --model local (OpenAI-compat endpoint)')
  info('  SPARQ_LOCAL_MODEL_NAME  Model name for local server (default: "default")')
  console.log()
  info('Available cases:')
  for (const caseName of listAvailableEvalCases()) {
    console.log(`    ${style.dim(caseName)}`)
  }
  console.log()
}

export async function cmdEval(options = {}) {
  const {
    caseName = null,
    all = false,
    model: modelKey = 'mock',
    yes: skipConfirm = false,
    project: projectDir = process.cwd(),
    audit = false,
    trends = false,
    strict = true,
    allowSkips = false,
    noClean = false,
    artifactRoot = null,
  } = options

  if (audit) return handleAudit()
  if (trends) return handleTrends(modelKey)

  if (!caseName && !all) {
    handleUsage()
    process.exitCode = 1
    return
  }

  try {
    const report = await runEvalWorkflowImpl({
      caseName,
      all,
      model: modelKey,
      yes: skipConfirm,
      project: projectDir,
      strict,
      allowSkips,
      clean: noClean ? false : null,
      artifactRoot,
    })

    if (strict && report.policy.runStatus !== 'PASS') {
      process.exitCode = 2
      return
    }

    process.exitCode = 0
  } catch (error) {
    fail(error.message)
    process.exitCode = 1
  }
}
