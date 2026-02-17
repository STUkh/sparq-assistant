# Scenario 6: Bug Regression -- Generating a Regression Test for Checkout Discount Code Bug

> **SparQ Version:** 1.0.0
>
> This example demonstrates Scenario 6: Bug Regression. Bug ticket BUG-42 describes a checkout price calculation issue where discount codes are applied twice when a user edits the cart quantity after applying a code.
>
> **Note**: This example uses a Vue/PrimeVue project. Your generated code will use selectors and patterns appropriate for your detected tech stack (see `sparq.config.json`).
>
> This example shows Playwright output, the default E2E framework. SparQ reads your `e2e.framework` from `sparq.config.json`.

---

## 1. User Invocation

```
User: /sparq:regression BUG-42
```

## 2. Orchestrator Classification

Classified as Scenario 6 (Bug Regression). Input matches Jira ticket ID pattern (`BUG-42`). Existing e2e/: 8 page objects, 6 components, 3 steps classes, 1 fixture. Dispatching automation-engineer (regression mode).

## 3. Bug Analysis (Phase 1)

- **Jira** -- BUG-42: "Discount code applied twice when editing cart quantity"
  - Severity: High
  - Component: Checkout / Cart
  - Reporter: QA team (manual testing)

Extracted from ticket:

- **Reproduction steps:**
  1. Navigate to cart page with 2+ items
  2. Apply discount code `SAVE20` (20% off)
  3. Verify discount is applied correctly (total reflects 20% reduction)
  4. Edit quantity of any cart item (increase from 1 to 2)
  5. Observe the order total

- **Actual behavior:** Discount is applied a second time after quantity edit. Total shows ~36% reduction instead of 20%.
- **Expected behavior:** Discount percentage remains at 20% after quantity edit. Total recalculates with new quantity but same single discount application.
- **Affected component:** `CartPage` -- existing page object found at `e2e/pages/cart.page.ts`

Infrastructure scan:

- **Reusable:** `CartPage` (has `quantityInput`, `orderTotal` accessors), `auth.fixture.ts`, `auth.steps.ts`
- **Missing:** No existing method for applying discount codes -- `CartPage` needs a new `discountCodeInput` accessor and `applyDiscount()` method

```
[sparq] P1 Bug parsed: BUG-42 -- CartPage, severity: high
```

## 4. Checkpoint 1: Bug Analysis Review

```
Bug: BUG-42 -- Discount code applied twice when editing cart quantity
Severity: High
Component: CartPage (e2e/pages/cart.page.ts)

Repro steps: 5 steps
  1. Navigate to cart with items
  2. Apply discount code SAVE20
  3. Verify discount applied (20% off)
  4. Edit item quantity
  5. Observe total (bug: double discount)

Existing infrastructure:
  - Reuse: CartPage, auth.fixture.ts, auth.steps.ts
  - Extend: CartPage -- add discountCodeInput, applyDiscountButton, applyDiscount()

Output: e2e/specs/regression/bug-42.spec.ts (1 test, @regression tag)
```

User approves.

## 5. Regression Test Generation (Phase 2)

Generated files are written directly to the project `e2e/` directory per `e2e.structure.*` config. Use `git diff` to review changes.

### `e2e/pages/cart.page.ts` (extended)

New accessors and method added to the existing `CartPage`:

```typescript
// --- Added for BUG-42 regression coverage ---

get discountCodeInput(): Locator { return this.page.getByLabel('Discount code') }
get applyDiscountButton(): Locator { return this.page.getByRole('button', { name: 'Apply' }) }
get discountBadge(): Locator { return this.page.getByTestId('discount-badge') }

async applyDiscount(code: string): Promise<void> {
  await this.discountCodeInput.fill(code)
  await this.applyDiscountButton.click()
}

async editItemQuantity(itemIndex: number, newQuantity: number): Promise<void> {
  const quantityInput = this.page.getByTestId(`quantity-input-${itemIndex}`)
  await quantityInput.clear()
  await quantityInput.fill(String(newQuantity))
  await quantityInput.press('Tab')
}
```

