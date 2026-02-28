# TestRail Formats Reference

For provider-agnostic priority/type mapping, see `tms-abstraction.md`. This file covers TestRail-specific XML format and MCP tool patterns.

## XML Import Format

Root element `<sections>` containing nested `<section>` elements with `<cases>`. Nested sub-sections supported.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<sections>
  <section>
    <name>Authentication</name>
    <description>Test cases for user authentication flows</description>
    <cases>
      <case>
        <title>TC-login-HP-001: Verify successful login with valid credentials</title>
        <template>Test Case (Steps)</template>
        <type>Functional</type>
        <priority>High</priority>
        <estimate>5m</estimate>
        <references>{PROJECT_KEY}-14</references>
        <custom>
          <preconds>1. User has valid credentials\n2. User is not logged in</preconds>
          <steps_separated>
            <step><index>1</index><content>Navigate to login</content><expected>Login form displayed</expected></step>
            <!-- additional steps follow same pattern -->
          </steps_separated>
          <postconditions>User session is active</postconditions>
        </custom>
      </case>
      <!-- additional cases follow same structure -->
    </cases>
    <sections><!-- nested sub-sections supported --></sections>
  </section>
</sections>
```

**XML Field Reference**:
- `<title>` (required): Include TC ID prefix, max 250 chars
- `<template>`: "Test Case (Steps)" for step-based, "Test Case (Text)" for text-based
- `<type>`: Test type name (see type mapping)
- `<priority>`: "Critical", "High", "Medium", "Low"
- `<estimate>`: "5m", "15m", "1h"
- `<references>`: Comma-separated Jira issue keys
- `<preconds>`: Preconditions text (within `<custom>`), numbered list plain text
- `<postconditions>`: Postconditions text (within `<custom>`), numbered list plain text
- `<steps_separated>`: Steps within `<custom>`, index starts at 1, sequential

**XML Rules**: Escape `&`->`&amp;`, `<`->`&lt;`, `>`->`&gt;`. Use CDATA for content with special chars: `<![CDATA[...]]>`

## MCP API Patterns

**mcp__testrail__get_sections** -- List all sections in a project/suite.
```
Parameters: { project_id: 1 }
```

**mcp__testrail__add_section** -- Create a new section.
```
Parameters: { project_id: 1, name: "Authentication", description: "...", parent_id: null }
```

**mcp__testrail__get_cases** -- List test cases in a project, optionally filtered by section.
```
Parameters: { project_id: 1, section_id: 101 }
```

**mcp__testrail__get_case** -- Fetch a single test case by ID.
```
Parameters: { case_id: 5001 }
```

**mcp__testrail__add_case** -- Create a new test case in a section.
```
Parameters: {
  section_id: 101, title: "TC-login-HP-001: Verify successful login",
  // TestCase.priority 2 (High) -> TestRail priority_id 3
  type_id: 6, priority_id: 3, estimate: "5m", refs: "{PROJECT_KEY}-14",
  custom_preconds: "User has valid credentials",
  custom_steps_separated: [
    { content: "Navigate to login page", expected: "Login form displayed" },
    { content: "Enter valid credentials", expected: "Fields accept input" },
    { content: "Click Sign In", expected: "Redirected to dashboard" }
  ]
}
```

**mcp__testrail__update_case** -- Update an existing test case.
```
Parameters: { case_id: 5001, title: "TC-login-HP-001: Updated title", priority_id: 3 }
```

**mcp__testrail__add_run** -- Create a new test run.
```
Parameters: { project_id: 1, name: "Sprint 5 Regression", include_all: false, case_ids: [5001, 5002, 5003] }
```

**mcp__testrail__add_result_for_case** -- Add a test result for a specific case in a run.
```
Parameters: { run_id: 10, case_id: 5001, status_id: 1, comment: "Passed in CI" }
```

## MCP Read Response Format

**mcp__testrail__get_cases response** (per case):
```json
{
  "id": 5001,
  "title": "TC-login-HP-001: Verify successful login with valid credentials",
  "section_id": 101,
  "type_id": 6,
  "priority_id": 3,
  "estimate": "5m",
  "refs": "EP-14",
  "custom_preconds": "1. User has valid credentials\n2. User is not logged in",
  "custom_steps_separated": [
    { "content": "Navigate to /login", "expected": "Login form displayed", "additional_info": "" },
    { "content": "Enter valid credentials", "expected": "Fields accept input", "additional_info": "" },
    { "content": "Click Sign In", "expected": "Redirect to /dashboard", "additional_info": "" }
  ],
  "custom_postconditions": "User session is active"
}
```

**mcp__testrail__get_sections response** (per section):
```json
{ "id": 101, "name": "Authentication", "description": "...", "parent_id": null, "depth": 0, "display_order": 1 }
```

### Normalization Rules
1. If `title` has TC ID pattern (`TC-{feature}-{ABBR}-{NNN}`), preserve it. Otherwise generate new ID.
2. Reverse-map `priority_id` and `type_id` per `tms-abstraction.md`.
3. Parse `custom_steps_separated` → TestStep[]. If null/empty → `automationStatus: "not_automatable"`.
4. Parse `custom_preconds` → preconditions[]. Map `refs` → requirementIds[].

## Priority & Type Mapping

Canonical mappings (forward and reverse) defined in `tms-abstraction.md` `<priority_mapping>`, `<type_mapping>`, `<reverse_priority_mapping>`, `<reverse_type_mapping>`. Always use `tms-abstraction.md` as single source of truth.

Non-canonical TestRail types (reference only): 1=Acceptance, 3=Automated, 7=Performance, 8=Regression, 10=Usability.

## Error Handling & Batch Operations

- **429 Rate Limited**: Wait `Retry-After` seconds; default 60s between batches
- **400 Bad Request**: Check field names match TestRail custom fields
- **403 Forbidden**: Verify API key and project permissions
- **Duplicate section**: Search existing first with `mcp__testrail__get_sections`, reuse if name matches
- **Duplicate case**: Match by title prefix (TC ID) using `mcp__testrail__get_cases`, update with `mcp__testrail__update_case` instead of create
- **Not found**: Verify IDs with `mcp__testrail__get_case` before updating

**Batch creation**: Create all sections first with `mcp__testrail__add_section` (collect IDs) -> create cases in batches of 10-20 with `mcp__testrail__add_case` -> 1s delay between batches -> log created case IDs for traceability.

<testrail_local_api_fallback>
When TestRail MCP is unavailable, the `/sparq:testrail-api` skill provides direct REST API access via curl/Bash.
- Skill: `claude/skills/sparq-testrail-api/SKILL.md`
- References: `claude/skills/sparq-testrail-api/references/` (projects-suites-sections-cases.md, runs-results-plans.md, other-endpoints.md)
- Requires: `$TESTRAIL_BASE_URL`, `$TESTRAIL_USERNAME`, `$TESTRAIL_API_KEY` environment variables
- Fallback chain: MCP -> `/sparq:testrail-api` REST -> WebSearch docs -> file export XML
See `degradation-strategy.md` `<local_skill_fallback>` for full chain.
For complete sync workflow with verification and recovery, see `testrail-sync.md`.
</testrail_local_api_fallback>

## See Also

- `qase-formats.md` — Qase export format and MCP tools
- `local-tms-formats.md` — Local file-based export format
- `tms-abstraction.md` — Provider-agnostic TMS interface
