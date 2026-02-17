# TMS Abstraction Reference

Provider-agnostic test management system interface. Referenced by: orchestrator, manual-test-writer, manual-to-e2e skill, export skill. For provider-specific details, see the corresponding format reference.

<tms_providers>
- `testrail`: MCP integration via `@bun913/mcp-testrail`. Config: `outputs.tms.testrail`. Details: `testrail-formats.md`
- `qase`: MCP integration via `@qase/mcp-server`. Config: `outputs.tms.qase`. Details: `qase-formats.md`
- `local`: File-based export, no MCP. Config: `outputs.tms.local`. Details: `local-tms-formats.md`
</tms_providers>

<provider_selection>
Read `outputs.tms.provider` from sparq.config.json:
- `"testrail"` -> use TestRail MCP tools, load `testrail-formats.md`
- `"qase"` -> use Qase MCP tools, load `qase-formats.md`
- `"local"` -> write files directly, load `local-tms-formats.md`
- `null` or missing -> TMS export disabled, skip TMS steps
</provider_selection>

<priority_mapping>
Abstract priority -> provider-specific values:

- critical: TestCase.priority=1, TestRail priority_id=4, Qase severity=1
- high: TestCase.priority=2, TestRail priority_id=3, Qase severity=2
- medium: TestCase.priority=3, TestRail priority_id=2, Qase severity=3
- low: TestCase.priority=4, TestRail priority_id=1, Qase severity=4

Local provider stores the abstract priority string directly (no numeric mapping).
</priority_mapping>

<type_mapping>
Abstract category -> provider-specific values:

- HP (happy_path): TestRail type_id=6 (Functional), Qase type=functional
- VE (negative): TestRail type_id=5 (Destructive), Qase type=destructive
- SEC (security): TestRail type_id=9 (Security), Qase type=security
- EC (edge_case): TestRail type_id=4 (Compatibility), Qase type=other
- A11Y (accessibility): TestRail type_id=2 (Accessibility), Qase type=accessibility

Local provider stores the canonical category abbreviation (HP, VE, SEC, EC, A11Y).
</type_mapping>

<export_workflow>
Generic TMS export workflow (all providers):

1. Load test cases from `.sparq/test-cases/TC-{feature}-manual.md`
2. Resolve provider from `outputs.tms.provider`
3. Load provider-specific format reference
4. Map categories to provider sections/suites (create missing ones)
5. Create/update test cases via provider API (MCP) or file write (local)
6. Report results with provider URL or file paths

If source test cases not found, prompt user or suggest `/sparq:generate-manual`.
</export_workflow>

<fallback_chain>
When TMS MCP unavailable (per `degradation-strategy.md`):
- TestRail: generate XML at `.sparq/test-cases/TC-{feature}-manual.xml` for manual import
- Qase: generate JSON at `.sparq/tms-export/TC-{feature}-qase.json` for manual import
- Local: always succeeds (no MCP dependency)

Fallback file formats follow the provider-specific format reference.
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
</reverse_priority_mapping>

<reverse_type_mapping>
Provider values -> abstract category:
- TestRail type_id: 6 (Functional)->HP, 5 (Destructive)->VE, 9 (Security)->SEC, 4 (Compatibility)->EC, 2 (Accessibility)->A11Y, other->HP
- Qase type: functional->HP, destructive->VE, security->SEC, other->EC, accessibility->A11Y, unknown->HP
</reverse_type_mapping>

<tms_output_format>
When `outputs.tms.provider` is set, the manual-test-writer produces a secondary export file:
- `testrail` -> XML at `.sparq/test-cases/TC-{feature}-manual.xml` per `testrail-formats.md`
- `qase` -> JSON at `.sparq/tms-export/TC-{feature}-qase.json` per `qase-formats.md`
- `local` -> JSON at configured `outputs.tms.local.outputDir` per `local-tms-formats.md`
- `null` -> no secondary export file

Primary markdown output (`.sparq/test-cases/TC-{feature}-manual.md`) is always produced regardless of provider.
</tms_output_format>
