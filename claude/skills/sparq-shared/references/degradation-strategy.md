# MCP Degradation Strategy

Single source of truth for fallback behaviors when MCP servers or external services are unavailable. Referenced by: all agents and skills.

## Three-Layer Resilience Model

<resilience_layers>
1. **Retry** (transient errors): exponential backoff per retry rules below
2. **Fallback** (persistent errors): per-source fallback behavior below
3. **Local Skill / Web Docs** (API-level fallback): when MCP and file export both inadequate, use direct REST API skills or live web documentation
Apply in order: retry -> if exhausted, fallback -> if inadequate, local skill / web docs.
</resilience_layers>

## Per-Source Fallback

<source_fallbacks>
- **Jira** (`mcp__atlassian__jira_*`): ask user for manual reqs (text input or file path), pause workflow
- **Confluence** (`mcp__atlassian__confluence_*`): skip enrichment, note gap in output, continue
- **Figma** (`mcp__figma__*`): grep `{sourceRoot}/**/*.{ext}` (per `project.componentFileExtensions`) for `data-testid`, labels, ARIA, continue
- **TMS write** (`mcp__testrail__add_*`, `mcp__qase__create_*`): per provider —
  - Qase: (L1) MCP tools -> (L2) `/sparq:qase-api` local skill (direct REST via curl) -> (L3) WebSearch Qase developer docs if REST endpoints changed -> (L4) generate JSON at `.sparq/tms-export/TC-{feature}-qase.json`
  - TestRail: (L1) MCP tools -> (L2) `/sparq:testrail-api` local skill (direct REST via curl) -> (L3) WebSearch TestRail docs if REST endpoints changed -> (L4) generate XML at `.sparq/test-cases/TC-{feature}-manual.xml`
  - Zephyr: (L1) MCP tools -> (L2) direct REST `POST /rest/atm/1.0/testcase` (ZEPHYR_BASE_URL + ZEPHYR_API_TOKEN; see `zephyr-sync.md` for Cloud v2 path) -> (L3) WebSearch Zephyr Scale developer docs if REST endpoints changed -> (L4) generate JSON at `.sparq/tms-export/TC-{feature}-zephyr.json`
  - Local: always succeeds
- **TMS read** (`mcp__testrail__get_*`, `mcp__qase__list_*`/`get_*`): per provider —
  - Qase: (L1) MCP tools -> (L2) `/sparq:qase-api` local skill -> (L3) prompt user for file-based import (Qase JSON)
  - TestRail: (L1) MCP tools -> (L2) `/sparq:testrail-api` local skill -> (L3) prompt user for file-based import (TestRail XML/CSV)
  - Zephyr: (L1) MCP tools -> (L2) direct REST `GET /rest/atm/1.0/testcase/search?query=projectKey="{projectKey}"` (Server; Cloud v2: `GET /testcases?projectKey=`; see `zephyr-sync.md`) -> (L3) prompt user for file-based import (Zephyr Scale JSON)
  Pause workflow until user provides file (when file-based import is the final fallback).
- **Playwright MCP** (`mcp__playwright__*`): skip browser verification, user runs `npx playwright test` manually, continue
</source_fallbacks>

## Codebase Content Fallbacks

<codebase_fallbacks>
When codebase readiness assessment (per `codebase-readiness.md`) finds insufficient content:

- **No `data-testid`**: fall back to semantic locators (`getByRole`, `getByLabel`, `getByText`). If also absent: `getByTestId('TODO-{element}')` placeholders with `// PLACEHOLDER` comments
- **No routes**: generate tests with hardcoded URL paths from requirements. Mark `confidence: low`
- **No components matching requirements**: generate page objects from requirement UI element descriptions. All locators are placeholders
- **Empty source root**: requirements + Figma (if available) as sole selector sources. Full placeholder mode. Report `[SRC-CB]` gaps
</codebase_fallbacks>

## Retry Rules

<retry_rules>
- **Transient** (429, 500-504, timeout): exponential backoff 2s/4s/8s, max 3 retries
- **Auth** (401, 403): retry once after user re-auth prompt, then fallback, max 1 retry
- **Client** (400, 404, 422): no retry, immediate fallback
- **Parse** (invalid JSON, empty body): retry once (may be transient), then fallback, max 1 retry
</retry_rules>

## Timeouts

