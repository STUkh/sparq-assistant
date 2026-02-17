# E2E Common Patterns Reference

> Loaded by ALL agents generating E2E code, regardless of framework.
> Framework-specific API patterns: `playwright-patterns.md` (Playwright) or `cypress-patterns.md` (Cypress), selected by `e2e.framework` from `sparq.config.json`.

## Directory Structure

Read directories from `e2e.structure.*` in `sparq.config.json`:

```
{e2e.structure.pages}/        # Page objects extending base class (index.ts barrel)
{e2e.structure.components}/   # Reusable UI component wrappers (index.ts barrel)
{e2e.structure.steps}/        # BDD step classes: Given/When/Then (index.ts barrel)
{e2e.structure.fixtures}/     # Factory-based test fixtures (index.ts re-exports)
{e2e.structure.specs}/{feature}/  # Test specs organized by feature
```

**Playwright defaults**: `e2e/pages`, `e2e/components`, `e2e/steps`, `e2e/fixtures`, `e2e/specs`
**Cypress defaults**: `cypress/support/pages`, `cypress/support/components`, `cypress/support/steps`, `cypress/fixtures`, `cypress/e2e`

**Barrel Exports**: Every folder has `index.ts` re-exporting all members.

## Import Strategy

**Import alias detection**: Check the project's `tsconfig.json` (or `e2e/tsconfig.json`) `compilerOptions.paths` for alias configuration:

```json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

**Route constants**: Scan using `project.routeDiscoveryPattern` from `sparq.config.json` to locate route definition files (e.g., `**/router/**/*.ts`).

If alias configured, use it for app source imports:
```typescript
import { authRoutePath } from '@/modules/auth/router/routes'
```

If no alias, use relative imports:
```typescript
import { authRoutePath } from '../../src/modules/auth/router/routes'
```

**Rule**: Always check the project's existing e2e imports first and match the established convention.

## Locator Priority

Read `preferences.locatorPriority` from `sparq.config.json`.

**Playwright default**: `[getByTestId, getByRole, getByLabel, getByText]`
**Cypress default**: `[cy.findByTestId, cy.findByRole, cy.findByLabelText, cy.findByText]`

`data-testid` attributes are the most stable selectors -- immune to text changes, role refactors, and UI framework upgrades. Always prefer testid-based locators when available. Fall back to semantic locators only when no `data-testid` exists.

**Source file searches**: When grepping source files for selectors, types, or route definitions, use `project.componentFileExtensions` to determine which file types to search. Scope to `{project.sourceRoot}`.

## Wrapped Input Pattern (Framework-Agnostic)

UI component libraries (PrimeVue, Vuetify, MUI, Ant Design, etc.) wrap native
`<input>` elements inside container divs. Use this framework-agnostic pattern:

**Playwright**:
- `page.getByTestId('email-field').locator('input')` — drill into wrapper
- Use `.or()` for resilient fallback (see playwright-patterns.md Resilient Locator Pattern)

**Cypress**:
- `cy.get('[data-testid="email-field"]').find('input')` — drill into wrapper

**Error messages**: Use `getByText` near the field, or semantic attributes
(`aria-describedby`, `aria-errormessage`) — works across all UI frameworks.

**Toasts / Dialogs**: Use `getByRole('alert')`, `getByRole('dialog')`,
`getByRole('alertdialog')` — ARIA roles set by all major UI frameworks.

## New Feature Checklist

1. Page object: extend base class (from `e2e.baseClass`), `get url()` from routes (via `project.routeDiscoveryPattern`), locator accessors -> update barrel index
2. Component object: static factories, locator accessors -> update barrel index
3. Steps: constructor takes framework page object, GIVEN/WHEN/THEN groups -> update barrel index
4. Fixtures/commands: Playwright: interface + factory + `base.extend`; Cypress: `Cypress.Commands.add()` + type declaration -> update barrel/support index
5. Spec: framework test structure (`test.describe`/`test` for Playwright, `describe`/`it` for Cypress) -> import from fixtures index (Playwright) or page objects (Cypress)
