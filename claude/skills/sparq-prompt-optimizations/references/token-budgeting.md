# Token Budgeting Guide

> Every token has a cost. Output tokens cost 3–5x input. Invest in precise input.

For **runtime workflow budgets** (sub-agent loads, hard limits, exhaustion protocol), see `claude/skills/sparq-shared/references/token-budget.md`. This file covers **prompt authoring efficiency** — writing agents, skills, and references with minimal token waste.

---

## Cost Model

### Pricing Reality

- **Input tokens** — base cost (what you send to the model)
- **Output tokens** — 3–5x input cost (what the model generates)
- **Cached tokens** — 50–90% discount on repeated static content
- **Thinking tokens** — additional cost for extended reasoning

**Key insight:** Reducing output by 50% saves more than reducing input by 50%. Precise instructions that produce concise output are the highest-ROI optimization.

### Budget Allocation

For a typical SparQ agent interaction:

- **System prompt** (CLAUDE.md + MEMORY.md + rules) — ~10.5K tokens, amortized via caching
- **Agent file** — 200–300 lines, ~2K–3K tokens (loaded per dispatch)
- **References** — conditional loading via `<references>`, ~1K–1.5K each
- **Dispatch data** — handoff from orchestrator, max 3K tokens
- **Tool calls** — each adds input (result) + output (decision) tokens
- **Response** — most expensive per-token; constrain format and length

---

## Measurement

### Rules of Thumb

- **English text** — ~4 characters/token (~0.75 words/token)
- **Code** — denser, ~3 characters/token
- **Markdown formatting** — headers, bullets, bold cost 1–3 tokens each
- **JSON** — ~30% overhead from `{`, `}`, `"`, `:` syntax
- **YAML** — ~15% overhead (less syntax than JSON)
- **Markdown-KV** — ~10% overhead (minimal syntax, maximum content)

### Estimating File Size

- **SKILL.md at 300 lines** — ~2,000–3,000 tokens
- **Reference file at 150 lines** — ~1,000–1,500 tokens
- **CLAUDE.md (full)** — ~4,000–6,000 tokens (loaded every session)
- **Agent file at 300 lines** — ~2,500–3,500 tokens (loaded per dispatch)

**Targets:** Agents under 300 lines. SKILL.md under 500 lines. References under 250 lines.

---

## Compression Benchmarks

### Real Agent Before/After

**Agent opening (sparq-test-validator.md):**
```markdown
// Verbose draft — 42 tokens
"The test validator agent is responsible for validating existing
E2E test suites against the current codebase, requirements, and
UI designs to detect broken selectors and stale test flows."

// Actual line 10 — 22 tokens
"Validate existing test suites against current requirements, UI designs,
and application code. Detect broken selectors, navigation flow mismatches."
```
**Savings: 47%** — eliminated "is responsible for," merged redundant "codebase"/"application code"

**Token budget summary (sparq-orchestrator.md `<token_budget>`):**
```markdown
// Verbose — 52 tokens
"Please refer to the token budget reference document for detailed limits.
The context window is 200,000 tokens. You should emit a warning when you
reach 120,000 tokens and stop generating at 150,000 tokens."

// Actual — 26 tokens
"See token-budget.md. Key: 200K context, 120K warning, 150K hard stop,
40 req max, 20 E2E batch, 30 manual batch, chain depth max 3."
```
**Savings: 50%** — compressed to key-value pairs, all limits in one line

**MCP response budget (sparq-requirements-analyst.md):**
```markdown
// Verbose — 38 tokens
"When receiving responses from MCP tools, the budget for each
source is approximately 5,000 words of maximum usable content
that should be extracted from the response."

// Actual — 8 tokens
"MCP response budget per source: ~5,000 words maximum usable content."
```
**Savings: 79%** — eliminated passive voice and filler

### Compression Targets

