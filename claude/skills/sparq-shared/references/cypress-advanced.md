# Cypress Advanced Patterns Reference

> Cypress-specific. Consumed by sparq-cypress-best-practices skill.
> See `test-generation-patterns.md` for A11Y category checklists.
> See `cypress-patterns.md` for core patterns (page objects, locators, intercepts, custom commands).

## Component Testing

Cypress component testing mounts individual components in isolation using framework-specific adapters.

- Install the framework adapter: `cypress/vue` (Vue 3) or `cypress/react18` (React 18)
- Configure `cypress.config.ts` with `component` key:

```typescript
import { defineConfig } from 'cypress'

export default defineConfig({
  component: {
    devServer: { framework: 'vue', bundler: 'vite' },
    specPattern: 'cypress/component/**/*.cy.{ts,tsx}',
    supportFile: 'cypress/support/component.ts',
  },
})
```

### Provider Wrapping

- Vue + Pinia: wrap `cy.mount()` with a custom command that installs the store
- Vue + Router: pass `router` instance via `global.plugins`
- React: wrap with context providers via a custom mount helper
- Always create a reusable `mountWithProviders` command in `cypress/support/component.ts`

### Patterns

- Props testing: pass different prop values to `cy.mount()`, assert rendered output
- Slot testing (Vue): `cy.mount(MyComponent, { slots: { default: 'Content' } })`
- Event testing: use `cy.stub()` as handler, assert with `.should('have.been.calledWith', ...)`
- Avoid testing internal state -- assert only on rendered output and emitted events

### Example: Vue Component with Pinia Store

```typescript
import { createTestingPinia } from '@pinia/testing'
import { mount } from 'cypress/vue'
import UserProfile from '@/components/UserProfile.vue'

Cypress.Commands.add('mountWithPinia', (component, options = {}) => {
  const pinia = createTestingPinia({ stubActions: false, ...options.piniaOptions })
  return mount(component, {
    global: { plugins: [pinia, ...(options.plugins ?? [])] },
    ...options,
  })
})

describe('UserProfile', () => {
  it('renders user name from store', () => {
    cy.mountWithPinia(UserProfile, {
      piniaOptions: { initialState: { user: { name: 'Jane Doe' } } },
    })
    cy.get('[data-testid="user-name"]').should('contain', 'Jane Doe')
  })

  it('emits update event on edit', () => {
    const onUpdate = cy.stub().as('updateHandler')
    cy.mountWithPinia(UserProfile, { props: { onUpdate } })
    cy.get('[data-testid="edit-btn"]').click()
    cy.get('@updateHandler').should('have.been.calledOnce')
  })
})
```

## Visual Regression Testing

Visual regression catches unintended layout and style changes by comparing screenshots against approved baselines.

- Percy: install `@percy/cypress` + `@percy/cli`, use `cy.percySnapshot('name')`
- Applitools: wrap with `cy.eyesOpen()` / `cy.eyesClose()`, capture via `cy.eyesCheckWindow()`
- Match levels (Applitools): `Strict` (default), `Layout` (ignore text), `Content` (ignore colors)
- Use visual testing for layout-heavy pages and design system components
- Use assertion-based testing for logic, data correctness, and user flows
- Baseline approval is a manual step -- integrate into PR review workflow

### Example: Percy with Dynamic Masking

```typescript
cy.percySnapshot('Dashboard', {
  percyCSS: `
    .timestamp, .avatar, .ad-banner { visibility: hidden !important; }
    .animated-element { animation: none !important; }
  `,
})

// Multi-viewport snapshots
const viewports: Cypress.ViewportPreset[] = ['iphone-6', 'ipad-2', 'macbook-15']
viewports.forEach(size => {
  it(`renders correctly on ${size}`, () => {
    cy.viewport(size)
    cy.visit('/dashboard')
    cy.percySnapshot(`Dashboard - ${size}`)
  })
})
```

## Accessibility Testing

Automated a11y scanning with `cypress-axe` catches WCAG violations early.

- Install: `cypress-axe` + `axe-core`; import in `cypress/support/e2e.ts`
- Inject before scanning: `cy.injectAxe()` (once per page load)
- Full page: `cy.checkA11y()`
- Scoped: `cy.checkA11y('#main-content')`
- Exclude regions: `cy.checkA11y(null, { exclude: ['.third-party-widget'] })`
- Severity-based CI: fail on `critical` + `serious`, warn on `moderate`
- Progressive adoption: start with `includedImpacts: ['critical']`, expand over sprints
- Rule filtering by WCAG tag: `runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] }`
- Disable flaky rules: `rules: { 'scrollable-region-focusable': { enabled: false } }`

### Example: A11y Test with Severity Filtering

