---
name: sparq:playwright-best-practices
description: "Consulting Playwright enterprise best practices — architecture, authentication, assertions, mocking, CI/CD, accessibility, visual regression, and anti-patterns. Providing production-ready patterns and code examples for Playwright test suites. Use when: user asks about Playwright best practices, test architecture, auth patterns, assertion strategies, CI setup, accessibility testing, visual regression, or wants to avoid common Playwright anti-patterns."
audience: qa
---

# Playwright Enterprise Best Practices

Supplementary consulting skill providing enterprise-grade Playwright best practices. Covers authentication, assertions, mocking, CI/CD, accessibility, visual regression, and anti-pattern avoidance. All patterns are production-tested and TypeScript-first.

> **Code-level generation patterns** (AbstractPage, POM, fixtures, locators, wait states) live in `playwright-patterns.md`. This skill covers higher-level architectural and operational best practices with zero content overlap.

## Quick Reference

Match user question to the right reference:

- **Auth / login / session / storageState / mocking API / HAR** → Load `playwright-auth-mocking.md`
- **Assertions / expect / soft assertions / custom matchers / waiting** → Load `playwright-assertions.md`
- **CI / parallel / sharding / retry / reporters / traces / performance** → Load `playwright-ci-reporting.md`
- **Accessibility / axe / WCAG / keyboard / visual regression / screenshots** → Load `playwright-a11y-visual.md`
- **Anti-patterns / common mistakes / bad practices / flaky tests** → Load `playwright-anti-patterns.md`
- **POM / page objects / fixtures / locators / code generation** → Cross-ref `playwright-patterns.md` (existing)
- **MCP browser tools / screenshots during generation** → Cross-ref `playwright-cli-tools.md` (existing)
- **Multiple topics or "full review"** → Load all references, present summary per domain

## Workflow

### Step 1: Verify Framework

Read `sparq.config.json` field `e2e.framework`. If value is `cypress`, redirect: "Your project uses Cypress. Try `/sparq:cypress-best-practices` instead." If missing, assume `playwright` (default).

### Step 2: Detect Topic or Present Index

Analyze user input for topic keywords (see Quick Reference above). If topic is clear, load the matching reference file and present relevant patterns with code examples.

If no specific topic detected, present the domain index:

```
Playwright Best Practices — pick a topic or ask a question:

  1. Authentication and API Mocking — storageState, setup projects, page.route(), HAR
  2. Assertions and Waiting — web-first assertions, soft assertions, custom matchers
  3. CI/CD and Reporting — parallelism, sharding, retries, reporters, traces, performance
  4. Accessibility and Visual Regression — axe-core, WCAG, keyboard, screenshots
  5. Anti-Patterns — timing, selector, test design, architecture, CI mistakes
```

### Step 3: Present Best Practices

After loading the relevant reference file(s):

1. **Summarize** the key principles (3-5 bullets)
2. **Show code examples** in TypeScript matching the user's question
3. **Highlight anti-patterns** to avoid (with corrected versions)
4. **Cross-reference** related topics: "You might also want to check [related domain]"
5. **Adapt** examples to the user's project conventions if `sparq.config.json` provides `e2e.structure.*` paths

### Step 4: Offer Follow-Up

After presenting best practices:
- Suggest related topics from other reference files
- Offer to review existing test code against the patterns shown
- If the user wants to generate tests, route to `/sparq:generate-e2e`

## Best Practice Summaries

### Authentication and API Mocking

**Key rule**: Never log in through the UI in every test — use `storageState` with setup projects for authentication, `page.route()` for API mocking, and HAR replay for complex API scenarios.

Topics: storageState auth flow, setup projects in config, per-worker auth isolation, multi-role testing, page.route() and context.route() mocking, mock factories, HAR recording/playback, selective route abort, test data via request fixture.

→ Full reference: `playwright-auth-mocking.md`

### Assertions and Waiting

**Key rule**: Always use web-first assertions (`expect(locator)`) with auto-retry — never use `page.waitForTimeout()` or manual polling loops.

Topics: web-first assertion inventory (visibility, content, state, navigation, count, attributes), soft assertions for multi-check flows, custom matchers (toHaveToastMessage pattern), common assertion anti-patterns, waiting strategy decision tree.

