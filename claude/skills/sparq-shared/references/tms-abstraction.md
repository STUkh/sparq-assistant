# TMS Abstraction Reference

Provider-agnostic test management system interface. Referenced by: orchestrator, manual-test-writer, manual-to-e2e skill, export skill. For provider-specific details, see the corresponding format reference.

<tms_providers>
- `testrail`: MCP integration via `@bun913/mcp-testrail`. Config: `outputs.tms.testrail`. Details: `testrail-formats.md`
- `qase`: MCP integration via `@qase/mcp-server`. Config: `outputs.tms.qase`. Details: `qase-formats.md`
- `zephyr`: MCP integration via `mcp-zephyr-scale`. Config: `outputs.tms.zephyr`. Details: `zephyr-formats.md`
- `local`: File-based export, no MCP. Config: `outputs.tms.local`. Details: `local-tms-formats.md`
</tms_providers>

<provider_selection>
Read `outputs.tms.provider` from sparq.config.json:
- `"testrail"` -> use TestRail MCP tools, load `testrail-formats.md`
- `"qase"` -> use Qase MCP tools, load `qase-formats.md`
- `"zephyr"` -> use Zephyr Scale MCP tools, load `zephyr-formats.md`
- `"local"` -> write files directly, load `local-tms-formats.md`
- `null` or missing -> TMS export disabled, skip TMS steps
</provider_selection>

<priority_mapping>
Abstract priority -> provider-specific values:

- critical: TestCase.priority=1, TestRail priority_id=4, Qase severity=1, Zephyr priority="Critical"
- high: TestCase.priority=2, TestRail priority_id=3, Qase severity=2, Zephyr priority="High"
- medium: TestCase.priority=3, TestRail priority_id=2, Qase severity=3, Zephyr priority="Normal"
- low: TestCase.priority=4, TestRail priority_id=1, Qase severity=4, Zephyr priority="Low"

Local provider stores the abstract priority string directly (no numeric mapping).
Full Zephyr Scale priority mapping: `zephyr-formats.md` `<zephyr_priority_mapping>`.
</priority_mapping>

<type_mapping>
Abstract category -> provider-specific values:

- HP (happy_path): TestRail type_id=6 (Functional), Qase type=functional, Zephyr folder="Happy Path"
- VE (negative): TestRail type_id=5 (Destructive), Qase type=destructive, Zephyr folder="Validation Errors"
- SEC (security): TestRail type_id=9 (Security), Qase type=security, Zephyr folder="Security"
- EC (edge_case): TestRail type_id=4 (Compatibility), Qase type=other, Zephyr folder="Edge Cases"
- A11Y (accessibility): TestRail type_id=2 (Accessibility), Qase type=accessibility, Zephyr folder="Accessibility"

Local provider stores the canonical category abbreviation (HP, VE, SEC, EC, A11Y).
Zephyr Scale uses folder names (not type fields) for category grouping.
</type_mapping>

<export_workflow>
Generic TMS export workflow (all providers):

1. Load test cases from `.sparq/test-cases/TC-{feature}-manual.md`
2. Resolve provider from `outputs.tms.provider`
3. Load provider-specific format reference
4. Map categories to provider sections/suites (create missing ones)
5. Create/update test cases via provider API (MCP) or file write (local) — see `<update_workflow>` for classification algorithm
6. Report results with provider URL or file paths

If source test cases not found, prompt user or suggest `/sparq:generate-manual`.
</export_workflow>

<tms_id_convention>
After a successful CREATE export, the remote TMS ID is written back to the local test case file's YAML frontmatter as:

```yaml
tmsId: {provider}:{remoteId}
```

Examples:
- `tmsId: testrail:5001` — TestRail case ID 5001
- `tmsId: qase:301` — Qase case ID 301
- `tmsId: zephyr:TC-PROJ-42` — Zephyr Scale test case key

**Rules**:
- The `tmsId` field is optional on first export and mandatory-preferred on subsequent exports
- If a test case file has no `tmsId`, the export skill attempts title-prefix matching (`TC-{feature}-{ABBR}-{NNN}`) as fallback
- `tmsId` is written to the frontmatter block at the top of the markdown file; if no frontmatter exists, a new `---` block is prepended
- Only one `tmsId` value per file (per provider); a file exported to multiple providers gets one entry per export run (last-write wins if re-exported to same provider)
- When a file previously exported to provider A is re-exported to provider B, the `tmsId` value is overwritten with provider B's ID — one active provider per workflow run; frontmatter reflects the most recent export target
- The local provider never writes `tmsId` (no remote state to track)
</tms_id_convention>

