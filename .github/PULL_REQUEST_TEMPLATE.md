## Description

<!-- What does this PR do and why? -->

## Type of Change

- [ ] CLI code (`bin/`)
- [ ] Agent / Skill / Reference (`claude/`)
- [ ] Tests (`test/`)
- [ ] CI / Config / Docs

## Checklist

- [ ] `npm run check` passes (lint + tests)
- [ ] `node --check` run on every `.mjs` file I changed
- [ ] No runtime dependencies added — Node.js built-ins only
- [ ] No real credentials committed (MCP configs use placeholders)

### Agent / Skill / Reference changes only

- [ ] `/sparq:prompt-optimizations` applied (required for all prompt changes)
- [ ] `<done_criteria>` present with verifiable items; `<references>` section complete
- [ ] Agents remain under 300 lines

## How It Was Tested

<!-- CI run link, test output, or manual verification steps. -->
