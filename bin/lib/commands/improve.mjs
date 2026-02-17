// bin/lib/commands/improve.mjs — improve command wrapper

import { runImproveWorkflow } from '../eval/improve-engine.mjs'
import { heading, info, warn } from '../state.mjs'

const DEFAULT_MAX_ITERATIONS = 3

function printUsage() {
  heading('SparQ Improve')
  info('Usage: sparq improve <case-name> [--model <name>] [--max-iterations <N>]')
  info('       sparq improve --all [--model <name>]')
}

export async function cmdImprove(options = {}) {
  const {
    caseName = null,
    all = false,
    model = null,
    project: projectDir = process.cwd(),
    strict = true,
    allowSkips = false,
    maxIterations = DEFAULT_MAX_ITERATIONS,
    yes: skipConfirm = false,
    artifactRoot = null,
  } = options

  if (!caseName && !all) {
    printUsage()
    process.exitCode = 1
    return
  }

  heading('SparQ Improve')

  try {
    const result = await runImproveWorkflow({
      caseName,
      all,
      model,
      project: projectDir,
      strict,
      allowSkips,
      maxIterations,
      yes: skipConfirm,
      artifactRoot,
    })

    if (result.reason) warn(result.reason)

    console.log(`[sparq] IMPROVE_STATUS=${result.status}`)
    console.log(`[sparq] IMPROVE_ITERATIONS=${result.iterations}`)
    console.log(`[sparq] IMPROVE_TUNED_FILES=${result.tunedFileCount}`)
    if (result.nextAction) console.log(`[sparq] NEXT_ACTION=${result.nextAction}`)

    process.exitCode = result.exitCode
  } catch (error) {
    warn(error.message)
    console.log('[sparq] IMPROVE_STATUS=BLOCKED')
    console.log('[sparq] IMPROVE_ITERATIONS=0')
    console.log('[sparq] IMPROVE_TUNED_FILES=0')
    process.exitCode = 1
  }
}
