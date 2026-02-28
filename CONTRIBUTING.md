# Contributing to SparQ Assistant

SparQ is a QA testing framework for Claude Code — a pipeline of AI agents, deterministic rubrics, and CLI tooling that takes a Jira ticket to production-ready test code with human approval at every step. Contributions that sharpen the rubrics, deepen the agent logic, or extend the CLI are the ones that matter most. If you've spotted a gap or have an idea that fits the architecture, you're in the right place.

---

## Quick Start (5 minutes)

**Prerequisites:** Node.js >= 22 (check with `node --version`)

```bash
git clone https://github.com/STUkh/sparq-assistant.git
cd sparq-assistant
npm install
npm run check          # lint + all tests — must pass clean before any PR
```

If `npm run check` passes on first run, your environment is good. If it fails, check your Node version first — the project uses `node:util` APIs that require 22+.

---

## Project Map

A quick tour of what lives where. See [CLAUDE.md](CLAUDE.md) for the full architecture and code standards reference.

```
bin/
  sparq.mjs              # CLI entry point — command dispatch and signal handling
  lib/
    commands/            # One file per CLI command (init, update, lint, doctor, ...)
    rubrics/             # Deterministic quality-check functions
    rubrics/shared/      # Shared utilities across rubrics (constants, finders, content-detect)
    args.mjs             # Argument parsing via node:util parseArgs
    constants.mjs        # Agent names, exit codes, paths — all magic values live here
    state.mjs            # Output helpers (ok/warn/fail/info) + style object
    platform.mjs         # AI editor detection registry (PLATFORM_REGISTRY)

claude/
  agents/                # Markdown agents with YAML frontmatter (orchestrator + sub-agents)
  skills/                # Skill directories, each with a SKILL.md (auto-discovered by CLI)
  skills/sparq-shared/
    references/          # Shared reference docs loaded by agents at runtime
  templates/             # Output templates for generated artifacts
  hooks/                 # Exit guard (Stop hook) + compaction resilience (PreCompact hook)

mcp/                     # MCP server configs (JSON, placeholder credentials only)

test/
  unit/                  # Unit tests for CLI modules and rubrics
  integration/           # Full init→doctor→update→uninstall lifecycle tests
  helpers/setup.mjs      # Test utilities: createTempDir, createMockProject, runCli
  evals/fixtures/        # Mock Jira/Figma/project fixtures (prompt dev reference)

.claude/rules/           # Scoped rule files for path-specific validation
```

---

## Core Philosophy

These five principles aren't just background — they shape every decision in the codebase. Understanding them will tell you whether your contribution fits.

### 1. Prompt Budget Discipline

Every agent, skill, and reference doc shares a 200K context window with about 10.5K tokens of fixed overhead already consumed. Token count is a first-class constraint, not an afterthought.

**In practice:**
- Use lists instead of tables in agent/skill markdown — this consistently saves 30–40% of token count for equivalent information.
- Prefer mermaid diagrams over ASCII art for flow visualization.
- Use XML-tagged sections (`<rules>`, `<done_criteria>`, `<references>`) so agents can selectively load sections rather than reading entire files.
- The `/sparq:prompt-optimizations` skill documents the full set of T1–T12 token-reduction techniques. Read it before touching any agent or skill file.

### 2. Atomic Prompts

Each agent does exactly one thing. The orchestrator classifies and dispatches; sub-agents never spawn other sub-agents. This constraint is deliberate — it forces you to be precise about what an agent's job actually is.

**In practice:**
- If you can't describe a new agent's responsibility in one sentence, it's doing too much. Extract the extra concern to a reference doc or split it into two agents.
- Agent logic that applies across scenarios belongs in `claude/skills/sparq-shared/references/` as a shared doc, not duplicated across agent files.
- Sub-agents must include a `<handoff>` section matching the schema in `handoff-schema.md`. The orchestrator rejects malformed handoffs.

### 3. Deterministic Quality Gates

The 18 rubrics in `bin/lib/rubrics/` are code — not AI judgment. Every finding traces to a specific pattern match, count check, or schema validation. No rubric calls a model. No rubric produces probabilistic output.

