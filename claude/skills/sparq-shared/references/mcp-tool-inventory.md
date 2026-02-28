# MCP Tool Inventory

Master inventory of all MCP tools across all configured servers. Each tool is marked as **Verified** (confirmed via ToolSearch in live environment) or **Convention-based** (name inferred from package API documentation).

## Verification

To check tool availability at runtime, use `ToolSearch`:
```
ToolSearch({ query: "+atlassian jira" })    // Find Atlassian Jira tools
ToolSearch({ query: "+figma screenshot" })   // Find Figma tools
ToolSearch({ query: "+testrail case" })      // Find TestRail tools
ToolSearch({ query: "+qase suite" })         // Find Qase tools
ToolSearch({ query: "+playwright click" })   // Find Playwright tools
```

If a tool name fails, the server key in `.mcp.json` may differ. Check `.mcp.json` for the actual key and adjust the `mcp__{key}__` prefix.

---

## Atlassian (Jira + Confluence)

**Server**: `atlassian` | **Type**: HTTP | **URL**: `https://mcp.atlassian.com/v1/mcp`
**Config**: `mcp/atlassian.json`
**Status**: Convention-based (names from Atlassian MCP API documentation)

### Jira Tools

<jira_tools>
- `mcp__atlassian__jira_get_issue` (issueKey: string): Fetch single issue with all fields. Used by: sparq-analyze
- `mcp__atlassian__jira_search_using_jql` (jql: string, limit?: number): Search issues via JQL query. Used by: sparq-analyze
- `mcp__atlassian__jira_create_issue` (project: string, summary: string, type: string, ...): Create a new Jira issue. Used by: sparq-export
- `mcp__atlassian__jira_update_issue` (issueKey: string, fields: object): Update issue fields. Used by: sparq-export
</jira_tools>

**Reference**: `jira-patterns.md`

### Confluence Tools

<confluence_tools>
- `mcp__atlassian__confluence_search_using_cql` (cql: string, limit?: number): Search pages via CQL query. Used by: sparq-analyze
- `mcp__atlassian__confluence_get_page` (pageId: string): Fetch single page with full content. Used by: sparq-analyze
- `mcp__atlassian__confluence_get_page_descendants` (pageId: string, depth?: string): Get child pages under a parent. Used by: sparq-analyze
- `mcp__atlassian__confluence_create_page` (spaceKey: string, title: string, body: string, ...): Create a new Confluence page. Used by: sparq-export
- `mcp__atlassian__confluence_update_page` (pageId: string, title: string, body: string, version: number): Update an existing page. Used by: sparq-export
</confluence_tools>

**Reference**: `confluence-patterns.md`

---

## Figma

**Server**: `figma` | **Type**: HTTP | **URL**: `https://mcp.figma.com/mcp`
**Config**: `mcp/figma.json`
**Status**: Verified (all tools confirmed via ToolSearch)

<figma_tools>
- `mcp__figma__get_screenshot` (figma_url: string): Capture visual screenshot of frame/component. Used by: sparq-analyze, visual-design-architect
- `mcp__figma__get_design_context` (figma_url: string): Get component tree with hierarchy and layout. Used by: sparq-analyze, visual-design-architect
- `mcp__figma__get_metadata` (figma_url: string): Get component properties, variants, styles. Used by: sparq-analyze, visual-design-architect
- `mcp__figma__get_variable_defs` (figma_url: string): Retrieve design token variable definitions. Used by: visual-design-architect
- `mcp__figma__get_code_connect_map` (figma_url: string): Get Code Connect component-to-code mappings. Used by: visual-design-architect
- `mcp__figma__get_figjam` (figma_url: string): Retrieve FigJam board content. Used by: sparq-analyze
- `mcp__figma__generate_diagram` (figma_url: string, diagram: string): Generate a diagram in FigJam. Used by: sparq-export
- `mcp__figma__create_design_system_rules` (figma_url: string): Create/update design system rules. Used by: visual-design-architect
- `mcp__figma__whoami` (none): Check authenticated user identity. Used by: (diagnostic)
- `mcp__figma__add_code_connect_map` (figma_url: string, component: string, code_path: string): Add a Code Connect mapping entry. Used by: visual-design-architect
- `mcp__figma__get_code_connect_suggestions` (figma_url: string): Get suggested Code Connect mappings. Used by: visual-design-architect
- `mcp__figma__send_code_connect_mappings` (figma_url: string, mappings: array): Push finalized Code Connect mappings. Used by: visual-design-architect
</figma_tools>

**Reference**: `figma-patterns.md`

---

## TestRail

**Server**: `testrail` | **Type**: stdio | **Package**: `@bun913/mcp-testrail@0.17.2`
**Config**: `mcp/testrail.json`
**Status**: Convention-based (names from @bun913/mcp-testrail package API)

