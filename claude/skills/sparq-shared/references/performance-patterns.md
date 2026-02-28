# Performance Patterns Reference

> Consumed by: `sparq:performance` skill
> Cross-referenced by: `playwright-ci-reporting.md` (Web Vitals collection)

Conventions, cheat sheets, and CI integration patterns for performance testing alongside SparQ-generated E2E suites.

## Directory Structure Conventions

```
project-root/
  k6/
    load-tests/       # per-feature browser scripts (login-flow.js, checkout-flow.js)
    scenarios/        # reusable executor configs (ramp-up.js, spike.js, soak.js)
    thresholds.js     # shared threshold definitions imported by load-tests
  artillery/
    load-tests/       # YAML scenario definitions (login-flow.yml)
    flows/            # Playwright flow functions (login.js, checkout.js)
  lighthouse/
    lighthouserc.js   # project root preferred; move here only if root is cluttered
```

Performance test artifacts (HTML reports, JSON outputs) go to `.sparq/performance/` — never commit them; add to `.gitignore`.

## When to Use Each Tier

### Tier 1 — Web Vitals in Playwright (always appropriate)

- Team has existing Playwright tests and wants a quick performance baseline
- No new tooling budget or infra needed
- Works in existing CI pipeline alongside functional suite
- Run on every PR — these tests are fast (< 5s per page)

### Tier 2 — Load Testing with k6 or Artillery (when load capacity matters)

- App will face real concurrent users and team needs to know breaking points
- Pre-launch load validation (staging, not production)
- Run nightly or on release branches — NOT on every PR (too slow, too costly)
- Choose k6 when: single binary preferred, team knows JS, Grafana integration needed
- Choose Artillery when: YAML scenario definitions preferred, want to reuse Playwright flow functions with minimal changes

### Tier 3 — Lighthouse CI Gates (when deploying to production regularly)

- Team wants automated regression prevention — catches performance regressions before they ship
- Run on every PR against a local preview build (not against live staging)
- Lower overhead than load tests; runs in 60–90s for 3–5 pages
- Use `temporary-public-storage` upload for quick setup; self-host LHCI server for persistent dashboards

## Web Vitals Thresholds Reference (Google Core Web Vitals 2025)

All three metrics must score "good" for a page to pass Core Web Vitals assessment.

### LCP — Largest Contentful Paint

- Good: < 2500ms
- Needs improvement: 2500ms – 4000ms
- Poor: >= 4000ms
- Typical targets by page type:
  - Marketing / landing pages: < 2000ms
  - Authenticated dashboards: < 3000ms
  - Heavy data tables: < 3500ms

### INP — Interaction to Next Paint (replaced FID in March 2024)

- Good: < 200ms
- Needs improvement: 200ms – 500ms
- Poor: >= 500ms
- Measured after any user interaction (click, keypress, tap)
- FID is deprecated; INP is the 2025 standard

### CLS — Cumulative Layout Shift

- Good: < 0.1
- Needs improvement: 0.1 – 0.25
- Poor: >= 0.25
- Unitless score; lower is better
- Reserve explicit dimensions for images, ads, embeds to prevent shifts

### Supporting Metrics (not Core Web Vitals, but useful for diagnostics)

- **FCP** (First Contentful Paint): < 1800ms good
- **TBT** (Total Blocking Time, lab proxy for INP): < 200ms good
- **TTI** (Time to Interactive): < 3800ms good

## k6 Browser Module API Cheat Sheet

k6 browser API mirrors Playwright's `Page` API. Direct substitution applies for most methods.

```javascript
// Navigation — same as Playwright
await page.goto(url)
await page.waitForURL(pattern, { timeout: 10_000 })
await page.waitForSelector(selector, { state: 'visible' })
await page.waitForLoadState('load')

// Locators — same Playwright methods
await page.getByTestId('my-input').fill('value')
await page.getByRole('button', { name: 'Submit' }).click()
await page.getByLabel('Email').fill('test@example.com')
await page.locator('[data-testid="nav"]').click()

// Assertions — use k6 check() instead of expect()
import { check } from 'k6'
check(page, {
  'on dashboard':    (p) => p.url().includes('/dashboard'),
  'title correct':   (p) => p.title().includes('Dashboard'),
})

// Metrics — emit custom histograms
import { Trend } from 'k6/metrics'
const loginDuration = new Trend('login_duration_ms', true)
loginDuration.add(Date.now() - start)

// Environment variables
const baseUrl = __ENV.BASE_URL ?? 'http://localhost:3000'

// Built-in Web Vitals thresholds (auto-collected by k6 browser)
// browser_web_vital_lcp, browser_web_vital_cls, browser_web_vital_fid
// browser_web_vital_ttfb, browser_web_vital_fcp, browser_http_req_duration
```

### k6 Executor Types

- `constant-vus`: fixed number of VUs for a duration — baseline and endurance tests
- `ramping-vus`: stages that increase/decrease VU count — ramp-up and spike tests
- `constant-arrival-rate`: fixed request rate regardless of VU response time — throughput tests
- `ramping-arrival-rate`: staged arrival rate — realistic traffic growth simulation