- **Agent descriptions** — 40–50% reduction (already dense; target filler words)
- **Rule sections** — 50–70% (most savings here)
- **Config/dispatch data** — 60–70% (KV format over prose)
- **Code examples** — 20–30% (code already dense)
- **Checklists** — 10–20% (already concise)

---

## SparQ Optimization Case Study

SparQ's token optimization history demonstrates cumulative savings across 7 waves:

### Key Optimizations Applied

- **`@path` refs removed from CLAUDE.md** — saved ~14K tokens by eliminating full file references that agents could discover via `<references>` sections
- **Conditional agent refs** — saved ~4–8K per workflow by loading references only when the scenario requires them (e.g., PW refs only for PW projects)
- **Batch thresholds** — 20 E2E / 30 manual per batch prevents context overflow
- **Config summary format** — ~120 tokens vs ~400 for raw JSON (see orchestrator's `<config_summary_format>`)
- **Handoff re-read protocol** — agents re-read from disk at phase boundaries instead of keeping full handoff in context

### Cumulative Impact

- **Before optimization**: orchestrator + 4 sub-agents consumed ~80K tokens in fixed overhead
- **After optimization**: ~45K tokens fixed overhead (44% reduction)
- **Result**: more context budget available for actual work (generating tests, reading source code)

---

## Output Ceiling Strategies

### Format as Implicit Limit

Specifying format naturally constrains output:

```markdown
// Unconstrained — model may produce 500+ tokens
"Explain the validation workflow"

// Constrained by format — typically 50–80 tokens
"Validation workflow:
1. Entry: [skill or agent]
2. Steps: [numbered, max 5]
3. Output: [artifact type]"
```

### Constraint Patterns

- **Bullet cap** — "Max 5 bullets"
- **Word cap** — "Under 100 words"
- **Line cap** — "Fit in 10 lines"
- **Section cap** — "One paragraph per section"
- **Depth cap** — "Top-level findings only, no sub-analysis"

### Output Exclusions

Explicitly state what NOT to generate:

```markdown
"Fix the selector. Output: changed lines only.
No explanations. No surrounding context. No refactoring suggestions."
```

---

## Prompt Template Library

### Bug Fix (minimal output)

```markdown
Fix [description] in [file_path].
Output: changed lines only.
```
**Expected output: 5–20 tokens**

### Code Review (structured)

```markdown
Review [file_path]:
- Issues: [max 5 bullets]
- Severity: critical/warning/info per item
- Fix: one-line suggestion per item
```
**Expected output: 50–150 tokens**

### Agent/Skill Update (bounded)

```markdown
Update [agent/skill file] in claude/agents/ or claude/skills/.
Follow patterns in existing files.
Changes: [list modified sections]
Verify: all @path refs valid, <done_criteria> intact, under 300 lines.
```
**Expected output: code blocks + 20–50 tokens**

### Architecture Analysis (capped)

```markdown
Analyze [component] architecture:
1. Current: [3 bullets]
2. Issues: [3 bullets]
3. Recommendation: [1 sentence]
```
**Expected output: 80–120 tokens**

---

## Anti-Patterns

### Redundant Context

```markdown
// Bad — same reference twice
"Read constants.mjs for ID formats.
The ID module at constants.mjs defines..."

// Good — reference once
"ID formats: see constants.mjs"
```

### Over-Specifying Obvious Behavior

```markdown
// Bad — Claude knows ESM syntax
"When writing the module, use import statements, not require.
Use named exports, not default. Add the .mjs extension."

// Good — state only non-obvious
"Follow existing patterns in bin/lib/. See constants.mjs for conventions."
```

### Full File When Line Range Suffices

```markdown
// Bad — loads entire 300-line agent file
"Read claude/agents/sparq-orchestrator.md"

// Good — targets relevant section
"Read sparq-orchestrator.md lines 45–80 (dispatch rules section)"
```

### Explaining the Obvious

```markdown
// Bad — 18 wasted tokens
"The following handoff object shows the structure that
the requirements analyst returns to the orchestrator:"

// Good — just show it
[handoff example]
```
