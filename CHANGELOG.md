# Changelog

All notable changes to SparQ Assistant will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

## [1.0.0]

### Added

- CLI installer (`bin/sparq.mjs`) with init, update, doctor, clean, uninstall, audit, lint, help commands
- Auto update check: non-blocking npm registry query on startup (cached 24h), notification after command completes. Opt-out via `--no-update-check`, `SPARQ_NO_UPDATE_CHECK=1`, or CI environments
- Agent pipeline: orchestrator (opus), requirements-analyst (opus), manual-test-writer (sonnet), automation-engineer (opus), test-validator (sonnet)
- 20 skills: QA workflow (start, generate, generate-manual, generate-e2e, manual-to-e2e, validate, sync, refactor, export, publish-results), setup (init, config), internal (analyze, resume), consulting (playwright-best-practices, cypress-best-practices), API fallback (qase-api, testrail-api), prompt guidance (prompt-optimizations), performance consulting (performance)
- 48 shared reference docs covering patterns, error handling, parallel execution, framework best practices, TMS formats, and more
- 11 output templates for requirements, test cases, coverage matrices, validation reports, execution plans
- MCP integration configs for Atlassian, Figma, Playwright, TestRail, Qase, Zephyr Scale
- Scenario support: S1 (manual creation), S1+S2 (unified generate), S2 (manual to E2E), S3 (E2E generation — feature ticket or bug ticket), S4 (test validation), S5 (requirement sync), S6 (publish results to TMS)
- Multi-TMS support: TestRail, Qase, and local folder providers via `outputs.tms` provider discriminator
- Model tier optimization: three tiers (premium/balanced/economy) configurable via `preferences.modelTier` in `sparq.config.json`
- Feature selection system (`--features` flag) with presets (all, minimal, e2e-only)
- Code quality linting via `sparq lint [path]` — deterministic rubrics (zero AI inference), CI-compatible
- Workflow state persistence to `.sparq/state/` with resume support
- Framework-agnostic selectors: `data-testid` first, semantic locators fallback
- `--dry-run` and `--non-interactive` modes for CI environments
- `.claude/rules/` scoped rule files for path-specific validation
- Checkpoint-based workflow with user approval gates
- Auto-detection of tech stack from package.json
