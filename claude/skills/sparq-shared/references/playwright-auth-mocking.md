# Playwright Authentication & API Mocking Patterns

> Playwright-specific. Consumed by sparq-automation-engineer (when tests involve auth or API), sparq-playwright-best-practices skill.
> Prerequisites: load `playwright-patterns.md` for base POM/fixture patterns, `e2e-common-patterns.md` for directory structure.

## Authentication Patterns

### storageState for Session Reuse

Playwright persists auth state (cookies, localStorage, sessionStorage) to a JSON file. Tests consume it to skip login UI entirely.

- Save after login: `await page.context().storageState({ path: authFile })`
- Consume in config: `use: { storageState: authFile }` applies to all tests in that project
- storageState files contain tokens -- add `playwright/.auth/` to `.gitignore`
- Never commit storageState JSON files to version control

### Setup Projects in playwright.config.ts

Use Playwright's project dependency system to run auth setup once before all tests:

- Define a setup project matching only `*.setup.ts` files
- Other projects declare `dependencies: ['setup']` to wait for auth
- Each setup file writes its storageState to `playwright/.auth/`

```typescript
// playwright.config.ts
import { defineConfig } from '@playwright/test'

const authFile = 'playwright/.auth/user.json'

export default defineConfig({
  projects: [
    { name: 'setup', testMatch: /.*\.setup\.ts/ },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], storageState: authFile },
      dependencies: ['setup'],
    },
  ],
})
```

### auth.setup.ts Example

```typescript
// e2e/auth.setup.ts
import { expect, test as setup } from '@playwright/test'

const authFile = 'playwright/.auth/user.json'

setup('authenticate', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Email').fill('test.user@example.com')
  await page.getByLabel('Password').fill('P@ssw0rd123!')
  await page.getByRole('button', { name: 'Sign in' }).click()

  await expect(page.getByTestId('dashboard-header')).toBeVisible()
  await page.context().storageState({ path: authFile })
})
```

### Per-Worker Authentication

For tests requiring isolated user sessions (parallel safety), create unique accounts per worker:

```typescript
// e2e/fixtures/auth.fixture.ts
import { test as base } from '@playwright/test'

export const test = base.extend<{}, { workerAuth: string }>({
  workerAuth: [async ({ browser }, use, workerInfo) => {
    const authFile = `playwright/.auth/worker-${workerInfo.parallelIndex}.json`
    const context = await browser.newContext()
    const page = await context.newPage()

    await page.goto('/login')
    await page.getByLabel('Email').fill(`worker${workerInfo.parallelIndex}@example.com`)
    await page.getByLabel('Password').fill('P@ssw0rd123!')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.context().storageState({ path: authFile })
    await context.close()

    await use(authFile)
  }, { scope: 'worker' }],

  page: async ({ browser, workerAuth }, use) => {
    const context = await browser.newContext({ storageState: workerAuth })
    const page = await context.newPage()
    await use(page)
    await context.close()
  },
})
```

### Multi-Role Testing

Test interactions between different user roles within a single test:

- Create separate storageState files per role: `admin.json`, `editor.json`, `viewer.json`
- Spawn isolated contexts with `browser.newContext({ storageState })` per role
- Each context gets its own page -- actions on one do not affect the other

```typescript
test('admin sees user that editor created', async ({ browser }) => {
  const editorCtx = await browser.newContext({ storageState: 'playwright/.auth/editor.json' })
  const editorPage = await editorCtx.newPage()
  await editorPage.goto('/users/new')
  await editorPage.getByLabel('Name').fill('New User')
  await editorPage.getByRole('button', { name: 'Create' }).click()
  await editorCtx.close()

  const adminCtx = await browser.newContext({ storageState: 'playwright/.auth/admin.json' })
  const adminPage = await adminCtx.newPage()
  await adminPage.goto('/users')
  await expect(adminPage.getByText('New User')).toBeVisible()
  await adminCtx.close()
})
```

## API Mocking and Network Interception

### page.route() -- Per-Test Mocking