<timeouts>
Per-request timeouts (agents track via retry count as proxy for elapsed time):
- Jira: 30s per request (single ticket or JQL search)
- Confluence: 30s per request (single page fetch)
- Figma: 30s per request (60s for large files with many frames)
- TestRail: 15s per request (faster API, smaller payloads)
- Qase: 15s per request (API-based TMS, similar payload size)
- Zephyr Scale: 15s per request (REST-based TMS, similar payload size)
- Playwright MCP: 30s per request (browser operations)

Phase budgets:
- **Phase 1 (Requirements)**: 2 minutes total across all sources. If budget exceeded, proceed with available results.
- **Phase 2 (Generation)**: No hard budget — generation is compute-bound, not network-bound.
- **Phase 3 (Verification)**: 1 minute for smoke check (`npx playwright test --list` or `npx tsc --noEmit`). If exceeded, report as Warning.

What "tracking elapsed time" means for agents: Agents cannot measure wall-clock time literally. Instead, count MCP call attempts per source. If a source required retries (indicating slowness or instability), treat remaining calls to that source with shorter retry budgets. After 3+ retries to any source, switch to fallback for all remaining calls to that source.
</timeouts>

## Gap Reporting

All fallbacks MUST be logged in the execution plan and output documents.

**In `execution-plan.md`** under `## Gaps`:

```markdown
- [SRC-J] Jira unavailable: Connection refused. Fallback: user-provided text input.
- [SRC-C] Confluence unavailable: 401 Unauthorized. Fallback: skipped, requirements may be incomplete.
- [SRC-F] Figma unavailable: timeout after 30s. Fallback: codebase grep for selectors.
```

**Source labels**: SRC-J (Jira), SRC-C (Confluence), SRC-F (Figma), SRC-L (Local)

**In output files**:

```markdown
> **Note**: Generated without {Source} data. {Gap description}. Re-run with `/sparq:analyze` when {Source} is available.
```

## Response Budget

<response_budget>
MCP responses can vary from 500 to 50,000+ words. To prevent context exhaustion:
- Extract only requirement-relevant content from MCP responses
- Per-source budget: ~5,000 words of usable content
- If response exceeds budget: extract structured fields only, discard metadata and history
- Log: `[sparq] {phase} Warning: {source} response truncated from {N} to {budget} words`
</response_budget>

## Decision Flow

```
MCP call fails
  -> Identify error type (transient / auth / client / parse)
  -> Apply retry rules
  -> If all retries exhausted:
     -> Log gap with source label
     -> Apply per-source fallback
     -> Continue pipeline (never block entirely unless primary source for user input)
  -> If primary source fails (source matching user input):
     -> Prompt user for alternative input (text/file)
```

## Skill-Specific Fallbacks

<skill_fallbacks>
- **sparq:analyze**: if primary source fails, prompt user for text; secondary sources degrade gracefully
- **sparq:generate-manual**: requires `.sparq/requirements/REQ-{feature}.md`; if missing, run `/sparq:analyze` first; no MCP dependency in generation
- **sparq:manual-to-e2e**: without Figma, use codebase selectors; without Playwright MCP, skip verification; without TMS MCP (when TMS read requested): (1) try `/sparq:qase-api` for Qase or `/sparq:testrail-api` for TestRail, (2) prompt user for file export (TestRail XML/CSV or Qase JSON)
- **sparq:generate-e2e**: combines analyze + manual-to-e2e fallbacks
- **sparq:sync** (UI drift): codebase validation always works; MCP sources add enrichment only
- **sparq:sync** (requirements): without test registry, falls back to coverage matrix then title matching (see `refresh-patterns.md`); without requirement source, same as sparq:analyze fallback; without Playwright MCP, skip smoke verification
- **sparq:export**: per-target fallbacks:
  - TMS: per provider — TestRail: (1) try `/sparq:testrail-api` direct REST, (2) if fails, generate XML at `.sparq/test-cases/TC-{feature}-manual.xml` for manual import; Qase: (1) try `/sparq:qase-api` direct REST, (2) if fails, generate JSON at `.sparq/tms-export/TC-{feature}-qase.json`; Zephyr: (1) direct REST at `{ZEPHYR_BASE_URL}/rest/atm/1.0/testcase` (see `zephyr-sync.md` for Cloud v2 path), (2) if fails, generate JSON at `.sparq/tms-export/TC-{feature}-zephyr.json`; Local: always succeeds
  - Jira: write coverage summary to `.sparq/coverage/{feature}-jira-comment.md` for manual posting
  - Confluence: write markdown to `.sparq/test-cases/TC-{feature}-confluence.md` for manual page creation
</skill_fallbacks>

## Local Skill API Fallback (Layer 2)