### `e2e/specs/regression/bug-42.spec.ts`

```typescript
// Regression test for BUG-42: Discount code applied twice when editing cart quantity
import { test, expect } from '../../fixtures/auth.fixture'
import { CartPage } from '../../pages/cart.page'

test.describe('BUG-42: Discount double-application on quantity edit', { tag: '@regression' }, () => {
  let cart: CartPage

  test('REG-BUG-42-001: discount is applied only once after editing cart quantity', async ({
    page,
    authSteps,
  }) => {
    // Given: user is logged in and has items in cart
    await authSteps.givenUserIsLoggedInAs('customer')
    cart = new CartPage(page)
    await cart.goto()

    // And: cart has at least one item with a known price
    const initialTotal = await cart.orderTotal.textContent()
    const initialAmount = parseFloat(initialTotal!.replace(/[^0-9.]/g, ''))

    // When: user applies a 20% discount code
    await cart.applyDiscount('SAVE20')

    // Then: discount badge shows and total reflects 20% reduction
    await expect(cart.discountBadge).toContainText('SAVE20')
    const discountedTotal = await cart.orderTotal.textContent()
    const discountedAmount = parseFloat(discountedTotal!.replace(/[^0-9.]/g, ''))
    const expectedAfterDiscount = initialAmount * 0.8
    expect(discountedAmount).toBeCloseTo(expectedAfterDiscount, 2)

    // When: user edits item quantity (increase first item from 1 to 2)
    await cart.editItemQuantity(0, 2)

    // Then: total recalculates with new quantity but discount is still only 20%
    await expect(cart.discountBadge).toContainText('SAVE20')
    const updatedTotal = await cart.orderTotal.textContent()
    const updatedAmount = parseFloat(updatedTotal!.replace(/[^0-9.]/g, ''))

    // The discount should NOT be applied twice (~36% off)
    // It should be: (new subtotal) * 0.8
    expect(updatedAmount).toBeGreaterThan(discountedAmount)
    expect(updatedAmount).not.toBeCloseTo(discountedAmount, 2)
  })
})
```

```
[sparq] P2 Regression test generated: e2e/specs/regression/bug-42.spec.ts -- 3 assertions
```

## 6. Checkpoint 2: Code Review

**Staged:** 2 files (1 regression test, 1 page object extension) | **Assertions:** 3 (discount badge, discounted total, post-edit total) | **Reused:** CartPage, auth fixture | **Extended:** CartPage with `discountCodeInput`, `applyDiscountButton`, `discountBadge`, `applyDiscount()`, `editItemQuantity()`

User approves. Files written to project `e2e/` directory.

## 7. Smoke Verification (Phase 3)

```
[sparq] Run: npx playwright test --list e2e/specs/regression/bug-42.spec.ts
Listing tests:
  [chromium] > regression/bug-42.spec.ts > BUG-42: Discount double-application on quantity edit > REG-BUG-42-001: discount is applied only once after editing cart quantity

Total: 1 test in 1 file
[sparq] P2 Smoke verification: npx playwright test --list PASSED
```

## 8. Checkpoint 3: Final Approval

```
[sparq] Regression test for BUG-42 complete.
  Spec: e2e/specs/regression/bug-42.spec.ts (1 test, @regression)
  Page object: e2e/pages/cart.page.ts (3 accessors + 2 methods added)
  Smoke: PASSED

Would you like to run /sparq:sync to validate the broader test suite?
```

User approves final output.

## 9. Final Artifacts

- `e2e/specs/regression/bug-42.spec.ts` -- Regression test spec (1 test, `@regression` tag)
- `e2e/pages/cart.page.ts` -- Extended page object (3 new accessors, 2 new methods)
- `.sparq/plans/execution-plan.md` -- Execution tracking

**Traceability:**

| Bug Ticket | Regression Test ID | Covers |
|------------|-------------------|--------|
| BUG-42 (Discount code applied twice on quantity edit) | REG-BUG-42-001 | Repro steps 1-5: apply discount, edit quantity, verify single application |