Intercept network requests and return controlled responses. Register routes BEFORE triggering navigation or actions that fire the request.

- `page.route()` scopes interception to a single page
- `context.route()` scopes interception to all pages in a context (feature flags, global config)
- Match patterns: string glob (`**/api/users`), regex (`/\/api\/users\/\d+/`), or predicate function
- Avoid overly broad wildcards (`**`) -- use precise URL patterns to prevent unintended interceptions

```typescript
test('displays users from API', async ({ page }) => {
  await page.route('**/api/users', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      json: [
        { id: 1, name: 'Alice', role: 'admin' },
        { id: 2, name: 'Bob', role: 'editor' },
      ],
    })
  })

  await page.goto('/users')
  await expect(page.getByText('Alice')).toBeVisible()
  await expect(page.getByText('Bob')).toBeVisible()
})
```

### Mock Factory Function

Centralise mock creation to keep tests DRY and typed:

```typescript
// e2e/mocks/user.mock.ts
interface User { id: number; name: string; role: string }

export function mockUsersRoute(page: Page, users: Partial<User>[] = []) {
  const defaults: User[] = [{ id: 1, name: 'Test User', role: 'viewer' }]
  const data = users.length > 0
    ? users.map((u, i) => ({ id: i + 1, name: 'User', role: 'viewer', ...u }))
    : defaults

  return page.route('**/api/users', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', json: data })
  )
}
```

### Response Modification

Intercept the real response, modify it, and fulfill with the altered version:

```typescript
await page.route('**/api/feature-flags', async (route) => {
  const response = await route.fetch()
  const json = await response.json()
  json.darkMode = true
  json.betaFeatures = false
  await route.fulfill({ response, json })
})
```

### HAR Recording and Playback

Record network traffic to HAR files for deterministic replay:

- Record: `await page.routeFromHAR('tests/data/api.har', { update: true })`
- Playback: `await page.routeFromHAR('tests/data/api.har')` (omit `update`)
- HAR files capture full request/response pairs -- useful for complex multi-endpoint flows
- Commit HAR files to version control for reproducible tests

### Abort Patterns for Error States

Block requests to test error handling, offline states, or to speed up tests:

```typescript
// Simulate network failure
await page.route('**/api/users', (route) => route.abort('connectionrefused'))

// Block analytics and tracking in all tests
await context.route('**/{analytics,tracking,telemetry}/**', (route) => route.abort())

// Block images to speed up visual-free tests
await page.route('**/*.{png,jpg,svg}', (route) => route.abort())
```

## Test Data Strategies

### API-Based Setup with request Fixture

Use Playwright's built-in `request` fixture for direct API calls without a browser:

```typescript
test('edit existing user', async ({ page, request }) => {
  // Create test data via API (faster than UI)
  const response = await request.post('/api/users', {
    data: { name: 'Seed User', email: 'seed@example.com', role: 'editor' },
    headers: { Authorization: 'Bearer test-api-token' },
  })
  const user = await response.json()

  // Test the UI with known data
  await page.goto(`/users/${user.id}/edit`)
  await page.getByLabel('Name').fill('Updated Name')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Updated Name')).toBeVisible()
})
```

### Teardown and Cleanup

- Use `test.afterAll` or fixture teardown to clean up API-created data
- Prefer API-based cleanup over UI-based cleanup (faster, more reliable)
- For database seeding, use `globalSetup` / `globalTeardown` in playwright.config.ts

```typescript
export const test = base.extend<{ testUser: User }>({
  testUser: async ({ request }, use) => {
    const res = await request.post('/api/users', {
      data: { name: 'Temp User', email: `temp-${Date.now()}@example.com` },
    })
    const user = await res.json()
    await use(user)
    // Cleanup after test completes
    await request.delete(`/api/users/${user.id}`)
  },
})
```

### Factory Functions for Deterministic Data

- Generate consistent test data with factory functions (timestamp or index-based uniqueness)
- Keep factories in `e2e/fixtures/` or `e2e/data/` alongside test code
- Use realistic but fake values -- never real credentials or PII
