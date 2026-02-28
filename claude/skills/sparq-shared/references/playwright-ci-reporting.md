# Playwright CI, Reporting & Performance Reference

> Playwright-specific. Consumed by sparq-playwright-best-practices skill.
> For Cypress CI patterns, see `cypress-advanced.md`. For Playwright locator/page-object/fixture patterns, see `playwright-patterns.md`. For MCP workflows, see `playwright-mcp-tools.md`.

## Parallelism and Sharding

### Test-Level vs Spec-Level Parallelism

- `fullyParallel: true` runs every `test()` in its own worker -- maximum concurrency
- Without it, all tests within a single spec file run sequentially in one worker
- Use spec-level (default) when tests in a file share expensive setup (e.g., authenticated state)
- Use test-level (`fullyParallel`) when tests are truly independent

### Worker Tuning

- Local: `workers: '50%'` -- half of available CPU cores
- CI: `workers: 1` -- single worker avoids resource contention on shared runners
- GitHub-hosted runners have 2 vCPUs -- more than 2 workers causes thrashing
- Override: `workers: process.env.CI ? 1 : '50%'`

### Sharding

- Split suite across CI jobs: `npx playwright test --shard=1/4`
- Each shard runs an equal slice of total spec files
- Combine with GitHub Actions matrix strategy for linear speedup
- Shard count should match or be less than total spec file count
- Each shard produces its own report -- merge after all shards complete

### Serial Mode

- `test.describe.configure({ mode: 'serial' })` -- tests run in order, skip on failure
- Use sparingly: ordered login -> action -> logout flows, seed -> verify -> cleanup
- Prefer independent tests with per-test setup over serial dependencies

### Config Example: CI-Optimized Settings

```typescript
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : '50%',
  reporter: process.env.CI
    ? [['html'], ['json', { outputFile: 'results/report.json' }], ['junit', { outputFile: 'results/junit.xml' }]]
    : [['html']],
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:5173',
    trace: 'on-first-retry',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
  ],
})
```

### GitHub Actions: Matrix Sharding

```yaml
jobs:
  e2e:
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        shard: [1, 2, 3, 4]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: npx playwright test --shard=${{ matrix.shard }}/4
      - uses: actions/upload-artifact@v4
        if: ${{ !cancelled() }}
        with:
          name: blob-report-${{ matrix.shard }}
          path: blob-report/
          retention-days: 7
  merge-reports:
    needs: e2e
    if: ${{ !cancelled() }}
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: npm ci
      - uses: actions/download-artifact@v4
        with: { path: all-blob-reports, pattern: 'blob-report-*', merge-multiple: true }
      - run: npx playwright merge-reports --reporter html ./all-blob-reports
      - uses: actions/upload-artifact@v4
        with: { name: html-report, path: playwright-report/, retention-days: 30 }
```

## Retry and Flaky Test Detection

### Retry Configuration

- CI: `retries: 2` -- catches transient failures (network, timing)
- Local: `retries: 0` -- immediate feedback, no masking of real bugs
- `forbidOnly: !!process.env.CI` -- prevents accidental `.only` from reaching CI

### Detecting Retry Inside a Test

```typescript
test('submits form data', async ({ page }) => {
  if (test.info().retry) {
    await page.evaluate(() => sessionStorage.clear())
  }
  // ... test body
})
```

- `test.info().retry` returns current retry attempt (0 on first run)
- Use to reset browser state, clear storage, or re-seed data on retry

### Result Categories

- **passed**: succeeded on first attempt
- **flaky**: failed first attempt, passed on retry -- tracked separately in reports
- **failed**: failed all attempts including retries

### Re-Running Failures and Annotations

- `npx playwright test --last-failed` -- re-runs only previous failures (requires `.last-run.json`)

```typescript
test('network-dependent operation', async ({ page }) => {
  test.fixme(process.env.CI === 'true', 'Flaky on CI due to DNS timing')
  // ... test body
})
```

- `test.fixme()` -- skips with reason, shows as "fixme" in reports
- `test.slow()` -- triples test timeout, signals known slow behavior
- `test.skip()` -- unconditional skip with reason

## Reporting Configuration

### Multi-Reporter Setup

- `html` -- interactive report with trace viewer integration
- `list` -- console pass/fail per test (useful for CI logs)
- `json` -- machine-readable for custom dashboards
- `junit` -- XML for CI systems (GitHub Actions, Jenkins, GitLab)

### CI Reporter Strategy

```typescript
reporter: process.env.CI
  ? [['html'], ['json', { outputFile: 'results/report.json' }], ['junit', { outputFile: 'results/junit.xml' }]]
  : [['html']]
```

- CI: all formats for archival, dashboards, and CI integration
- Local: HTML only -- opens with `npx playwright show-report`

