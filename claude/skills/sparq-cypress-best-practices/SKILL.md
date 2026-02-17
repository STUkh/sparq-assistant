---
name: sparq:cypress-best-practices
description: "Consulting Cypress enterprise best practices — architecture, authentication, mocking, assertions, CI/CD, accessibility, visual regression, component testing, and anti-patterns. Providing production-ready patterns and code examples for Cypress test suites. Use when: user asks about Cypress best practices, test architecture, auth patterns, cy.intercept strategies, assertion chains, CI setup, accessibility testing, visual regression, component testing, or wants to avoid common Cypress anti-patterns."
audience: qa
---

# Cypress Enterprise Best Practices

Supplementary consulting skill providing enterprise-grade Cypress best practices. Covers project architecture, authentication, API mocking, assertions, CI/CD, accessibility, visual regression, component testing, and anti-pattern avoidance. All patterns are production-tested and TypeScript-first.

> **Code-level generation patterns** (BasePage, commands, cy.session, cy.intercept basics, specs) live in `cypress-patterns.md`. This skill covers higher-level architectural and operational best practices with zero content overlap.

## Quick Reference

Match user question to the right reference:

- **Project structure / config / TypeScript / plugins / env** → Load `cypress-architecture.md`
- **Auth / cy.session / cy.intercept / assertions / commands / selectors** → Load `cypress-testing-strategies.md`
- **Component testing / visual regression / a11y / CI / reporters / perf** → Load `cypress-advanced.md`
- **Anti-patterns / common mistakes / bad practices / flaky tests** → Load `cypress-anti-patterns.md`
- **POM / page objects / commands / basic intercept / code generation** → Cross-ref `cypress-patterns.md` (existing)
- **Multiple topics or "full review"** → Load all references, present summary per domain

## Workflow

### Step 1: Verify Framework

Read `sparq.config.json` field `e2e.framework`. If value is `playwright` or missing (default), redirect: "Your project uses Playwright. Try `/sparq:playwright-best-practices` instead." Proceed only when `e2e.framework: 'cypress'`.

### Step 2: Detect Topic or Present Index

Analyze user input for topic keywords (see Quick Reference above). If topic is clear, load the matching reference file and present relevant patterns with code examples.

If no specific topic detected, present the domain index:

```
Cypress Best Practices — pick a topic or ask a question:

  1. Project Architecture — directory structure, config, TypeScript, plugins, env management
  2. Testing Strategies — auth (cy.session), API mocking (cy.intercept), assertions, commands
  3. Advanced Patterns — component testing, visual regression, accessibility, CI/CD, reporters
  4. Anti-Patterns — cy.wait(ms), conditional testing, shared state, retry-ability mistakes
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

### Project Architecture

**Key rule**: Use `defineConfig()` with TypeScript, organize by feature domain (not test type), keep plugins lean with explicit `cy.task` registration, and manage environments through `cypress.env.json` with CLI overrides.

Topics: enterprise directory layout with feature folders, `defineConfig()` deep dive (e2e, component, retries, timeouts), TypeScript with separate tsconfig for Cypress, plugin architecture (cy.task registration, code coverage), environment management hierarchy (config < env.json < CLI < system env).

→ Full reference: `cypress-architecture.md`

### Testing Strategies

**Key rule**: Use `cy.session()` for auth (never UI login per test), `cy.intercept()` for deterministic API control, `.should()` chains for retry-able assertions, and custom commands only for truly reusable multi-step operations.

Topics: test isolation with `testIsolation: true`, advanced cy.session() (API login, token injection, SSO via cy.origin, session switching), advanced cy.intercept() (GraphQL matching, conditional responses, request modification, sequences), callback assertions for complex validation, custom Chai matchers, child commands with `prevSubject`, @testing-library/cypress integration, cy.within() scoping, Shadow DOM, error handling config.

→ Full reference: `cypress-testing-strategies.md`

### Advanced Patterns

**Key rule**: Use component testing for isolated UI validation, Percy/Applitools for visual regression (not screenshot diffing), cypress-axe for accessibility, and optimize CI with API-based auth and disabled video.

Topics: component testing with Vue (Pinia store injection) and React mount, Percy snapshot integration, Applitools Eyes, cypress-axe a11y (checkA11y with WCAG rules), GitHub Actions CI workflow (parallel with cypress-io/github-action), Mochawesome and JUnit reporters, performance optimization (API login, session cache, video/screenshot config, memory management with `numTestsKeptInMemory`).

→ Full reference: `cypress-advanced.md`

### Anti-Patterns

**Key rule**: Never use `cy.wait(ms)` for timing — use `cy.intercept()` aliases instead. Never conditionally test based on DOM state. Never share state between tests via variables.

Topics: `cy.wait(number)` (use intercept aliases), conditional testing (restructure as separate tests), shared state via variables (use `beforeEach`), `after()` for cleanup (use `beforeEach`), tiny single-assertion tests (group related assertions), CSS/XPath selectors (use `data-testid`), ignoring retry-ability (chain `.should()` directly), async/await mixing (use Cypress command chain), testing third-party services (stub at boundary).

→ Full reference: `cypress-anti-patterns.md`

## Integration with SparQ Pipeline

These best practices are consumed at multiple points in the SparQ workflow:
- **Generation** (`/sparq:generate-e2e`): automation-engineer agent always loads `cypress-testing-strategies.md` and `cypress-anti-patterns.md` when framework is Cypress
- **Validation** (`/sparq:validate`): test-validator cross-references anti-patterns during drift detection
- **Consulting** (this skill): users access the full best practices library on demand
- Existing code-level patterns in `cypress-patterns.md` remain the primary generation reference — this skill supplements, never replaces them

<done_criteria>
1. `sparq.config.json` read; `e2e.framework` confirmed as `cypress`
2. User topic detected from keywords OR full domain index presented
3. Relevant reference file(s) loaded based on topic match
4. Code examples shown in TypeScript with project convention awareness
5. Related topics from other reference files offered as follow-up
6. No content duplicated from existing `cypress-patterns.md` or `e2e-common-patterns.md`
</done_criteria>

## References

- `.claude/skills/sparq-shared/references/cypress-architecture.md` — project structure, config, TypeScript, plugins, env
- `.claude/skills/sparq-shared/references/cypress-testing-strategies.md` — auth, intercept, assertions, commands, selectors
- `.claude/skills/sparq-shared/references/cypress-advanced.md` — component testing, visual, a11y, CI, reporters, performance
- `.claude/skills/sparq-shared/references/cypress-anti-patterns.md` — timing, conditional, state, retry, design anti-patterns
- `.claude/skills/sparq-shared/references/cypress-patterns.md` — code-level generation patterns (cross-ref, not loaded by default)

## Usage

```
/sparq:cypress-best-practices
```

Examples:
- `"Show Cypress best practices for API mocking"`
- `"How should I handle auth in Cypress tests?"`
- `"Cypress anti-patterns to avoid"`
- `"Best practices for Cypress CI setup"`

## Example

**User**: "How should I handle API mocking in Cypress?"

**Response flow**:
1. Detect topic: "API mocking" → load `cypress-testing-strategies.md`
2. Present advanced `cy.intercept()` patterns (GraphQL, sequences, conditional)
3. Show deterministic response fixtures with TypeScript typing
4. Highlight anti-pattern: "Never use `cy.wait(2000)` — use `cy.wait('@alias')` instead"
5. Offer follow-up: "Want to see how to set up authentication with `cy.session()` too?"
