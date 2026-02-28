# Data Model Reference

Core TypeScript interfaces for requirements, test cases, coverage tracking, and validation findings.

## Requirement

Testable requirement extracted from Jira, Confluence, Figma, or manual input.

```typescript
interface Requirement {
  id: string                    // REQ-{feature}-{number} e.g. REQ-login-001
  title: string
  description: string
  source: 'jira' | 'confluence' | 'figma' | 'manual'
  sourceRef: string             // Ticket ID, page URL, Figma link
  priority: 'critical' | 'high' | 'medium' | 'low'
  category: 'functional' | 'ui' | 'security' | 'performance' | 'accessibility' | 'validation'
  uiElements: UIElement[]       // From Figma or manual; used for selector generation
  acceptanceCriteria: string[]  // Each criterion maps to 1+ test cases
  userJourney?: string[]        // Ordered user steps
}
```

- `source` + `sourceRef`: Track provenance for re-sync from origin
- `id`: Format `REQ-{feature}-{number}`, feature is short kebab-case
- `priority`: 4 levels -- `'critical'` (blocking/data integrity), `'high'` (daily workflow), `'medium'` (secondary flows), `'low'` (cosmetic/rare)
- `category`: 6 values -- `'validation'` covers input validation and form-level rules

## Requirement-to-TestCase Priority Mapping

<priority_mapping>
- `'critical'` -> TestCase.priority `1`, Label: Critical
- `'high'` -> TestCase.priority `2`, Label: High
- `'medium'` -> TestCase.priority `3`, Label: Medium
- `'low'` -> TestCase.priority `4`, Label: Low

See `tms-abstraction.md` for provider-specific mapping (TestRail priority_id, Qase priority, local format).
</priority_mapping>

## UIElement

Interactive/significant UI element used to generate Playwright selectors.

```typescript
interface UIElement {
  nodeId?: string               // Figma node ID (if from Figma)
  name: string                  // e.g. "Login Submit Button"
  type: 'button' | 'input' | 'select' | 'checkbox' | 'radio' | 'link' | 'text' | 'form' | 'dialog' | 'table' | 'menu' | 'tab' | 'other'
  label?: string                // Visible label text
  role?: string                 // ARIA role
  suggestedSelector: string     // Priority: role+name > label > testid > CSS
  screen: string                // Page where element appears
}
```

- `type: 'other'`: For non-standard or composite UI elements. Use `getByTestId` as primary selector strategy since role/label may not be deterministic.

## Test Category Naming

Canonical three-tier naming for test categories. All files reference this single source of truth.

<test_category_naming>
- `happy_path` / Abbreviation: `HP` / Display: Happy Path
- `negative` / Abbreviation: `VE` / Display: Validation Errors
- `security` / Abbreviation: `SEC` / Display: Security
- `edge_case` / Abbreviation: `EC` / Display: Edge Cases
- `accessibility` / Abbreviation: `A11Y` / Display: Accessibility
</test_category_naming>

```typescript
// Abbreviation mapping for TC IDs: TC-{feature}-{ABBR}-{number}
const TYPE_TO_ABBR: Record<TestCase['type'], string> = {
  happy_path: 'HP',
  negative: 'VE',
  security: 'SEC',
  edge_case: 'EC',
  accessibility: 'A11Y',
}
```

## TestCase

Single test case with steps, linked to requirements.

```typescript
interface TestCase {
  id: string                    // TC-{feature}-{ABBR}-{number} e.g. TC-login-HP-001
  title: string
  section: string               // Grouping e.g. "Authentication", "Form Validation"
  type: 'happy_path' | 'negative' | 'security' | 'edge_case' | 'accessibility'
  priority: 1 | 2 | 3 | 4      // 1=Critical, 2=High, 3=Medium, 4=Low
  preconditions: string[]
  steps: TestStep[]
  requirementIds: string[]      // Links to Requirement.id; every test needs 1+
  tags: string[]                // e.g. ['smoke', 'regression', 'login']
  automationStatus: 'not_automated' | 'automatable' | 'automated' | 'not_automatable'
  estimate?: string             // Time estimate for TestRail (e.g., "5m", "15m", "1h")
  tmsId?: string                // Written by /sparq:export after first CREATE. Format: "{provider}:{remoteId}" e.g. "testrail:5001" | "qase:301" | "zephyr:TC-PROJ-42". Used for UPDATE matching on subsequent exports. See tms-abstraction.md <tms_id_convention>.
}
```

