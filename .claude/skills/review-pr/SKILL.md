---
name: review-pr
description: "Reviewing pull requests for SparQ project compliance. Checking code standards, quality gates, agent/skill prompt quality, and security. Use when: reviewing a PR, preparing changes for merge, validating contributions, or running a pre-push review."
---

# PR Reviewer

Automated review of SparQ pull requests against project standards defined in CLAUDE.md.

## When to Use

- Before pushing a branch or opening a PR
- Reviewing someone else's contribution
- Validating your own changes before requesting review

## Workflow

### Step 1: Identify Changed Files

1. Determine the base branch — use the branch or PR number provided as argument (e.g., `/review-pr feature/xyz` or `/review-pr 42`), the PR target branch if in a PR context, or default to `main`
2. Run `git diff --name-only {base}...HEAD` to list all changed files
3. Run `git diff --stat {base}...HEAD` for a size overview
4. Classify each file into categories:
   - **cli**: `bin/**/*.mjs`
   - **agent**: `claude/agents/*.md`
   - **skill**: `claude/skills/**`
   - **reference**: `claude/skills/sparq-shared/references/**`
   - **test**: `test/**/*.test.mjs`
   - **config**: `biome.json`, `mcp/*.json`, `.github/**`
   - **docs**: root `*.md` files, `docs/**`
5. If no changed files found, report "No changes detected" and stop

### Step 2: Run Quality Gates

Execute and capture results:

1. `npm run check` — must exit 0 (runs Biome lint + all tests)
2. For each changed `.mjs` file: `node --check {file}` — must exit 0
3. For each new `.mjs` file in `bin/lib/`: verify a corresponding `test/unit/{name}.test.mjs` exists
4. For each new `.mjs` file in `bin/lib/commands/`: verify it is registered in `constants.mjs` and `help.mjs`

Report pass/fail for each gate. If `npm run check` fails, include the relevant error output.

### Step 3: Category-Specific Review

Load `references/review-checklist.md` and review each changed file against its category-specific criteria. The checklist covers: CLI code, agents, skills, references, tests, MCP configs, security, and prompt optimization compliance.

For any agent/skill/reference changes with >20 lines of prompt content changed, check for evidence that `/sparq:prompt-optimizations` was applied. Flag as Warning if no optimization evidence found.

### Step 4: Produce Review Report

Output using this structure:

```
## PR Review: {branch name}

**Files reviewed**: {count} ({category breakdown})
**Quality gates**: {pass/fail summary}

### Critical
{Findings that MUST be fixed — broken gates, missing required sections, real credentials}

### Warnings
{Findings that SHOULD be addressed — line count limits, missing optimization, missing tests}

### Info
{Non-blocking suggestions and observations}

### Verdict
{One of: Ready to merge | Needs fixes ({count} critical, {count} warnings) | Needs rework}
```

Omit empty severity sections. If all gates pass and no findings exist, output a short "All clear" summary.

<done_criteria>
1. All changed files identified and classified by category
2. `npm run check` executed and result reported
3. `node --check` run on every changed `.mjs` file
4. Each changed file reviewed against its category-specific checklist
5. Prompt optimization compliance checked for any agent/skill/reference changes
6. Structured report produced with severity-classified findings
7. Clear merge verdict provided
</done_criteria>

## References

- `CLAUDE.md` — canonical code standards and quality gates
- `.claude/skills/review-pr/references/review-checklist.md` — detailed review criteria by category
- `claude/skills/sparq-prompt-optimizations/SKILL.md` — prompt optimization requirements