→ Full reference: `playwright-assertions.md`

### CI/CD and Reporting

**Key rule**: Shard tests across CI machines with `--shard=N/M`, configure retries for flaky detection, and use multi-reporter setup (HTML + JUnit + JSON) for comprehensive CI feedback.

Topics: fullyParallel mode, CI sharding strategy, retry and flaky detection, multi-reporter config, trace viewer debugging, Core Web Vitals via PerformanceObserver, CDP network throttling.

→ Full reference: `playwright-ci-reporting.md`

### Accessibility and Visual Regression

**Key rule**: Integrate axe-core via `@axe-core/playwright` with WCAG 2.1 AA tags, fail CI on critical/serious violations, and use `toHaveScreenshot()` with masking for stable visual regression.

Topics: axe-core integration, WCAG tag filtering, severity-based CI gating, reusable a11y fixture, keyboard navigation testing, focus management, toHaveScreenshot() config, dynamic content masking, Docker screenshot consistency, responsive viewport testing.

→ Full reference: `playwright-a11y-visual.md`

### Anti-Patterns

**Key rule**: Eliminate `waitForTimeout()`, avoid CSS/XPath selectors, never share state between tests, and keep page objects focused with `get` accessors.

Topics: timing anti-patterns (hardcoded waits, networkidle), selector anti-patterns (CSS, XPath, nth-child, ElementHandle), test design anti-patterns (shared state, test interdependence, redundant login), architecture anti-patterns (god page objects, missing barrels, framework imports), CI anti-patterns (missing retries, no traces, sequential runs).

→ Full reference: `playwright-anti-patterns.md`

## Integration with SparQ Pipeline

These best practices are consumed at multiple points in the SparQ workflow:
- **Generation** (`/sparq:generate-e2e`): automation-engineer agent always loads `playwright-assertions.md` and `playwright-anti-patterns.md` for quality guardrails
- **Validation** (`/sparq:validate`): test-validator cross-references anti-patterns during drift detection
- **Consulting** (this skill): users access the full best practices library on demand
- Existing code-level patterns in `playwright-patterns.md` and `playwright-cli-tools.md` remain the primary generation references — this skill supplements, never replaces them

<done_criteria>
1. `sparq.config.json` read; `e2e.framework` confirmed as `playwright` (or missing/default)
2. User topic detected from keywords OR full domain index presented
3. Relevant reference file(s) loaded based on topic match
4. Code examples shown in TypeScript with project convention awareness
5. Related topics from other reference files offered as follow-up
6. No content duplicated from existing `playwright-patterns.md` or `e2e-common-patterns.md`
</done_criteria>

## References

- `.claude/skills/sparq-shared/references/playwright-auth-mocking.md` — storageState, setup projects, API mocking, HAR
- `.claude/skills/sparq-shared/references/playwright-assertions.md` — web-first assertions, soft assertions, custom matchers
- `.claude/skills/sparq-shared/references/playwright-ci-reporting.md` — parallelism, sharding, reporters, traces, performance
- `.claude/skills/sparq-shared/references/playwright-a11y-visual.md` — axe-core, WCAG, keyboard, visual regression
- `.claude/skills/sparq-shared/references/playwright-anti-patterns.md` — timing, selector, design, architecture, CI anti-patterns
- `.claude/skills/sparq-shared/references/playwright-patterns.md` — code-level generation patterns (cross-ref, not loaded by default)
- `.claude/skills/sparq-shared/references/playwright-cli-tools.md` — CLI browser tools (cross-ref, not loaded by default)

## Usage

```
/sparq:playwright-best-practices
```

Examples:
- `"Show Playwright best practices for auth testing"`
- `"How should I handle assertions in Playwright?"`
- `"Playwright anti-patterns to avoid"`
- `"Best practices for Playwright CI/CD setup"`

## Example

**User**: "What's the best way to handle auth in my Playwright tests?"

**Response flow**:
1. Detect topic: "auth" → load `playwright-auth-mocking.md`
2. Present storageState pattern with setup projects config
3. Show per-worker auth isolation for parallel safety
4. Highlight anti-pattern: "Avoid UI login in every test — it's 10x slower"
5. Offer follow-up: "Want to see how to mock API responses too?"
