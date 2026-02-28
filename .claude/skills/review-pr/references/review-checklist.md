# PR Review Checklist

Detailed review criteria by file category. Loaded by the review-pr skill during Step 3.

## CLI Code (`bin/**`)

- Import style: `import { x } from 'node:fs'` — `node:` prefix required for all built-ins
- Export style: named exports only (`export const`, `export function`) — no `export default`
- No runtime deps: only `node:*` imports allowed, zero npm packages
- Variables: `const` required, `var` forbidden, `let` only when reassignment is needed
- Colors: `style` object from `state.mjs` — no raw ANSI escape codes
- Constants: magic values belong in `constants.mjs`, not inline
- File ops: use `files.mjs` helpers where available
- Exit codes: use constants from `constants.mjs` (`EXIT_SUCCESS`, `EXIT_GENERAL`, `EXIT_USAGE`, `EXIT_FILESYSTEM`)
- Line width: 100 characters max (enforced by Biome)
- Quote style: single quotes, no semicolons, 2-space indent, trailing commas

## Agent Files (`claude/agents/*.md`)

- YAML frontmatter fields: `name` (kebab-case, `sparq-` prefix), `description` (gerund-form), `model` (`opus`|`sonnet`), `color`
- `<done_criteria>`: numbered checklist, every item objectively verifiable — no subjective terms like "high quality"
- `<references>`: lists all files loaded at startup; conditional loads have clear conditions
- `<progress_signals>`: `[sparq]`-prefixed signals for user visibility
- Handoff (sub-agents only): `<handoff>` XML tag or `## Handoff` heading
- All handoff entries inside canonical handoff section, never scattered in workflow sections
- Line count: hard limit 300 lines
- `@path` references: verify each target file exists on disk

## Skill Files (`claude/skills/**/SKILL.md`)

- YAML frontmatter: `name` (format `sparq:{verb}` for product skills), `description` (trigger-oriented, includes "Use when")
- Config preamble: non-init skills must read `sparq.config.json` first
- `## References` section: must list every file mentioned inline with `@path`
- Line count: hard limit 500 lines
- No extra docs: no README.md, CHANGELOG.md, or INSTALLATION_GUIDE.md in skill directories

## Reference Files (`claude/skills/sparq-shared/references/*.md`)

- Single source of truth: no content duplicated across multiple references
- Line count: recommended limit 300 lines
- Cross-references use `@path` syntax to link related docs

## Test Files (`test/**`)

- Framework: `node:test` + `node:assert/strict` (never `node:assert` without `/strict`)
- Temp dirs: `cleanTempDir()` in `after()` hooks — no leaked temp directories
- Integration tests: `runCli()` subprocess execution only — no direct CLI module imports
- Unit tests: one per CLI module in `test/unit/`
- Helpers: import from `test/helpers/setup.mjs`

## MCP Configs (`mcp/*.json`)

- Valid JSON: parseable without errors
- Placeholder credentials only — no real API keys or tokens
- Blocked patterns: `sk-`, `xoxb-`, `ghp_`, `ATATT` prefixes

## Security

- No `.env`, `credentials.json`, or secret files committed
- Test data uses fake values (`test.user@example.com`, `P@ssw0rd123!`)
- MCP configs in `mcp/` use placeholder values — real creds go in target project `.mcp.json`

## Prompt Optimization (agent/skill/reference changes)

Evidence that `/sparq:prompt-optimizations` was applied:
- Token compression: merged synonymous sentences, eliminated filler words
- Quantified constraints: explicit limits ("3 bullets, max 12 words each") over vague "be concise"
- JIT loading: conditional references over blanket loading
- Lists over tables: ~30-40% token savings
- Hard rules: MUST/NEVER reserved for safety invariants only
- No anti-laziness language: no "be thorough", "think carefully", "don't be lazy"
