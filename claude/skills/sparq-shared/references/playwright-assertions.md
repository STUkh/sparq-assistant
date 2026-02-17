# Playwright Assertions Reference

> Playwright-specific. Consumed by sparq-automation-engineer, sparq-playwright-best-practices skill.
> Complements `playwright-patterns.md` locator and spec patterns.
> Cross-references: `playwright-anti-patterns.md` (common mistakes), `playwright-patterns.md` (POM, fixtures, specs).

## Web-First Assertions

Playwright's `expect()` assertions auto-retry until the condition is met or the timeout expires. This eliminates manual polling and race conditions. Default timeout is 5 seconds (configurable globally or per-assertion).

### How auto-retry works

When you write `await expect(locator).toBeVisible()`, Playwright:

1. Queries the locator in the DOM
2. Checks the condition (visibility in this case)
3. If the condition fails, waits briefly and retries from step 1
4. Repeats until the condition passes or the timeout expires
5. Throws only after timeout -- not on the first failed check

This is fundamentally different from `expect(await locator.isVisible()).toBe(true)` which evaluates `isVisible()` once, captures the boolean, and asserts on a static value with zero retries.

### Assertion inventory by category

**Visibility**
- `toBeVisible()` -- element is in DOM and has non-zero bounding box
- `toBeHidden()` -- element is not in DOM, or has `display:none`, `visibility:hidden`, or zero size
- `toBeAttached()` -- element exists in DOM (may be hidden)
- `toBeDetached()` -- element does not exist in DOM

**Content**
- `toHaveText(expected)` -- element's `textContent` matches (string or regex)
- `toContainText(expected)` -- element's `textContent` contains the substring
- `toHaveValue(expected)` -- input/textarea/select has this value
- `toHaveValues(expected[])` -- multi-select has exactly these selected values

**State**
- `toBeEnabled()` -- element is not disabled
- `toBeDisabled()` -- element has `disabled` attribute or `aria-disabled="true"`
- `toBeChecked()` -- checkbox or radio is checked
- `toBeEditable()` -- element is visible, enabled, and not readonly

**Navigation**
- `toHaveURL(expected)` -- page URL matches (string or regex)
- `toHaveTitle(expected)` -- page title matches (string or regex)

**Count**
- `toHaveCount(n)` -- locator resolves to exactly `n` elements

**Attributes and styling**
- `toHaveAttribute(name, value)` -- element has attribute with expected value
- `toHaveClass(expected)` -- element's class list contains the expected class(es)
- `toHaveCSS(property, value)` -- element has the specified computed CSS value

### Custom timeout per assertion

Override the default timeout for assertions that need more time (e.g., after slow API calls):

```typescript
await expect(page.getByText('Report generated')).toBeVisible({ timeout: 15000 })
await expect(page).toHaveURL(/\/reports\/\d+/, { timeout: 10000 })
```

### The wrong pattern -- losing auto-retry

```typescript
// WRONG: evaluates once, no retry
expect(await submitButton.isVisible()).toBe(true)
expect(await heading.textContent()).toBe('Dashboard')
expect(await input.inputValue()).toContain('test')

// RIGHT: auto-retrying web-first assertions
await expect(submitButton).toBeVisible()
await expect(heading).toHaveText('Dashboard')
await expect(input).toHaveValue(/test/)
```

## Soft Assertions

`expect.soft()` records the failure but does not stop the test. The test continues executing and reports all soft failures at the end.

### When to use

- Form validation: verify multiple field error messages in one pass
- Dashboard checks: verify several widgets rendered correctly
- Visual inventory: confirm a set of elements are present on a page

### When NOT to use

- Navigation guards: if a page redirect fails, subsequent assertions are meaningless
- Prerequisites: if login fails, every following assertion will also fail
- Data creation: if a record was not created, asserting on its properties is noise

### Code example: form validation

```typescript
test('registration form shows all validation errors', async ({ page }) => {
  const registerPage = new RegisterPage(page)
  await registerPage.goto()
  await registerPage.submitButton.click()

  // Soft assertions: collect all validation errors in one run
  await expect.soft(registerPage.emailError).toHaveText('Email is required')
  await expect.soft(registerPage.passwordError).toHaveText('Password is required')
  await expect.soft(registerPage.nameError).toHaveText('Name is required')
  await expect.soft(registerPage.tosError).toHaveText('You must accept the terms')
})
```

## Custom Matchers

Use `expect.extend()` to create project-specific assertions that encapsulate repeated patterns.

### Code example: toast message matcher

