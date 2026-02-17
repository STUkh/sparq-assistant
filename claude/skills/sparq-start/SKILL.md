---
name: sparq:start
description: "Conversational QA workflow router — the primary entry point for SparQ. Detecting user intent from natural language and routing to the correct SparQ skill automatically. Triggering on any QA-related request including: generating tests from Jira tickets or requirements, creating E2E tests for features, converting manual tests to automated Playwright tests, validating existing tests after UI changes, updating tests when requirements changed, creating regression tests for bugs, exporting results to TestRail or Qase or Jira, checking test coverage, and configuring SparQ settings. Use when: user asks to test a ticket, generate tests, create E2E tests, validate tests, sync requirements, write regression tests, export results, cover a feature with tests, check if tests are valid, or describes any QA testing need in plain language. Also use when: user provides a Jira ticket ID like EP-142, mentions test generation or test creation, says tests are broken or outdated, asks what tests they need, wants to convert manual tests, or is unsure which SparQ command to use."
audience: qa
---

# SparQ Guided Workflow

Conversational QA router mapping natural language intent to the right SparQ skill. Users describe needs in plain language, provide Jira ticket IDs, or use the interactive menu.

## Workflow

### Step 1: Check Prerequisites

1. Check for interrupted workflow state first:
   - Read `.sparq/state/current-task.json` — if exists and status is `in-progress` or `failed`:
     - Prompt: "I found an interrupted workflow ({scenario} for {feature}). Resume or start fresh?"
     - If resume: invoke `/sparq:resume` logic
     - If fresh: clear `.sparq/state/` directory and proceed to next check
2. Check if `sparq.config.json` exists
   - If missing: "SparQ isn't set up yet. Let me initialize it first." → Run `/sparq:init` flow
   - If exists: proceed to Step 2

### Step 2: Detect Intent or Present Menu

**First, check if the user already provided enough context to route directly.** Analyze the user's message for:
- A Jira ticket ID (e.g., `EP-142`, `BUG-300`)
- A file path (e.g., `e2e/specs/login.spec.ts`)
- A URL (Confluence, Figma, Jira)
- Keywords that reveal intent (see Free-Form Input Detection below)
- A natural language description of what they want

**If intent is clear** (high-confidence match from the detection rules below): skip the menu, confirm the detected intent in one sentence, and route directly. Example:

> "I'll generate tests for ticket EP-142 — both manual test cases and E2E automation."

Ask only the minimum follow-up questions the target skill needs (if any), then hand off.

**If intent is ambiguous or no input was provided**: present the lane-first interactive menu:

<!-- Only show skills with audience: qa. Dev/internal skills are accessed directly. -->
```
Choose a lane (pick a number, or just describe what you need)

  1. Generate lane (new tests): manual, E2E, or unified
  2. Maintain lane (existing tests/results): validate, sync, regression, refactor, export
  3. View or edit SparQ configuration
```

Wait for user selection or free-form response.

### Step 3: Route Based on Selection

**Selection 1 → Generate lane**

Ask: "What type of tests do you need?"
- (A) Manual test cases only → invoke `/sparq:generate-manual`
- (B) Automated E2E tests only → invoke `/sparq:generate-e2e`
- (C) Both manual AND E2E tests (recommended) → invoke `/sparq:generate`

Then ask: "Provide a Jira ticket ID, Confluence URL, or describe the feature:"

Pass user input to the selected skill.

**Selection 2 → Maintain lane**

Ask: "What do you need to maintain?"
- (A) Validate tests after UI changes → invoke `/sparq:validate`
- (B) Sync tests after requirement changes → invoke `/sparq:sync`
- (C) Create a regression test for a bug → invoke `/sparq:regression`
- (D) Refactor test code after codebase changes → invoke `/sparq:refactor`
- (E) Export results to TMS/Jira/Confluence → invoke `/sparq:export`

