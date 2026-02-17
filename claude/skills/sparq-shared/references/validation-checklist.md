# Validation Checklist

Rules and severity classification for `/sparq:sync` to detect stale tests, broken selectors, flow mismatches, and coverage gaps. This checklist covers two sync modes:

- **S4 (UI sync)**: All selector, flow, UI mismatch, test data, deprecated pattern, and flakiness checks apply. These detect drift between tests and the current codebase/Figma/browser state.
- **S5 Part A (test-validator inventory pass)**: Coverage gap detection and traceability checks apply. These verify test-to-requirement mapping and identify gaps before the diff analysis phase.

## Selector Validation

Verify test selectors match current codebase elements.

**Checks**:
1. **data-testid existence**: Grep each `getByTestId` value in tests against `data-testid` in `{project.sourceRoot}/**/*.{ext}` where `{ext}` comes from `project.componentFileExtensions` in `sparq.config.json`
2. **Role + name match**: Cross-reference `getByRole` selectors with component ARIA roles and text
3. **Label match**: Verify `getByLabel` values exist in component templates (`label`, `aria-label`)
4. **Wrapped input pattern**: verify tests using UI component library wrappers follow the `.locator('input')` / `.find('input')` pattern from `e2e-common-patterns.md`
5. **Figma cross-reference**: Compare Figma element labels with test selectors for UI text changes

**Severity**:
- Critical: `data-testid` removed from component (element not found)
- Critical: Role exists but name changed (selector won't match)
- Warning: Label text changed slightly (partial match may work)
- Warning: Element moved to different parent (selector works, context changed)
- Info: New testid added, not used in tests (coverage opportunity)

## Flow Validation

Verify test navigation flows match current routing.

**Checks**:
1. **Route existence**: Compare `goto()` URLs with router definitions. Scan `{project.sourceRoot}/` using `project.routeDiscoveryPattern` from `sparq.config.json` to locate route files.
2. **Route guards**: Tests must authenticate first or expect login redirect
3. **Multi-step flow order**: Confirm wizard/stepper tests follow current step sequence
4. **Redirect URLs**: Post-action redirects match current router config

**Severity**:
- Critical: Route path changed/removed
- Critical: New auth guard added to route
- Critical: Step order changed in wizard
- Warning: Redirect destination changed
- Info: New optional route parameter added

## UI Mismatch Detection

Compare current UI state (Figma or codebase) with test assertions.

**Checks**:
1. **Button/label text**: Compare Figma text overrides with test assertion strings
2. **Form field inventory**: Detect added/removed fields; flag new untested fields. Grep `{project.sourceRoot}/**/*.{ext}` using `project.componentFileExtensions` for form elements.
3. **Dialog/modal content**: Verify dialog titles and confirmation messages
4. **Table column changes**: Detect added/removed/renamed data table columns

**Severity**:
- Critical: Form field removed / new required field added (interaction/submission failure)
- Warning: Button text completely changed / dialog title changed / column header renamed
- Info: New column added (coverage opportunity)

## Coverage Gap Detection

Cross-reference requirements with test cases.

**Checks**:
1. **Acceptance criteria mapping**: Each requirement needs 1+ linked test case per criterion
2. **Category coverage by priority**: P1 needs `happy_path` + `negative` + `security`, P2 needs `happy_path` + `negative`, P3 needs `happy_path` minimum, P4 needs `happy_path` minimum
3. **Orphaned tests**: Tests linked to removed/deprecated requirements
4. **New feature detection**: New routes/components without test coverage. Scan `{project.sourceRoot}/` using `project.routeDiscoveryPattern` and `project.componentFileExtensions` to discover new features.

**Severity**:
- Critical: P1 requirement with zero coverage
- Warning: P2 requirement with zero coverage / P1 missing security tests / new route without tests
- Info: Orphaned test for removed feature

## Test Data Validation

Verify test data and mocks match current codebase.

**Checks**:
1. **Enum values**: Compare test enum usage with type definitions found under `{project.sourceRoot}/`. Use `project.componentFileExtensions` and common type file patterns (`**/types/*.ts`, `**/types.ts`) to locate type definitions.
2. **API response shapes**: Compare fixture objects with current interface definitions
3. **Mock handler routes**: Verify mock handler URLs match API service paths

**Severity**:
- Critical: API fields removed / enum value removed / mock handler URL outdated
- Info: API fields added / enum value added (coverage opportunity)

## Deprecated Pattern Detection

Detect usage of outdated or removed patterns in test code. For comprehensive anti-pattern catalogs with code examples and corrected versions, see framework-specific references: `playwright-anti-patterns.md` (Playwright) or `cypress-anti-patterns.md` (Cypress).

**Checks**:
1. **Old imports**: References to moved/renamed modules (`import from` paths that no longer exist)
2. **Removed helpers**: Calls to utility functions that have been deleted or replaced
3. **Deprecated Playwright APIs**: Usage of `elementHandle()`, `$eval()`, `$$eval()`, `page.waitForNavigation()` (replaced by `page.waitForURL()`), `page.waitForSelector()` (prefer locator-based waits)
4. **Superseded patterns**: Direct `page.locator('.css-class')` when `getByRole`/`getByTestId` equivalents exist
5. **Framework-specific deprecations**: Check `project.componentFileExtensions` to detect deprecated framework-specific patterns by file type

**Severity**:
- Warning: Deprecated Playwright API usage (will break in future versions)
- Warning: Removed helper function call
- Info: Pattern can be modernized (functional but suboptimal)

## Flakiness Detection

Identify patterns known to cause intermittent test failures.

**Checks**:
1. **`waitForTimeout` usage**: Hardcoded waits (`page.waitForTimeout(1000)`) -- replace with condition-based waits (`waitForSelector`, `expect().toBeVisible()`)
2. **Missing `await`**: Async operations without `await` -- causes race conditions
3. **Animation assertions**: Assertions on elements mid-animation -- add `waitForLoadState('load')` or wait for animation-complete state
4. **Non-deterministic selectors**: `nth(0)` or `:first-child` on dynamic lists -- prefer stable identifiers
5. **Time-dependent tests**: Tests relying on `Date.now()` or clock -- use Playwright clock API

**Severity**:
- Warning: `waitForTimeout` (flaky by nature)
- Warning: Missing `await` on async operation
- Info: Animation timing risk / non-deterministic selector

## Conflict Handling

When multiple auto-fixes target the same line in a file:

1. **Detect**: Group findings by `testFile` + `line` number
2. **Flag**: Mark as conflict -- set `autoFixable: false` on all conflicting findings
3. **Report**: List conflicts in validation report under "## Conflicts Requiring Manual Review"
4. **Action**: User must resolve manually; provide all suggested fixes as options

## Auto-Fix Rules

**Auto-fixable** (autoFixable=true):
- Text assertion update: old text in exactly one location, new text known -> replace
- Selector name update: role unchanged, new accessible name unambiguous -> update
- TestId update: old removed, new exists on same logical element -> replace
- Enum value update: direct 1:1 rename -> replace

**NOT auto-fixable** (autoFixable=false):
- Flow/navigation changes (new business logic)
- New test coverage (requires test design)
- Removed feature cleanup (archival vs deletion decision)
- Added form fields (test data design needed)
- Multi-step flow reorder (new step dependencies)
- Security test updates (authorization model review)
- Conflicting fixes on same line (see Conflict Handling above)

**Fix process**: Group findings by `testFile` -> detect conflicts (same line, multiple fixes) -> apply non-conflicting auto-fixes bottom-up (preserve line numbers) -> run affected tests to verify -> report non-auto-fixable with suggested actions -> generate summary.
