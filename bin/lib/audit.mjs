// bin/lib/audit.mjs — Prompt maturity audit engine

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  AUDIT_SENTINEL_END,
  AUDIT_SENTINEL_START,
  MATURITY_LEVELS,
  SPARQ_RULE_FILE,
} from './constants.mjs'
import { emoji, heading, info, isDryRun, ok, style, warn } from './state.mjs'

// ---------------------------------------------------------------------------
// Dimension Definitions
// ---------------------------------------------------------------------------

export const DIMENSIONS = Object.freeze([
  {
    id: 'e2e-patterns',
    label: 'E2E Testing Patterns',
    mentionPatterns: [/playwright/i, /cypress/i, /e2e\s+test/i],
    completePatterns: [
      /page\.goto|cy\.visit/i,
      /expect\(|should\(/i,
      /locator|findBy|getBy|data-testid/i,
    ],
  },
  {
    id: 'manual-testing',
    label: 'Manual Testing Guidelines',
    mentionPatterns: [/manual\s+test/i, /test\s+case/i, /QA\s+checklist/i],
    completePatterns: [
      /acceptance\s+criteria/i,
      /test\s+steps|preconditions/i,
      /expected\s+result|actual\s+result/i,
    ],
  },
  {
    id: 'naming-conventions',
    label: 'Test Naming Conventions',
    mentionPatterns: [/naming\s+convention/i, /naming\s+pattern/i, /file\s+naming/i],
    completePatterns: [/\.spec\.|\.test\.|\.cy\./i, /describe.*should|it.*should|test\.describe/i],
  },
  {
    id: 'coverage-requirements',
    label: 'Coverage Requirements',
    mentionPatterns: [/coverage/i, /test\s+coverage/i, /code\s+coverage/i],
    completePatterns: [
      /threshold|minimum.*\d+%/i,
      /happy\s+path|edge\s+case|\bHP\b|\bVE\b|\bSEC\b|\bEC\b|\bA11Y\b/i,
    ],
  },
  {
    id: 'ci-integration',
    label: 'CI/CD Integration',
    mentionPatterns: [/ci\/cd|ci\s+cd|continuous\s+integration|pipeline/i],
    completePatterns: [
      /github\s+actions|gitlab\s+ci|azure\s+devops|circleci|jenkins/i,
      /npm\s+test|npm\s+run\s+test|npx\s+playwright|npx\s+cypress/i,
    ],
  },
  {
    id: 'framework-selectors',
    label: 'Framework-Specific Patterns',
    mentionPatterns: [/data-testid/i, /selector|locator\s+strateg/i],
    completePatterns: [
      /getByRole|getByLabel|getByText|findByRole/i,
      /v-if|v-for|\$emit|useEffect|useState|@Component|ng-|\{#each\}|\{#if\}|bind:|createSignal|querySelector|addEventListener/i,
    ],
  },
  {
    id: 'page-objects',
    label: 'Page Object Patterns',
    mentionPatterns: [/page\s+object|page\s+model|POM/i],
    completePatterns: [
      /base\s*page|abstract\s*page|extends.*Page/i,
      /get\s+(accessor|locator|selector)|get\s+\w+\(\)/i,
    ],
  },
  {
    id: 'test-data',
    label: 'Fixture & Test Data',
    mentionPatterns: [/fixture|test\s+data|mock\s+data/i],
    completePatterns: [
      /seed\s+data|factory|faker|example\.com/i,
      /beforeEach|beforeAll|afterEach|setup|teardown/i,
    ],
  },
  {
    id: 'error-handling',
    label: 'Error Handling in Tests',
    mentionPatterns: [/error\s+handling|error\s+state|negative\s+test/i],
    completePatterns: [
      /timeout|retry|flaky|stability/i,
      /expect.*toThrow|expect.*reject|expect.*error/i,
    ],
  },
  {
    id: 'accessibility',
    label: 'Accessibility Testing',
    mentionPatterns: [/accessibility|a11y|wcag|aria/i],
    completePatterns: [
      /axe|lighthouse|tab.*order|focus.*management/i,
      /role=|aria-label|getByRole|screen\s+reader/i,
    ],
  },
])

// ---------------------------------------------------------------------------
// Prompt Templates
// ---------------------------------------------------------------------------

function extractE2EContext(config) {
  const fw = config?.e2e?.framework || 'playwright'
  const isPW = fw === 'playwright'
  const dirs = config?.e2e?.structure || {}
  return {
    isPW,
    pages: dirs.pages || 'e2e/pages',
    specs: dirs.specs || 'e2e/specs',
    fixtures: dirs.fixtures || 'e2e/fixtures',
    components: dirs.components || 'e2e/components',
    steps: dirs.steps || 'e2e/steps',
    baseClass: config?.e2e?.baseClass || (isPW ? 'e2e/pages/base.page.ts' : ''),
    fixtureIndex: config?.e2e?.fixtureIndex || (isPW ? 'e2e/fixtures/index.ts' : ''),
  }
}

const PROMPT_TEMPLATES = {
  'testing-architecture': {
    file: 'testing-architecture.md',
    dimensions: ['e2e-patterns', 'naming-conventions'],
    levels: [0, 1, 2],
    generate(config) {
      const { isPW, pages, specs, fixtures, components, steps, baseClass, fixtureIndex } =
        extractE2EContext(config)

      return `# Testing Architecture

## Directory Structure
- Pages: \`${pages}/\` — page objects encapsulating UI interactions
- Components: \`${components}/\` — reusable component objects
- Steps: \`${steps}/\` — high-level step functions
- Fixtures: \`${fixtures}/\` — test data and setup helpers
- Specs: \`${specs}/\` — test specification files${baseClass ? `\n- Base class: \`${baseClass}\`` : ''}${fixtureIndex ? `\n- Fixture index: \`${fixtureIndex}\`` : ''}

## Import Rules
${
  isPW
    ? `- Specs MUST import test/expect from \`${fixtureIndex || 'fixtures'}\` — NEVER from \`@playwright/test\`
- Page objects extend the base class from \`${baseClass || 'base.page.ts'}\`
- Import page objects and components from barrel \`index.ts\` in each directory`
    : `- Specs import \`cy\` globally — no explicit test runner import needed
- Page objects and custom commands live in \`cypress/support/\`
- Import shared utilities from \`cypress/support/commands.ts\``
}

## File Naming
- Page objects: \`{feature}.page.ts\`
- Components: \`{component}.component.ts\`
- Steps: \`{feature}.steps.ts\`
- Specs: \`{feature}${isPW ? '.spec.ts' : '.cy.ts'}\`
- Every new file MUST have a barrel \`index.ts\` update in its directory

## Framework
- E2E: ${isPW ? 'Playwright' : 'Cypress'}
- Config: \`${isPW ? 'playwright.config.ts' : 'cypress.config.ts'}\`
`
    },
  },

  'page-object-conventions': {
    file: 'page-object-conventions.md',
    dimensions: ['page-objects'],
    levels: [0, 1, 2],
    generate(config) {
      const { isPW, baseClass } = extractE2EContext(config)
      const uiFramework = config?.techStack?.uiFramework || ''
      const locPriority = config?.preferences?.locatorPriority || [
        'data-testid',
        'role',
        'label',
        'text',
        'css',
      ]

      return `# Page Object Conventions

## Pattern
${
  isPW
    ? `- All page objects extend the base class from \`${baseClass || 'base.page.ts'}\`
- Locators MUST use \`get\` accessors (NOT constructor assignments)
- Return \`Locator\` type from \`@playwright/test\`
- URL from route constants — never hardcode paths`
    : `- Page objects use class pattern with \`Chainable\` return types
- Element accessors use \`get\` methods returning \`cy.get()\` chains
- Visit methods use \`cy.visit()\` with route constants`
}

## Example
\`\`\`typescript
${
  isPW
    ? `import { BasePage } from './base.page'

export class LoginPage extends BasePage {
  get usernameInput() { return this.page.getByTestId('login-username') }
  get passwordInput() { return this.page.getByTestId('login-password') }
  get submitButton() { return this.page.getByRole('button', { name: 'Sign in' }) }

  async login(username: string, password: string) {
    await this.usernameInput.fill(username)
    await this.passwordInput.fill(password)
    await this.submitButton.click()
  }
}`
    : `export class LoginPage {
  get usernameInput() { return cy.get('[data-testid="login-username"]') }
  get passwordInput() { return cy.get('[data-testid="login-password"]') }
  get submitButton() { return cy.get('[data-testid="login-submit"]') }

  login(username: string, password: string) {
    this.usernameInput.type(username)
    this.passwordInput.type(password)
    this.submitButton.click()
  }
}`
}
\`\`\`

## Locator Priority (highest to lowest)
${locPriority.map((p, i) => `${i + 1}. \`${p}\``).join('\n')}
${
  uiFramework
    ? `
## ${uiFramework} Selectors
- UI framework components wrap native inputs — always add \`data-testid\` on the outer component
- For wrapped inputs: use \`.locator('input')\` inside the component container
- Check framework-specific roles: dialogs, toasts, dropdowns have custom DOM structure`
    : ''
}

## Rules
- NEVER recreate existing page objects — extend with new methods
- ALWAYS update barrel \`index.ts\` after adding a new file
- Read existing patterns before generating new page objects
`
    },
  },

  'testability-guidelines': {
    file: 'testability-guidelines.md',
    dimensions: ['framework-selectors', 'accessibility'],
    levels: [0, 1, 2, 3],
    generate(config) {
      const fw = (config?.techStack?.framework || '').toLowerCase()
      const uiFramework = config?.techStack?.uiFramework || ''

      let frameworkSection = ''
      if (fw === 'vue') {
        frameworkSection = `
## Vue-Specific Testability
- Add \`data-testid\` to template root elements and interactive children
- Use \`$emit\` for state changes — tests can listen for emitted events
- Expose loading/error states via template refs or data attributes
- Use \`v-if\`/\`v-show\` with data attributes for conditional visibility`
      } else if (fw === 'react') {
        frameworkSection = `
## React-Specific Testability
- Add \`data-testid\` to JSX elements, especially dynamic ones
- Use callback props for state changes — tests verify calls
- Expose loading/error states via ARIA attributes (\`aria-busy\`, \`aria-invalid\`)
- Avoid anonymous inline handlers that prevent mocking`
      } else if (fw === 'angular') {
        frameworkSection = `
## Angular-Specific Testability
- Add \`data-testid\` via attribute binding: \`[attr.data-testid]\`
- Use \`@Output()\` EventEmitters for state changes
- Expose states via \`[attr.data-state]\` bindings
- Ensure all \`*ngIf\` blocks have corresponding test coverage`
      } else if (fw === 'svelte') {
        frameworkSection = `
## Svelte-Specific Testability
- Add \`data-testid\` to elements — Svelte compiles away, so attributes reach the DOM
- Use \`bind:value\` and \`on:event\` for state changes — tests verify final DOM state
- Expose loading/error states via \`data-state\` attributes on container elements
- Use \`{#if}\`/\`{#each}\` blocks with testid on wrapper elements for conditional visibility`
      } else {
        frameworkSection = `
## General Testability
- Add \`data-testid\` to all interactive and stateful elements
- Use semantic HTML elements (\`<button>\`, \`<input>\`, \`<a>\`) for natural accessibility
- Expose state via \`data-*\` attributes (e.g., \`data-state="loading"\`) rather than CSS classes
- Prefer standard DOM APIs — \`querySelector\`, \`addEventListener\` — for predictable test hooks`
      }

      return `# Testability Guidelines

## data-testid Placement
- Every interactive element (button, input, link, select) MUST have \`data-testid\`
- Format: \`{feature}-{element}\` (e.g., \`login-submit-btn\`, \`user-name-input\`)
- Container elements wrapping forms or sections also need \`data-testid\`
- Tables: testid on table container, NOT on individual rows

## ARIA Attributes
- All form inputs MUST have associated labels (\`label[for]\` or \`aria-label\`)
- Buttons MUST have accessible names (text content or \`aria-label\`)
- Dialogs MUST have \`aria-labelledby\` pointing to title element
- Status messages MUST have \`role="alert"\` or \`aria-live="polite"\`
${frameworkSection}${
  uiFramework
    ? `
## ${uiFramework} Testability
- UI framework wraps native inputs — always add \`data-testid\` to outer component
- Use framework-provided slots/props for custom test attributes when available
- Check framework docs for recommended testing approaches`
    : ''
}

## Component Structure
- Emit events for state changes (enables assertion in tests)
- Expose loading/error states via data attributes or ARIA
- Avoid dynamic class-only state indicators — use \`data-state="loading"\` instead

## Anti-Patterns to Avoid
- Dynamically generated testids (e.g., \`data-testid={\`item-\${index}\`}\`)
- CSS-class-only selectors for state (fragile across UI framework upgrades)
- \`setTimeout\`-dependent UI state transitions (untestable race conditions)
- Inline anonymous event handlers that prevent mocking
`
    },
  },

  'test-modification-guide': {
    file: 'test-modification-guide.md',
    dimensions: ['test-data', 'error-handling'],
    levels: [0, 1, 2],
    generate(config) {
      const { isPW, pages, specs, fixtures } = extractE2EContext(config)

      return `# Modifying E2E Tests

## When to Update Tests
- Selector changed (testid renamed, element restructured) — update page object locator
- Route path changed — update page object URL getter and \`goto()\` calls
- Form field added/removed — update page object, step methods, and spec
- Button text changed — update locator (if using getByRole/getByText)
- API response shape changed — update fixtures/mocks

## Safe Modification Process
1. Find affected page object(s) in \`${pages}/\`
2. Update locators (\`get\` accessors) to match new selectors
3. Update step methods if interaction flow changed
4. Update specs to cover new behavior
5. Verify: ${isPW ? '`npx playwright test --list`' : '`npx tsc --noEmit`'}

## Adding Tests for New Features
1. Check if a page object already exists for the feature area
2. If yes: add new locators and methods to existing page object
3. If no: create new page object extending the base class
4. Create or extend spec file in \`${specs}/{feature}/\`
5. Update barrel \`index.ts\` in every directory where files were added

## Fixture & Mock Updates
${
  isPW
    ? `- Update factory functions in \`${fixtures}/\`
- Re-export via \`index.ts\`
- API response shapes must match current TypeScript interfaces`
    : `- Update \`cypress/fixtures/*.json\` for static data
- Update custom commands in \`cypress/support/commands.ts\`
- API response shapes must match current TypeScript interfaces`
}

## Selector Synchronization
- When renaming a \`data-testid\` in application code, grep \`${pages}/\` for the old value
- When removing an element, check which tests assert on it
- When moving an element to a different component, restructure the page object

## Error Handling in Tests
- Use explicit waits on network calls — never \`waitForTimeout()\`
- Add retry logic for flaky selectors with \`toBeVisible()\` or \`should('be.visible')\`
- Assert error states explicitly (toast messages, form validation errors)
- Each test MUST be independently runnable — no shared state between tests

## Regression Tests
- Bug fixes: append inline \`test.describe\` to the relevant feature spec in \`${specs}/\`
- Use \`REG-{ticket}-{NNN}\` in the test title (e.g., \`REG-BUG-142-001\`)
- Filter: \`npx playwright test --grep "REG-"\`
`
    },
  },

  'test-coverage-strategy': {
    file: 'test-coverage-strategy.md',
    dimensions: ['manual-testing', 'coverage-requirements'],
    levels: [0, 1, 2, 3],
    generate() {
      return `# Test Coverage Strategy

## Test Categories (ordered by priority)
1. **Happy Path (HP)**: Primary user flow end-to-end, valid data, successful outcome
2. **Validation Errors (VE)**: Per-field validation (empty, format, length), form-level validation
3. **Security (SEC)**: Unauthorized access, session handling, XSS/injection prevention
4. **Edge Cases (EC)**: Double-click, back button, concurrent tabs, empty states, large datasets
5. **Accessibility (A11Y)**: Keyboard navigation, screen reader, focus management, color contrast

## Priority-Based Coverage Targets
- P1 Critical (auth, data integrity, payments): HP + VE + SEC automated, 100% coverage
- P2 High (daily workflows, common paths): HP + VE automated, 90% coverage
- P3 Medium (secondary flows, a11y): HP minimum automated, 70% coverage
- P4 Low (cosmetic, rare paths): manual testing acceptable

## When Suggesting Tests
- New feature: suggest at least HP + VE tests; flag SEC/EC/A11Y gaps
- Bug fix: suggest regression test (single focused spec) in addition to the fix
- Refactor: suggest running existing test suite; flag any selector changes needed
- PR review: check if changed code paths have test coverage; suggest additions for gaps

## Test Naming
- Test case IDs: \`TC-{feature}-{category}-{number}\` (e.g., TC-login-HP-001)
- Spec descriptions: \`describe('{Feature}')\` > \`it('{should + behavior}')\`
- Regression IDs: \`REG-{ticket}-{number}\`

## What NOT to Test in E2E
- Pure computation (unit test these instead)
- Third-party library internals
- Visual pixel-perfect layout (use visual regression tools)
- Performance benchmarks (use dedicated perf tooling)
`
    },
  },

  'ci-test-integration': {
    file: 'ci-test-integration.md',
    dimensions: ['ci-integration'],
    levels: [0, 1, 2],
    generate(config) {
      const { isPW } = extractE2EContext(config)

      return `# CI & Test Execution

## Running Tests Locally
${
  isPW
    ? `- Full suite: \`npx playwright test\`
- Single file: \`npx playwright test {path}\`
- List tests (no run): \`npx playwright test --list\`
- Debug mode: \`npx playwright test --debug\`
- UI mode: \`npx playwright test --ui\``
    : `- Full suite: \`npx cypress run\`
- Single file: \`npx cypress run --spec {path}\`
- Verify setup: \`npx cypress verify\`
- Interactive mode: \`npx cypress open\``
}
- Type check: \`npx tsc --noEmit\`

## CI Configuration
- Tests run headless in CI (no --headed flag)
${
  isPW
    ? `- Install browsers first: \`npx playwright install --with-deps\`
- Use \`--reporter=github\` for CI-friendly output`
    : `- Ensure cypress binary is cached between runs
- Use \`--reporter mocha-junit-reporter\` for CI-friendly output`
}

