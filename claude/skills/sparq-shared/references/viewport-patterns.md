# Viewport Matrix & Responsive Testing Patterns

> Consumed by: sparq-automation-engineer
> Related: data-driven-patterns.md, playwright-patterns.md, cypress-patterns.md, config-schema.md

<viewport_presets>
Standard presets (name → width × height):
- `desktop`:   1920 × 1080
- `laptop`:    1440 × 900
- `tablet`:    768 × 1024
- `mobile`:    375 × 667   (iPhone SE)
- `mobile-lg`: 414 × 896   (iPhone 11 Pro Max)
</viewport_presets>

<when_to_use>
Enable viewport matrix for:
- Landing pages, marketing pages — layout and breakpoints are core acceptance criteria
- Checkout flows — responsive layout directly affects conversion
- Navigation/header tests — mobile hamburger menu, collapsed nav

Skip viewport matrix for:
- API-testing via UI — viewport has no bearing on response payloads
- Admin-only pages — typically desktop-only by design
- Highly dynamic content where layout shift is expected and not a test target
- Default behavior: `viewports.enabled: false` → generate desktop-only tests (no change from current behavior)
</when_to_use>

<count_multiplication>
When `viewports.enabled: true`, test count multiplies by the number of enabled viewports.
- Example: 10 E2E tests × 2 viewports = 20 test functions
- Orchestrator: divide E2E batch limit by viewport count before dispatching (e.g., 20 max ÷ 2 viewports = 10 base tests per batch)
- Include viewport-adjusted count in handoff `report.counts.totalTests`
</count_multiplication>

<playwright_viewport_patterns>
## TC ID Naming

Append viewport name as kebab-case suffix to the base TC ID:
- Base: `TC-{feature}-{ABBR}-{NNN}`
- With viewport: `TC-{feature}-{ABBR}-{NNN}-{viewport-name}`
- Examples: `TC-homepage-HP-001-mobile`, `TC-checkout-HP-002-tablet`

## test.each(VIEWPORTS) Wrapper Pattern

Preferred for spec-level viewport iteration. Builds on `data-driven-patterns.md` `test.each()` approach.

```typescript
import { expect, test } from '../../fixtures'
import { HomePage } from '../../pages'

const VIEWPORTS = [
  { name: 'desktop', width: 1920, height: 1080 },
  { name: 'mobile',  width: 375,  height: 667  },
] as const

test.each(VIEWPORTS)(
  'TC-homepage-HP-001-$name: Responsive layout at $name viewport',
  async ({ page }, { width, height, name }) => {
    await page.setViewportSize({ width, height })
    await page.goto('/')
    // assertions specific to this viewport
    await expect(page.getByTestId('nav-menu')).toBeVisible()
  }
)
```

Tag pattern — add viewport tag in test title or via `test.describe.configure`:
```typescript
test.describe('Homepage viewport suite @viewport-mobile', () => {
  test.use({ viewport: { width: 375, height: 667 } })
  // tests run with mobile viewport applied globally to this describe block
})
```

## File-Level Override (`test.use`)

Use for a single viewport applied to an entire spec file:
```typescript
test.use({ viewport: { width: 375, height: 667 } })
```

## Per-Test Override (`page.setViewportSize`)

Use inside `test.each()` or individual tests for inline viewport control:
```typescript
await page.setViewportSize({ width: 768, height: 1024 })
```

## Role + Viewport Combination

When tests must cover both user-role variants and viewport variants, use nested `test.describe` blocks — outer for the role context, inner for the viewport matrix — rather than a two-dimensional `test.each` cartesian product.

```typescript
import { expect, test } from '../../fixtures'
import { DashboardPage } from '../../pages'

test.describe('Dashboard — admin role', () => {
  test.use({ storageState: 'playwright/.auth/admin.json' })

  test.each([
    { name: 'desktop', width: 1920, height: 1080 },
    { name: 'mobile',  width: 375,  height: 667  },
  ] as const)(
    'TC-dashboard-HP-001-$name: Admin dashboard layout at $name',
    async ({ page }, { width, height }) => {
      await page.setViewportSize({ width, height })
      const dashboard = new DashboardPage(page)
      await dashboard.goto()
      await expect(dashboard.adminPanel).toBeVisible()
    }
  )
})
```

This keeps TC IDs in the pattern `TC-{feature}-{ABBR}-{NNN}-{viewport-name}` and avoids a two-dimensional product ID scheme.

## Project-Level Config (Playwright CI — preferred for full matrix)

Define projects in `playwright.config.ts` for parallel CI execution across viewports:
```typescript
projects: [
  { name: 'desktop', use: { viewport: { width: 1920, height: 1080 } } },
  { name: 'tablet',  use: { viewport: { width: 768, height: 1024 } } },
  { name: 'mobile',  use: { viewport: { width: 375, height: 667 }, isMobile: true } },
]
```
</playwright_viewport_patterns>

<cypress_viewport_patterns>
## cy.viewport() — Per-Test

```typescript
it('TC-homepage-HP-001-mobile: Responsive layout at mobile', () => {
  cy.viewport(375, 667)
  cy.visit('/')
  cy.get('[data-testid="nav-menu"]').should('be.visible')
})
```

## Device Preset Shorthand

```typescript
cy.viewport('iphone-se2') // 375 × 667
cy.viewport('ipad-2')     // 768 × 1024
```

## forEach Viewport Loop (mirrors data-driven-patterns.md approach)

```typescript
const VIEWPORTS = [
  { name: 'desktop', width: 1920, height: 1080 },
  { name: 'mobile',  width: 375,  height: 667  },
]

VIEWPORTS.forEach(({ name, width, height }) => {
  describe(`TC-homepage-HP-001-${name}: Responsive layout at ${name}`, () => {
    beforeEach(() => cy.viewport(width, height))
    it('shows navigation', () => {
      cy.visit('/')
      cy.get('[data-testid="nav-menu"]').should('be.visible')
    })
  })
})
```
</cypress_viewport_patterns>

## Reading Viewport Config

Resolve viewports from `viewports` config key:
1. If `viewports.presets` array is set, map preset names to their `{ width, height }` dimensions from `<viewport_presets>` above
2. If `viewports.custom` array is set, merge after presets (custom entries take precedence on name collision)
3. Build `VIEWPORTS` constant for `test.each()` from the resolved list
