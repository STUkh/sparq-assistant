# Regression Workflow (S6) — Automation Engineer

Generate a single focused regression test from a bug ticket. ONE spec file reproducing the bug's repro steps and asserting expected behavior.

## Constants

- Regression test ID format: `REG-{ticket}-{NNN}` (e.g., `REG-BUG142-001`)
- Output path: `e2e/specs/regression/{ticket-id}.spec.ts` (ticket ID lowercase, kebab-case)
- Test tag: `@regression`
- Header comment: `// Regression test for {ticket-id}: {bug title}`

## Steps

### Step 1: Parse Bug Ticket

Extract from the bug ticket (Jira MCP or pasted text): ticket ID and title, reproduction steps (ordered), actual behavior (the bug), expected behavior (the fix target), affected component/page/feature area, severity. Normalize ticket ID to kebab-case for file naming (e.g., `BUG-142` -> `bug-142`).

### Step 2: Identify Test Target

Map the bug to existing project infrastructure:
1. Read E2E Infrastructure Summary from `.sparq/plans/execution-plan.md` or `config-snapshot.json`
2. Search existing page objects for the affected component
3. Search existing step classes and fixtures for reusable actions/state setup
4. Determine if existing page object methods cover the repro steps or if new methods are needed

### Step 3: Generate Regression Test

Create a single spec file at `e2e/specs/regression/{ticket-id}.spec.ts`:
1. Import per framework convention (Playwright: from fixture index; Cypress: from support barrel)
2. Import required page objects from their barrel exports
3. `test.describe` (Playwright) or `describe` (Cypress) block with regression tag
4. Map each repro step to framework actions using existing page object methods
5. Assert the expected behavior (not the bug behavior)
6. Keep assertions minimal -- only verify the specific fix, not full feature coverage

## Rules

- ONE spec file per bug ticket, ONE test (or small describe block for multi-step repros)
- Tag: `{ tag: '@regression' }` (Playwright) or `{ tags: '@regression' }` (Cypress, via grep plugin)
- Reuse existing page objects -- extend with new methods, never create new PO files unless no PO exists
- Minimal assertions: only assert the bug's expected behavior
- Include the bug's exact repro steps as test steps (1:1 mapping where possible)
- Add header comment: `// Regression test for {ticket-id}: {bug title}`
- Use `get` accessors for any new locators (not `readonly` fields)
- Ensure `e2e/specs/regression/` directory exists before writing

### Step 4: Smoke Verify

Run smoke verification per `preferences.smokeVerify` config and framework. Maximum 2 fix-verify cycles on failure.
