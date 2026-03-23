# Playwright CLI Verification Workflows

> Playwright-specific. Consumed by sparq-automation-engineer (when `e2e.framework: 'playwright'`), sparq-playwright-best-practices skill.
> Requires Playwright installed as a project dev dependency. Detection: `npx playwright --version`.
> For tool inventory of other MCP servers, see `mcp-tool-inventory.md`.

## Availability Detection

Before any CLI workflow, check Playwright is installed:

```
npx playwright --version 2>/dev/null
```

If exit code != 0: skip all browser verification, log `[sparq] Browser verification skipped — Playwright not installed`. Continue pipeline without blocking.

## Screenshot Output

All verification screenshots are saved to `.sparq/screenshots/`. This directory is created on first use and included in `.sparq/` output artifacts.

## Selector Verification Workflow

Verify that Figma-derived selectors resolve correctly on the live page.

```
1. npx playwright screenshot http://localhost:5173/login --output=.sparq/screenshots/login-verify.png
2. node -e "
   const { chromium } = require('playwright');
   (async () => {
     const browser = await chromium.launch();
     const page = await browser.newPage();
     await page.goto('http://localhost:5173/login');
     const tree = await page.accessibility.snapshot();
     console.log(JSON.stringify(tree, null, 2));
     await browser.close();
   })();
   "
3. Verify expected elements exist in accessibility tree output: "Email input", "Password input", "Sign In button"
4. Review screenshot for visual confirmation
```

## Visual Regression Workflow

Compare the live page against Figma designs visually.

```
1. npx playwright screenshot http://localhost:5173/users --output=.sparq/screenshots/users-desktop.png --viewport-size=1440,900
2. Compare with mcp__figma__get_screenshot() output side-by-side
```

## Form Testing Workflow

Validate form submission flows interactively.

```
1. node -e "
   const { chromium } = require('playwright');
   (async () => {
     const browser = await chromium.launch();
     const page = await browser.newPage();
     await page.goto('http://localhost:5173/login');
     await page.getByLabel('Email').fill('admin@test.com');
     await page.getByLabel('Password').fill('SecurePass123!');
     await page.getByRole('button', { name: 'Sign In' }).click();
     await page.waitForURL('**/dashboard');
     const errors = [];
     page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
     console.log('Navigation:', page.url());
     console.log('Console errors:', errors.length ? errors : 'none');
     await page.screenshot({ path: '.sparq/screenshots/login-result.png' });
     await browser.close();
   })();
   "
```

## Responsive Layout Workflow

Verify page renders correctly across viewports.

```
1. npx playwright screenshot http://localhost:5173/dashboard --output=.sparq/screenshots/dashboard-desktop.png --viewport-size=1440,900
2. npx playwright screenshot http://localhost:5173/dashboard --output=.sparq/screenshots/dashboard-tablet.png --viewport-size=768,1024
3. npx playwright screenshot http://localhost:5173/dashboard --output=.sparq/screenshots/dashboard-mobile.png --viewport-size=375,812
```

## Network & Console Debugging

Diagnose API or runtime issues during testing.

```
1. node -e "
   const { chromium } = require('playwright');
   (async () => {
     const browser = await chromium.launch();
     const page = await browser.newPage();
     const requests = [];
     const consoleMessages = [];
     page.on('request', req => requests.push({ url: req.url(), method: req.method() }));
     page.on('console', msg => consoleMessages.push({ type: msg.type(), text: msg.text() }));
     await page.goto('http://localhost:5173/users');
     await page.waitForLoadState('domcontentloaded');
     console.log('Network requests:', JSON.stringify(requests.filter(r => r.url.includes('/api/')), null, 2));
     console.log('Console messages:', JSON.stringify(consoleMessages.filter(m => m.type === 'error'), null, 2));
     const state = await page.evaluate(() => window.__PINIA_STATE__);
     console.log('App state:', JSON.stringify(state, null, 2));
     await browser.close();
   })();
   "
```

## Integration Points

- `sparq-automation-engineer` agent: screenshot + accessibility tree for selector verification during P0.5/generation/P3
- `sparq-test-validator` agent: screenshot pages during S4 validation to confirm selector drift
- `sparq-generate-e2e` skill: screenshot + console output for smoke testing
- `sparq-validate` skill: screenshot for live browser comparison
- `sparq-manual-to-e2e` skill: screenshot + accessibility tree for selector verification
