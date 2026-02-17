---
name: sparq:improve
description: "Running the lean improve loop for failing evals. Default path: strict eval -> improve -> baseline promote. Improve auto-runs reflect+tune+strict re-eval with bounded iterations."
audience: dev
---

# Improve Loop

Run bounded improvement for one case or all cases.

## Input

```
/sparq:improve {case-name}
/sparq:improve --all
```

Optional flags:
- `--max-iterations <N>` (default 3)
- `--model <name>` (optional; otherwise latest strict run model is used)
- `--allow-skips`
- `--project <dir>`

## Execute

```bash
node bin/sparq.mjs improve {case-or---all} {flags}
```

Primary orchestration behavior in CLI:
- strict eval
- reflection generation
- deterministic tune plan apply
- strict re-eval
- bounded repeat (default `3`)

## Interpret Output

Read `[sparq] IMPROVE_STATUS=...`:
- `IMPROVED_AND_PASSING`: success. Suggest `/sparq:baseline-promote {case|--all}`.
- `PARTIAL_IMPROVEMENT`: improvement detected but still failing. Suggest another improve run or targeted `/sparq:eval-reflect` + `/sparq:eval-tune`.
- `NO_IMPROVEMENT`: suggest manual reflection+tune.
- `BLOCKED`: report blocker reason from CLI output and follow `[sparq] NEXT_ACTION=...`.

Also parse:
- `[sparq] IMPROVE_ITERATIONS=<n>`
- `[sparq] IMPROVE_TUNED_FILES=<n>`
- `[sparq] NEXT_ACTION=<command>`

### BLOCKED Fallback Routing

If `BLOCKED` reason indicates model-generation constraints (no model resolved, `mock`, or missing API/local model env):
1. Suggest generation-capable rerun first: `sparq improve <case|--all> --model haiku` (or `local` when configured)
2. If still blocked, route to service primitives explicitly:
   - `/sparq:eval-reflect`
   - `/sparq:eval-tune`
   - strict re-eval (`/sparq:eval <case|--all> --strict`)

## Cost Guidance

- `improve` needs generation-capable model runs to mutate outputs meaningfully.
- Use `haiku` first for lower cost; move to `sonnet/opus` only when needed.
- Keep `/sparq:optimize` out of the default loop; run it only after strict stability.

<done_criteria>
1. CLI improve command executed with requested scope and flags
2. Final `IMPROVE_STATUS` captured and explained
3. Next action suggested (`/sparq:baseline-promote` on success, reflect/tune path otherwise)
4. Machine-readable improve metadata surfaced (status/iterations/tuned-files/next-action)
5. BLOCKED model-generation cases routed to service primitives only when needed
</done_criteria>

## Usage

```
/sparq:improve
```

Examples:
- `"Improve eval case format-compliance"`
- `"Improve all failing eval cases"`
- `"Run improve loop with haiku model"`

## References

- `bin/lib/commands/improve.mjs`
- `bin/lib/commands/eval.mjs`
- `claude/skills/sparq-optimize/SKILL.md`