**In practice:**
- If you're adding a new AI-generated output pattern (a new test ID format, a new artifact schema), back it with a rubric that can deterministically validate it.
- A rubric that says "tests look good" is not a rubric — every finding needs a concrete rule that can pass or fail independently of context.
- Rubrics that skip non-matching content return `{ skipped: true }` — don't report findings on files that aren't your target type.

### 4. Zero Runtime Dependencies

The CLI uses only Node.js built-in modules. This is a hard constraint — not a preference. It means `sparq init` runs in milliseconds on any machine with Node 22, with zero supply-chain surface area.

**In practice:**
- If you find yourself reaching for a third-party package, stop. Find the built-in equivalent: `node:fs` for file operations, `node:util` for parsing and styling, `node:path` for path manipulation.
- If there is genuinely no built-in equivalent, open an issue to discuss before implementing. Do not sneak in a dependency.
- Test utilities (`node:test`, `node:assert`) are built-in — they're the framework. Don't add test runners.

### 5. Checkpoint-Driven Workflows

Humans stay in the loop. Every phase transition in the agent pipeline requires explicit user approval. The `<done_criteria>` contract in each agent is what makes this enforceable — it's a numbered checklist of objectively verifiable items. If something isn't in `<done_criteria>`, it doesn't gate the phase.

**In practice:**
- When writing or editing an agent, the `<done_criteria>` section is not boilerplate — it's the contract. Every item must be something the agent can verify without human judgment ("all TC IDs follow `TC-{feature}-{ABBR}-{NNN}` format", not "tests are thorough").
- Never add a phase transition that bypasses a checkpoint, even for "simple" scenarios. The whole value of the human-in-the-loop model depends on this being consistent.

---

## How to Contribute

### Bug Fix

1. Open an issue (or find an existing one) describing the problem and expected behavior.
2. Reproduce it locally — add a failing test if you can:
   ```bash
   node --test test/unit/the-relevant-module.test.mjs
   ```
3. Fix the bug in the smallest diff that addresses it — resist the urge to refactor while you're there.
4. Make sure your fix is covered by a test. If the bug had no test, add one.
5. Run the full quality gate:
   ```bash
   npm run check
   node --check bin/sparq.mjs        # or whichever .mjs files you touched
   ```
6. Open a PR. Reference the issue number in the description.

---

### New Rubric

Rubrics are the simplest contribution to scope — each is a self-contained `.mjs` file that exports a single function.

1. Create `bin/lib/rubrics/{your-rubric-name}.mjs`:
   ```js
   /**
    * Your rubric — what it checks and why.
    */
   export function evaluate(content, _checks = [], _options = {}) {
     const findings = []
     let score = 0
     const maxScore = 5   // adjust to number of independent checks

     // Your deterministic checks here.
     // findings entries: { severity: 'critical'|'warning'|'info', message: string }

     return { score, maxScore, findings }
   }
   ```
   See `bin/lib/rubrics/coverage-completeness.mjs` for the simplest real example. For skipping non-target files, see `bin/lib/rubrics/shared/content-detect.mjs`.

2. Register it in `bin/lib/commands/lint.mjs` — add it to the appropriate array:
   - `FILE_RUBRICS` for test code files (`.spec.ts`, `.cy.ts`, etc.)
   - `ARTIFACT_RUBRICS` for JSON files in `.sparq/`
   - `MARKDOWN_RUBRICS` for `.sparq/*.md` artifacts

3. Write a unit test in `test/unit/{your-rubric-name}.test.mjs`. Cover the pass case, the fail case, and the skip case if your rubric has one.

4. Run `npm run check` and open a PR. Include the finding format in your PR description so reviewers can evaluate the signal quality.

---

### New Agent

Agents live in `claude/agents/` as markdown files with YAML frontmatter. They're loaded by Claude Code at runtime — the file format is the interface.

1. Create `claude/agents/sparq-{name}.md`:
   ```markdown
   ---
   name: sparq-{name}
   description: "Gerund-form description for trigger accuracy. What this agent does."
   model: opus   # or sonnet — use opus for complex reasoning, sonnet for structured generation
   color: pick-a-unique-color
   ---

   # SPARQ {Name} Agent

   <references>
   Always: config-schema.md, handoff-schema.md, error-handling.md
   All in: claude/skills/sparq-shared/references/
   </references>

   <!-- agent content -->

   <done_criteria>
   1. [Objective, verifiable item]
   2. [Objective, verifiable item]
   </done_criteria>
   ```