<update_workflow>
CREATE/UPDATE/SKIP/REMOVE classification algorithm. Applied on every TMS export (TestRail and Qase; Zephyr Scale applies equivalent tool names).

**Step 1 — Fetch remote state**:
- TestRail: `mcp__testrail__get_cases` with project_id and suite_id
- Qase: `mcp__qase__list_cases` with project_code
- Zephyr Scale: `mcp__zephyr__get_test_cases` with project_key
- Build a lookup map: `remoteById` (id → case) and `remoteByTitle` (title prefix → case)

**Step 2 — Classify each local case**:
- Read the local test case file frontmatter for `tmsId`
- If `tmsId` present → look up `remoteById[remoteId]`:
  - Found, fields differ → **UPDATE**
  - Found, fields identical → **SKIP**
  - Not found (deleted remotely) → **CREATE** (write new, update tmsId)
- If `tmsId` absent → check `remoteByTitle` for title-prefix match (`TC-{feature}-{ABBR}-{NNN}`):
  - Match found → **UPDATE** (and write tmsId from matched remote ID)
  - No match → **CREATE**

**Step 3 — Classify orphaned remote cases** (exist remotely, no local match):
- Remote case not matched by any local `tmsId` or title-prefix → **REMOVE** (requires user approval)

**Step 4 — Execute**:
- CREATE: call provider `add_case` / `create_case` / `create_test_case` → on success, write `tmsId` to local file
- UPDATE: call provider `update_case` / `update_test_case` with changed fields only → no tmsId change needed
- SKIP: no API call
- REMOVE: present REMOVAL CHECKPOINT, wait for explicit approval (see `<removal_policy>`)

**Field change detection for UPDATE** (compare local parsed values against remote):
- title, priority, type/severity, preconditions, steps count, step actions/expected results
- If any field differs → UPDATE; if all match → SKIP

**MCP update tools**:
- TestRail: `mcp__testrail__update_case` (case_id, ...fields)
- Qase: `mcp__qase__update_case` (project_code, case_id, ...fields)
- Zephyr Scale: `mcp__zephyr__update_test_case` (project_key, test_case_key, ...fields)
</update_workflow>

<result_workflow>
Result publishing workflow — used by `/sparq:publish-results` after CI runs.

**Status mapping** (SparQ/Playwright → TMS):
- `passed` → PASS: TestRail status_id=1, Qase `passed`, Zephyr `PASS`
- `failed` / `timedOut` → FAIL: TestRail status_id=5, Qase `failed`, Zephyr `FAIL`
- `skipped` → NOT_EXECUTED: TestRail status_id=3, Qase `skipped`, Zephyr `NOT_EXECUTED`

**TC ID extraction**: apply regex `TC-[A-Za-z0-9-]+-[A-Z0-9]+-\d+` to each test title. Tests with no match group under "Untracked Tests".

**Run creation**:
- TestRail: `mcp__testrail__add_run(project_id, name, case_ids[])` — include only matched case IDs
- Qase: `mcp__qase__create_run(project_code, title)`
- Zephyr: `mcp__zephyr__create_test_cycle(project_key, name)`

**Result posting** (after run is created):
- TestRail: prefer `mcp__testrail__add_results_for_cases(run_id, results[])` for batch efficiency; fall back to `mcp__testrail__add_result_for_case` per case
- Qase: `mcp__qase__create_result(project_code, run_id, case_id, status, time_ms, comment?)` — loop per result (no batch API)
- Zephyr: `mcp__zephyr__add_test_result(project_key, test_cycle_key, test_case_key, status, comment?)`

**TC ID → TMS case ID resolution**: read `tmsId` frontmatter from `.sparq/test-cases/TC-{feature}-manual.md` files. If no `tmsId` mapping exists for a matched TC ID, skip that result and log as unresolved.

**Fallback**: when MCP unavailable, write `.sparq/results/{YYYY-MM-DD}-results.csv` with columns: TC ID, Test Title, Status, Duration (ms), Error Message.
</result_workflow>

<fallback_chain>
When TMS MCP unavailable (per `degradation-strategy.md`):
- TestRail: (L1) MCP tools -> (L2) `/sparq:testrail-api` direct REST via curl -> (L3) WebSearch docs if REST endpoints changed -> (L4) generate XML at `.sparq/test-cases/TC-{feature}-manual.xml` for manual import
- Qase: (L1) MCP tools -> (L2) `/sparq:qase-api` direct REST via curl -> (L3) WebSearch docs if endpoint changed -> (L4) generate JSON at `.sparq/tms-export/TC-{feature}-qase.json` for manual import
- Zephyr Scale: (L1) MCP tools -> (L2) direct REST (Server: `{ZEPHYR_BASE_URL}/rest/atm/1.0/testcase`; Cloud: `https://api.zephyrscale.smartbear.com/v2/testcases`; see `zephyr-sync.md`) -> (L3) WebSearch docs if endpoint changed -> (L4) generate JSON at `.sparq/tms-export/TC-{feature}-zephyr.json` for manual import
- Local: always succeeds (no MCP dependency)