```typescript
// e2e/support/custom-matchers.ts
import { expect as baseExpect } from '@playwright/test'

export const expect = baseExpect.extend({
  async toHaveToastMessage(page: Page, expected: string) {
    const toast = page.getByRole('alert')
    try {
      await baseExpect(toast).toContainText(expected, { timeout: 5000 })
      return { pass: true, message: () => `Toast displayed: "${expected}"` }
    } catch {
      return {
        pass: false,
        message: () => `Expected toast with "${expected}" but it was not found`,
      }
    }
  },
})

// Usage in spec
await expect(page).toHaveToastMessage('Changes saved successfully')
```

Register custom matchers in the fixture barrel so every spec inherits them automatically.

## Assertion Anti-Patterns

### Manual `isVisible()` check before action

Locator actions (`click`, `fill`) already auto-wait for the element to be actionable. A preceding visibility check is redundant and can introduce a race condition between the check and the action.

```typescript
// BAD: redundant check + race condition
if (await page.getByTestId('modal-close').isVisible()) {
  await page.getByTestId('modal-close').click()
}

// GOOD: use locator directly (auto-waits)
await page.getByTestId('modal-close').click()

// If the element may not exist, use a conditional pattern:
const closeButton = page.getByTestId('modal-close')
if (await closeButton.count() > 0) {
  await closeButton.click()
}
```

### Asserting on `page.content()` or `innerHTML()`

These return raw HTML strings. String matching on HTML is fragile, encoding-dependent, and bypasses Playwright's auto-retry.

```typescript
// BAD: string matching on raw HTML
const html = await page.content()
expect(html).toContain('Welcome')

// GOOD: web-first assertion on locator
await expect(page.getByText('Welcome')).toBeVisible()
```

### Using `toHaveCount(0)` when `toBeHidden()` suffices

`toHaveCount(0)` asserts the element is not in the DOM at all. `toBeHidden()` covers both absent and hidden elements. Use `toHaveCount(0)` only when you specifically need to confirm DOM removal.

### Using exact `toHaveText()` for dynamic content

Dynamic text (timestamps, counts, user-generated content) changes between runs. Use `toContainText()` or regex patterns.

```typescript
// BAD: breaks when count changes
await expect(resultsHeading).toHaveText('Showing 42 results')

// GOOD: flexible match
await expect(resultsHeading).toContainText('results')
// or
await expect(resultsHeading).toHaveText(/Showing \d+ results/)
```

## Waiting Strategies

Choose the correct wait mechanism based on what you are waiting for. Use the narrowest strategy that covers the case.

### Decision tree

1. **Locator action** (`click`, `fill`, `check`, `selectOption`)
   - Built-in auto-wait: waits for element to be visible, stable, enabled, and receiving events
   - No additional wait needed

2. **Assertion** (`expect(locator).toBeVisible()`, etc.)
   - Built-in auto-retry: re-evaluates until passing or timeout
   - No additional wait needed

3. **Element appearance/disappearance** -- when you need to wait without asserting
   - `await locator.waitFor()` -- waits for element to be visible (default)
   - `await locator.waitFor({ state: 'hidden' })` -- waits for element to disappear
   - `await locator.waitFor({ state: 'attached' })` -- waits for element in DOM

4. **Page navigation**
   - `await page.waitForURL(urlOrRegex)` -- waits for the URL to match
   - Cross-reference: `playwright-patterns.md` Wait States for `waitForLoadState` usage

5. **API response** -- waiting for a specific network call to complete
   - `await page.waitForResponse(urlOrPredicate)` -- resolves when matching response arrives

   ```typescript
   const responsePromise = page.waitForResponse('**/api/users')
   await page.getByRole('button', { name: 'Save' }).click()
   const response = await responsePromise
   expect(response.status()).toBe(200)
   ```

6. **Page load state**
   - `await page.waitForLoadState('load')` -- default, fires on `window.load`
   - `await page.waitForLoadState('domcontentloaded')` -- DOM ready, resources may still load
   - See `playwright-patterns.md` Wait States for when to use each

### NEVER use `waitForTimeout`

`page.waitForTimeout(N)` is always wrong. It either over-waits (slow tests) or under-waits (flaky tests). Every use case has a better alternative listed above. See `playwright-anti-patterns.md` Timing Anti-Patterns for detailed examples.

### Combining waits for complex flows

For actions that trigger both a network call and a navigation:

```typescript
// Wait for both API response and URL change
const saveResponse = page.waitForResponse('**/api/settings')
await settingsPage.saveButton.click()
await saveResponse
await page.waitForURL('/settings/confirmation')
await expect(page.getByText('Settings saved')).toBeVisible()
```
