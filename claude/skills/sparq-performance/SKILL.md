---
name: sparq:performance
description: "Guiding teams to add performance testing (k6, Artillery) alongside their SparQ-generated E2E tests. Covers Web Vitals assertions, load test scripts, Lighthouse CI integration, and converting Playwright tests to k6 browser scripts. Use when: user asks about performance testing, load testing, k6, artillery, web vitals, lighthouse, performance regression, lcp fid cls, or wants to measure speed and load capacity."
triggers:
  - performance testing
  - load testing
  - k6
  - artillery
  - web vitals
  - lighthouse
  - performance regression
  - lcp fid cls
audience: qa
---

# Performance Testing Consulting

This consulting skill helps teams add performance testing alongside their functional E2E suite. SparQ-generated tests cover correctness; performance tests measure speed, load capacity, and Web Vitals compliance.

> **Code-level E2E generation patterns** live in `playwright-patterns.md` and `e2e-common-patterns.md`. This skill covers performance-specific tooling and integration strategies with zero content overlap.

## Three Coverage Tiers

- **Tier 1 — Web Vitals in Playwright**: Add Core Web Vitals assertions directly to existing Playwright tests using `PerformanceObserver`. Zero new tooling — runs alongside functional suite.
- **Tier 2 — Load Testing**: Simulate concurrent users with k6 (browser module, Playwright-like API) or Artillery (native Playwright engine). Converts HP-category SparQ tests into load scenarios.
- **Tier 3 — Lighthouse CI Quality Gates**: Automated Lighthouse audits in CI as hard pass/fail gates on performance score and Web Vitals. Blocks deploys on performance regression.

## Quick Reference

Match user question to the right tier:

- **"Are my pages fast enough?" / "Web Vitals" / "LCP CLS"** → Tier 1: Web Vitals assertions in Playwright
- **"How many users can my app handle?" / "load test" / "k6" / "artillery"** → Tier 2: Load testing scripts
- **"Block deploys on performance regression" / "lighthouse" / "CI gate"** → Tier 3: Lighthouse CI
- **"Convert my Playwright tests to load tests"** → Conversion guide below
- **"Which tool should I use?" / "compare k6 vs artillery"** → Present tool selection guide
- **Multiple topics or "full setup"** → Present all tiers in sequence

## Workflow

### Step 1: Read Config

Read `sparq.config.json`:
- `e2e.framework`: determines which conversion examples to show (playwright or cypress)
- `e2e.structure.specs`: locate existing HP-category tests to use as load test base
- If config missing, proceed with Playwright as default and note that Artillery and k6 are framework-agnostic

### Step 2: Detect Topic or Present Index

Analyze user input for topic keywords (see Quick Reference above). If topic is clear, present the matching tier with code examples.

If no specific topic detected, present the tier index:

```
Performance Testing — pick a tier or ask a question:

  1. Web Vitals in Playwright — LCP/CLS/INP assertions with zero new tooling
  2. Load Testing with k6   — browser-based load tests using Playwright-like API
  3. Load Testing with Artillery — native Playwright engine for load scenarios
  4. Lighthouse CI Gates    — automated performance quality gates in GitHub Actions
  5. Convert E2E to Load    — step-by-step guide to adapt SparQ HP tests
```

### Step 3: Present Tier

After identifying the relevant tier(s):

1. **Summarize** the key principles (3-5 bullets)
2. **Show code examples** matching the user's E2E framework
3. **State thresholds** with the 2025 Google Core Web Vitals reference values
4. **Highlight anti-patterns** to avoid (e.g., measuring vitals before page is interactive)
5. **Cross-reference** adjacent tiers: "Tier 1 is fast to add — want Tier 2 for load simulation too?"

### Step 4: Offer Follow-Up

After presenting a tier:
- Suggest adjacent tiers relevant to the user's goal
- Offer to help identify which existing SparQ HP tests to convert first
- If the user wants to generate new E2E tests, route to `/sparq:generate-e2e`

<tier1_web_vitals>

## Tier 1: Web Vitals Assertions in Playwright

Add Core Web Vitals collection directly to existing Playwright tests using `PerformanceObserver`. No new tools required — runs inside the existing Playwright suite.

