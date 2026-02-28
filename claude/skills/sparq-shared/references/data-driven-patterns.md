# Data-Driven Test Generation Patterns

> Consumed by: sparq-automation-engineer, sparq-test-validator
> Related: playwright-patterns.md, cypress-patterns.md, test-generation-patterns.md, data-model.md

## When to Use Data-Driven Tests

Apply data-driven patterns when multiple test variants share the same flow but differ only in input data. Do not apply when tests have genuinely different flows — those require separate `test()` blocks.

**Trigger heuristic**: If a requirement has 3+ validation scenarios for the same field or flow, use `test.each()` (Playwright) or `forEach` (Cypress) instead of separate `test()` blocks.

**Use data-driven patterns for**:
- VE (Validation Errors) category: same form submission flow with different invalid inputs (empty, too short, invalid format, max length exceeded, injection attempts)
- Same user journey tested with multiple datasets — roles, permission levels, locales
- Boundary value testing where the assertion shape is identical across variants

**Do not use data-driven patterns for**:
- Tests with different flows — different preconditions, different action sequences, or different assertion shapes require separate `test()` blocks
- HP (Happy Path) category — the canonical success flow is usually one test, not a table of variants
- A11Y or SEC tests — single-scenario per check; each addresses a distinct concern
- When only 1-2 variants exist — two separate tests are more readable than a `test.each()` table

## Playwright `test.each()` Patterns

### Inline Table (2-5 variants)

Prefer inline table syntax for small datasets. The `$label` interpolation suffix in the title enables distinct test names in reports.

```typescript
import { expect, test } from '../../fixtures'
import { LoginPage } from '../../pages'

test.each([
  { input: '',                        error: 'Email is required',    label: 'empty' },
  { input: 'not-an-email',            error: 'Invalid email format', label: 'invalid-format' },
  { input: 'a'.repeat(255) + '@t.co', error: 'Email too long',       label: 'max-length-exceeded' },
  { input: '<script>alert(1)</script>',error: 'Invalid email format', label: 'xss-attempt' },
])('TC-login-VE-001-$label: Email validation — $label', async ({ page, input, error }) => {
  const loginPage = new LoginPage(page)
  await loginPage.goto()
  await loginPage.emailInput.fill(input)
  await loginPage.submitButton.click()
  await expect(loginPage.emailError).toHaveText(error)
})
```

### `test.describe.each` for Role or Viewport Variants

Use `test.describe.each` when the same set of sub-tests must run for each variant (e.g., role-based permissions, viewport sizes).

```typescript
test.describe.each([
  { role: 'admin',  canDelete: true  },
  { role: 'viewer', canDelete: false },
])('TC-dashboard-VE-001-$role: Permissions for $role', ({ role, canDelete }) => {
  test('Delete button visibility', async ({ page }) => {
    // setup role session, then assert
    await expect(page.getByTestId('delete-btn')).toBeVisible({ visible: canDelete })
  })
})
```

## TC ID Naming Convention for Variants

Use a kebab-case suffix appended to the base TC ID to identify each variant. This preserves traceability to the parent scenario while making individual test reports scannable.

- Base ID: `TC-{feature}-VE-{NNN}` (the parent scenario from manual test cases or requirements)
- Variant suffix: `-{variant-label}` in kebab-case, appended to the base ID
- Final form: `TC-{feature}-VE-{NNN}-{variant-label}`

```
TC-login-VE-001-empty
TC-login-VE-001-invalid-format
TC-login-VE-001-max-length-exceeded
TC-login-VE-001-xss-attempt
```

Rules:
- The label must appear in the test title string — use `$label` interpolation
- Labels must be unique within a `test.each()` call
- Derived variant IDs are recorded in the test registry alongside the parent TC ID
- The parent TC ID (`TC-login-VE-001`) is preserved in `TestCase.id` in manual test outputs; variants are automation-only identifiers

## Fixture-Driven Data (6+ Variants)

For larger datasets or datasets reused across multiple spec files, define a typed constant in the fixtures directory and import from the barrel.

```typescript
// e2e/fixtures/test-data/login.ts
export const emailValidationCases = [
  { input: '',                         error: 'Email is required',    label: 'empty' },
  { input: 'not-an-email',             error: 'Invalid email format', label: 'invalid-format' },
  { input: 'a'.repeat(255) + '@t.co',  error: 'Email too long',       label: 'max-length-exceeded' },
  { input: '<script>alert(1)</script>', error: 'Invalid email format', label: 'xss-attempt' },
  { input: "' OR 1=1 --",              error: 'Invalid email format', label: 'sql-injection' },
  { input: 'user @example.com',        error: 'Invalid email format', label: 'space-in-local' },
] as const

export type EmailValidationCase = typeof emailValidationCases[number]
```