### Allure Reporter

Allure is the industry-standard visual reporting layer for CI test results, providing history trends, screenshots, traces, and team dashboards. Install: `npm install --save-dev allure-playwright`.

Include Allure alongside the HTML reporter to preserve local `npx playwright show-report` access:

```typescript
reporter: process.env.CI
  ? [
      ['allure-playwright', { detail: true, outputFolder: 'allure-results', suiteTitle: true }],
      ['html', { open: 'never' }],
      ['junit', { outputFile: 'test-results/junit.xml' }],
    ]
  : [['html']],
```

For full setup (history trends, GitHub Actions upload steps, artifact retention policy, test annotations): see `allure-patterns.md`.

### Trace, Video, and Screenshot Settings

- `trace: 'on-first-retry'` -- captures only on failure retry; saves storage, preserves evidence
- `video: 'retain-on-failure'` -- records all, keeps only failures
- `screenshot: 'only-on-failure'` -- captures at moment of failure
- Set any to `'on'` to capture every test (useful for debugging but storage-intensive)

### Merging Sharded Reports and Retention

- Each shard writes to `blob-report/`; merge: `npx playwright merge-reports --reporter html ./all-blob-reports`
- Produces unified report across all shards; works with `json` and `junit` too
- Retention: feature branches 7 days, main 30 days, blob reports 1 day (intermediate only)

## Debugging Strategies

### Trace Viewer (Primary Tool)

- `npx playwright show-trace trace.zip` -- opens trace in browser
- Shows every action, network request, console log, and DOM snapshot
- Timeline scrubbing: frame-by-frame execution review
- Network tab: request/response bodies, headers, timing

### Structured Steps for Readable Traces

```typescript
test('checkout flow', async ({ page }) => {
  await test.step('Add item to cart', async () => {
    await page.getByTestId('add-to-cart').click()
    await expect(page.getByTestId('cart-count')).toHaveText('1')
  })
  await test.step('Complete checkout', async () => {
    await page.getByTestId('checkout-btn').click()
    await page.getByTestId('confirm-btn').click()
  })
})
```

- `test.step()` groups actions under named sections in the trace viewer
- Steps can be nested for hierarchical organization

### Interactive and Environment Debugging

- `await page.pause()` -- pauses execution, opens Playwright Inspector (remove before committing -- CI will hang)
- `PWDEBUG=1 npx playwright test` -- headed with Inspector open
- `PWDEBUG=console` -- adds `playwright` object to DevTools console
- `DEBUG=pw:api npx playwright test` -- verbose API logging
- VS Code extension: run/debug from editor, pick locator, record at cursor, time-travel trace debugging

### Console and Error Inspection

```typescript
test('no console errors on load', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  await page.goto('/dashboard')
  expect(errors).toEqual([])
})
```

- `page.on('console', ...)` -- captures all console output
- `page.on('pageerror', ...)` -- captures uncaught exceptions
- Attach listeners before navigation to catch early errors

## Performance Testing

### Core Web Vitals Measurement

```typescript
test('homepage meets CWV thresholds', async ({ page }) => {
  await page.goto('/')
  const cwv = await page.evaluate(() =>
    new Promise<{ lcp: number; cls: number }>((resolve) => {
      let lcp = 0, cls = 0
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) lcp = Math.max(lcp, (e as any).startTime)
      }).observe({ type: 'largest-contentful-paint', buffered: true })
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) cls += (e as any).value
      }).observe({ type: 'layout-shift', buffered: true })
      setTimeout(() => resolve({ lcp, cls }), 3000)
    })
  )
  expect(cwv.lcp).toBeLessThan(2500)  // Good LCP: < 2.5s
  expect(cwv.cls).toBeLessThan(0.1)   // Good CLS: < 0.1
})
```

### Navigation Timing

- `performance.getEntriesByType('navigation')` -- page load breakdown
- Key metrics: `domContentLoadedEventEnd`, `loadEventEnd`, `responseStart` (TTFB)
- Run via `page.evaluate()` after navigation completes

### Network Throttling via CDP

```typescript
test('loads under slow 3G', async ({ page }) => {
  const client = await page.context().newCDPSession(page)
  await client.send('Network.emulateNetworkConditions', {
    offline: false,
    downloadThroughput: (1.6 * 1024 * 1024) / 8, // 1.6 Mbps
    uploadThroughput: (750 * 1024) / 8,            // 750 Kbps
    latency: 562,                                   // Slow 3G RTT
  })
  await page.goto('/')
  await expect(page.getByTestId('main-content')).toBeVisible({ timeout: 15000 })
})
```

- CDP sessions only available with Chromium-based browsers
- Use `test.skip()` annotation when running against Firefox or WebKit
- Reset network conditions between tests or use a dedicated project config