**Key rule**: Collect vitals after the page is fully interactive, not at navigation start. Tag performance tests with `@performance` to allow selective execution in CI.

### Web Vitals Thresholds (Google Core Web Vitals 2025)

- **LCP** (Largest Contentful Paint): < 2.5s good, < 4.0s needs improvement, >= 4.0s poor
- **INP** (Interaction to Next Paint, replaced FID in 2024): < 200ms good, < 500ms needs improvement, >= 500ms poor
- **CLS** (Cumulative Layout Shift): < 0.1 good, < 0.25 needs improvement, >= 0.25 poor

### Collection Helper (page object or shared fixture)

```typescript
// e2e/helpers/web-vitals.ts
import type { Page } from '@playwright/test'

export interface WebVitals {
  lcp?: number   // ms
  inp?: number   // ms
  cls?: number   // score (unitless)
}

export async function collectWebVitals(page: Page, timeoutMs = 5000): Promise<WebVitals> {
  return page.evaluate(
    (timeout) =>
      new Promise<WebVitals>((resolve) => {
        const metrics: WebVitals = {}
        const done = () => resolve(metrics)

        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (entry.entryType === 'largest-contentful-paint') metrics.lcp = entry.startTime
            if (entry.entryType === 'event' && entry.name === 'pointerdown') {
              metrics.inp = (entry as PerformanceEventTiming).processingStart - entry.startTime
            }
            if (entry.entryType === 'layout-shift' && !(entry as any).hadRecentInput) {
              metrics.cls = ((metrics.cls ?? 0) + (entry as any).value)
            }
          }
        })

        observer.observe({ entryTypes: ['largest-contentful-paint', 'event', 'layout-shift'] })
        setTimeout(() => { observer.disconnect(); done() }, timeout)
      }),
    timeoutMs,
  )
}
```

### Using the Helper in Tests

```typescript
// e2e/specs/performance/homepage.perf.spec.ts
import { expect, test } from '../../fixtures'
import { collectWebVitals } from '../../helpers/web-vitals'

test.describe('@performance Homepage Web Vitals', () => {
  test('TC-homepage-PERF-001: Page meets Core Web Vitals thresholds', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('load')

    // Trigger a user interaction to capture INP
    await page.keyboard.press('Tab')

    const vitals = await collectWebVitals(page)

    expect(vitals.lcp, 'LCP should be under 2.5s').toBeLessThan(2500)
    expect(vitals.cls, 'CLS should be under 0.1').toBeLessThan(0.1)
    if (vitals.inp !== undefined) {
      expect(vitals.inp, 'INP should be under 200ms').toBeLessThan(200)
    }
  })
})
```

### Playwright Config: Selective Performance Tag

```typescript
// playwright.config.ts — run perf tests separately from functional suite
export default defineConfig({
  projects: [
    { name: 'functional', testMatch: /(?<!\.perf)\.spec\.ts/ },
    { name: 'performance', testMatch: /\.perf\.spec\.ts/, grep: /@performance/ },
  ],
})
```

</tier1_web_vitals>

<tier2_k6>

## Tier 2: Load Testing with k6 Browser Module

k6's browser module uses a Playwright-like API — existing Playwright knowledge transfers directly. k6 measures throughput, latency, and Web Vitals under concurrent user load.

**Key rule**: Base k6 browser scripts on your HP-category Playwright tests. Remove UI assertions; keep navigation waits and add threshold checks. Never port VE or error-path tests — load tests simulate normal user flows.

### Installation

```bash
# macOS
brew install k6

# Linux
sudo gpg -k && sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg \
  --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" \
  | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update && sudo apt-get install k6
```

### Directory Structure

```
k6/
  load-tests/         # per-feature browser scripts
    login-flow.js
    checkout-flow.js
  scenarios/          # reusable scenario configs
    ramp-up.js
    spike.js
  thresholds.js       # shared threshold definitions
```

### k6 Browser Script (converted from Playwright HP test)

