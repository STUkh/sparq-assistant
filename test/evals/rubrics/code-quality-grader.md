# Code Quality Grader

Evaluate the quality of generated Playwright E2E code. Score each dimension 1-5.

## Dimensions

1. **POM Adherence** (1-5): Uses get accessors? Extends base class? URL from route constants?
2. **Selector Quality** (1-5): Prefers data-testid? Falls back to semantic locators? No fragile CSS?
3. **BDD Structure** (1-5): Steps follow Given/When/Then? Steps compose smaller methods?
4. **Fixture Pattern** (1-5): Uses factory functions? Includes cleanup()? Extends base test?
5. **Import Conventions** (1-5): From fixtures index? Type imports use `import type`? Barrel imports?

## Scoring

- 5: Matches existing project conventions perfectly
- 4: Good, minor deviations from conventions
- 3: Acceptable, some convention mismatches
- 2: Significant convention violations
- 1: Ignores project conventions entirely

## Output Format

```json
{
  "pomAdherence": 5,
  "selectorQuality": 4,
  "bddStructure": 4,
  "fixturePattern": 5,
  "importConventions": 5,
  "overallScore": 4.6,
  "feedback": "Excellent POM adherence. Selectors could use more data-testid attributes instead of getByRole."
}
```