- `priority`: Numeric for TMS compatibility (see "Requirement-to-TestCase Priority Mapping" above and `tms-abstraction.md`)
- `type`: Maps to abbreviation for TC IDs (see "Test Category Naming" above)
- `id`: Format `TC-{feature}-{ABBR}-{number}` using abbreviation from mapping
- **Regression Test ID**: `REG-{ticket}-{NNN}` (e.g., `REG-BUG142-001`). Used for S3 bug mode regression tests. The `{ticket}` is the bug ticket ID with hyphens preserved.
- Regression tests use the same `TestCase` structure but with category `"REG"` and an additional `bugTicket: string` field containing the source bug ticket reference.
- `automationStatus`: 4 values -- `'not_automated'` (no automation exists), `'automatable'` (can be automated, not yet done), `'automated'` (automation exists), `'not_automatable'` (requires manual testing only, e.g., subjective UX)
- `estimate`: Optional time estimate, maps to TMS export fields (TestRail `<estimate>` in XML, Qase `estimate` in JSON)
- `tmsId`: Optional, written automatically by `/sparq:export` after first successful CREATE. Never set manually. Format: `"{provider}:{remoteId}"`. Enables UPDATE matching on subsequent exports instead of creating duplicates. See `tms-abstraction.md` `<tms_id_convention>` and `<update_workflow>`.

## TestStep

```typescript
interface TestStep {
  order: number
  action: string                // Human-readable action
  expectedResult: string        // Human-readable expected outcome
  testData?: string             // Specific data values
  playwrightCode?: string       // Generated code using page object methods
}
```

## TestPlan

Aggregates test cases into a structured plan for a feature.

```typescript
interface TestPlan {
  feature: string               // Feature name (kebab-case)
  categories: TestCase['type'][] // Categories included in this plan
  totalEstimated: number        // Total estimated test cases
  batches: TestPlanBatch[]      // Ordered execution batches
}

interface TestPlanBatch {
  name: string                  // e.g. "Batch 1: Critical Happy Path"
  priority: 1 | 2 | 3 | 4
  testCaseIds: string[]
  estimatedDuration?: string    // e.g. "30m", "1h"
}
```

## CoverageEntry

Tracks requirement coverage by test cases.

```typescript
interface CoverageEntry {
  requirementId: string
  requirementTitle: string
  testCaseIds: string[]
  coveragePercentage: number    // 0-100, formula: (AC with linked tests / total AC) * 100
  gaps: string[]                // Uncovered criteria descriptions
  status: 'covered' | 'partial' | 'uncovered'  // 100% | 1-99% | 0%
}
```

- `coveragePercentage`: Calculated as `(acceptance criteria with at least one linked test case / total acceptance criteria) * 100`. Round to nearest integer.

## ValidationFinding

Issue found during test validation against current codebase/UI state.

```typescript
interface ValidationFinding {
  id: string                    // VF-{number}
  testFile: string
  testCaseId?: string
  severity: 'critical' | 'warning' | 'info'
  type: 'broken_selector' | 'flow_mismatch' | 'ui_change' | 'coverage_gap' | 'stale_data' | 'deprecated_pattern'
  description: string
  currentState: string
  expectedState: string
  suggestedFix: string
  autoFixable: boolean          // true only for deterministic fixes
  line?: number
}
```

- `type`: Classification determines which validation rules detected the finding (see `validation-checklist.md`)
- `type: 'deprecated_pattern'`: Detected when tests use old imports, removed helper functions, deprecated Playwright APIs (e.g., `page.waitForTimeout`, `elementHandle` methods), or superseded utility patterns. Suggested fix should reference the current replacement.

## TechStack

Auto-detected from `package.json` dependencies and project structure.

