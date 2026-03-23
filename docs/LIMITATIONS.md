# SparQ Limitations

## MCP Server Dependencies

Each MCP server is optional. When unavailable, SparQ degrades gracefully:

| MCP Server | Depends On It | When Unavailable |
|------------|---------------|-----------------|
| **Atlassian (Jira)** | Ticket extraction, acceptance criteria | Prompts user to paste requirements or provide local file |
| **Atlassian (Confluence)** | Spec pages, business rules, user journeys | Skips source, documents gap, continues with others |
| **Figma** | UI element extraction, selector enrichment | Falls back to codebase grep for `data-testid` and `aria-label` |
| **Playwright CLI** | Live DOM verification, selector testing | Skips verification; install `@playwright/test` as dev dependency for full coverage |
| **TestRail** | Direct API export of test cases | Falls back to XML generation with import instructions |
| **Qase** | Direct API export of test cases | Falls back to local file generation with import instructions |

If all MCP servers are unavailable, SparQ still works with local files and user-provided text.

## Context Window Limits

- **Large requirement sets** -- split across multiple runs. Jira epics with 20+ sub-tasks should be batched by related tickets.
- **Max test cases per run** -- auto-batched at ~30 cases (manual) or ~60 cases (automation). Beyond these thresholds, SparQ splits generation into sequential batches to maintain quality.
- **Large Figma files** -- provide specific frame URLs with `?node-id=1:234` instead of whole file links.
- **Long Confluence pages** -- provide specific page URLs rather than relying on search.

## Framework Support

**Auto-detected frameworks:** Vue, React, Angular, Svelte -- detected from `package.json` during `npx sparq-assistant init`.

**Auto-detected UI libraries:** PrimeVue, Vuetify, Quasar, Element Plus, Naive UI, Ant Design Vue, Headless UI -- used for selector strategy adaptation.

**E2E code generation:**
- **Full support:** Playwright -- code generation for Scenarios 2, 3, 4, and 6 produces Playwright specs, page objects, and fixtures
- **Full support:** Cypress -- code generation for Scenarios 2, 3, 4, and 6 produces Cypress specs, page objects, and support files. Selector strategies and smoke verification adapt automatically.
- **Not supported:** Selenium, WebdriverIO -- not detected or generated

**Maturity note:** Code generation patterns are most mature for Vue + Playwright projects. Cypress support is fully functional but newer. React, Angular, and Svelte projects produce correct E2E code but may require more manual adjustment for framework-specific selector patterns.

## Concurrency

- **Single-user, single-session** -- SparQ is designed for one user running one session at a time within a single AI coding assistant session (Claude Code, Cursor, or Codex). Running multiple SparQ commands concurrently (e.g., in parallel terminals) may cause file conflicts in the `.sparq/` output directory.

## TMS Integration

### TestRail
- **XML import** supports only standard fields (title, steps, expected result, preconditions, priority, type, references). Custom fields must be populated manually.
- **Section nesting** limited to two levels: feature > category (e.g., "Login" > "Happy Path").
- **API rate limiting** may throttle when creating hundreds of test cases rapidly.
- **Re-export** creates new cases rather than updating previously exported ones.

### Qase
- **Custom fields** require manual configuration in Qase project settings before import.
- **Suite structure** mapped from SparQ categories; deeply nested hierarchies may flatten.
- **API rate limiting** may throttle when creating hundreds of test cases rapidly.
- **Re-export** creates new cases rather than updating previously exported ones.

### Local Folder Export
- **Format** exports as structured JSON and/or Markdown files to the configured output directory.
- **No sync** -- local exports are one-way snapshots, not kept in sync with source changes.

## Generated Code Quality

- **Always review before production use.** Generated tests are written directly to your project's `e2e/` directory. Use `git diff` to review changes before committing.
- **Selector accuracy** depends on sources. With Figma + codebase access, selectors are reliable. Without them, best-guess.
- **Test data strategy** requires human input at the clarification checkpoint (auth setup, API seeding, mock data).
- **Complex interactions** (drag-and-drop, file uploads, multi-step wizards) may need manual refinement.

## Figma Limitations

- **Cannot interact with prototypes** -- reads metadata, component names, and text only.
- **Component variants** may not map 1:1 to DOM selectors (e.g., "Button/Primary/Disabled" renders as one `<button>` with CSS classes).
- **Design token extraction** is best-effort; values may not match exact CSS implementation.
- **Auto-layout frames** may report positions differently than rendered HTML.

## Jira and Confluence