Follow-up prompts by action:
- (A) Ask for test path (default: `e2e.structure.specs`)
- (B) Ask for requirement source + test path (auto-detect tests from registry if omitted)
- (C) Ask for bug ticket ID or repro steps
- (D) Ask for `--from` and `--to` rename patterns (e.g., old selector → new selector)
- (E) Ask for export target(s) if user did not specify

Pass gathered input to the selected maintain skill.

**Selection 3 → Configuration**

Invoke `/sparq:config`.

### Step 4: Hand Off

After routing, the target skill takes over completely. `/sparq:start` does not remain active — it's a pure router.

## Design Principles

- **Conversation first**: Natural language is primary input — menu is the fallback
- **No jargon**: Never expose S-codes, agent names, or MCP servers
- **Plain language**: "Jira ticket" not "requirement source", "E2E tests" not "automation artifacts"
- **Minimal questions**: default max 2 before routing (`preferences.maxClarifications`, default `2`)
- **Two-lane model**: route through `Generate` or `Maintain` mental model whenever menu is needed
- **Smart defaults**: Most common choice first, marked "(recommended)"
- **Always accept free-form**: If user reveals intent at any point, route immediately
- **Confirm, don't interrogate**: Confirm detected intent and proceed — never re-ask provided info

### Free-Form Input Detection

Detect intent from any user input (alongside `/sparq:start`, menu follow-up, or standalone request). On match, skip menu and route directly.

#### Pattern-Based Detection (highest confidence)

- **Jira ticket pattern** (`[A-Z]+-\d+` like `EP-142`, `PROJ-99`): route to Generate lane (default unified)
- **File path ending in `.spec.ts` or `.test.ts`**: route to Maintain lane → Validate
- **URL containing `confluence` or `figma`**: route to Generate lane (default unified)
- **URL containing `jira` or `atlassian` with ticket path**: route to Generate lane (default unified)
- **PR URL pattern** (GitHub/GitLab PR URL): route to Generate lane (default unified) with PR diff as input
- **Branch name pattern** (`feature/`, `fix/`, `bugfix/` prefix): offer generation from diff

#### Keyword-Based Detection (match any keyword in user input)

**Generate lane (default unified — manual + E2E)**:
- "generate tests", "create tests", "write tests", "need tests", "make tests"
- "test this ticket", "test this feature", "cover this feature", "cover this with tests"
- "what tests do I need", "testing for", "tests for"
- "I have a ticket", "from this ticket", "from requirements", "from this Jira"
- "test my PR", "test this PR", "tests for this PR", "generate tests from PR"
- "test my branch", "test these changes", "test my diff"

**Generate lane — manual only**:
- "manual tests", "manual test cases", "test cases only", "just test cases"
- "QA checklist", "test plan"

**Generate lane — E2E only**:
- "e2e tests only", "just e2e", "just automation", "playwright tests only"
- "automate this", "automated tests only"

**Generate lane — manual-to-E2E conversion**:
- "convert manual", "manual to e2e", "manual to automated", "automate my manual tests"
- "convert these tests", "have manual tests", "existing manual tests"
- "turn these into e2e", "make these automated"

**Maintain lane — validate**:
- "validate", "check tests", "check if tests", "are my tests valid", "tests still valid"
- "tests broken", "tests are broken", "tests failing", "tests outdated"
- "drift", "after UI changes", "after redesign", "after refactor"
- "verify tests", "review tests", "test health"
- "test quality", "test score", "how good are my tests", "test health check"

**Maintain lane — sync**:
- "sync", "requirements changed", "reqs changed", "update tests", "tests out of date"
- "ticket was updated", "requirements updated", "spec changed"
- "refresh tests", "align tests", "tests don't match requirements"

**Maintain lane — regression**:
- "bug", "regression", "repro", "reproduction", "reproduce"
- "regression test for", "test for this bug", "bug ticket"
- "this bug needs a test", "prevent this from happening again"

**Maintain lane — export**:
- "export", "testrail", "qase", "push to", "publish to"
- "send to jira", "coverage comment", "publish test plan"
- "sync to tms", "upload tests"