2. Add the filename to `AGENT_NAMES` in `bin/lib/constants.mjs` — the CLI uses this array to install agents.

3. If this is a sub-agent (not the orchestrator), add a `<handoff>` section. Match the schema in `claude/skills/sparq-shared/references/handoff-schema.md`.

4. Keep the agent under 300 lines. Logic shared with other agents belongs in `claude/skills/sparq-shared/references/`.

5. Run `npm run check` and open a PR.

---

### New Skill

Skills are auto-discovered by the CLI — you don't need to register them anywhere.

1. Create the directory `claude/skills/sparq-{name}/`.
2. Create `claude/skills/sparq-{name}/SKILL.md` with YAML frontmatter:
   ```markdown
   ---
   name: sparq-{name}
   description: "Gerund-form description."
   ---

   <!-- skill content -->
   ```
3. Reference any shared docs from `claude/skills/sparq-shared/references/` using `@path` syntax rather than inlining content.
4. Run `npm run check` and open a PR.

---

### New Reference Doc

Reference docs in `claude/skills/sparq-shared/references/` are loaded by agents at startup. They're the shared knowledge base — patterns, schemas, protocols, checklists.

1. Add your file to `claude/skills/sparq-shared/references/{name}.md`.
2. Link it from the relevant agents and skills using `@path` syntax in their `<references>` sections.
3. Keep the scope narrow — one doc, one concern. Cross-linking between reference docs is fine; circular dependency chains are not.
4. Open a PR with a description of what the doc covers and which agents/skills load it.

---

### New CLI Module

1. Create `bin/lib/commands/{command}.mjs` (for a command) or `bin/lib/{module}.mjs` (for a utility):
   - Named exports only — no default exports.
   - `node:` prefix on all imports.
   - Use helpers from `state.mjs` for output (`ok`, `warn`, `fail`, `info`, `heading`).
   - Use `files.mjs` for file operations — no raw `fs` outside that module.
   - All magic values go in `constants.mjs`.

2. If it's a command:
   - Add it to `COMMANDS` in `bin/lib/constants.mjs`.
   - Register it in the `COMMAND_HANDLERS` map in `bin/sparq.mjs`.
   - Add help text to `bin/lib/commands/help.mjs`.
   - Add integration test coverage in `test/integration/`.

3. Write a unit test in `test/unit/{module}.test.mjs`.

4. Syntax-check every `.mjs` file you touched:
   ```bash
   node --check bin/lib/commands/{command}.mjs
   ```

5. Run `npm run check` and open a PR.

---

## Quality Gates

Run this before every PR. Copy-paste it:

```bash
npm run lint            # Biome — zero warnings required
npm run test            # All unit + integration tests — zero failures required
node --check bin/sparq.mjs    # Syntax-check the entry point
```

For every `.mjs` file you modified:
```bash
node --check bin/lib/{the-file-you-changed}.mjs
```

For agent or skill files with `@path` references, verify every path points to an existing file:
```bash
ls claude/skills/sparq-shared/references/{referenced-file}.md
```

**The full checklist:**

- [ ] `npm run lint` passes with zero warnings
- [ ] `npm test` passes with zero failures
- [ ] `node --check` passes on every `.mjs` file touched
- [ ] New CLI module has a unit test in `test/unit/`
- [ ] New command has integration test coverage in `test/integration/`
- [ ] New rubric is registered in `FILE_RUBRICS`, `ARTIFACT_RUBRICS`, or `MARKDOWN_RUBRICS` in `lint.mjs`
- [ ] New agent is added to `AGENT_NAMES` in `constants.mjs`
- [ ] New agent has `<done_criteria>` with objectively verifiable items
- [ ] Agent files are under 300 lines (`wc -l claude/agents/*.md`)
- [ ] All `@path` references point to existing files
- [ ] No runtime dependencies introduced

---

## Prompt Engineering Standards

This section matters for any change to `claude/agents/`, `claude/skills/`, or `claude/skills/sparq-shared/references/`. Read it before touching those files.

### Token budget rules

The 200K context window fills faster than you expect. Each agent loads its own content plus the reference docs in its `<references>` section, plus system prompts and conversation history. The fixed overhead (system + CLAUDE.md) is about 10.5K tokens before a single agent is loaded.