- **Access permissions** -- OAuth authenticates your personal account; you can only access what you have permission to view.
- **Complex Confluence hierarchies** -- deeply nested child pages are not traversed beyond the first level.
- **Acceptance criteria formats** -- parses Given/When/Then, numbered lists, checkbox lists, "should" statements. Unusual formats may be partially extracted.
- **Jira custom fields** beyond description and acceptance criteria are not extracted. Reference them in the description or provide as text.

## Known Constraints

- **Single project focus** -- one feature per run; no cross-project dependency analysis
- **English only** -- optimized for English; other languages may produce lower-quality output
- **No visual regression** -- generates functional tests only; use Playwright visual comparisons, Percy, or Chromatic
- **Performance testing guidance only** -- `/sparq:performance` provides consulting on k6, Artillery, Lighthouse CI, and Web Vitals, but does not generate or execute performance tests directly
- **UI framework selectors** -- auto-detected UI libraries (PrimeVue, Vuetify, Ant Design Vue, etc.) have tailored selector strategies; unrecognized libraries fall back to semantic selectors
- **CI workflow templates** -- `--ci-provider` generates starter workflows for GitHub Actions, GitLab CI, and Azure Pipelines, but does not integrate with CI beyond template generation
- **Regression tests** -- generates a single focused test per bug ticket; does not create comprehensive test suites from bug reports. Use Scenario 3 for full feature coverage.
- **Refactor scope** -- `/sparq:refactor` only modifies E2E test files (`e2e/`); does not update application source code, Playwright config, or `package.json`

## Agent Architecture

- **Startup cost** -- each sub-agent (requirements-analyst, manual-test-writer, automation-engineer, test-validator) loads its references, reads the execution plan, and performs project discovery before doing work. This is inherent to the stateless agent model and cannot be eliminated.
- **Sub-agents can't ask questions** -- agents dispatched via the Task tool cannot pause for user input. The orchestrator must provide complete, unambiguous instructions in the dispatch prompt. If context is missing, the agent documents gaps in its handoff rather than blocking.
- **Parallel phase restart** -- if one parallel Task agent fails and must be retried, it restarts from scratch (no incremental resume within a single phase). Successfully completed parallel tasks are preserved.

## Requirement Sync (Scenario 5)

- **Traceability requires registry** -- S5 works best when tests were generated by SparQ (S1/S3), which auto-registers them. For manually written or pre-existing tests, the first refresh falls back to coverage matrix → title matching → treating all requirements as NEW. After the first refresh, the test gets registered.
- **Content hashing is text-based** -- requirements hash compares extracted text content. Formatting-only changes (whitespace, bullet style) may trigger a false "stale" signal. SparQ detects this and reports "No functional changes detected" without modifying tests.
- **No auto-deletion** -- removed requirements are marked `// [REFRESH] DEPRECATED` but never automatically deleted. Manual cleanup is required.
- **Single-source diffing** -- S5 diffs against one requirement source at a time. Multi-ticket features should use the ticket that consolidates all acceptance criteria, or provide multiple tickets in the command.

## Workarounds

| Limitation | Workaround |
|------------|------------|
| Jira MCP unavailable | Paste ticket content: `/sparq:generate-manual "As a user, I want to..."` |
| Figma file too large | Use specific frame URL with `?node-id=` |
| Too many test cases | Split by feature area, one `/sparq:generate-manual` per user journey |
| TMS custom fields | Export XML/JSON, import, populate custom fields manually |
| Selectors inaccurate | Run `/sparq:sync` after moving tests to `e2e/` |
| Tests out of sync with requirements | Run `/sparq:sync EP-14 e2e/specs/auth/login.spec.ts` |
| Pre-existing tests not in registry | Run `/sparq:sync` once to register them |
| Non-English requirements | Translate key acceptance criteria or provide bilingual summary |
| Cross-project dependencies | Run SparQ per project, link test cases in TestRail manually |
| Visual regression needed | Generate functional tests, add `expect(page).toHaveScreenshot()` manually |
| S4 without MCP servers | S4 still runs ~60% of checks via codebase analysis; install Playwright as a dev dependency for full coverage |
| Cypress project | Set `e2e.framework: "cypress"` in config; all scenarios generate Cypress code |
| Bug needs regression test | `/sparq:generate-e2e BUG-142` — orchestrator auto-detects bug ticket, appends inline `REG-` test |
| Renamed component in codebase | `/sparq:refactor --from "OldName" --to "NewName" e2e/` |
