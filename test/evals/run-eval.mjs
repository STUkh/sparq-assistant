#!/usr/bin/env node

/**
 * SparQ Evaluation Runner — backward-compatible wrapper
 *
 * Core logic lives in bin/lib/commands/eval.mjs.
 * This shim preserves the old `node test/evals/run-eval.mjs` invocation.
 */

import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { cmdEval } from '../../bin/lib/commands/eval.mjs'

export async function main(argv = process.argv.slice(2)) {
  const { values, positionals } = parseArgs({
    args: argv,
    options: {
      all: { type: 'boolean', default: false },
      project: { type: 'string', default: process.cwd() },
      model: { type: 'string', default: 'mock' },
      yes: { type: 'boolean', default: false },
      strict: { type: 'boolean', default: true },
      'allow-skips': { type: 'boolean', default: false },
      'no-clean': { type: 'boolean', default: false },
      'artifact-root': { type: 'string' },
    },
    strict: false,
    allowPositionals: true,
  })

  await cmdEval({
    caseName: positionals[0],
    all: values.all,
    model: values.model,
    yes: values.yes,
    project: values.project,
    strict: values.strict,
    allowSkips: values['allow-skips'],
    noClean: values['no-clean'],
    artifactRoot: values['artifact-root'] ?? null,
  })
}

function isEntrypoint() {
  if (!process.argv[1]) return false
  if (resolve(process.argv[1]) !== fileURLToPath(import.meta.url)) return false
  // `node --test test/evals/run-eval.mjs` executes this file with no args.
  // Skip auto-run in that discovery path, but keep normal CLI behavior.
  if (process.env.NODE_TEST_CONTEXT && process.argv.length <= 2) return false
  return true
}

if (isEntrypoint()) {
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