```javascript
// k6/load-tests/login-flow.js
import { browser } from 'k6/experimental/browser'
import { check, sleep } from 'k6'
import { htmlReport } from 'https://raw.githubusercontent.com/benc-uk/k6-reporter/main/dist/bundle.js'

export const options = {
  scenarios: {
    browser: {
      executor: 'constant-vus',
      exec: 'browserTest',
      vus: 5,           // 5 concurrent virtual users
      duration: '30s',
      options: { browser: { type: 'chromium' } },
    },
  },
  thresholds: {
    browser_web_vital_lcp:      ['p(95) < 2500'],  // 95th percentile LCP < 2.5s
    browser_web_vital_cls:      ['p(99) < 0.1'],
    browser_web_vital_fid:      ['p(95) < 200'],
    'browser_http_req_duration': ['p(95) < 3000'],  // total page load < 3s
  },
}

export async function browserTest() {
  const page = await browser.newPage()
  try {
    await page.goto(__ENV.BASE_URL ?? 'http://localhost:3000/login')
    await page.waitForSelector('[data-testid="login-form"]', { state: 'visible' })

    await page.getByTestId('email').fill('test@example.com')
    await page.getByTestId('password').fill('P@ssw0rd123!')
    await page.getByTestId('submit').click()

    await page.waitForURL('**/dashboard', { timeout: 10_000 })

    check(page, {
      'landed on dashboard': (p) => p.url().includes('/dashboard'),
    })

    sleep(1)
  } finally {
    await page.close()
  }
}

export function handleSummary(data) {
  return {
    'k6-report.html': htmlReport(data),
    stdout: JSON.stringify(data.metrics, null, 2),
  }
}
```

### Running k6

```bash
# Local run against staging
k6 run --env BASE_URL=https://staging.example.com k6/load-tests/login-flow.js

# CI run with JSON output
k6 run --out json=k6-results.json k6/load-tests/login-flow.js

# Ramp scenario: 0 → 20 → 0 users over 2 minutes
k6 run --vus 1 --stage 30s:20,60s:20,30s:0 k6/load-tests/login-flow.js
```

### k6 vs Artillery: Choosing a Tool

- Use **k6** when: team already knows JavaScript, wants rich threshold DSL, needs Grafana integration, or wants a single binary with no npm setup
- Use **Artillery** when: team prefers YAML scenario definitions, already has Playwright tests to reuse directly, or needs simpler ramp configuration syntax

</tier2_k6>

<tier2_artillery>

## Tier 2: Load Testing with Artillery (Playwright Engine)

Artillery natively supports Playwright as a test engine. Existing Playwright flow logic can be ported with minimal changes — Artillery handles the concurrency model.

**Key rule**: Artillery flow functions receive a `page` object identical to Playwright's `Page`. Reuse the same `getByTestId`, `fill`, `click`, `waitForURL` calls from your existing SparQ page objects.

### Installation

```bash
npm install --save-dev artillery @artillery/engine-playwright
```

### Directory Structure

```
artillery/
  load-tests/         # YAML scenario definitions
    login-flow.yml
    checkout-flow.yml
  flows/              # Playwright flow functions
    login.js
    checkout.js
```

### YAML Scenario Definition

```yaml
# artillery/load-tests/login-flow.yml
config:
  target: "http://localhost:3000"
  phases:
    - duration: 60
      arrivalRate: 5      # 5 new virtual users per second
      name: "Steady load"
    - duration: 30
      arrivalRate: 5
      rampTo: 20          # ramp from 5 to 20/s over 30s
      name: "Ramp up"
  engines:
    playwright: {}
  processor: "./flows/login.js"
  ensure:
    p95: 3000             # 95th percentile response < 3s; fail otherwise
    maxErrorRate: 1       # fail if error rate exceeds 1%

scenarios:
  - name: "Login happy path"
    engine: playwright
    flowFunction: "loginFlow"
```

### Playwright Flow Function

