# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 2.0.x   | Yes       |
| < 2.0   | No        |

## What SparQ Does

SparQ Assistant installs Claude Code agent definitions (`.md` files), skill definitions, and templates into your project's `.claude/` directory. It also merges MCP server configuration into `.mcp.json`. It does **not** execute arbitrary code, access networks, or modify your application source code.

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly:

1. **Do NOT** open a public GitHub issue
2. Email **security@sparq-assistant.dev** with:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
3. You will receive acknowledgment within 48 hours
4. A fix will be prioritized based on severity

Alternatively, use [GitHub Security Advisories](https://github.com/sparq-assistant/sparq-assistant/security/advisories/new) to report privately.

## Scope

- CLI installer (`bin/sparq.mjs` and `bin/lib/`)
- Generated configuration files (`sparq.config.json`, `.mcp.json`)
- File copy operations (agents, skills, templates)

MCP server security (Atlassian, Figma, TestRail, Playwright) is managed by their respective providers.
