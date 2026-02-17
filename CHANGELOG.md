# Changelog

All notable changes to SparQ Assistant will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

## [1.0.0]

### Added

- CLI installer (`bin/sparq.mjs`) with init, update, doctor, clean, uninstall, audit, help, eval, improve, baseline, tune commands
- Agent pipeline: orchestrator (opus), requirements-analyst (opus), manual-test-writer (sonnet), automation-engineer (opus), test-validator (sonnet)
- 24 skills: QA workflow (start, generate, generate-manual, generate-e2e, manual-to-e2e, validate, sync, regression, refactor, export), setup (init, config, tune), internal (analyze, resume), consulting (playwright-best-practices, cypress-best-practices), dev tools (eval, improve, baseline-promote, eval-reflect, eval-tune, optimize, audit-prompts)
- 38 shared reference docs covering patterns, error handling, parallel execution, framework best practices
- 11 output templates for requirements, test cases, coverage matrices, validation reports, execution plans
- MCP integration configs for Atlassian, Figma, Playwright, TestRail, Qase
- Scenario support: S1 (manual creation), S1+S2 (unified generate), S2 (manual to E2E), S3 (E2E generation), S4 (test validation), S5 (requirement sync), S6 (bug regression)
- Multi-TMS support: TestRail, Qase, and local folder providers via `outputs.tms` provider discriminator
- Model tier optimization: three tiers (premium/balanced/economy) with `sparq tune` CLI command
- Feature selection system (`--features` flag) with presets (all, minimal, e2e-only)
- Eval framework with YAML cases, code-based rubrics, model-based graders
- Workflow state persistence to `.sparq/state/` with resume support
- Framework-agnostic selectors: `data-testid` first, semantic locators fallback
- `--dry-run` and `--non-interactive` modes for CI environments
- `.claude/rules/` scoped rule files for path-specific validation
- Checkpoint-based workflow with user approval gates
- Auto-detection of tech stack from package.json
