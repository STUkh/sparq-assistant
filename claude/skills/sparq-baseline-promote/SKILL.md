---
name: sparq:baseline-promote
description: "Promoting eval baselines after policy eligibility checks. Requires 2 consecutive clean strict passes and clear optimize gate."
audience: dev
---

# Baseline Promote

Promote baselines explicitly after strict reliability checks.

## Input

```
/sparq:baseline-promote {case-name}
/sparq:baseline-promote --all
```

Optional:
- `--model <name>` to target a specific model key

## Execute

```bash
node bin/sparq.mjs baseline promote {case-or---all} {flags}
```

## Interpret Output

- Success: baselines promoted for eligible cases.
- Denied: report policy reason from CLI output, then suggest:
  - run another clean strict pass: `/sparq:eval {case|--all} --strict`
  - if failing after mock eval: `/sparq:improve {case|--all} --model haiku`

## Policy Reminder

Promotion is denied when:
- clean strict pass streak is `< 2`
- optimize gate is pending
- case is not evaluated in latest run

<done_criteria>
1. CLI baseline promotion command executed
2. Eligible/denied cases clearly reported
3. Denial reasons surfaced verbatim from CLI output
4. Next strict action suggested when denied
</done_criteria>

## Usage

```
/sparq:baseline-promote
```

Examples:
- `"Promote current eval results as baseline"`
- `"Promote baseline for format-compliance case"`
- `"Promote all baselines after clean strict passes"`

## References

- `bin/lib/commands/baseline.mjs`
- `bin/lib/eval/persistence.mjs`
