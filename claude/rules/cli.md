# CLI Rules

Guidance for CLI command implementation.

## Contracts

- Preserve backward compatibility for flags and command outputs
- Non-interactive mode should prefer safe local-first defaults
- Keep doctor diagnostics aligned with shipped MCP config/env contracts

## Verification

- Run `npm run lint`
- Run `npm test`
- Run `node --check` for changed CLI modules