**Configuration (outside lanes)**:
- "config", "configuration", "settings", "setup", "change project key"
- "enable jira", "disable confluence", "change checkpoint"

**Model tier optimization** (direct route — not in menu):
- "tune", "model tier", "cheaper model", "reduce cost", "save money", "optimize costs"
- "switch to sonnet", "switch to haiku", "use cheaper model", "lower cost"
- "economy tier", "balanced tier", "premium tier"
  → Invoke `/sparq:tune`

**Best practices consulting** (direct route — not in menu):
- "playwright best practices", "playwright patterns", "playwright auth", "playwright assertions"
- "cypress best practices", "cypress patterns", "cypress auth", "cypress intercept"
- "e2e best practices", "testing best practices", "anti-patterns", "test architecture"
  → If `e2e.framework: 'cypress'`: invoke `/sparq:cypress-best-practices`
  → Otherwise (default): invoke `/sparq:playwright-best-practices`

**Maintain lane — refactor**:
- "refactor", "rename selectors", "bulk rename", "update selectors"
- "class names changed", "selectors changed", "imports changed"
- "update test selectors", "rename data-testid"

#### Natural Language Examples

- "Generate tests for EP-142" → Generate lane (unified)
- "Create tests for this ticket" → Generate lane (unified), ask for ticket ID
- "I need E2E tests for the login feature" → Generate lane (E2E)
- "Test this Jira ticket" → Generate lane (unified), ask for ticket ID
- "My tests are broken after the redesign" → Maintain lane (validate)
- "Requirements changed, update tests" → Maintain lane (sync), ask for source
- "Create a regression test for this bug" → Maintain lane (regression), ask for ticket
- "Check if my tests are still valid" → Maintain lane (validate)
- "Cover this feature with tests" → Generate lane (unified), ask for source
- "What tests do I need for EP-200?" → Generate lane (unified)
- "Push my test cases to TestRail" → Maintain lane (export)
- "Convert our manual QA tests to Playwright?" → Generate lane (manual-to-E2E)
- "The login page was redesigned, check our E2E suite" → Maintain lane (validate)
- "BUG-451 keeps regressing, write a test for it" → Maintain lane (regression)
- "Test my PR" → Generate lane (unified) with PR diff as input
- "Generate tests for these changes" → Generate lane (unified), detect branch diff

#### Ambiguity Resolution

When input matches multiple categories with similar confidence:
1. State the top two interpretations plainly
2. Ask the user to pick: "Did you mean X or Y?"
3. Do NOT fall back to the full menu — keep it to a binary or ternary choice
4. If unresolved after `preferences.maxClarifications` turns (default 2), choose the safest high-confidence route and proceed with explicit assumption in one sentence

**S4 vs S5 disambiguation**: If the user says "tests are out of date" or similar ambiguous input, ask: "Did the **UI/codebase** change (→ validate for drift), or did the **requirements** change (→ sync with updated specs)?"

<done_criteria>
1. User intent detected from natural language OR user presented with plain-language workflow menu (no scenario codes, no jargon)
2. If user provided enough context (ticket ID, keywords, description), menu was skipped and intent was confirmed in one sentence
3. If user input was ambiguous, narrowed to 2-3 choices (not the full menu)
4. User selection or detected intent mapped to correct SparQ skill
5. Minimum necessary follow-up questions asked (default max 2 via `preferences.maxClarifications`) — never re-asked information the user already provided
6. Target skill invoked with all user-provided context passed through
7. Two-lane UX preserved: Generate lane (manual/e2e/unified) and Maintain lane (validate/sync/regression/refactor/export), plus config path
</done_criteria>

## Usage

```
/sparq:start
```

Examples:
- `"Start QA workflow"`
- `"Help me test the login feature"`
- `"I need tests for EP-142"`
- `"What tests do I need for this ticket?"`

## References

- `sparq.config.json` — for prerequisite check and default paths
