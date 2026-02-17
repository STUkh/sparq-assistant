# Playwright Accessibility & Visual Regression Patterns

> Playwright-specific. Consumed by sparq-automation-engineer (when generating A11Y or visual tests), sparq-playwright-best-practices skill.
> See `test-generation-patterns.md` for A11Y category checklists (TC-*-A11Y-* naming, coverage criteria).

## Accessibility Testing with axe-core

### Integration Setup

Install `@axe-core/playwright` as a dev dependency. Use `AxeBuilder` to run WCAG audits against any page or component.

- Tag sets for compliance levels:
  - WCAG 2.0 Level AA: `['wcag2a', 'wcag2aa']`
  - WCAG 2.1 Level AA (recommended): `['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']`
  - Section 508: `['section508']`
- Scoped scans: `.include('#login-form')` to audit a single component
- Exclude known third-party issues: `.exclude('.third-party-widget')`
- Disable specific rules when exceptions are documented: `.disableRules(['color-contrast'])`

### Severity-Based CI Strategy

- **Critical / Serious**: fail the test -- these are barriers to access
- **Moderate**: warn in output, track as tech debt
- **Minor**: log for awareness, do not fail CI

### Page-Level Accessibility Test

```typescript
import { expect, test } from '../../fixtures'
import AxeBuilder from '@axe-core/playwright'

test.describe('Login page accessibility', () => {
  test('should have no critical WCAG violations', async ({ page }) => {
    await page.goto('/login')

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()

    const critical = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious'
    )
    expect(critical, `Found ${critical.length} critical a11y violations`).toHaveLength(0)
  })
})
```

### Reusable Accessibility Fixture

Create a `makeAxeBuilder` fixture to standardise axe configuration across all tests:

```typescript
// e2e/fixtures/a11y.fixture.ts
import AxeBuilder from '@axe-core/playwright'
import { test as base } from '@playwright/test'

type AxeFixture = { makeAxeBuilder: () => AxeBuilder }

export const test = base.extend<AxeFixture>({
  makeAxeBuilder: async ({ page }, use) => {
    await use(() =>
      new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .exclude('.third-party-widget')
    )
  },
})
```

Usage in tests:

```typescript
test('dashboard meets WCAG 2.1 AA', async ({ page, makeAxeBuilder }) => {
  await page.goto('/dashboard')
  const results = await makeAxeBuilder().include('#main-content').analyze()
  expect(results.violations).toHaveLength(0)
})
```

### Attaching Results for Debugging

Attach full axe results to the test report for post-failure analysis:

```typescript
test('settings page a11y audit', async ({ page }, testInfo) => {
  await page.goto('/settings')
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze()

  await testInfo.attach('a11y-results', {
    body: JSON.stringify(results.violations, null, 2),
    contentType: 'application/json',
  })

  expect(results.violations).toHaveLength(0)
})
```

## Keyboard and Focus Testing

### Tab Order Verification

Verify that interactive elements receive focus in the expected order:

```typescript
test('login form tab order', async ({ page }) => {
  await page.goto('/login')

  await page.keyboard.press('Tab')
  await expect(page.getByLabel('Email')).toBeFocused()

  await page.keyboard.press('Tab')
  await expect(page.getByLabel('Password')).toBeFocused()

  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeFocused()
})
```

### Focus Trap in Dialogs

Verify that focus cycles within a modal and Escape dismisses it:

```typescript
test('modal traps focus and dismisses on Escape', async ({ page }) => {
  await page.goto('/dashboard')
  await page.getByRole('button', { name: 'Open settings' }).click()

  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()

  // Tab through all focusable elements inside dialog
  await page.keyboard.press('Tab')
  const firstFocused = page.locator(':focus')
  await expect(firstFocused).toHaveAttribute('data-testid', 'setting-toggle')

  // Escape dismisses
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
})
```

### ARIA State Assertions

- `toHaveAttribute('aria-expanded', 'true')` for disclosure widgets
- `toHaveAttribute('aria-selected', 'true')` for tabs and list items
- `toHaveAttribute('aria-disabled', 'true')` for non-interactive states
- `toHaveRole('alert')` for live region announcements

## Visual Regression Testing

### Screenshot Comparison

Playwright compares screenshots pixel-by-pixel against committed baselines:

- `expect(page).toHaveScreenshot('name.png')` for full-page
- `expect(locator).toHaveScreenshot('component.png')` for component-level
- First run creates baseline images -- commit these to version control
- Subsequent runs compare against baselines and fail on differences

### Threshold Configuration

- `maxDiffPixelRatio`: percentage of pixels allowed to differ (e.g., `0.01` = 1%)
- `maxDiffPixels`: absolute number of pixels allowed to differ
- Use ratio for full-page, absolute for small components

### Masking Dynamic Content

Mask elements that change between runs (timestamps, avatars, ads):

```typescript
test('dashboard visual regression', async ({ page }) => {
  await page.goto('/dashboard')
  await expect(page).toHaveScreenshot('dashboard.png', {
    maxDiffPixelRatio: 0.01,
    mask: [
      page.locator('.timestamp'),
      page.locator('.user-avatar'),
      page.locator('[data-testid="live-counter"]'),
    ],
    animations: 'disabled',
  })
})
```

### Component-Level Screenshot

Isolate visual tests to individual components for faster, more stable comparisons:

```typescript
test('data table renders correctly', async ({ page }) => {
  await page.goto('/reports')
  const table = page.getByTestId('report-table')
  await expect(table).toHaveScreenshot('report-table.png', {
    maxDiffPixels: 50,
    animations: 'disabled',
  })
})
```

### CI Consistency with Docker

- Visual baselines are platform-dependent (font rendering, anti-aliasing)
- Generate baselines inside Linux Docker containers matching CI environment
- Use `npx playwright test --update-snapshots` inside the container to regenerate
- Chromium produces the most consistent cross-platform results -- use as primary baseline browser
- Compare Firefox and WebKit separately if cross-browser visual parity is required

### Updating Snapshots

- Run `npx playwright test --update-snapshots` to regenerate all baselines
- Review diffs in the HTML report before committing updated snapshots
- CI should fail on snapshot mismatches -- never auto-update in CI pipelines

## Responsive Testing

### Device Emulation via Config Projects

Define projects per device to run the full suite across viewports:

```typescript
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'tablet', use: { ...devices['iPad Pro 11'] } },
    { name: 'mobile', use: { ...devices['iPhone 14'] } },
  ],
})
```

### Custom Viewport Breakpoints

Test specific breakpoints that match the application's responsive design:

```typescript
test.describe('navigation responsive behavior', () => {
  test('shows hamburger menu at mobile breakpoint', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 })
    await page.goto('/dashboard')
    await expect(page.getByTestId('hamburger-menu')).toBeVisible()
    await expect(page.getByTestId('desktop-nav')).toBeHidden()
  })

  test('shows full nav at desktop breakpoint', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/dashboard')
    await expect(page.getByTestId('desktop-nav')).toBeVisible()
    await expect(page.getByTestId('hamburger-menu')).toBeHidden()
  })
})
```

### Mobile Touch Interactions

- `page.tap(locator)` for touch events (requires `hasTouch: true` in device config)
- Device emulation configs from `devices` already set `hasTouch` for mobile devices
- Use `page.setViewportSize()` for mid-test viewport changes (e.g., rotation simulation)
