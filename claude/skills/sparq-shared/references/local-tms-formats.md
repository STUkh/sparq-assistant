# Local TMS Export Format Reference

Local file-based test case export specification. No MCP dependency — always succeeds. Referenced by: export skill, manual-test-writer. For provider-agnostic interface, see `tms-abstraction.md`.

<local_export_structure>
Output directory: `outputs.tms.local.outputDir` (default: `.sparq/tms-export`)
Format: `outputs.tms.local.format` (default: `"json"`, alternative: `"markdown"`)

Directory layout:
```
{outputDir}/{feature}/
  test-cases.json          # Full TestCase[] array (JSON format)
  test-cases.md            # Human-readable test plan (markdown format)
  coverage-summary.json    # CoverageEntry[] summary
```

When format is `"json"`: produces `test-cases.json` (primary) + `coverage-summary.json`
When format is `"markdown"`: produces `test-cases.md` (primary) + `coverage-summary.json`
</local_export_structure>

<json_schema>
`test-cases.json` follows the TestCase interface from `data-model.md`:
```json
[
  {
    "id": "TC-login-HP-001",
    "title": "Verify successful login with valid credentials",
    "section": "Happy Path",
    "category": "HP",
    "priority": "high",
    "preconditions": ["User has valid credentials", "User is not logged in"],
    "steps": [
      {
        "index": 1,
        "action": "Navigate to /login",
        "expected": "Login form is displayed"
      }
    ],
    "requirementIds": ["REQ-login-001"],
    "tags": ["smoke", "authentication"],
    "automationStatus": "not_automated",
    "estimate": "5m"
  }
]
```

Fields use abstract values (no provider-specific IDs):
- `priority`: string ("critical", "high", "medium", "low")
- `category`: canonical abbreviation ("HP", "VE", "SEC", "EC", "A11Y")
- `automationStatus`: "not_automated" | "automatable" | "automated" | "not_automatable"
</json_schema>

<local_import>
Local export files can be re-imported by:
- `/sparq:manual-to-e2e` — reads JSON format to generate Playwright tests
- External CI tooling — JSON format is machine-readable for integration
- Other TMS providers — JSON can be transformed to provider-specific format
</local_import>

<local_fallback>
Local provider never fails (no MCP dependency). It IS the ultimate fallback for other providers when their MCP is unavailable and the user wants file-based output.
</local_fallback>