```javascript
// Ramp-up scenario config
scenarios: {
  ramp: {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: '30s', target: 10 },   // ramp up
      { duration: '60s', target: 10 },   // hold
      { duration: '30s', target: 0 },    // ramp down
    ],
  },
},
```

## Artillery Playwright Engine Config Reference

```yaml
config:
  target: "http://localhost:3000"
  phases:
    - duration: 60          # seconds
      arrivalRate: 5        # new VUs per second
      name: "Warm up"
    - duration: 60
      arrivalRate: 5
      rampTo: 20            # linear ramp
      name: "Ramp up"
    - duration: 120
      arrivalRate: 20       # sustained load
      name: "Sustained"
  engines:
    playwright:
      launchOptions:
        headless: true
        args: ['--no-sandbox']
  processor: "./flows/my-flow.js"
  ensure:
    p95: 5000               # 95th percentile < 5s; test fails otherwise
    maxErrorRate: 2         # fail if > 2% of requests error
  plugins:
    expect: {}              # enables soft assertions via `artillery.expect`
```

Flow function signature:

```javascript
// artillery/flows/my-flow.js
module.exports = { myFlow }

async function myFlow(page, vuContext, events, test) {
  // page: Playwright Page — full API available
  // vuContext.vars: scenario variables (target, custom vars)
  // events: metric emitter — events.emit('histogram', name, value)
  // test: Artillery test context
}
```

## Tagging Performance Tests in Playwright

Use `test.describe.configure` with tag syntax to control execution:

```typescript
// Tag at describe block level
test.describe('@performance Web Vitals', () => {
  test.describe.configure({ mode: 'serial' })  // run vitals tests sequentially
  // ...
})

// Run only performance tests
// npx playwright test --grep @performance

// Exclude performance tests from main suite
// npx playwright test --grep-invert @performance
```

File naming convention: `*.perf.spec.ts` — allows project-level include/exclude without tag matching.

## CI Integration Patterns

### Principle: Performance tests run nightly, not on every PR

```
Every PR  → Tier 1 (Web Vitals in Playwright, fast) + Tier 3 (Lighthouse CI, < 90s)
Nightly   → Tier 2 (k6 / Artillery load tests, minutes to hours)
Pre-release → All tiers against staging environment
```

### GitHub Actions: Nightly Load Test Job

```yaml
# .github/workflows/nightly-load.yml
name: Nightly Load Tests
on:
  schedule:
    - cron: '0 2 * * *'   # 2 AM UTC nightly

jobs:
  k6-load:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: grafana/setup-k6-action@v1
      - name: Start app
        run: npm ci && npm run build && npm run preview &
      - name: Wait for server
        run: npx wait-on http://localhost:4173 --timeout 30000
      - name: Run k6 load tests
        run: k6 run --out json=k6-results.json k6/load-tests/login-flow.js
        env:
          BASE_URL: http://localhost:4173
      - uses: actions/upload-artifact@v4
        with:
          name: k6-results
          path: k6-results.json
```

### GitHub Actions: PR Lighthouse Gate

```yaml
# Part of existing CI workflow
- name: Build and preview
  run: npm run build && npm run preview &
- name: Wait for server
  run: npx wait-on http://localhost:4173 --timeout 30000
- name: Lighthouse CI
  run: npx lhci autorun
  env:
    LHCI_GITHUB_APP_TOKEN: ${{ secrets.LHCI_GITHUB_APP_TOKEN }}
```

## Performance Budget Concepts

A performance budget is a hard cap on a metric — exceeding it fails CI.

### Budget per Page Type

- **Landing / marketing**: LCP < 2.0s, TBT < 150ms, payload < 500KB (gzipped)
- **Authenticated dashboard**: LCP < 3.0s, TBT < 300ms, payload < 1MB (gzipped)
- **Checkout / payment**: LCP < 2.5s, INP < 100ms, total JS < 300KB
- **Search results**: INP < 100ms (filter interactions), LCP < 2.5s

### Payload Budget per Route

Track JavaScript, CSS, and total transfer size — not just timing:

```javascript
// lighthouserc.js assertions for payload budgets
'total-byte-weight':       ['error', { maxNumericValue: 500_000 }],   // 500KB total
'unused-javascript':       ['warn',  { maxNumericValue: 100_000 }],   // 100KB unused JS
'render-blocking-resources': ['warn', { maxNumericValue: 500 }],      // 500ms blocking
```

### Setting Realistic Budgets

1. Measure current production values (Lighthouse, Chrome DevTools, CrUX dashboard)
2. Set budget at current value + 10% tolerance (not aspirational targets)
3. Tighten budget 5–10% each quarter as a performance improvement target
4. Never set a budget that current code already violates — CI will never be green

## See Also

- `config-schema.md` — `viewports`, `ci.provider`, and `preferences.smokeVerify` config fields referenced by performance patterns; use when configuring Tier 1 Web Vitals collection or CI-based reporting
- `degradation-strategy.md` — fallback chain when k6, Artillery, or Lighthouse CI are unavailable in the CI environment; apply retry and circuit-breaker patterns before failing the performance gate
