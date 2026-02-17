# Codebase Readiness Assessment

Assessment protocol for E2E test generation codebase sufficiency. Referenced by: orchestrator (Phase 0.5), automation-engineer (S3 Step 1).

## Enforcement Model

Runs in AGENT REASONING, not CLI code. Orchestrator and automation-engineer assess during discovery/analysis phases. Eval rubrics verify readiness signals in output.

<readiness_signals>

### Critical (BLOCKING mandatory)
- `source_root_missing`: `project.sourceRoot` does not exist or contains zero files
- `zero_components`: Grep `{sourceRoot}/**/*.{ext}` (per `project.componentFileExtensions`) returns zero component files

### Blocking (BLOCKING with user choices)
- `zero_routes`: Grep using `project.routeDiscoveryPattern` returns zero route definitions
- `zero_selectors`: Zero `data-testid` AND zero `aria-label`/`role=` matches across `{sourceRoot}/**/*.{ext}`
- `requirements_codebase_mismatch`: Requirements reference N distinct pages/features, source contains < N/2 matching components/routes

### Warning (proceed with gap reporting)
- `no_testids`: Zero `data-testid` found, but semantic locators (roles, labels) available
- `partial_mismatch`: Some (not most) requirements reference unimplemented features
- `sparse_selectors`: Fewer than 1 `data-testid` per 3 component files

### Info (note in summary only)
- `low_testid_density`: `data-testid` exists but covers < 50% of interactive elements

</readiness_signals>

<assessment_protocol>

### Phase 0.5 (Orchestrator) -- Lightweight Scan

Append to E2E Infrastructure Summary (max 5 lines):

1. Verify `project.sourceRoot` exists and is non-empty
2. Count component files matching `project.componentFileExtensions`
3. Grep `{sourceRoot}/**/*.{ext}` for `data-testid` -- count unique values
4. Grep using `project.routeDiscoveryPattern` -- count route files
5. Classify: Critical / Blocking / Warning / Info per signals above

Summary format:
```
Codebase readiness: {CRITICAL|BLOCKING|WARNING|OK}
  Components: {N} files | Routes: {N} definitions | TestIDs: {N} unique | Semantic: {N} labels/roles
  {If not OK: signal names and descriptions}
```

### Automation Engineer Step 1 (S3) -- Detailed Check

After reading requirements, before code generation:

1. For each requirement's referenced pages/screens, search `{sourceRoot}/` for matching components
2. For each UI element in requirements, search for matching `data-testid` or semantic locator
3. Compute match ratio: (matched elements / total requirement elements)
4. If match ratio < 0.3: Blocking readiness signal
5. If match ratio 0.3-0.6: Warning, annotate unmatched elements
6. If match ratio > 0.6: proceed normally, note gaps

</assessment_protocol>

<user_choices>

When readiness is CRITICAL or BLOCKING, present choices:

**(A) Proceed with placeholder selectors** (test-first mode)
- Generate tests with `getByTestId('TODO-{element-name}')` placeholders
- All placeholders documented in handoff `gaps[]`
- Handoff `confidence` set to `low` for all generated tests
- Generate `.sparq/selectors/TODO-selectors-{feature}.md` manifest
- Signal: `[sparq] P0.5 Warning: Codebase readiness {level} -- generating with placeholder selectors (test-first mode)`

**(B) Provide additional context**
- User provides: component file paths, manual selector list, Figma link, or description
- Re-run readiness assessment with new information
- Max 2 context-provision rounds, then force A/C/D

**(C) Fall back to manual tests only** (downgrade S3->S1)
- Skip E2E generation, produce manual test cases only
- Signal: `[sparq] P0.5 Fallback: E2E skipped -- insufficient codebase. Manual tests only.`

**(D) Defer and resume later**
- Save state via resume protocol for later continuation
- Signal: `[sparq] P0.5 Deferred: Codebase not ready. State saved for resume.`

</user_choices>

<greenfield>

Test-first projects (option A) generate:
- Page objects with placeholder locators: `get submitButton() { return this.page.getByTestId('TODO-submit-button') }`
- Inline comment per placeholder: `// PLACEHOLDER: add data-testid="submit-button" to component`
- Spec files that fail until testids added (intentional TDD-style)
- Selector manifest at `.sparq/selectors/TODO-selectors-{feature}.md` listing: element name, suggested `data-testid`, component file (if identifiable), requirement ID
- Handoff includes `testFirstMode: true` flag

</greenfield>

<gap_reporting>

All readiness findings recorded in:
1. **E2E Infrastructure Summary** (P0.5): readiness level + signal names
2. **Handoff `gaps[]`** (P2): per-element entries with source label `[SRC-CB]` (codebase)
3. **Execution plan** `## Gaps`: `[SRC-CB] Codebase readiness: {level}. {N} placeholder selectors generated.`

Gap format:
- `"[SRC-CB] No data-testid for {element} in {component} -- placeholder getByTestId('TODO-{name}')"`
- `"[SRC-CB] Route {path} from REQ-{id} not found in route definitions"`
- `"[SRC-CB] Component {name} from REQ-{id} not found in {sourceRoot}/"`

</gap_reporting>

<progress_signals>

- `[sparq] P0.5 Codebase readiness: {OK|WARNING|BLOCKING|CRITICAL} -- {N} components, {N} routes, {N} testids`
- `[sparq] P0.5 Warning: Codebase readiness {level} -- {primary gap description}`
- `[sparq] P0.5 Fallback: {user choice description}`
- `[sparq]   Selector coverage: {N}/{M} requirement elements matched ({percent}%)`

</progress_signals>