Write prompts as if every word costs money — because in this architecture, it measurably affects quality. When a context window is 60% consumed by agent instructions, the model has 40% left for actual work. Loose phrasing compounds.

Concrete targets:
- Use lists over tables. For equivalent information, a bullet list consistently uses 30–40% fewer tokens than a markdown table.
- Use mermaid over ASCII art. Mermaid is more compact and the model understands it at least as well.
- Reference shared docs by `@path` instead of inlining content. If two agents need the same rules, those rules belong in `references/`, not copy-pasted into both agents.
- Front-load critical instructions — models weight earlier content more heavily (primacy bias). Put the most important constraints first.
- Use `IMPORTANT:` prefix sparingly. Reserve it for rules that cause cascading failures if missed. Overuse dilutes the signal.

The `/sparq:prompt-optimizations` skill (at `claude/skills/sparq-prompt-optimizations/SKILL.md`) documents T1–T12 token-reduction techniques in detail. Read it before any non-trivial agent edit.

### XML tag conventions

SparQ uses a consistent set of XML tags as section boundaries. This isn't aesthetic — it allows agents to reference sections by tag rather than heading text, which is more robust to reformatting.

| Tag | Purpose |
|:----|:--------|
| `<references>` | Files the agent must load at startup |
| `<done_criteria>` | Completion checklist — objectively verifiable items only |
| `<classification_rules>` | Scenario or input type classification logic |
| `<rules>` | Behavioral constraints |
| `<handoff>` | Structured handoff schema for sub-agent → orchestrator communication |
| `<few_shot_examples>` | Classification or generation examples |
| `<constants>` | ID formats, timeouts, severity levels |
| `<token_budget>` | Context limit reminders and scope guidance |

Don't invent new tags unless a section genuinely can't be expressed with an existing one. Consistency is what makes the pattern work.

### The done_criteria contract

`<done_criteria>` is the most important section in any agent. It's what tells the agent when it's finished, and it's what the orchestrator uses to validate handoffs before accepting them.

Every item must be objectively verifiable — something the agent can check without human judgment:

```
Good: "All TC IDs follow TC-{feature}-{ABBR}-{NNN} format"
Good: "Coverage matrix maps every REQ ID to at least one TC ID"
Bad:  "Test cases are comprehensive and well-structured"
Bad:  "Output quality is high"
```

When you add or edit an agent, the `<done_criteria>` should be the last thing you review. If an item isn't verifiable, rewrite it until it is or remove it. An agent with a vague `<done_criteria>` will loop indefinitely or stop too early.

### Line limits

Agents must stay under 300 lines. This is checked as part of the review process:

```bash
wc -l claude/agents/*.md
```

If you're approaching the limit, extract shared logic to `claude/skills/sparq-shared/references/` and reference it with `@path`. The agent file should contain reasoning logic; reference docs should contain patterns, schemas, and examples.

---

## PR Guidelines

**Small, focused PRs.** A PR that changes one rubric is easy to review and easy to roll back. A PR that changes three agents, two rubrics, and a CLI module is not. If your change touches multiple concerns, split it.

**Conventional commit messages:**

```
feat: add viewport-matrix rubric for responsive breakpoint validation
fix: resolve false positive in locator-quality when using data-testid
docs: clarify handoff schema for parallel task indexes
refactor: extract shared category constants to rubrics/shared/constants.mjs
test: add edge cases for resume-state-compliance rubric
```

**PR description should include:**
- What the change does and why (one paragraph max)
- What you tested and how
- Any token budget impact if you touched an agent or skill (before/after line counts)
- For rubrics: example findings the new rule produces, so reviewers can judge signal quality

---

## Community

**Questions:** Open a [GitHub Discussion](https://github.com/STUkh/sparq-assistant/discussions) or ask in the issue that prompted your question.

**Bug reports:** Open a [GitHub Issue](https://github.com/STUkh/sparq-assistant/issues) with:
- Node version (`node --version`)
- SparQ version (`npx sparq-assistant --version`)
- The command you ran and the full output
- Expected vs. actual behavior

**Feature ideas:** Open an issue tagged `enhancement`. Describe the scenario you're trying to enable, not just the implementation you have in mind. The best contributions come from real workflows — share the context.

**Security issues:** Do not open a public issue. Email the maintainers directly (see package.json for contact info) or use GitHub's private vulnerability reporting.