<testrail_tools>
- `mcp__testrail__get_sections` (project_id: number): List all sections in a project/suite. Used by: sparq-export, sparq-manual-to-e2e
- `mcp__testrail__add_section` (project_id: number, name: string, description?: string, parent_id?: number): Create a new section. Used by: sparq-export
- `mcp__testrail__get_cases` (project_id: number, section_id?: number): List test cases, optionally filtered by section. Used by: sparq-export, sparq-sync, sparq-manual-to-e2e
- `mcp__testrail__get_case` (case_id: number): Fetch a single test case by ID. Used by: sparq-sync, sparq-manual-to-e2e
- `mcp__testrail__add_case` (section_id: number, title: string, type_id?: number, priority_id?: number, ...): Create a new test case. Used by: sparq-export
- `mcp__testrail__update_case` (case_id: number, ...fields): Update an existing test case. Used by: sparq-export
- `mcp__testrail__add_run` (project_id: number, name: string, case_ids?: number[]): Create a new test run. Used by: sparq-export, sparq-publish-results
- `mcp__testrail__add_results_for_cases` (run_id: number, results: Array<{case_id, status_id, comment?}>): Batch-add results for multiple cases in one call. Used by: sparq-publish-results
- `mcp__testrail__add_result_for_case` (run_id: number, case_id: number, status_id: number, comment?: string): Add a single test result for a case in a run. Used by: sparq-export, sparq-publish-results
</testrail_tools>

**Reference**: `testrail-formats.md`

---

## Qase

**Server**: `qase` | **Type**: stdio | **Package**: `@qase/mcp-server`
**Config**: `mcp/qase.json`
**Status**: Convention-based

<qase_tools>
- `mcp__qase__list_suites` (project_code): List suites. Used by: sparq-export, sparq-manual-to-e2e
- `mcp__qase__create_suite` (project_code, title, ...): Create suite. Used by: sparq-export
- `mcp__qase__list_cases` (project_code, suite_id?): List cases. Used by: sparq-export, sparq-sync, sparq-manual-to-e2e
- `mcp__qase__get_case` (project_code, case_id): Get case. Used by: sparq-sync, sparq-manual-to-e2e
- `mcp__qase__create_case` (project_code, title, ...): Create case. Used by: sparq-export
- `mcp__qase__update_case` (project_code, case_id, ...): Update case. Used by: sparq-export
- `mcp__qase__bulk_create_cases` (project_code, cases[]): Batch create. Used by: sparq-export
- `mcp__qase__create_run` (project_code, title, ...): Create run. Used by: sparq-export, sparq-publish-results
- `mcp__qase__create_result` (project_code, run_id, case_id, status, time_ms?, comment?): Add result per test case. Used by: sparq-export, sparq-publish-results
</qase_tools>

**Reference**: `qase-formats.md`

---

## Zephyr Scale

