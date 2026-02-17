# Cypress Architecture Reference

> Cypress-specific. Consumed by sparq-cypress-best-practices skill.
> See `e2e-common-patterns.md` for shared directory structure and locator priority.
> See `cypress-patterns.md` for page objects, components, steps, commands, and spec patterns.

## Project Structure

Enterprise directory layout extending `e2e-common-patterns.md` defaults. Read `e2e.structure.*` from `sparq.config.json` for project-specific overrides.

```
cypress/
  e2e/                          # Spec files organized by feature
    auth/
      login.spec.ts
      registration.spec.ts
    dashboard/
      overview.spec.ts
  support/
    commands/                   # Custom command modules (grouped by domain)
      auth.commands.ts
      api.commands.ts
      index.ts                  # Barrel — imports and registers all commands
    pages/                      # Page objects extending BasePage
      login.page.ts
      dashboard.page.ts
      index.ts                  # Barrel export
    components/                 # Reusable UI component wrappers
      form-field.component.ts
      toast.component.ts
      index.ts                  # Barrel export
    steps/                      # BDD step classes (Given/When/Then)
      auth.steps.ts
      index.ts                  # Barrel export
    e2e.ts                      # e2e support file — imports commands/index
    component.ts                # Component test support file (if component testing enabled)
    index.d.ts                  # Global type declarations for custom commands
  plugins/
    index.ts                    # setupNodeEvents — task registration, preprocessor
  fixtures/
    users.json                  # Static fixture data
    auth/
      valid-credentials.json
    api-responses/              # Stubbed API response payloads
      get-users.json
      create-order.json
  downloads/                    # Auto-created by Cypress for download assertions
  screenshots/                  # Auto-created on failure (gitignore)
  videos/                       # Auto-created in run mode (gitignore)
```

Key conventions:
- `support/commands/index.ts` is the single barrel that registers all custom commands via `import`
- `support/e2e.ts` is the support file loaded before every e2e spec (set via `supportFile` in config)
- `fixtures/api-responses/` separates API stubs from static test data for clarity
- `screenshots/` and `videos/` are gitignored -- CI artifacts only

## cypress.config.ts Deep Dive

Full enterprise configuration using `defineConfig()` with TypeScript:

```typescript
import { defineConfig } from 'cypress'

export default defineConfig({
  // Global settings
  viewportWidth: 1280,
  viewportHeight: 720,
  defaultCommandTimeout: 10000,
  requestTimeout: 15000,
  responseTimeout: 30000,
  watchForFileChanges: false,

  // Retry configuration -- separate for CI vs local
  retries: {
    runMode: 2,     // CI: retry failed tests twice
    openMode: 0,    // Local: no retries for fast feedback
  },

  // Cypress Cloud integration (optional)
  projectId: 'abc123',

  // Environment variables -- overridden per environment
  env: {
    apiUrl: 'http://localhost:3000/api',
    coverage: false,
  },

  e2e: {
    baseUrl: 'http://localhost:5173',
    specPattern: 'cypress/e2e/**/*.spec.ts',
    supportFile: 'cypress/support/e2e.ts',
    experimentalRunAllSpecs: true,

    setupNodeEvents(on, config) {
      // Task registration (see Plugin Architecture section)
      on('task', {
        'db:seed': require('./cypress/plugins/db-seed'),
        'db:reset': require('./cypress/plugins/db-reset'),
      })

      // Environment-specific config loading
      const envFile = config.env.configFile || 'dev'
      const envConfig = require(`./cypress/config/${envFile}.json`)
      return { ...config, ...envConfig }
    },
  },
})
```

Configuration priorities (highest wins):
- CLI flags: `--config baseUrl=https://staging.example.com`
- Environment overrides: `--env apiUrl=https://staging.example.com/api`
- `cypress.config.ts` values
- Cypress defaults

Multi-environment pattern:
- `cypress/config/dev.json` -- local development settings
- `cypress/config/staging.json` -- staging URLs and longer timeouts
- `cypress/config/prod.json` -- production smoke test settings (read-only assertions only)
- Select via: `npx cypress run --env configFile=staging`

## TypeScript Configuration

