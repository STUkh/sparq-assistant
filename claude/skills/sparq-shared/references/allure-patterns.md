# Allure Reports Integration Patterns

> Consumed by: sparq-automation-engineer, sparq-playwright-best-practices.
> For CI reporter strategy without Allure, see `playwright-ci-reporting.md`.
> For general CI workflow generation, see `bin/lib/ci.mjs`.

<allure_setup>

## Installation

**Playwright**:
```bash
npm install --save-dev allure-playwright
```

**Cypress**:
```bash
npm install --save-dev allure-cypress
```

## Playwright Reporter Config (`playwright.config.ts`)

```typescript
reporter: [
  ['allure-playwright', {
    detail: true,
    outputFolder: 'allure-results',
    suiteTitle: true,
    categories: [
      { name: 'Flaky tests', matchedStatuses: ['broken'] },
      { name: 'Product defects', matchedStatuses: ['failed'] },
    ],
  }],
  ['html', { open: 'never' }], // keep HTML as fallback
],
```

Use `process.env.CI` guard to add Allure only in CI environments when also running locally:

```typescript
reporter: process.env.CI
  ? [
      ['allure-playwright', { detail: true, outputFolder: 'allure-results', suiteTitle: true }],
      ['html', { open: 'never' }],
      ['junit', { outputFile: 'test-results/junit.xml' }],
    ]
  : [['html']],
```

## Cypress Reporter Config (`cypress.config.ts`)

```typescript
import allureWriter from 'allure-cypress/writer'

export default defineConfig({
  e2e: {
    setupNodeEvents(on, config) {
      allureWriter(on, config)
      return config
    },
  },
  reporter: 'allure-cypress',
  reporterOptions: {
    resultsDir: 'allure-results',
  },
})
```

</allure_setup>

<github_actions_integration>

## GitHub Actions — Basic Allure Upload

After tests complete, generate and upload the Allure report:

```yaml
- name: Generate Allure report
  if: always()
  run: npx allure generate allure-results -o allure-report --clean

- name: Upload Allure report
  if: always()
  uses: actions/upload-artifact@v4
  with:
    name: allure-report
    path: allure-report/
    retention-days: 14
```

## GitHub Actions — Using Allure GitHub Action

For direct URL access without downloading artifacts:

```yaml
- name: Publish Allure report
  if: always()
  uses: simple-elf/allure-report-action@master
  with:
    allure_results: allure-results
    allure_report: allure-report
    gh_pages: gh-pages
    allure_history: allure-history
```

Or with branch-based history via `fescobar/allure-report-branch-action@v1`:

```yaml
- name: Publish Allure report to GitHub Pages
  if: always()
  uses: fescobar/allure-report-branch-action@v1
  with:
    allure_results: allure-results
    allure_report: allure-report
    gh_pages: gh-pages
    allure_history: allure-history
```

## Deploy to GitHub Pages

```yaml
- name: Deploy Allure report to GitHub Pages
  if: always()
  uses: peaceiris/actions-gh-pages@v4
  with:
    github_token: ${{ secrets.GITHUB_TOKEN }}
    publish_dir: allure-report
    publish_branch: gh-pages
    destination_dir: allure-report
```

Requires Pages enabled on `gh-pages` branch in repository settings.

</github_actions_integration>

<allure_history>

## Historical Trend Charts

For trend charts to work across CI runs, carry forward the previous run's history artifacts.

```yaml
- name: Load Allure history
  uses: actions/download-artifact@v4
  with:
    name: allure-history
    path: allure-results/history
  continue-on-error: true   # first run has no history — safe to fail

- name: Run E2E tests
  run: npx playwright test

- name: Generate Allure report
  if: always()
  run: npx allure generate allure-results -o allure-report --clean

- name: Upload Allure history for next run
  if: always()
  uses: actions/upload-artifact@v4
  with:
    name: allure-history
    path: allure-report/history/
    retention-days: 90

- name: Upload Allure report
  if: always()
  uses: actions/upload-artifact@v4
  with:
    name: allure-report
    path: allure-report/
    retention-days: 14
```

The `continue-on-error: true` on the download step is critical — on the first CI run there is no previous `allure-history` artifact, so the download will fail without it.

</allure_history>

<allure_features>

## Test Code Annotations (Playwright)

```typescript
import { test } from '../../fixtures'
import { allure } from 'allure-playwright'

test('TC-login-HP-001: successful login with valid credentials', async ({ page }) => {
  await allure.feature('Login')
  await allure.story('Happy Path')
  await allure.severity('critical')
  await allure.label('TC-ID', 'TC-login-HP-001')

  await test.step('Navigate to login page', async () => {
    await page.goto('/login')
  })

  await test.step('Submit credentials', async () => {
    await page.getByLabel('Email').fill('user@example.com')
    await page.getByLabel('Password').fill('P@ssw0rd123!')
    await page.getByRole('button', { name: 'Sign in' }).click()
  })

  await test.step('Verify redirect to dashboard', async () => {
    await expect(page).toHaveURL('/dashboard')
  })
})
```

## Automatic Attachments

- Screenshots: attached automatically on failure when `screenshot: 'only-on-failure'` is set
- Traces: attach `.zip` trace files manually with `allure.attachment('trace', traceBuffer, 'application/zip')`
- Videos: Playwright retains on failure; attach with `allure.attachment('video', videoBuffer, 'video/webm')`

</allure_features>

<ci_best_practices>

## Artifact Retention Policy

- `allure-results/`: 3 days (raw data, only needed to generate the report)
- `allure-report/`: 14 days (generated HTML report for viewing)
- `allure-history/`: 90 days (enables trend charts across 90+ CI runs)

## Storage Considerations

- Raw `allure-results/` for a large suite (200+ tests with traces) can exceed 500 MB — always set short retention
- Avoid uploading `allure-results/` with traces enabled unless debugging; use `trace: 'on-first-retry'` to limit size
- For sharded test runs: merge `allure-results/` from each shard before calling `allure generate`:
  ```bash
  # Each shard uploads its allure-results/ with unique artifact names
  # Then in merge job:
  npx allure generate all-allure-results/ -o allure-report --clean
  ```

## When to Add Allure

Add Allure to `playwright.config.ts` when:
- CI provider is detected in `sparq.config.json` (`ci.provider` field)
- OR user explicitly requests Allure during setup (`/sparq:config` or `/sparq:init`)

Always include HTML reporter alongside Allure as fallback for local runs.

</ci_best_practices>