**Server**: `zephyr` | **Type**: stdio | **Package**: `mcp-zephyr-scale`
**Config**: `mcp/zephyr.json`
**Status**: Verified (env vars confirmed from `src/index.ts` `validateEnvironment()` in v0.3.4)
**Required env (MCP process)**: `ZEPHYR_API_TOKEN`, `JIRA_PROJECT_KEY` (mapped from user's `ZEPHYR_PROJECT_KEY`)
**Required env (shell, L2 REST fallback)**: `ZEPHYR_BASE_URL`, `ZEPHYR_API_TOKEN`, `ZEPHYR_PROJECT_KEY`

<zephyr_tools>
- `mcp__zephyr__get_test_cases` (projectKey: string, folderId?: string): List test cases in a project or folder. Used by: sparq-export, sparq-manual-to-e2e
- `mcp__zephyr__get_test_case` (testCaseKey: string): Fetch a single test case by key (e.g., "PROJ-T1"). Used by: sparq-sync, sparq-manual-to-e2e
- `mcp__zephyr__create_test_case` (projectKey: string, name: string, status?: string, priority?: string, ...): Create a new test case. Used by: sparq-export
- `mcp__zephyr__update_test_case` (testCaseKey: string, ...fields): Update an existing test case. Used by: sparq-export
- `mcp__zephyr__get_folders` (projectKey: string): List folders in a project for test organization. Used by: sparq-export
- `mcp__zephyr__create_test_cycle` (projectKey: string, name: string, description?: string): Create a new test cycle (run). Used by: sparq-publish-results
- `mcp__zephyr__create_test_execution` (testCycleKey: string, testCaseKey: string, statusName: string, comment?: string): Add execution result for a test case. Used by: sparq-publish-results
</zephyr_tools>

**Reference**: `zephyr-formats.md`

---

## Playwright

**Server**: `playwright` | **Type**: stdio | **Package**: `@playwright/mcp@latest`
**Config**: `mcp/playwright.json`
**Status**: Verified (all 22 tools confirmed via ToolSearch)

### Navigation (3 tools)

<playwright_navigation>
- `mcp__playwright__browser_navigate` (url: string): Navigate to a URL. Used by: sparq-sync, qa-e2e-playwright
- `mcp__playwright__browser_navigate_back` (none): Navigate back in history. Used by: qa-e2e-playwright
- `mcp__playwright__browser_tabs` (none): List open browser tabs. Used by: qa-e2e-playwright
</playwright_navigation>

### Interaction (9 tools)

<playwright_interaction>
- `mcp__playwright__browser_click` (element: string, ref: string): Click an element. Used by: sparq-sync, qa-e2e-playwright
- `mcp__playwright__browser_hover` (element: string, ref: string): Hover over an element. Used by: qa-e2e-playwright
- `mcp__playwright__browser_drag` (startElement, startRef, endElement, endRef): Drag element to target. Used by: qa-e2e-playwright
- `mcp__playwright__browser_type` (text: string, element?: string, ref?: string): Type text into element. Used by: sparq-sync, qa-e2e-playwright
- `mcp__playwright__browser_press_key` (key: string): Press a keyboard key. Used by: qa-e2e-playwright
- `mcp__playwright__browser_select_option` (element: string, ref: string, values: string[]): Select dropdown option. Used by: sparq-sync, qa-e2e-playwright
- `mcp__playwright__browser_fill_form` (values: array): Fill multiple form fields. Used by: sparq-sync, qa-e2e-playwright
- `mcp__playwright__browser_file_upload` (paths: string[], ref: string): Upload file to input. Used by: qa-e2e-playwright
- `mcp__playwright__browser_handle_dialog` (accept: boolean, promptText?: string): Handle browser dialog. Used by: qa-e2e-playwright
</playwright_interaction>

### Inspection (5 tools)

<playwright_inspection>
- `mcp__playwright__browser_snapshot` (none): Accessibility snapshot with element refs. Used by: sparq-analyze, sparq-sync, qa-e2e-playwright
- `mcp__playwright__browser_take_screenshot` (none): Capture visual screenshot. Used by: sparq-analyze, visual-design-architect
- `mcp__playwright__browser_console_messages` (none): Retrieve console messages. Used by: sparq-generate-e2e, qa-e2e-playwright
- `mcp__playwright__browser_network_requests` (none): List network requests. Used by: sparq-generate-e2e, qa-e2e-playwright
- `mcp__playwright__browser_evaluate` (expression: string): Execute JS in browser. Used by: qa-e2e-playwright
</playwright_inspection>

### Utility (5 tools)

<playwright_utility>
- `mcp__playwright__browser_install` (none): Install browser binaries. Used by: (setup)
- `mcp__playwright__browser_resize` (width: number, height: number): Resize browser viewport. Used by: visual-design-architect, qa-e2e-playwright
- `mcp__playwright__browser_close` (none): Close browser tab/browser. Used by: qa-e2e-playwright
- `mcp__playwright__browser_wait_for` (event: string, timeout?: number): Wait for condition. Used by: sparq-sync, qa-e2e-playwright
- `mcp__playwright__browser_run_code` (code: string): Execute Playwright code snippet. Used by: qa-e2e-playwright
</playwright_utility>

**Reference**: `playwright-mcp-tools.md`

---

## SparQ Agent Subset

<sparq_subset>
The ~18 MCP tools SparQ agents routinely use (out of 68 total):

**Atlassian — Jira**: `jira_get_issue`, `jira_search_using_jql`
**Atlassian — Confluence**: `confluence_get_page`, `confluence_search_using_cql`, `confluence_get_page_descendants`
**Figma**: `get_design_context`, `get_screenshot`, `get_metadata`
**Playwright**: `browser_navigate`, `browser_snapshot`, `browser_click`, `browser_type`, `browser_evaluate`
**TestRail**: `get_cases`, `add_case`, `get_sections`
**Qase**: `list_cases`, `create_case`, `list_suites`
**Zephyr Scale**: `get_test_cases`, `create_test_case` (export/publish-results only)

All other tools are available for export, diagnostics, or advanced workflows but are not part of the core agent pipeline.
</sparq_subset>

## Summary

<tool_summary>
- Atlassian (Jira): 4 tools, Convention-based, N/A (HTTP)
- Atlassian (Confluence): 5 tools, Convention-based, N/A (HTTP)
- Figma: 12 tools, Verified, N/A (HTTP)
- TestRail: 9 tools, Convention-based, `@bun913/mcp-testrail`
- Qase: 9 tools, Convention-based, `@qase/mcp-server`
- Zephyr Scale: 7 tools, Verified, `mcp-zephyr-scale`
- Playwright: 22 tools, Verified, `@playwright/mcp@latest`
- **Total: 68 tools**
</tool_summary>