Cypress requires its own `tsconfig.json` to avoid conflicts with the application's TypeScript config.

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "isolatedModules": true,
    "types": ["cypress", "@testing-library/cypress"],
    "baseUrl": ".",
    "paths": {
      "@support/*": ["cypress/support/*"],
      "@fixtures/*": ["cypress/fixtures/*"],
      "@pages/*": ["cypress/support/pages/*"]
    }
  },
  "include": [
    "cypress/**/*.ts",
    "cypress.config.ts"
  ],
  "exclude": ["node_modules"]
}
```

Key rules:
- `types` array MUST include `"cypress"` -- provides global `cy`, `Cypress`, `describe`, `it`
- Add `"@testing-library/cypress"` to `types` when the package is installed
- Path aliases (`@support/*`, `@pages/*`) reduce brittle relative imports in specs
- Keep Cypress `tsconfig.json` at project root or `cypress/tsconfig.json` -- configure via `cypress.config.ts` if non-default location
- For component testing alongside e2e, use separate tsconfigs:
  - `cypress/tsconfig.e2e.json` -- e2e-specific includes
  - `cypress/tsconfig.component.json` -- component test includes with framework types

## Plugin Architecture

Plugins run in Node.js (not the browser). Use `setupNodeEvents` in `cypress.config.ts` to register tasks, preprocessors, and event hooks.

### `cy.task()` Registration

Tasks bridge the gap between browser-context tests and Node.js operations (database seeding, file system access, environment setup).

```typescript
// cypress/plugins/db-seed.ts
import { Pool } from 'pg'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

export async function seed(data: { table: string; rows: Record<string, unknown>[] }) {
  for (const row of data.rows) {
    const keys = Object.keys(row)
    const values = Object.values(row)
    const placeholders = keys.map((_, i) => `$${i + 1}`)
    await pool.query(
      `INSERT INTO ${data.table} (${keys.join(', ')}) VALUES (${placeholders.join(', ')})`,
      values
    )
  }
  return null // cy.task() must return a value or null
}
```

Registration in config:
```typescript
setupNodeEvents(on, config) {
  on('task', {
    'db:seed': seed,
    'db:reset': async () => { await pool.query('TRUNCATE users, orders CASCADE'); return null },
    'log': (message: string) => { console.log(message); return null },
  })
}
```

Usage in tests:
```typescript
beforeEach(() => {
  cy.task('db:reset')
  cy.task('db:seed', {
    table: 'users',
    rows: [{ id: 1, email: 'test.user@example.com', role: 'admin' }],
  })
})
```

Key rules:
- Every task MUST return a value or `null` -- returning `undefined` causes Cypress to error
- Tasks run in Node.js process -- they can access filesystem, databases, environment variables
- Keep tasks idempotent -- they may be called multiple times across retries

### Code Coverage Plugin

```typescript
setupNodeEvents(on, config) {
  require('@cypress/code-coverage/task')(on, config)
  return config
}
```

Add to `support/e2e.ts`:
```typescript
import '@cypress/code-coverage/support'
```

## Environment Management

Environment variables control test behavior across dev, staging, and production.

### Sources (highest priority wins)

- CLI: `npx cypress run --env apiUrl=https://staging.example.com/api,user=admin`
- `cypress.env.json` (gitignored -- local secrets only)
- `env` block in `cypress.config.ts`
- `setupNodeEvents` return value

### `cypress.env.json` (NEVER commit this file)

```json
{
  "apiUrl": "http://localhost:3000/api",
  "adminEmail": "test.admin@example.com",
  "adminPassword": "P@ssw0rd123!"
}
```

Add to `.gitignore`:
```
cypress.env.json
```

### Usage in Tests

```typescript
const apiUrl = Cypress.env('apiUrl')
cy.intercept('GET', `${apiUrl}/users`).as('getUsers')
```

### Environment-Aware Base URL

```typescript
// cypress/config/staging.json
{
  "baseUrl": "https://staging.example.com",
  "env": {
    "apiUrl": "https://staging.example.com/api",
    "coverage": false
  }
}
```

```typescript
// cypress.config.ts -- dynamic loading
setupNodeEvents(on, config) {
  const envName = config.env.configFile || 'dev'
  const envConfig = require(`./cypress/config/${envName}.json`)
  config.baseUrl = envConfig.baseUrl
  config.env = { ...config.env, ...envConfig.env }
  return config
}
```

Run against specific environment:
```bash
npx cypress run --env configFile=staging
npx cypress run --env configFile=prod --spec "cypress/e2e/smoke/**"
```

Security rules:
- NEVER commit `cypress.env.json` -- it may contain credentials
- Use placeholder values in committed config files (e.g., `"password": "REPLACE_ME"`)
- CI pipelines inject secrets via environment variables, not config files
- Production configs should only run read-only smoke tests -- never mutate production data