## Debugging Failures
${
  isPW
    ? `- Check \`test-results/\` for traces and screenshots
- Use \`--trace on\` for full trace recording
- Replay traces: \`npx playwright show-trace {trace.zip}\``
    : `- Check \`cypress/screenshots/\` and \`cypress/videos/\`
- Enable video recording: \`video: true\` in cypress.config.ts`
}
- Flaky test indicators: passes locally but fails in CI (timing), passes alone but fails in suite (state leak)
- Common fixes: add explicit waits on network calls, ensure test isolation

## Test Isolation Rules
- Each test MUST be independently runnable
- Never depend on test execution order
- Clean up test data in afterEach/fixture cleanup
${isPW ? "- Use `test.describe.configure({ mode: 'parallel' })` when safe" : '- Parallelism is across spec files — not within a single file'}

## Smoke Verification Before PR
${isPW ? '- `npx playwright test --list` (ensures all tests parse)' : '- `npx tsc --noEmit` + `npx cypress verify`'}
- Run changed specs: target affected files specifically
`
    },
  },
}

// ---------------------------------------------------------------------------
// Scanning
// ---------------------------------------------------------------------------

function readFileSafe(filePath) {
  try {
    return readFileSync(filePath, 'utf-8')
  } catch {
    return null
  }
}

function scanMdFilesInDir(dir, prefix) {
  const contents = []
  const files = []
  try {
    for (const f of readdirSync(dir)) {
      if (!f.endsWith('.md')) continue
      const text = readFileSafe(join(dir, f))
      if (text !== null) {
        contents.push(text)
        files.push(`${prefix}${f}`)
      }
    }
  } catch {
    /* directory unreadable */
  }
  return { contents, files }
}

function scanSkillFiles(skillsDir) {
  const contents = []
  const files = []
  try {
    for (const d of readdirSync(skillsDir)) {
      const text = readFileSafe(join(skillsDir, d, 'SKILL.md'))
      if (text !== null) {
        contents.push(text)
        files.push(`.claude/skills/${d}/SKILL.md`)
      }
    }
  } catch {
    /* directory unreadable */
  }
  return { contents, files }
}

function collectMarkdownContent(targetDir) {
  const contents = []
  const filesScanned = []

  const claudeMd = readFileSafe(join(targetDir, 'CLAUDE.md'))
  if (claudeMd !== null) {
    contents.push(claudeMd)
    filesScanned.push('CLAUDE.md')
  }

  const claudeDir = join(targetDir, '.claude')
  if (!existsSync(claudeDir)) return { corpus: contents.join('\n'), filesScanned }

  const dirs = [
    { path: join(claudeDir, 'rules'), prefix: '.claude/rules/' },
    { path: join(claudeDir, 'agents'), prefix: '.claude/agents/' },
  ]

  for (const { path, prefix } of dirs) {
    if (!existsSync(path)) continue
    const result = scanMdFilesInDir(path, prefix)
    contents.push(...result.contents)
    filesScanned.push(...result.files)
  }

  const skillsDir = join(claudeDir, 'skills')
  if (existsSync(skillsDir)) {
    const result = scanSkillFiles(skillsDir)
    contents.push(...result.contents)
    filesScanned.push(...result.files)
  }

  return { corpus: contents.join('\n'), filesScanned }
}

function scoreDimension(corpus, dimension) {
  const findings = []
  let mentionCount = 0
  let completeCount = 0

  for (const pattern of dimension.mentionPatterns) {
    if (pattern.test(corpus)) {
      mentionCount++
      findings.push({ type: 'mention', pattern: pattern.source })
    }
  }

  for (const pattern of dimension.completePatterns) {
    if (pattern.test(corpus)) {
      completeCount++
      findings.push({ type: 'complete', pattern: pattern.source })
    }
  }

  let score = 0
  if (mentionCount > 0 && completeCount >= 2) score = 2
  else if (mentionCount > 0 || completeCount > 0) score = 1

  return { score, findings }
}

function scoreToLevel(totalScore) {
  if (totalScore === 0) return 0
  if (totalScore <= 5) return 1
  if (totalScore <= 10) return 2
  if (totalScore <= 15) return 3
  return 4
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function auditPromptMaturity(targetDir) {
  if (!existsSync(targetDir)) {
    const dimensions = {}
    for (const dim of DIMENSIONS) {
      dimensions[dim.id] = { score: 0, findings: [], label: dim.label }
    }
    return {
      level: 0,
      levelName: MATURITY_LEVELS[0],
      totalScore: 0,
      maxScore: DIMENSIONS.length * 2,
      dimensions,
      filesScanned: [],
      gaps: DIMENSIONS.map((d) => d.id),
      recommendations: [],
      targetDirMissing: true,
    }
  }

  const claudeMdExists = existsSync(join(targetDir, 'CLAUDE.md'))
  const claudeDirExists = existsSync(join(targetDir, '.claude'))

  // Level 0 gate: no AI setup at all
  if (!claudeMdExists && !claudeDirExists) {
    const dimensions = {}
    for (const dim of DIMENSIONS) {
      dimensions[dim.id] = { score: 0, findings: [], label: dim.label }
    }
    return {
      level: 0,
      levelName: MATURITY_LEVELS[0],
      totalScore: 0,
      maxScore: DIMENSIONS.length * 2,
      dimensions,
      filesScanned: [],
      gaps: DIMENSIONS.map((d) => d.id),
      recommendations: DIMENSIONS.map((d) => ({
        dimension: d.id,
        label: d.label,
        action: `Add ${d.label.toLowerCase()} guidance to your AI prompts`,
        priority: 'high',
      })),
    }
  }

  const { corpus, filesScanned } = collectMarkdownContent(targetDir)
  const dimensions = {}
  let totalScore = 0
  const gaps = []

  for (const dim of DIMENSIONS) {
    const { score, findings } = scoreDimension(corpus, dim)
    dimensions[dim.id] = { score, findings, label: dim.label }
    totalScore += score
    if (score < 2) gaps.push(dim.id)
  }

  const level = scoreToLevel(totalScore)
  const levelName = MATURITY_LEVELS[level]

  const recommendations = gaps.map((id) => {
    const dim = DIMENSIONS.find((d) => d.id === id)
    const score = dimensions[id].score
    return {
      dimension: id,
      label: dim.label,
      action:
        score === 0
          ? `Add ${dim.label.toLowerCase()} guidance to your AI prompts`
          : `Expand ${dim.label.toLowerCase()} with concrete patterns and examples`,
      priority: score === 0 ? 'high' : 'medium',
    }
  })

  return {
    level,
    levelName,
    totalScore,
    maxScore: DIMENSIONS.length * 2,
    dimensions,
    filesScanned,
    gaps,
    recommendations,
  }
}

export function generatePromptFiles(targetDir, auditResult, config) {
  const promptsDir = join(targetDir, '.sparq', 'prompts')
  const generated = []

  if (!isDryRun()) {
    mkdirSync(promptsDir, { recursive: true })
  }

  for (const [, template] of Object.entries(PROMPT_TEMPLATES)) {
    // Skip if this template doesn't apply at this maturity level
    if (!template.levels.includes(auditResult.level)) continue

    // At Level 2+, only generate for dimensions that have gaps
    if (auditResult.level >= 2) {
      const hasGap = template.dimensions.some((d) => auditResult.gaps.includes(d))
      if (!hasGap) continue
    }

    const content = template.generate(config || {})
    const filePath = join(promptsDir, template.file)

    if (isDryRun()) {
      info(`Would generate: .sparq/prompts/${template.file}`)
    } else {
      writeFileSync(filePath, content, 'utf-8')
      ok(`Generated: .sparq/prompts/${template.file}`)
    }
    generated.push(template.file)
  }

  return generated
}

export function updateRuleFileReferences(targetDir, generatedFiles) {
  const ruleFile = join(targetDir, '.claude', 'rules', SPARQ_RULE_FILE)

  if (!existsSync(ruleFile)) {
    warn('Rule file not found — skipping @path reference injection')
    return
  }

  let content
  try {
    content = readFileSync(ruleFile, 'utf-8')
  } catch {
    warn('Cannot read rule file — skipping @path reference injection')
    return
  }

  // Build the new reference block
  const refs = generatedFiles.map((f) => `@.sparq/prompts/${f}`).join('\n')
  const newBlock = [
    AUDIT_SENTINEL_START,
    '## Testing Architecture',
    '',
    refs,
    AUDIT_SENTINEL_END,
  ].join('\n')

  const startIdx = content.indexOf(AUDIT_SENTINEL_START)
  const endIdx = content.indexOf(AUDIT_SENTINEL_END)

  if (startIdx !== -1 && endIdx !== -1 && startIdx < endIdx) {
    // Replace existing block
    content = `${content.slice(0, startIdx)}${newBlock}${content.slice(endIdx + AUDIT_SENTINEL_END.length)}`
  } else if (startIdx !== -1 || endIdx !== -1) {
    // Unbalanced sentinels — warn and append fresh block
    warn('Unbalanced audit sentinels in rule file — appending new block')
    content = `${content.trimEnd()}\n\n${newBlock}\n`
  } else {
    // No sentinels — append new block
    content = `${content.trimEnd()}\n\n${newBlock}\n`
  }

  if (isDryRun()) {
    info(
      `Would update: .claude/rules/${SPARQ_RULE_FILE} with ${generatedFiles.length} @path references`,
    )
  } else {
    writeFileSync(ruleFile, content, 'utf-8')
    ok(`Updated: .claude/rules/${SPARQ_RULE_FILE} with ${generatedFiles.length} @path references`)
  }
}

const LEVEL_COLORS = { 0: 'red', 1: 'yellow', 2: 'yellow', 3: 'cyan', 4: 'green' }
const SCORE_ICONS = [style.red('\u2717'), style.yellow('\u25CB'), style.green('\u2713')]
const SCORE_LABELS = ['missing', 'partial', 'complete']

function formatDimensionLines(result) {
  return DIMENSIONS.map((dim) => {
    const d = result.dimensions[dim.id]
    return `    ${SCORE_ICONS[d.score]} ${dim.label.padEnd(28)} ${style.dim(SCORE_LABELS[d.score])}`
  })
}

function formatRecommendationLines(recommendations) {
  return recommendations.map((rec) => {
    const icon = rec.priority === 'high' ? style.red('\u25B6') : style.yellow('\u25B6')
    return `    ${icon} ${rec.action}`
  })
}

export function formatAuditReport(result) {
  const lines = []

  lines.push('')
  heading(`${emoji.audit}Prompt Maturity Audit`)
  lines.push('')

  const colorFn = style[LEVEL_COLORS[result.level]] || style.dim
  lines.push(
    `  Level: ${colorFn(`${result.level} "${result.levelName}"`)}  (${result.totalScore}/${result.maxScore} points)`,
  )
  lines.push('')

  lines.push(`  ${style.bold('Dimensions')}`)
  lines.push(...formatDimensionLines(result))
  lines.push('')

  if (result.filesScanned.length > 0) {
    lines.push(
      `  ${style.dim(`Scanned ${result.filesScanned.length} file(s): ${result.filesScanned.join(', ')}`)}`,
    )
    lines.push('')
  }

  if (result.recommendations.length > 0) {
    lines.push(`  ${style.bold('Recommendations')}`)
    lines.push(...formatRecommendationLines(result.recommendations))
    lines.push('')
    lines.push(`  ${style.dim('Run with --fix to generate supplementary prompts automatically.')}`)
  } else {
    lines.push(`  ${style.green('\u2713 All dimensions covered — production-ready!')}`)
  }

  lines.push('')

  for (const line of lines) {
    console.log(line)
  }
}
