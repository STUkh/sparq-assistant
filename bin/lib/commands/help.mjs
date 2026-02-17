// bin/lib/commands/help.mjs — Help command

import { VERSION } from '../constants.mjs'
import { FEATURE_GROUPS, PRESET_FEATURES } from '../features.mjs'
import { emoji, style } from '../state.mjs'

function renderSkillSections(options = {}) {
  const { advanced = false } = options

  const advancedSkills = `
  ${style.dim('Framework Development')}
    ${style.cyan('/sparq:analyze')}           Gather requirements from sources
    ${style.cyan('/sparq:eval')}              Run strict eval
    ${style.cyan('/sparq:improve')}           Run bounded improve loop
    ${style.cyan('/sparq:baseline-promote')}  Promote baseline after policy checks
    ${style.cyan('/sparq:eval-reflect')} ${style.dim('[service]')}      Analyze eval results
    ${style.cyan('/sparq:eval-tune')}    ${style.dim('[service]')}      Apply prompt engineering fixes
    ${style.cyan('/sparq:optimize')}     ${style.dim('[service]')}      Optimize prompts for token budget
    ${style.cyan('/sparq:audit-prompts')}     Assess prompt maturity in project`

  return `
${style.bold(`${emoji.skills}SKILLS`)} ${style.dim('(use in Claude Code)')}
  ${style.dim('Default model: /sparq:start routes into Generate or Maintain lanes')}

  ${style.dim('Setup')}
    ${style.cyan('/sparq:start')}             Default entry — guided workflow router
    ${style.cyan('/sparq:init')}              Initialize SparQ in your project
    ${style.cyan('/sparq:config')}            View or edit configuration
    ${style.cyan('/sparq:tune')}              Optimize prompts for cheaper model tiers

  ${style.dim('Generate')}
    ${style.cyan('/sparq:generate')}          Generate manual + E2E tests from requirements
    ${style.cyan('/sparq:generate-manual')}   Generate manual test cases only
    ${style.cyan('/sparq:generate-e2e')}      Generate E2E tests only
    ${style.cyan('/sparq:manual-to-e2e')}     Convert manual tests to E2E

  ${style.dim('Maintain')}
    ${style.cyan('/sparq:validate')}          Check tests for UI drift
    ${style.cyan('/sparq:sync')}              Update tests after requirement changes
    ${style.cyan('/sparq:regression')}        Create regression test for a bug
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
${style.boldCyan(`${emoji.help}SparQ QA Assistant`)} ${style.dim(`v${VERSION}`)}
QA Assistant Framework for Claude Code

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
  ${emoji.tune || emoji.config}${style.cyan('tune')}        Optimize agent prompts for a model tier
              (premium, balanced, economy)
  ${emoji.help}${style.cyan('help')}        Show this help message
${
  advanced
    ? `
${style.bold('FRAMEWORK DEVELOPMENT COMMANDS')}
  ${emoji.audit}${style.cyan('audit')}       Assess prompt maturity — check testing architecture
  ${emoji.eval}${style.cyan('eval')}        Run prompt evaluation cases — score agent outputs
  ${emoji.improve}${style.cyan('improve')}     Auto-run bounded improvement loop for failing eval cases
  ${emoji.baseline}${style.cyan('baseline')}    Promote eval baselines after strict pass streak policy`
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
      ['--non-interactive', 'Skip prompts and use safe local-first defaults'],
      ['--dry-run', 'Preview changes without writing files'],
      ['--quiet, -q', 'Suppress info/ok output'],
      ['--verbose', 'Show extra detail'],
    ],
    examples: [
      'npx sparq-assistant init',
      'npx sparq-assistant init ./my-project',
      'npx sparq-assistant init --features=e2e,jira',
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
      ['--quiet, -q', 'Suppress info/ok output'],
      ['--verbose', 'Show extra detail'],
    ],
    examples: [
      'npx sparq-assistant doctor',
      'npx sparq-assistant doctor --deep',
      'npx sparq-assistant doctor --fix',
    ],
  },
  eval: {
    description: 'Run prompt evaluation cases — score agent outputs against rubrics',
    usage: 'npx sparq-assistant eval [case-name] [options]',
    options: [
      ['--all', 'Run all eval cases'],
      ['--model <name>', 'mock (default), haiku, sonnet, opus, local, or claude-* ID'],
      ['--strict, --no-strict', 'Strict policy mode is default; disable only for exploration'],
      ['--allow-skips', 'Allow skip-heavy/non-evaluated cases without failing strict policy'],
      ['--yes', 'Skip execution confirmation prompt'],
      ['--no-clean', 'Disable per-case workspace cleanup for batch/API runs'],
      ['--artifact-root <dir>', 'Resolve artifacts under <project>/<dir>/<case-stem>'],
      ['--audit', 'Run standalone prompt quality audit (line counts, required sections)'],
      ['--trends', 'Show eval score history over time'],
      ['--project <dir>', 'Project root for output resolution (default: cwd)'],
    ],
    examples: [
      'npx sparq-assistant eval s6-bug-regression',
      'npx sparq-assistant eval s6-bug-regression --strict',
      'npx sparq-assistant eval --all --strict',
      'npx sparq-assistant eval --model haiku s6-bug-regression',
      'npx sparq-assistant eval --model opus --yes --all',
      'npx sparq-assistant eval --all --allow-skips',
      'npx sparq-assistant eval --audit',
      'npx sparq-assistant eval --trends',
    ],
  },
  improve: {
    description: 'Run bounded strict improvement loop (reflect + tune + strict re-eval)',
    usage: 'npx sparq-assistant improve [case-name] [options]',
    options: [
      ['--all', 'Run improve loop for all eval cases'],
      ['--model <name>', 'haiku, sonnet, opus, local, or claude-* ID (required for generation)'],
      ['--strict, --no-strict', 'Strict policy mode is default'],
      ['--allow-skips', 'Allow skip-heavy runs during exploratory improve'],
      ['--max-iterations <N>', 'Maximum improve iterations (default: 3)'],
      ['--project <dir>', 'Project root for output resolution (default: cwd)'],
      ['--artifact-root <dir>', 'Resolve artifacts under <project>/<dir>/<case-stem>'],
    ],
    examples: [
      'npx sparq-assistant improve s6-bug-regression --model haiku',
      'npx sparq-assistant improve s6-bug-regression --max-iterations=2 --model sonnet',
      'npx sparq-assistant improve --all --model haiku',
    ],
  },
  audit: {
    description: 'Assess prompt maturity — check testing architecture in project AI prompts',
    usage: 'npx sparq-assistant audit [target-directory] [options]',
    options: [
      ['--fix', 'Generate supplementary prompts to fill detected gaps'],
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
  tune: {
    description: 'Optimize agent prompts for a model tier (premium, balanced, economy)',
    usage: 'npx sparq-assistant tune <apply|revert|status> [options]',
    options: [
      ['apply <tier>', 'Apply Layer 1 enhancements for a model tier'],
      ['revert', 'Restore all agents to premium defaults'],
      ['status', 'Show current tier and agent status'],
      ['--force', 'Skip confirmation prompts'],
      ['--project <dir>', 'Target project directory (default: cwd)'],
      ['--non-interactive', 'Skip prompts and use defaults'],
      ['--dry-run', 'Preview changes without writing files'],
    ],
    examples: [
      'npx sparq-assistant tune apply economy',
      'npx sparq-assistant tune apply balanced',
      'npx sparq-assistant tune revert',
      'npx sparq-assistant tune status',
    ],
  },
  baseline: {
    description:
      'Promote per-case baselines after policy check (2 consecutive clean strict passes required)',
    usage: 'npx sparq-assistant baseline promote [case-name|--all] [options]',
    options: [
      ['--all', 'Promote every evaluated case from latest run if policy allows'],
      ['--model <name>', 'Model key to use for streak lookup and baseline write'],
    ],
    examples: [
      'npx sparq-assistant baseline promote s6-bug-regression',
      'npx sparq-assistant baseline promote --all',
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
${style.boldCyan(`${emoji.help}SparQ QA Assistant`)} ${style.dim(`v${VERSION}`)}

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
