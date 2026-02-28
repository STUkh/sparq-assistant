# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.0.x   | Yes       |

## What SparQ Does

SparQ Assistant installs Claude Code agent definitions (`.md` files), skill definitions, templates, rules, and hooks into your project's `.claude/` directory. It also merges MCP server configuration into `.mcp.json` and provides a `lint` command with deterministic rubrics for test quality scoring. It does **not** access networks or modify your application source code.

**Hooks**: The `sparq init` and `sparq update` commands install shell hooks (`.claude/hooks/`) that execute during Claude Code lifecycle events (Stop, PreCompact). These hooks run shell commands in the project directory. Review installed hooks before use.

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly:

1. **Do NOT** open a public GitHub issue
2. Email **security@sparq-assistant.dev** with:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
3. You will receive acknowledgment within 48 hours
4. A fix will be prioritized based on severity

Alternatively, use [GitHub Security Advisories](https://github.com/STUkh/sparq-assistant/security/advisories/new) to report privately.

## Scope

- CLI installer (`bin/sparq.mjs` and `bin/lib/`)
- Generated configuration files (`sparq.config.json`, `.mcp.json`)
- File copy operations (agents, skills, templates, rules)
- Hooks (`claude/hooks/`) — shell scripts executed by Claude Code lifecycle events
- Rubrics and lint output (`bin/lib/rubrics/`, `.sparq/lint-results.sarif`)

MCP server security (Atlassian, Figma, Playwright, TestRail, Qase, Zephyr Scale) is managed by their respective providers.

## Supply Chain

SparQ has **zero runtime dependencies** — it uses only Node.js built-in modules (`node:fs`, `node:path`, `node:util`, etc.). This eliminates supply chain attack surface from third-party packages. Development dependencies (Biome) are used only for linting and are not shipped.