<local_skill_fallback>
When MCP tools for a TMS provider fail and a corresponding local API skill exists, the fallback chain attempts direct REST API calls before falling back to file export.

**Available local API skills**:
- Qase: `/sparq:qase-api` — direct REST API v1 via curl/Bash. Requires `$QASE_API_TOKEN` env variable.
- TestRail: `/sparq:testrail-api` — direct REST API v2 via curl/Bash. Requires `$TESTRAIL_BASE_URL`, `$TESTRAIL_USERNAME`, `$TESTRAIL_API_KEY` env variables.

**Activation criteria**:
- MCP tool call returned error (any category after retry exhaustion)
- Local API skill exists for the provider
- API credentials are set (`$QASE_API_TOKEN` for Qase; `$TESTRAIL_BASE_URL` + `$TESTRAIL_USERNAME` + `$TESTRAIL_API_KEY` for TestRail)

**If local skill also fails**:
- 404/422 errors: invoke Web Docs Fallback (search `developers.qase.io` for Qase or `support.testrail.com` for TestRail)
- Auth errors (401/403): stop, report credential issue to user
- Other errors: fall through to file export fallback (final layer)

**Web Docs Fallback (Layer 3)**:
When local skill REST calls return 404 or 422 suggesting endpoint changes:
1. `WebSearch "qase api {endpoint-name} site:developers.qase.io"` (or `site:support.testrail.com` for TestRail)
2. `WebFetch` the relevant docs page, extract updated path/method/body
3. Retry the REST call with corrected endpoint
4. Log: `[sparq] TMS Fallback: REST endpoint resolved from web docs`
5. If web lookup also fails: fall through to file export

Signal format: `[sparq] {phase} TMS fallback: MCP unavailable, using /sparq:{provider}-api direct REST`
</local_skill_fallback>

## Removal Safeguard Fallback

<removal_safeguard>
When a sync or export operation detects items for removal but cannot verify remote state (MCP unavailable):
- Default action: SKIP all removals
- Log: `[sparq] Warning: Cannot verify remote TMS state — skipping removals. Re-run when {Provider} is available to reconcile.`
- Write reconciliation report to `.sparq/sync/pending-removals-{feature}.md` listing items that need reconciliation
- On next successful MCP connection, remind user about pending reconciliation

Removal actions are NEVER performed when remote state cannot be verified. This prevents accidental data loss during degraded operation.
</removal_safeguard>

## Parallel Execution Degradation

Generic parallel degradation (Task unavailable, partial completion, slow tasks): see `parallel-execution.md` section "Graceful Degradation".

**S5-specific**: Phase 1 dual gathering (test-validator + requirements-analyst). If one fails: retry once sequentially. If retry fails: traceability without requirements = hash comparison only; requirements without traceability = treat all as NEW.

## S4 Validation Capability Matrix

<s4_capability_matrix>
What S4 (Sync — UI drift) can check with and without MCP servers:

- **Selector validity**: without MCP = codebase grep for `data-testid`/ARIA; +Playwright = live DOM verification; +Figma = design-to-code comparison
- **Flow correctness**: without MCP = static route/form analysis; +Playwright = browser execution; +Figma = UI vs design flow
- **Text/label drift**: without MCP = codebase string matching; +Playwright = live rendered text; +Figma = design vs live text
- **Coverage gaps**: requirement-to-test mapping (static) — same with/without MCP
- **Data freshness**: test data pattern analysis (code-level) — same with/without MCP
- **Flakiness**: without MCP = static anti-pattern detection; +Playwright = runtime detection; Figma = N/A

**Without any MCP**: ~60% validation depth (codebase grep + static route analysis + requirement mapping). No live DOM or design comparison.

**Recommendation**: For full S4 value, configure at minimum the Playwright MCP (local, no credentials needed). Figma MCP adds design-to-code drift detection.
</s4_capability_matrix>

## State File Persistence Degradation

<state_degradation>
If `.sparq/state/` cannot be created or written (permissions, disk full):
- Warn: "State persistence degraded. Resume may not work."
- Fall back to `execution-plan.md`-only state tracking (legacy mode, phase-granularity resume only)
- Workflow continues normally — state write failure does NOT halt the pipeline
- See `resume-protocol.md` `<edge_cases>` for full details
</state_degradation>

## Init Skill Fallback

**sparq:init**: If MCP server verification fails during init (e.g., servers not installed or network unavailable), warn the user and continue with manual configuration. MCP entries are still written to `.mcp.json` with placeholder credentials -- user can configure them later. For offline environments, see degradation fallback rules above.
