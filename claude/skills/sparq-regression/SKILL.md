---
name: sparq:regression
description: "Generating a targeted regression test from a bug ticket (Playwright or Cypress per config). Extracting repro steps, creating a single focused spec file tagged @regression."
audience: qa
input_type: "text"
---

# /sparq:regression

Generate a targeted regression test (Playwright or Cypress per config) from a bug ticket (Jira ID, URL, or pasted repro steps). Produces one focused spec file that reproduces the bug and verifies the fix.

Config, version check, pattern rules, and E2E code generation preamble per `claude/rules/skills.md`.

## Input Examples

```
/sparq:regression BUG-142
/sparq:regression https://jira.example.com/browse/BUG-142
/sparq:regression --verify BUG-142
/sparq:regression "When clicking submit without filling required fields, the form crashes instead of showing validation"
```

## Input Detection

- **Jira ticket ID**: matches `/^[A-Z]+-\d+$/` -- fetch via Atlassian MCP
- **Jira URL**: contains `/browse/` -- extract ticket ID, fetch via Atlassian MCP
- **Text description**: pasted repro steps with no ticket reference -- use as-is
- **`--verify` flag**: after generating, run the test via Playwright MCP

## Orchestrator Dispatch

Classify as **S6** (Bug Regression). Dispatch to `sparq-automation-engineer` agent with `mode: "regression"`.

- **P0**: Classify input, detect bug source
- **P1**: Parse bug ticket -- extract repro steps, affected component, expected vs actual behavior
- **P2**: Generate regression test -- single spec with `@regression` tag, reusing existing page objects
- **P3**: Smoke verify (`npx playwright test --list`)
- **P4** (optional): If `--verify`, run the generated test via Playwright

**Checkpoints**: After P1 (parsed bug details, test strategy) and after P2 (generated code). **Wait for approval.** P3 has no checkpoint if smoke passes. Non-interactive mode: auto-approved except on Critical findings or smoke failures.

## Output

```
e2e/specs/regression/{TICKET-ID}.spec.ts    # Regression test spec
{e2e.structure.pages}/{Feature}Page.ts      # Modified page objects (if methods added)
.sparq/plans/execution-plan.md              # Execution tracking
```

Files written directly to project E2E directory. Git is the safety net for review and revert.

## Chaining

After generation, offer `/sparq:sync` to validate the broader test suite. No auto-chain -- always offer, never auto-execute.

## Error Handling

- **Jira MCP unavailable**: accept pasted repro steps as text input
- **Bug ticket not found**: prompt user for ticket ID or pasted description
- **No E2E infrastructure**: error -- run `/sparq:init` first
- Full fallback details: `degradation-strategy.md`

<done_criteria>
1. `sparq.config.json` read and E2E structure paths resolved from config
2. Bug ticket parsed — repro steps, affected component, and expected vs actual behavior extracted (from Jira MCP or user-provided text)
3. Regression spec written to `e2e/specs/regression/{TICKET-ID}.spec.ts` with `@regression` tag and unique `REG-{ticket}-{NNN}` test ID
4. Existing page objects reused (and extended with new accessors only if needed) — no duplicate page classes created
5. Smoke verify per `e2e.framework` (`npx playwright test --list` for Playwright, `npx cypress run --spec {path}` or `npx tsc --noEmit` for Cypress) passed without errors listing the new spec
</done_criteria>

## References

- `.claude/skills/sparq-shared/references/pattern-adherence.md`
- `.claude/skills/sparq-shared/references/degradation-strategy.md`
- `.claude/skills/sparq-shared/references/mcp-tool-inventory.md`
- `.claude/skills/sparq-shared/references/playwright-patterns.md`, `cypress-patterns.md`, `e2e-common-patterns.md`

## Usage

```
/sparq:regression
```

Examples:
- `"Create regression test for BUG-142"`
- `"Write a test to prevent this bug from recurring"`
- `"Regression test from these repro steps: click submit without filling required fields..."`

## Example

```
/sparq:regression BUG-142
-> fetches BUG-142 from Jira: "Form crashes on empty submit"
-> CHECKPOINT: SubmitForm component, 3 repro steps, reuse FormPage, assert validation visible
-> generates e2e/specs/regression/BUG-142.spec.ts (@regression tag, 1 test case)
-> extends FormPage with getValidationError() accessor
-> smoke verify: npx playwright test --list PASSED
-> output: BUG-142.spec.ts, FormPage.ts (modified) -- offers /sparq:sync
```
