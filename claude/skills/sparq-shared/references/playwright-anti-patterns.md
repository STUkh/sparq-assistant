# Playwright Anti-Patterns Reference

> Playwright-specific. Consumed by sparq-automation-engineer, sparq-test-validator, sparq-playwright-best-practices skill.
> Cross-references: `playwright-patterns.md` (canonical patterns), `playwright-assertions.md` (assertion strategies).

## Timing Anti-Patterns

### Hard-coded waits

`page.waitForTimeout(N)` is the most common source of both flakiness and slowness. It either waits too long (slow CI) or not long enough (flaky on load).

```typescript
// BAD: arbitrary delay
await page.waitForTimeout(3000)
await expect(page.getByText('Saved')).toBeVisible()

// GOOD: auto-retrying assertion handles timing
await expect(page.getByText('Saved')).toBeVisible()
```

### Using `networkidle` wait state

Banned in `playwright-patterns.md` (Wait States section). The reason: `networkidle` fires when no network requests occur for 500ms. SSE connections, websocket heartbeats, analytics pings, and long-polling endpoints keep the network active indefinitely -- the wait never resolves or resolves unpredictably.

```typescript
// BAD: hangs with SSE/websocket connections
await page.goto('/dashboard', { waitUntil: 'networkidle' })

// GOOD: wait for meaningful page state
await page.goto('/dashboard')
await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
```

### Polling element state instead of auto-retry assertions

Manually checking `.isVisible()` or `.textContent()` in a loop loses Playwright's built-in retry mechanism and produces unreliable results.

```typescript
// BAD: manual polling loop
let visible = false
for (let i = 0; i < 10; i++) {
  visible = await page.getByText('Ready').isVisible()
  if (visible) break
  await page.waitForTimeout(500)
}
expect(visible).toBe(true)

// GOOD: single auto-retrying assertion
await expect(page.getByText('Ready')).toBeVisible({ timeout: 5000 })
```

## Selector Anti-Patterns

### CSS class selectors

CSS classes are styling concerns. They change during redesigns, theme switches, and CSS module hash rotations.

```typescript
// BAD: coupled to styling
page.locator('.btn-primary.large')

// GOOD: semantic or test-id locator
page.getByRole('button', { name: 'Submit' })
page.getByTestId('submit-btn')
```

### XPath selectors

XPath is fragile, unreadable, and breaks when DOM structure changes. Playwright's locator API is strictly preferred.

```typescript
// BAD: XPath
page.locator('//div[@class="form"]//input[@name="email"]')

// GOOD: accessible locator
page.getByLabel('Email')
```

### `nth(0)` on dynamic lists

Index-based selection breaks when list order changes or items are inserted/removed.

```typescript
// BAD: positional on dynamic content
page.locator('.product-card').nth(0)

// GOOD: match by unique content
page.getByRole('listitem').filter({ hasText: 'Premium Plan' })
```

### Structural selectors

Deep DOM path selectors (`div > span > button`) break on any markup change between the target and its ancestors.

```typescript
// BAD: tightly coupled to DOM structure
page.locator('div.container > div.row > div.col > button')

// GOOD: direct semantic locator
page.getByRole('button', { name: 'Add to Cart' })
```

### Deprecated ElementHandle API

`page.$()` and `page.$$()` return ElementHandle objects that can become stale. Locators re-query on every action.

```typescript
// BAD: stale ElementHandle
const button = await page.$('button.submit')
await button?.click()

// GOOD: locator auto-resolves on each action
await page.getByTestId('submit-btn').click()
```

## Test Design Anti-Patterns

### Shared mutable state via globals

Global variables shared across tests cause order-dependent failures and break parallel execution.

```typescript
// BAD: shared mutable state
let userId: string
test('create user', async ({ page }) => {
  userId = await createUser(page)
})
test('edit user', async ({ page }) => {
  await editUser(page, userId) // depends on previous test
})

// GOOD: each test is self-contained
test('edit user', async ({ page, auth }) => {
  const userId = await createUser(page)
  await editUser(page, userId)
})
```