```typescript
interface TechStack {
  framework: 'vue' | 'react' | 'angular' | 'svelte' | null
  frameworkVersion: string | null
  router: 'vue-router' | 'react-router' | null
  componentFileExtensions: string[]       // Derived: vue->[".vue"], react->[".tsx",".jsx"], angular->[".component.html",".component.ts"], svelte->[".svelte"], null->[".tsx",".jsx",".vue"]
}
```

## TestRegistryEntry

Tracking entry for a generated or refreshed test file. Stored in `.sparq/tracking/test-registry.json`. Written by S1/S2/S3 on test creation, S5 on refresh.

```typescript
interface TestRegistry {
  version: "1.0"
  lastUpdated: string | null           // ISO 8601 timestamp
  entries: TestRegistryEntry[]
}

interface TestRegistryEntry {
  testFile: string                     // relative path, e.g. "e2e/specs/auth/login.spec.ts"
  testIds: string[]                    // TC IDs in this file, e.g. ["TC-login-HP-001"]
  requirements: string[]               // REQ IDs covered, e.g. ["REQ-login-001"]
  sourceTicket: string | null          // Jira ticket, e.g. "EP-14"
  sourcePages: string[]                // Confluence URLs used as source
  generatedAt: string                  // ISO 8601 when first generated
  lastRefreshedAt: string              // ISO 8601 when last refreshed (= generatedAt initially)
  generatedBy: "S1" | "S2" | "S3" | "S5"  // scenario that created/last refreshed
  requirementsHash: string             // SHA-256 of requirements content at generation time
}
```

- `requirementsHash`: Used for staleness detection. If current requirements hash differs, tests are stale.
- `sourceTicket` + `sourcePages`: Enable reverse lookup (ticket → test files) for `/sparq:sync EP-14`.
- `testIds`: Updated on refresh when new tests are added to the file.
- `lastRefreshedAt`: Updated on each S5 refresh. Compare against source ticket `updated` field for timestamp-based staleness.

## RefreshDiff

Diff analysis between current requirements and existing test coverage. Generated by orchestrator in S5 Phase 1.5.

```typescript
interface RefreshDiff {
  feature: string                      // feature name (kebab-case)
  sourceRef: string                    // Jira ticket or Confluence URL
  timestamp: string                    // ISO 8601 when diff was generated
  categories: {
    new: RefreshDiffItem[]             // requirements not covered by any test
    changed: RefreshDiffItem[]         // requirements with content changes
    removed: RefreshDiffItem[]         // requirements no longer in source
    unchanged: string[]                // REQ-IDs with no changes (IDs only)
  }
  summary: {
    total: number
    new: number
    changed: number
    removed: number
    unchanged: number
  }
}

interface RefreshDiffItem {
  requirementId: string                // e.g. "REQ-login-006"
  title: string
  changeSeverity?: 'high' | 'medium' | 'low'  // for changed items only
  changeDescription: string
  affectedTests: string[]              // TC-IDs of tests impacted
  recommendedAction: 'generate' | 'rewrite' | 'update' | 'deprecate' | 'review'
}
```

- `changeSeverity`: `'high'` = logic/behavior changed (test rewrite), `'medium'` = acceptance criteria added/removed (test update), `'low'` = text-only change (comment only)
- `recommendedAction`: `'generate'` for NEW, `'rewrite'`/`'update'`/`'review'` for CHANGED (by severity), `'deprecate'` for REMOVED

## QualityScore

Composite quality score for generated test suites.

```typescript
interface QualityScore {
  total: number           // 0-100 composite score
  breakdown: {
    coverage: number      // 40% weight — % of requirements with tests
    categoryBreadth: number // 20% weight — all 5 categories represented?
    assertionDensity: number // 15% weight — avg assertions per test
    patternAdherence: number // 15% weight — matches project patterns?
    selectorStability: number // 10% weight — stable locators (testid > CSS)?
  }
}
```

### Computation

Orchestrator computes from Phase 2 handoff data at Phase 3 (run summary). Each sub-score is 0-100, weighted sum = total.

