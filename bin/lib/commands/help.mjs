// bin/lib/commands/help.mjs — Help command

import { SPARQ_LOGO, VERSION } from '../constants.mjs'
import { FEATURE_GROUPS, PRESET_FEATURES } from '../features.mjs'
import { emoji, style } from '../state.mjs'

function renderSkillSections(options = {}) {
  const { advanced = false } = options

  const advancedSkills = `
  ${style.dim('Framework Development')}
    ${style.cyan('/sparq:analyze')}           Gather and consolidate requirements from sources`

  return `
${style.bold(`${emoji.skills}SKILLS`)} ${style.dim('(use in Claude Code)')}
  ${style.dim('Default model: /sparq:start routes into Generate or Maintain lanes')}

  ${style.dim('Setup')}
    ${style.cyan('/sparq:start')}             Default entry — guided workflow router
    ${style.cyan('/sparq:init')}              Initialize SparQ in your project
    ${style.cyan('/sparq:config')}            View or edit configuration

  ${style.dim('Generate')}
    ${style.cyan('/sparq:generate')}          Generate manual + E2E tests from requirements
    ${style.cyan('/sparq:generate-manual')}   Generate manual test cases only
    ${style.cyan('/sparq:generate-e2e')}      Generate E2E tests only
    ${style.cyan('/sparq:manual-to-e2e')}     Convert manual tests to E2E

  ${style.dim('Maintain')}
    ${style.cyan('/sparq:validate')}          Check tests for UI drift
    ${style.cyan('/sparq:sync')}              Update tests after requirement changes
    ${style.cyan('/sparq:refactor')}          Refactor existing test code
    ${style.cyan('/sparq:export')}            Export to TestRail, Qase, or Jira

  ${style.dim('Consulting')}
    ${style.cyan('/sparq:playwright-best-practices')}  Playwright patterns and guides
    ${style.cyan('/sparq:cypress-best-practices')}     Cypress patterns and guides
${
  advanced
    ? advancedSkills
    : `
  ${style.dim('Dev skills hidden. Run: npx sparq-assistant help advanced')}`
}
`
}

export function cmdHelp(options = {}) {
  const { advanced = false } = options

  console.log(`
${style.cyan(SPARQ_LOGO)} ${style.dim(`v${VERSION}`)}
Multi-platform QA test automation framework

${style.bold('USAGE')}
  npx sparq-assistant ${style.cyan('<command>')} ${style.dim('[target-directory] [options]')}

${style.bold('COMMANDS')}
  ${emoji.init}${style.cyan('init')}        Interactive setup wizard — installs agents, skills,
              templates, MCP configs, and generates sparq.config.json
  ${emoji.update}${style.cyan('update')}      Re-install agent, skill, and template files
              (overwrites existing, preserves config)
  ${emoji.uninstall}${style.cyan('uninstall')}   Remove all SparQ files and configuration from a project
  ${emoji.clean}${style.cyan('clean')}       Remove stale artifacts from .sparq/ output directories
  ${emoji.doctor}${style.cyan('doctor')}      Verify installation — checks all files and configs
  ${emoji.lint}${style.cyan('lint')}        Lint generated E2E test files — detect flaky patterns,
              selector quality, and format compliance
  ${emoji.coverage}${style.cyan('coverage')}    Compute requirement coverage from .sparq/ artifacts
  ${emoji.help}${style.cyan('help')}        Show this help message
${
  advanced
    ? `
${style.bold('FRAMEWORK DEVELOPMENT COMMANDS')}
  ${emoji.audit}${style.cyan('audit')}       Assess prompt maturity — check testing architecture`
    : ''
}

${style.bold(`${emoji.config}OPTIONS`)}
  ${style.dim('[target-directory]')}    Path to your project (default: current directory)
  ${style.dim('--non-interactive')}     Skip prompts and use safe local-first defaults (for CI)
  ${style.dim('--dry-run')}             Preview changes without writing any files
  ${style.dim('--force')}               Skip confirmation prompts
  ${style.dim('--quiet, -q')}           Suppress info/ok output
  ${style.dim('--verbose')}             Show full stack traces and extra detail
  ${style.dim('--help, -h')}            Show this help message and exit
  ${style.dim('--version, -v')}         Show version number and exit
  ${style.dim('--no-update-check')}     Disable the npm version check for this run
  ${style.dim('--no-color')}            Disable colored output (also: NO_COLOR=1 env var)

  Run ${style.dim('sparq help <command>')} for command-specific options.

${style.bold('EXAMPLES')}
  ${style.dim('$')} npx sparq-assistant init
  ${style.dim('$')} npx sparq-assistant init --features=e2e,jira
  ${style.dim('$')} npx sparq-assistant doctor
  ${style.dim('$')} npx sparq-assistant update --only=agents,skills

  Run ${style.dim('sparq help <command>')} for more examples.

${style.bold(`${emoji.skills}FEATURES`)}
  ${style.dim('Individual (use with --features):')}
${Object.entries(FEATURE_GROUPS)
  .map(
    ([key, group]) =>
      `    ${style.cyan(key.padEnd(20))}${group.description}${group.alwaysIncluded ? ' (always included)' : ''}`,
  )
  .join('\n')}

  ${style.dim('Presets:')}
${Object.entries(PRESET_FEATURES)
  .map(([key, features]) => `    ${style.cyan(key.padEnd(20))}${features.join(', ')}`)
  .join('\n')}

${style.bold(`${emoji.agents}INSTALLED AGENTS`)}
  sparq-orchestrator           Multi-agent test workflow coordinator
  sparq-requirements-analyst   Requirements analysis and extraction
  sparq-manual-test-writer     Manual test case generation
  sparq-automation-engineer    E2E test automation + bug regression
  sparq-test-validator         Test coverage validation
${renderSkillSections({ advanced })}
${style.bold(`${emoji.directories}OUTPUT DIRECTORIES`)}
  .sparq/requirements/        Extracted requirements
  .sparq/test-cases/          Generated test cases
  .sparq/parallel/             Parallel execution working directory
  .sparq/coverage/            Coverage reports
  .sparq/validation/          Validation results
  .sparq/refresh/             Refresh diffs and change logs
  .sparq/tracking/            Test registry and traceability data
  .sparq/plans/               Test plans
`)
}