### Redundant login per test

Logging in through the UI for every test wastes time. Use `storageState` to inject auth cookies/tokens.

```typescript
// BAD: UI login in every test (~3s overhead each)
test.beforeEach(async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Email').fill('admin@example.com')
  await page.getByLabel('Password').fill('P@ssw0rd123!')
  await page.getByRole('button', { name: 'Sign in' }).click()
})

// GOOD: auth state injected via storageState
// setup: global-setup.ts generates storageState file
// playwright.config.ts uses storageState for authenticated projects
test('dashboard loads', async ({ page }) => {
  await page.goto('/dashboard')
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
})
```

### Long sequential chains

Tests that combine many actions into a single `test()` are hard to debug and slow to retry on failure. Isolate logical scenarios.

### Testing implementation details

Asserting on internal state (Redux store values, component instance properties, internal API response shapes) couples tests to implementation. Assert on user-visible outcomes instead.

### Over-mocking

Mocking every API call masks integration bugs. Mock only external third-party services; let internal APIs run against a test environment.

### Missing cleanup

Fixtures must include `cleanup()`. Tests that create data without cleanup cause cascading failures in subsequent runs. See the fixture pattern in `playwright-patterns.md`.

## Architecture Anti-Patterns

### God page objects

Page objects exceeding ~150 lines indicate the page should be decomposed into component objects (see Component Object Pattern in `playwright-patterns.md`).

- Split by UI region: header, sidebar, form sections, modals
- Each component object gets its own file and barrel export
- Page object composes components via `get` accessors

### Locators defined in spec files

Locators belong in page objects or component objects. Specs should only call named accessors and action methods.

```typescript
// BAD: locator logic in spec
test('submit form', async ({ page }) => {
  await page.getByTestId('name-input').fill('Test')
  await page.locator('form button[type="submit"]').click()
})

// GOOD: spec uses page object API
test('submit form', async ({ page }) => {
  const formPage = new FormPage(page)
  await formPage.nameInput.fill('Test')
  await formPage.submitButton.click()
})
```

### Deep fixture dependency chains

Fixtures depending on three or more other fixtures create hidden coupling. Flatten by composing at the config level rather than chaining fixture-to-fixture.

### Importing from `@playwright/test` in specs

Specs must import `test` and `expect` from the project fixture barrel (`../../fixtures`). Importing directly from `@playwright/test` bypasses custom fixtures and shared configuration. See Spec Pattern in `playwright-patterns.md`.

### No barrel exports

Every `pages/`, `steps/`, `components/`, and `fixtures/` directory needs an `index.ts` barrel. Without barrels, import paths scatter across specs and break on file moves.

## CI Anti-Patterns

### Running `--headed` in CI

Headed mode requires a display server. CI environments are headless. Use `--headed` only for local debugging.

### Setting `workers: 1` globally

Serial execution is a last resort for test-order dependencies (which are themselves an anti-pattern). Default to parallel; isolate the few truly serial suites with `test.describe.serial()`.

### Missing trace/screenshot on failure

Without failure artifacts, debugging CI-only failures requires reproduction. Configure in `playwright.config.ts`:

- `trace: 'on-first-retry'` -- captures trace only on retry (low overhead)
- `screenshot: 'only-on-failure'` -- captures screenshot on failure

### Recording video unconditionally

`video: 'on'` for all tests generates gigabytes of artifacts and slows CI. Use `video: 'on-first-retry'` or `video: 'retain-on-failure'` instead.

### Ignoring flaky test reports

Playwright's `--last-failed` and retry annotations surface flaky tests. Suppressing retries or ignoring flaky annotations allows non-deterministic tests to erode suite reliability. Track and fix flaky tests within one sprint.
