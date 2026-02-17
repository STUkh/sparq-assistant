# Playwright MCP Workflows

> Playwright-specific. Consumed by sparq-automation-engineer (when `e2e.framework: 'playwright'`), sparq-playwright-best-practices skill.
> Tool inventory with parameters: see `mcp-tool-inventory.md` section "Playwright".

## Selector Verification Workflow

Verify that Figma-derived selectors resolve correctly on the live page.

```
1. mcp__playwright__browser_navigate({ url: "http://localhost:5173/login" })
2. mcp__playwright__browser_snapshot() -> get page accessibility tree with element refs
3. Verify expected elements exist: "Email input" (ref e3), "Password input" (ref e4), "Sign In button" (ref e12)
4. mcp__playwright__browser_take_screenshot() -> visual confirmation
```

## Visual Regression Workflow

Compare the live page against Figma designs visually.

```
1. mcp__playwright__browser_navigate({ url: "http://localhost:5173/users" })
2. mcp__playwright__browser_snapshot() -> wait for page to stabilize (never use "networkidle" -- see playwright-patterns.md)
3. mcp__playwright__browser_resize({ width: 1440, height: 900 })
4. mcp__playwright__browser_take_screenshot() -> capture full-page screenshot
5. Compare with mcp__figma__get_screenshot() output side-by-side
```

## Form Testing Workflow

Validate form submission flows interactively.

```
1. mcp__playwright__browser_navigate({ url: "http://localhost:5173/login" })
2. mcp__playwright__browser_snapshot() -> identify form field refs
3. mcp__playwright__browser_fill_form({ values: [
     { ref: "e3", value: "admin@test.com" },
     { ref: "e4", value: "SecurePass123!" }
   ]})
4. mcp__playwright__browser_click({ element: "Sign In", ref: "e12" })
5. mcp__playwright__browser_snapshot() -> verify navigation to dashboard (never use "networkidle" -- see playwright-patterns.md)
7. mcp__playwright__browser_console_messages() -> check for errors
```

## Responsive Layout Workflow

Verify page renders correctly across viewports.

```
1. mcp__playwright__browser_navigate({ url: "http://localhost:5173/dashboard" })
2. mcp__playwright__browser_resize({ width: 1440, height: 900 }) -> desktop
3. mcp__playwright__browser_take_screenshot()
4. mcp__playwright__browser_resize({ width: 768, height: 1024 }) -> tablet
5. mcp__playwright__browser_take_screenshot()
6. mcp__playwright__browser_resize({ width: 375, height: 812 }) -> mobile
7. mcp__playwright__browser_take_screenshot()
```

## Network & Console Debugging

Diagnose API or runtime issues during testing.

```
1. mcp__playwright__browser_navigate({ url: "http://localhost:5173/users" })
2. mcp__playwright__browser_snapshot() -> wait for page to stabilize (never use "networkidle" -- see playwright-patterns.md)
3. mcp__playwright__browser_network_requests() -> verify API calls (200 status, correct endpoints)
4. mcp__playwright__browser_console_messages() -> check for JS errors or warnings
5. mcp__playwright__browser_evaluate({ expression: "window.__PINIA_STATE__" }) -> inspect app state
```

## Integration Points

| Agent / Skill | Primary Tools | Purpose |
|---------------|---------------|---------|
| `qa-e2e-playwright` agent | All interaction + inspection tools | Write and debug E2E tests |
| `sparq-analyze` skill | `browser_navigate`, `browser_snapshot`, `browser_take_screenshot` | Verify selectors from Figma extraction |
| `sparq-sync` skill | `browser_navigate`, `browser_fill_form`, `browser_click`, `browser_snapshot` | Sync tests -- validate form flows against UI |
| `visual-design-architect` agent | `browser_navigate`, `browser_resize`, `browser_take_screenshot` | Visual regression against Figma designs |
| `sparq-generate-e2e` skill | `browser_navigate`, `browser_snapshot`, `browser_console_messages` | E2E test generation smoke testing |