**coverage** (weight 0.40):
- `score = (reqs with ≥1 linked TC / total reqs) * 100`
- Source: coverage matrix REQ→TC mapping

**categoryBreadth** (weight 0.20):
- `score = (categories with ≥1 test / 5) * 100`
- Categories: HP, VE, SEC, EC, A11Y. Count distinct `TestCase.type` values in output.

**assertionDensity** (weight 0.15):
- Count `expect(` / `toHave` / `toContain` / `toBe` / `toEqual` / `assert` calls in generated spec files
- `avg = total assertions / total test blocks`
- Scale: avg ≥5 → 100, avg 4 → 85, avg 3 → 70, avg 2 → 50, avg 1 → 20, avg 0 → 0

**patternAdherence** (weight 0.15):
- Start at 100, deduct per violation:
  - -25: spec imports from `@playwright/test` instead of fixture index
  - -25: new page object instead of extending existing one (when base exists)
  - -15: missing barrel `index.ts` update
  - -15: locators inline instead of page object `get` accessors
  - -10: test data hardcoded instead of using fixtures
  - Floor: 0

**selectorStability** (weight 0.10):
- Count locators in generated code. Classify each:
  - Stable: `getByRole`, `getByTestId`, `getByLabel`, `getByText`, `data-testid` → weight 1.0
  - Moderate: `getByPlaceholder`, attribute selectors `[name=]` → weight 0.5
  - Fragile: CSS class `.btn-primary`, XPath, nth-child → weight 0.0
- `score = (sum of weights / total locators) * 100`

**total**: `coverage*0.40 + categoryBreadth*0.20 + assertionDensity*0.15 + patternAdherence*0.15 + selectorStability*0.10`

Thresholds: 80+ excellent, 60-79 good, below 60 needs improvement. Display in run summary per `sparq-run-summary.md`.

## RunHistoryEntry

Tracks completed workflow runs for history display and undo capability. Stored in `.sparq/tracking/run-history.json` as an array.

```typescript
interface RunHistoryEntry {
  id: string                    // "run-{timestamp}" e.g. "run-20260213-142300"
  scenario: string              // S1, S1+S2, S2, S3, S4, S5, S6
  feature: string               // Feature name (kebab-case)
  source: string                // Ticket ID or input description
  startedAt: string             // ISO 8601 timestamp
  completedAt: string           // ISO 8601 timestamp
  checkpointLevel: string       // full, standard, fast
  results: {
    requirements: number
    manualTests: number
    e2eTests: number
    coverage: number            // 0-100 percentage
    qualityScore: number        // 0-100 composite (from QualityScore)
  }
  filesCreated: string[]        // Paths of new files (for undo: delete)
  filesModified: string[]       // Paths of modified files (for undo: git checkout)
  batchId: string | null        // Non-null when part of multi-ticket batch
  flowMetrics?: {
    timeToFirstArtifactSec?: number
    clarificationTurns?: number
    fallbackCount?: number
    checkpointCount?: number
    firstPassSuccess?: boolean
  }
}
```

- `id`: timestamp-based, unique per run
- `filesCreated` + `filesModified`: tracked for rollback via git (`git checkout -- {files}`)
- `batchId`: links runs from the same `/sparq:generate EP-1 EP-2` batch
- `flowMetrics`: optional usage-flow telemetry for UX/DX tuning (local-only)

## ProjectConfig

Project-level configuration fields written to `sparq.config.json`.

```typescript
interface ProjectConfig {
  name: string                             // Project name
  testDir: string                          // Test directory, default 'e2e'
  testPattern: string                      // Glob for test files
  sourceRoot: string                       // Application source root, default 'src'
  routeDiscoveryPattern: string            // Glob for route definitions, derived from router
}
```

- `sourceRoot`: Auto-detected (`src/` → `app/` → `lib/` → default `"src"`)
- `routeDiscoveryPattern`: Derived — `vue-router`→`"**/router/**/*.ts"`, `react-router`→`"**/routes/**/*.{ts,tsx}"`, `angular`→`"**/*-routing.module.ts"`, default→`"**/route*/**/*.ts"`
