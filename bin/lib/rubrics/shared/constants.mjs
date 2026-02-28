// Shared constants for eval rubrics — named replacements for magic numbers.

/** Minimum assertion-to-action ratio for density check */
export const ASSERTION_DENSITY_THRESHOLD = 0.3

/** Maximum percentage of IDs that can be orphans (defined once, never cross-referenced) */
export const PHANTOM_ID_TOLERANCE = 0.2

/** Number of occurrences before an ID is considered a true duplicate (not cross-reference) */
export const DUPLICATE_ID_THRESHOLD = 3

/** Number of direct page.locator() calls that triggers a page-object suggestion */
export const DIRECT_LOCATOR_THRESHOLD = 5

/** Number of direct cy.get() calls that triggers a custom-command suggestion */
export const DIRECT_CY_GET_THRESHOLD = 10

/** Method name prefixes that indicate assertion delegation to page objects */
export const ASSERTION_DELEGATION_PREFIXES = [
  'verify',
  'expect',
  'assert',
  'should',
  'check',
  'confirm',
  'validate',
  'ensure',
]