```typescript
describe('Dashboard Accessibility', () => {
  beforeEach(() => {
    cy.visit('/dashboard')
    cy.injectAxe()
  })

  it('has no critical or serious a11y violations', () => {
    cy.checkA11y(null, {
      includedImpacts: ['critical', 'serious'],
    }, (violations) => {
      violations.forEach(v => {
        Cypress.log({
          name: 'a11y',
          message: `[${v.impact}] ${v.id}: ${v.description}`,
          consoleProps: () => v,
        })
      })
    })
  })

  it('scoped scan on form region', () => {
    cy.checkA11y('#login-form', {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
    })
  })
})
```

## CI/CD Integration

### Example: GitHub Actions Workflow

```yaml
name: Cypress E2E
on: [push, pull_request]
jobs:
  cypress:
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        containers: [1, 2, 3]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/cache@v4
        with:
          path: |
            ~/.cache/Cypress
            node_modules
          key: cypress-${{ runner.os }}-${{ hashFiles('package-lock.json') }}
      - uses: cypress-io/github-action@v6
        with:
          build: npm run build
          start: npm run dev
          wait-on: 'http://localhost:3000'
          wait-on-timeout: 120
          browser: chrome
          parallel: true
          record: true
          group: 'E2E - Chrome'
        env:
          CYPRESS_RECORD_KEY: ${{ secrets.CYPRESS_RECORD_KEY }}
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: cypress-artifacts-${{ matrix.containers }}
          path: |
            cypress/screenshots
            cypress/videos
          retention-days: 7
```

### Key Practices

- `--parallel --record` requires Cypress Cloud (or Sorry Cypress for self-hosted)
- Matrix `containers` count should match Cypress Cloud parallelization slots
- `fail-fast: false` ensures all containers complete -- partial results are still useful
- Cache `~/.cache/Cypress` to avoid re-downloading the binary on every run
- Upload screenshots and videos only on failure to save storage
- Docker alternative: `cypress/included:13.x.x` image for consistent browser versions
- `wait-on` prevents tests from starting before the dev server is ready

## Reporting and Debugging

- **Mochawesome**: install `cypress-mochawesome-reporter`, set as reporter in config; merge per-spec JSON with `mochawesome-merge`, render HTML with `mochawesome-report-generator`
- **JUnit**: `reporter: 'junit'`, `reporterOptions: { mochaFile: 'results/junit-[hash].xml' }` -- for Jenkins, GitLab, Azure DevOps
- **Multi-reporter**: `cypress-multi-reporters` outputs Mochawesome (humans) + JUnit (CI) simultaneously via `reporter-config.json`
- `cy.log('Step: filling login form')` -- documents test steps in the Command Log
- `cy.debug()` -- pauses execution, opens DevTools at current command
- `cy.pause()` -- pauses test runner; resume manually in Cypress UI
- `cy.screenshot('descriptive-name')` -- capture at key points for post-mortem analysis
- Video: `video: false` in CI by default; enable only for debugging or failure re-runs
- `videoCompression: 32` (default) -- lower values = better quality, larger files
- Disable video for component tests -- only useful for E2E flows

## Performance Optimization

### Authentication: API Over UI

- UI login: ~3-5s per test (visit, type, click, wait); API login: ~200-500ms
- Always prefer API login with `cy.session()` for test isolation:

```typescript
Cypress.Commands.add('loginViaApi', (username: string, password: string) => {
  cy.session([username, password], () => {
    cy.request('POST', '/api/auth/login', { username, password }).then(res => {
      window.localStorage.setItem('auth_token', res.body.token)
    })
  }, {
    cacheAcrossSpecs: true,
    validate: () => {
      cy.request({ url: '/api/auth/me', failOnStatusCode: false })
        .its('status').should('eq', 200)
    },
  })
})
```

### Example: Performance-Optimized Config

```typescript
export default defineConfig({
  e2e: {
    video: false,
    screenshotOnRunFailure: true,
    numTestsKeptInMemory: 0,
    experimentalMemoryManagement: true,
    defaultCommandTimeout: 10000,
    retries: { runMode: 2, openMode: 0 },
  },
})
```

### Network and Navigation

- Stub expensive endpoints with `cy.intercept()` -- eliminates network latency
- Cache static fixtures in `cypress/fixtures/` -- avoid inline response bodies
- Call `cy.visit()` once per `describe` in `beforeEach`; use in-app navigation within
- `cy.session()` with `cacheAcrossSpecs: true` avoids re-authentication across spec files

### Spec Parallelism

- Balance spec file sizes -- very small specs have overhead; very large block parallelization
- Target 30-90 seconds per spec for optimal parallel distribution
- Group related tests to share `before` setup costs
- Use `--parallel` with Cypress Cloud or Sorry Cypress for cross-machine distribution