Fallback file formats follow the provider-specific format reference. See `degradation-strategy.md` `<local_skill_fallback>` for full chain details.
</fallback_chain>

<read_workflow>
Generic TMS read workflow (TestRail and Qase only — local has no remote read):

1. Resolve provider: check `inputs.tms.provider`, fallback to `outputs.tms.provider`
2. Load provider-specific format reference for response parsing
3. Fetch sections/suites structure
4. Fetch test cases (optionally filtered by section/suite)
5. Normalize each case to SparQ TestCase format:
   - Reverse-map provider priority (see reverse mappings below)
   - Reverse-map provider type to test category (HP/VE/SEC/EC/A11Y)
   - Extract steps to TestStep[] format
   - Assign SparQ TC IDs: `TC-{feature}-{ABBR}-{NNN}`
   - Preserve TMS ID as metadata: `tmsId: {provider}:{id}`
6. Write normalized cases to `.sparq/test-cases/TC-{feature}-tms-import.md`

If TMS MCP unavailable, prompt user for file export (XML/JSON) per `degradation-strategy.md`.
</read_workflow>

<reverse_priority_mapping>
Provider values -> abstract priority:
- TestRail priority_id: 4->critical, 3->high, 2->medium, 1->low
- Qase severity: 1->critical, 2->high, 3->medium, 4+->low
- Zephyr priority string: "Critical"->critical, "High"->high, "Normal"->medium, "Low"->low, other->medium
</reverse_priority_mapping>

<reverse_type_mapping>
Provider values -> abstract category:
- TestRail type_id: 6 (Functional)->HP, 5 (Destructive)->VE, 9 (Security)->SEC, 4 (Compatibility)->EC, 2 (Accessibility)->A11Y, other->HP
- Qase type: functional->HP, destructive->VE, security->SEC, other->EC, accessibility->A11Y, unknown->HP
- Zephyr folder name: "Happy Path"->HP, "Validation Errors"->VE, "Security"->SEC, "Edge Cases"->EC, "Accessibility"->A11Y, other->HP
</reverse_type_mapping>

<tms_output_format>
When `outputs.tms.provider` is set, the manual-test-writer produces a secondary export file:
- `testrail` -> XML at `.sparq/test-cases/TC-{feature}-manual.xml` per `testrail-formats.md`
- `qase` -> JSON at `.sparq/tms-export/TC-{feature}-qase.json` per `qase-formats.md`
- `zephyr` -> JSON at `.sparq/tms-export/TC-{feature}-zephyr.json` per `zephyr-formats.md`
- `local` -> JSON at configured `outputs.tms.local.outputDir` per `local-tms-formats.md`
- `null` -> no secondary export file

Primary markdown output (`.sparq/test-cases/TC-{feature}-manual.md`) is always produced regardless of provider.
</tms_output_format>

<removal_policy>
Removal/deletion safeguard for TMS sync operations. Applies to all providers.

**Core principle**: ALWAYS ask user before removing test cases, whether local or remote.

**Scenarios requiring user approval**:
1. `/sparq:sync` REMOVED requirements -> tests targeted for deprecation/deletion
2. `/sparq:export` updating existing TMS -> remote cases not present locally
3. `/sparq:manual-to-e2e` converting -> if user requests cleanup of source manual tests
4. `/sparq:qase-api` or `/sparq:testrail-api` direct REST DELETE -> see destructive operations confirmation in respective skill

**Removal checkpoint format**:
```
[sparq] Removal detected: {N} items
  - {ID}: {title} — Recommended: {DEPRECATE|DELETE|SKIP}
Approve removals? (approve all / approve selectively / reject all)
```

**Non-interactive mode exceptions**:
- DEPRECATE (marking with comment): auto-approved when `preferences.interactiveMode: false`
- DELETE (permanent removal): NEVER auto-approved — always requires explicit user input
- Remote TMS deletion: NEVER auto-approved

**Config interaction**:
- `refresh.preserveDeprecated: true` -> default recommendation is DEPRECATE
- `refresh.preserveDeprecated: false` -> default recommendation is DELETE (still asks)
</removal_policy>