const COMMAND_HELP = {
  init: {
    description: 'Interactive setup wizard — installs agents, skills, templates, MCP configs',
    usage: 'npx sparq-assistant init [target-directory] [options]',
    options: [
      ['--features <list>', 'Comma-separated features to install'],
      ['--ci-provider <name>', 'Generate CI workflow template (github, gitlab, azure)'],
      ['--defaults', 'Show detected defaults, confirm once'],
      ['--workspace <path>', 'Initialize a specific workspace in a monorepo'],
      ['--all-workspaces', 'Initialize all declared workspaces'],
      ['--non-interactive', 'Skip prompts and use safe local-first defaults'],
      ['--dry-run', 'Preview changes without writing files'],
      ['--quiet, -q', 'Suppress info/ok output'],
      ['--verbose', 'Show extra detail'],
    ],
    examples: [
      'npx sparq-assistant init',
      'npx sparq-assistant init ./my-project',
      'npx sparq-assistant init --features=e2e,jira',
      'npx sparq-assistant init --workspace packages/web',
      'npx sparq-assistant init --defaults --dry-run',
    ],
  },
  update: {
    description:
      'Re-install agent, skill, and template files (overwrites existing, preserves config)',
    usage: 'npx sparq-assistant update [target-directory] [options]',
    options: [
      [
        '--only <categories>',
        'Update only specified categories (agents,skills,templates,mcp,config)',
      ],
      ['--skip <categories>', 'Skip specified categories during update'],
      ['--force', 'Skip confirmation prompts'],
      ['--non-interactive', 'Skip prompts and use defaults'],
      ['--dry-run', 'Preview changes without writing files'],
      ['--quiet, -q', 'Suppress info/ok output'],
      ['--verbose', 'Show extra detail'],
    ],
    examples: [
      'npx sparq-assistant update',
      'npx sparq-assistant update --force',
      'npx sparq-assistant update --only=agents,skills',
      'npx sparq-assistant update --skip=mcp --dry-run',
    ],
  },
  uninstall: {
    description: 'Remove all SparQ files and configuration from a project',
    usage: 'npx sparq-assistant uninstall [target-directory] [options]',
    options: [
      ['--force', 'Skip confirmation prompt'],
      ['--non-interactive', 'Skip prompts and use defaults'],
      ['--dry-run', 'Preview changes without writing files'],
      ['--quiet, -q', 'Suppress info/ok output'],
    ],
    examples: [
      'npx sparq-assistant uninstall',
      'npx sparq-assistant uninstall --force',
      'npx sparq-assistant uninstall ./my-project --dry-run',
    ],
  },
  clean: {
    description: 'Remove stale artifacts from .sparq/ output directories',
    usage: 'npx sparq-assistant clean [target-directory] [options]',
    options: [
      ['--type <type>', 'Artifact type filter (requirements, test-cases, coverage, etc.)'],
      ['--older-than <days>', 'Age filter — only remove artifacts older than N days'],
      ['--all', 'Include protected files in clean'],
      ['--force', 'Skip confirmation prompt'],
      ['--non-interactive', 'Skip prompts and use defaults'],
      ['--dry-run', 'Preview changes without writing files'],
    ],
    examples: [
      'npx sparq-assistant clean',
      'npx sparq-assistant clean --type=requirements --older-than=30',
      'npx sparq-assistant clean --all --force',
    ],
  },
  doctor: {
    description: 'Verify installation — checks all files, configs, and MCP connectivity',
    usage: 'npx sparq-assistant doctor [target-directory] [options]',
    options: [
      ['--deep', 'Run deep MCP health checks'],
      ['--fix', 'Auto-repair fixable issues'],
      ['--workspace <path>', 'Check a specific workspace in a monorepo'],
      ['--quiet, -q', 'Suppress info/ok output'],
      ['--verbose', 'Show extra detail'],
    ],
    examples: [
      'npx sparq-assistant doctor',
      'npx sparq-assistant doctor --deep',
      'npx sparq-assistant doctor --fix',
      'npx sparq-assistant doctor --workspace packages/web',
    ],
  },
  lint: {
    description: 'Lint generated E2E test files — detect flaky patterns and selector quality',
    usage: 'npx sparq-assistant lint [target-directory] [options]',
    options: [
      ['--strict', 'Exit non-zero if any critical issues found'],
      ['--threshold <N>', 'Exit non-zero if average quality score is below N% (0-100)'],
      ['--coverage-gate <N>', 'Exit non-zero if fewer than N% of files pass quality checks'],
      ['--format <type>', 'Output format: human (default), json, or sarif'],
      ['--workspace <path>', 'Lint a specific workspace in a monorepo'],
      ['--all-workspaces', 'Lint all declared workspaces in sparq.config.json'],
      ['--quiet, -q', 'Suppress info/ok output'],
    ],
    examples: [
      'npx sparq-assistant lint',
      'npx sparq-assistant lint ./e2e',
      'npx sparq-assistant lint --strict',
      'npx sparq-assistant lint --format sarif',
      'npx sparq-assistant lint --threshold 80 --coverage-gate 90',
      'npx sparq-assistant lint --all-workspaces --format json',
    ],
  },
  coverage: {
    description: 'Compute requirement coverage from .sparq/ artifacts',
    usage: 'npx sparq-assistant coverage [target-directory] [options]',
    options: [
      ['--threshold <N>', 'Exit non-zero if coverage is below N% (0-100)'],
      ['--format <type>', 'Output format: human (default) or json'],
      ['--workspace <path>', 'Check coverage for a specific workspace'],
      ['--quiet, -q', 'Suppress info/ok output'],
    ],
    examples: [
      'npx sparq-assistant coverage',
      'npx sparq-assistant coverage --threshold 80',
      'npx sparq-assistant coverage --format json',
      'npx sparq-assistant coverage --workspace packages/web',
    ],
  },
  audit: {
    description: 'Assess prompt maturity — check testing architecture in project AI prompts',
    usage: 'npx sparq-assistant audit [target-directory] [options]',
    options: [
      ['--fix', 'Generate supplementary prompts to fill detected gaps'],
      ['--strict', 'Exit non-zero if maturity level is below 3 (for CI gating)'],
      ['--json', 'Output audit report in JSON format (for CI)'],
      ['--quiet, -q', 'Suppress info/ok output'],
      ['--verbose', 'Show detailed scoring breakdown'],
      ['--dry-run', 'Preview changes without writing files'],
    ],
    examples: [
      'npx sparq-assistant audit',
      'npx sparq-assistant audit --fix',
      'npx sparq-assistant audit --json',
      'npx sparq-assistant audit ./my-project --fix --dry-run',
    ],
  },
}

export function cmdHelpCommand(name) {
  const entry = COMMAND_HELP[name]
  if (!entry) {
    console.log(`\n  ${style.red(`Unknown command: ${name}`)}`)
    console.log(`  Run ${style.dim('"npx sparq-assistant help"')} for all commands.\n`)
    return
  }

  const optLines = entry.options
    .map(([flag, desc]) => `  ${style.dim(flag.padEnd(25))}${desc}`)
    .join('\n')

  const exLines = entry.examples.map((ex) => `  ${style.dim('$')} ${ex}`).join('\n')

  console.log(`
${style.cyan(SPARQ_LOGO)} ${style.dim(`v${VERSION}`)}

${style.bold('COMMAND')}
  ${emoji[name] || ''}${style.cyan(name)} — ${entry.description}

${style.bold('USAGE')}
  ${entry.usage}

${style.bold('OPTIONS')}
${optLines}

${style.bold('EXAMPLES')}
${exLines}
`)
}