```typescript
// e2e/fixtures/index.ts — add to barrel
export { emailValidationCases } from './test-data/login'
```

```typescript
// e2e/specs/auth/login.spec.ts
import { expect, test } from '../../fixtures'
import { emailValidationCases } from '../../fixtures'
import { LoginPage } from '../../pages'

test.each(emailValidationCases)(
  'TC-login-VE-001-$label: Email validation — $label',
  async ({ page, input, error }) => {
    const loginPage = new LoginPage(page)
    await loginPage.goto()
    await loginPage.emailInput.fill(input)
    await loginPage.submitButton.click()
    await expect(loginPage.emailError).toHaveText(error)
  }
)
```

- Always use `as const` for the data array to get narrow literal types
- Place test data files in `{e2e.structure.fixtures}/test-data/` — not inline in spec files for 6+ variants
- Add new data files to the fixture barrel `index.ts`

## Cypress Equivalent

Cypress lacks native `test.each()`. Use a `forEach` loop over an inline array or an imported constant.

```typescript
// Inline array (2-5 variants)
const emailValidationCases = [
  { input: '',             error: 'Email is required'    },
  { input: 'not-an-email', error: 'Invalid email format' },
  { input: 'a'.repeat(255) + '@t.co', error: 'Email too long' },
]

describe('TC-login-VE-001: Email field validation', () => {
  emailValidationCases.forEach(({ input, error }) => {
    it(`rejects input: "${input || '(empty)'}"`, () => {
      cy.visit('/login')
      cy.get('[data-testid="email-input"]').type(input)
      cy.get('[data-testid="submit-btn"]').click()
      cy.get('[data-testid="email-error"]').should('contain', error)
    })
  })
})
```

For shared datasets in Cypress, export from the support barrel:

```typescript
// cypress/support/test-data/login.ts
export const emailValidationCases = [ /* ... */ ]

// cypress/support/index.ts — add to barrel
export { emailValidationCases } from './test-data/login'
```

## TestStep.testData Field

The `TestStep.testData` field in the data model carries the specific data values for a step (e.g., `"input: 'not-an-email', error: 'Invalid email format'"`). When a manual test case's steps have populated `testData` fields and all steps share the same flow shape, use that data to populate the `test.each()` table rather than inferring values from step descriptions.

- Parse all `TestStep.testData` values for the test case
- Group by shared flow shape
- If 3+ variants share the same flow, collapse into `test.each()` instead of separate `test()` blocks
- Preserve the original `TC-{feature}-VE-{NNN}` ID as the base; append variant label suffix

## Edge Cases

### More Than 10 Variants

When a `test.each()` table would exceed 10 rows, move the dataset to a fixture file rather than keeping it inline. Inline tables beyond 10 rows are hard to scan and slow to modify.

- Place data in `{e2e.structure.fixtures}/test-data/{feature}.ts` (Playwright) or `cypress/support/test-data/{feature}.ts` (Cypress)
- Export from the fixture barrel (`index.ts`)
- Import in the spec using the barrel import path
- Apply `as const` to get narrow literal types

See the "Fixture-Driven Data" section above for the exact pattern.

### Assertions Differ Between Variants

When test variants share the same flow but require different assertion logic (not just different expected values), do not force them into a single `test.each()` table:

- Same assertion shape with different expected values → `test.each()` (the table populates the expected value field)
- Different assertion method, different element, or different assertion count per variant → separate `test()` blocks

Example: one variant asserts `toHaveText('Error A')` and another asserts `toBeHidden()` — different assertion shapes require separate `test()` blocks.

### Combining Viewport Matrix with Data-Driven Tests

Do not nest a `test.each(VIEWPORTS)` wrapper inside a `test.each(dataCases)` table or vice versa. The resulting test names are difficult to read in reports and TC ID suffix collisions create traceability problems.

Apply the two dimensions separately:
- Use `test.each(dataCases)` for VE-category data variants (different inputs, same flow)
- Use a separate `test.describe` with `test.use({ viewport })` or a project-level viewport config for viewport coverage
- Never combine both `test.each` loops for the same test; write distinct specs for each dimension

See `viewport-patterns.md` for the role+viewport combination pattern.
