# Test Quality Grader

Evaluate the quality of generated manual test cases. Score each dimension 1-5.

## Dimensions

1. **Step Granularity** (1-5): Each step is a single user action? Expected results are specific (not vague)?
2. **Data Realism** (1-5): Test data uses realistic values (not "test123")? Specific enough to reproduce?
3. **Precondition Completeness** (1-5): Auth state specified? Starting URL? Required test data? Browser reqs?
4. **Expected Result Specificity** (1-5): States what user sees, not "works correctly"? Includes state changes?
5. **Edge Case Coverage** (1-5): Boundary values tested? Empty inputs? Max lengths? Special characters?

## Scoring

- 5: Enterprise-grade, ready for production QA team
- 4: Good quality, minor improvements possible
- 3: Acceptable, some vague or missing elements
- 2: Below standard, significant gaps
- 1: Unusable, major rework needed

## Output Format

```json
{
  "stepGranularity": 4,
  "dataRealism": 3,
  "preconditionCompleteness": 5,
  "expectedResultSpecificity": 4,
  "edgeCaseCoverage": 3,
  "overallScore": 3.8,
  "feedback": "Steps are well-granulated. Test data could use more realistic email addresses. Edge cases missing max-length and Unicode inputs."
}
```