```javascript
// artillery/flows/login.js
// Mirrors SparQ HP test — same selectors, no UI assertions
module.exports = { loginFlow }

async function loginFlow(page, vuContext, events) {
  const baseUrl = vuContext.vars.target ?? 'http://localhost:3000'
  const start = Date.now()

  await page.goto(`${baseUrl}/login`)
  await page.waitForSelector('[data-testid="login-form"]', { state: 'visible' })

  await page.getByTestId('email').fill('test@example.com')
  await page.getByTestId('password').fill('P@ssw0rd123!')
  await page.getByTestId('submit').click()

  await page.waitForURL('**/dashboard', { timeout: 10_000 })

  // Emit a custom timing histogram metric
  events.emit('histogram', 'login_flow_duration_ms', Date.now() - start)
}
```

### Running Artillery

```bash
# Local run
npx artillery run artillery/load-tests/login-flow.yml

# Against a specific target
npx artillery run --target https://staging.example.com artillery/load-tests/login-flow.yml

# Generate HTML report
npx artillery run --output artillery-report.json artillery/load-tests/login-flow.yml
npx artillery report artillery-report.json
```

</tier2_artillery>

<tier3_lighthouse>

## Tier 3: Lighthouse CI Quality Gates

Lighthouse CI runs automated Lighthouse audits in CI and enforces hard pass/fail gates on performance score and Web Vitals. Fails the build if performance regresses beyond configured thresholds.

**Key rule**: Run Lighthouse CI against a locally started preview build — not production. Gate on the metrics that matter most for your application type (content sites: LCP; SPAs: FID/INP + TTI).

### Installation

```bash
npm install --save-dev @lhci/cli
```

### Lighthouse CI Config

```javascript
// lighthouserc.js (project root)
module.exports = {
  ci: {
    collect: {
      // Pages to audit — add your critical routes
      url: [
        'http://localhost:4173/',
        'http://localhost:4173/login',
        'http://localhost:4173/dashboard',
      ],
      numberOfRuns: 3,                  // median of 3 runs for stability
      settings: { preset: 'desktop' },  // or 'mobile' per your primary audience
    },
    assert: {
      assertions: {
        'categories:performance':            ['error', { minScore: 0.8 }],
        'first-contentful-paint':            ['error', { maxNumericValue: 2000 }],
        'largest-contentful-paint':          ['error', { maxNumericValue: 2500 }],
        'cumulative-layout-shift':           ['error', { maxNumericValue: 0.1 }],
        'total-blocking-time':               ['warn',  { maxNumericValue: 300 }],
        'interactive':                       ['warn',  { maxNumericValue: 5000 }],
        'uses-optimized-images':             ['warn',  { minScore: 0 }],
        'uses-text-compression':             ['error', { minScore: 1 }],
      },
    },
    upload: {
      target: 'temporary-public-storage',  // free Lighthouse CI server; swap for self-hosted
    },
  },
}
```

### GitHub Actions Integration

```yaml
# .github/workflows/lighthouse.yml
name: Lighthouse CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  lighthouse:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - name: Build preview
        run: npm run build
      - name: Start preview server
        run: npm run preview &
      - name: Wait for server
        run: npx wait-on http://localhost:4173 --timeout 30000
      - name: Run Lighthouse CI
        run: npx lhci autorun
        env:
          LHCI_GITHUB_APP_TOKEN: ${{ secrets.LHCI_GITHUB_APP_TOKEN }}
```

### Severity Guidance for Assertion Levels

- `'error'`: blocks CI — use for LCP, CLS, FCP (user-visible, Google ranking signals)
- `'warn'`: reports but does not fail — use for TBT, TTI, image optimization (aspirational targets)

</tier3_lighthouse>

<conversion_guide>

## Converting SparQ E2E Tests to Performance Tests

SparQ-generated HP (Happy Path) tests are the best source for load test conversion — they represent realistic user flows.

### Which Tests to Convert

- Convert: HP-category tests for high-traffic flows (login, search, checkout, dashboard load, product listing)
- Do not convert: VE (validation/error), SEC (security), EC (edge case), A11Y tests — they do not represent normal load patterns

### Step-by-Step Conversion

