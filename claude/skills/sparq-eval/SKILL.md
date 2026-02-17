---
name: sparq:eval
description: "Running eval cases via CLI to score agent outputs against rubrics."
audience: dev
---

# Eval Runner

Thin wrapper — delegates entirely to `sparq eval` CLI. No AI reasoning needed; rubrics are pure code.

Default lean flow (skills-first, low cost):
1. `/sparq:eval {case|--all} --strict`
2. `/sparq:improve {case|--all}` if failing (use `--model haiku` when strict eval used `mock`)
3. `/sparq:baseline-promote {case|--all}` after clean strict passes

## Input

```
/sparq:eval {case-name} [flags]
```

## Execute

Build and run the CLI command via Bash:

```bash
node bin/sparq.mjs eval {case-name} {flags}
```

Flags (pass through directly):
- `--all` — run all eval cases
- `--model <name>` — mock (default), haiku, sonnet, opus, local
- `--strict` / `--no-strict` — strict mode is default
- `--allow-skips` — exploratory mode (permits skips/non-evaluated cases)
- `--audit` — prompt quality check (no eval run)
- `--trends` — score history (no eval run)
- `--yes` — skip API confirmation

Model guidance for primary reliability loop:
- `mock` is fine for cheap policy checks and rubric validation.
- If strict run fails and you plan to use `/sparq:improve`, prefer generation-capable model (`--model haiku` first).

## After Execution

Parse CLI output:
- Always parse `[sparq] NEXT_ACTION=...` and suggest that exact command first.
- If `EVAL_STATUS=FAIL` and current model is `mock`, suggest:
  - `/sparq:improve {case|--all} --model haiku`
- If `EVAL_STATUS=PASS`, suggest baseline promotion action from `NEXT_ACTION`.

<done_criteria>
1. CLI command executed with correct flags
2. Verdict (PASS/FAIL) communicated to user
3. Next action suggested from verdict (`/sparq:improve` or `/sparq:baseline-promote`)
</done_criteria>

## References

- `bin/lib/commands/eval.mjs` -- eval implementation (do NOT replicate logic, just call CLI)

## Examples

```
/sparq:eval s2-manual-to-e2e            -> node bin/sparq.mjs eval s2-manual-to-e2e
/sparq:eval --all                        -> node bin/sparq.mjs eval --all
/sparq:eval --model haiku s6-bug-regression --yes
/sparq:eval --audit
/sparq:eval --trends
/sparq:eval s2-manual-to-e2e --strict
/sparq:improve s2-manual-to-e2e --model haiku
/sparq:baseline-promote s2-manual-to-e2e
```