1. **Pick an HP test** from your `e2e/specs/` directory as the base
2. **Extract the flow steps**: list each navigation, interaction, and wait in order
3. **Replace page object calls** with direct Playwright/k6 API calls — page objects add indirection that complicates load test portability
4. **Remove UI assertions** (`expect().toBeVisible()`, `expect().toHaveText()`) — keep only navigation waits (`waitForURL`, `waitForSelector`)
5. **Add performance thresholds** appropriate to the flow:
   - Login / auth flows: LCP < 2.5s, total duration < 3s
   - Checkout / payment flows: total duration < 5s
   - Dashboard / data-heavy pages: LCP < 3.5s, TBT < 500ms
   - Search / filter interactions: INP < 200ms, results visible < 2s
6. **Parameterize** the base URL via environment variable (`__ENV.BASE_URL` in k6, `vuContext.vars.target` in Artillery)

### Conversion Example

```typescript
// BEFORE: SparQ Playwright HP test (e2e/specs/auth/login.spec.ts)
test('TC-auth-HP-001: User can log in with valid credentials', async ({ page }) => {
  const loginPage = new LoginPage(page)
  await loginPage.goto()
  await loginPage.emailInput.fill('test@example.com')
  await loginPage.passwordInput.fill('P@ssw0rd123!')
  await loginPage.submitButton.click()
  await expect(page).toHaveURL(/dashboard/)
  await expect(loginPage.welcomeBanner).toBeVisible()
})
```

```javascript
// AFTER: k6 browser load test (k6/load-tests/login-flow.js)
export async function browserTest() {
  const page = await browser.newPage()
  try {
    await page.goto(`${__ENV.BASE_URL}/login`)
    await page.waitForSelector('[data-testid="login-form"]', { state: 'visible' })
    await page.getByTestId('email').fill('test@example.com')
    await page.getByTestId('password').fill('P@ssw0rd123!')
    await page.getByTestId('submit').click()
    await page.waitForURL('**/dashboard', { timeout: 10_000 })
    check(page, { 'reached dashboard': (p) => p.url().includes('/dashboard') })
  } finally {
    await page.close()
  }
}
```

**Key differences**: no page objects, no `expect()` assertions, `waitForURL` replaces `toHaveURL`, `check()` replaces hard assertions (k6 records failures as metrics, not test failures).

</conversion_guide>

<done_criteria>
- [ ] User understands the three tiers and when to apply each
- [ ] Appropriate tier recommended based on stated need (speed check = Tier 1, load capacity = Tier 2, CI regression gate = Tier 3)
- [ ] At least one working code example generated for the user's specific flow or framework
- [ ] Web Vitals thresholds set with correct 2025 Google Core Web Vitals reference values (LCP < 2.5s, INP < 200ms, CLS < 0.1)
- [ ] CI integration plan provided when Tier 3 is selected
- [ ] No duplication with `playwright-patterns.md` or `e2e-common-patterns.md` locator/POM content
</done_criteria>

## References

- `.claude/skills/sparq-shared/references/performance-patterns.md` — directory conventions, tool cheat sheets, CI integration, performance budgets
- `.claude/skills/sparq-shared/references/playwright-patterns.md` — code-level Playwright patterns (cross-ref for locator style, page objects)
- `.claude/skills/sparq-shared/references/data-driven-patterns.md` — parameterized test patterns applicable to load test data
- `.claude/skills/sparq-shared/references/playwright-ci-reporting.md` — CI sharding and reporter config (cross-ref)

## Usage

```
/sparq:performance
```

Examples:
- `"How do I add Web Vitals checks to my Playwright tests?"`
- `"Set up k6 load testing for our login flow"`
- `"Convert my Playwright happy path tests to Artillery load scenarios"`
- `"Add Lighthouse CI gates to our GitHub Actions pipeline"`
- `"Our LCP is too slow — how do I measure and gate on it?"`

## Example

**User**: "We want to make sure our checkout flow doesn't slow down under load. Where do we start?"

**Response flow**:
1. Detect topic: "load" + "checkout flow" → recommend Tier 2 (load testing) with Tier 1 as quick win
2. Locate HP tests for checkout via `e2e.structure.specs` in config
3. Present k6 conversion of the checkout HP test with `vus: 10, duration: '60s'`
4. Set threshold: `browser_http_req_duration: p(95) < 5000` for checkout flows
5. Offer follow-up: "Want to add Lighthouse CI gates too, so deploys block on performance regression?"
