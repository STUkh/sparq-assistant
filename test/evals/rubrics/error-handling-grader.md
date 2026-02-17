# Error Handling Quality Grader

Model-based evaluation rubric for error handling compliance in SparQ agent outputs.

## Scoring Dimensions

### 1. Retry Protocol Compliance (1-5)

- **5**: All MCP errors show correct retry classification (transient/auth/client/parse), appropriate retry counts, and exponential backoff timing in signals
- **4**: Retry classification correct, signals present but missing some timing details
- **3**: Retries attempted but classification unclear or inconsistent
- **2**: Some retry attempts but protocol not followed (wrong counts, no backoff)
- **1**: No retry behavior visible despite MCP errors occurring

### 2. Fallback Behavior Accuracy (1-5)

- **5**: Every source failure triggers the correct per-source fallback (Jira->user input, Confluence->skip, Figma->codebase grep), fallback actions are documented, and output quality is maintained
- **4**: Correct fallbacks for most sources, minor gaps in documentation
- **3**: Fallbacks triggered but some are incorrect or incomplete
- **2**: Only some failures have fallbacks, others silently ignored
- **1**: No fallback behavior despite source failures

### 3. Gap Documentation Completeness (1-5)

- **5**: Every degradation is recorded in handoff `gaps[]`, source labels (SRC-J/C/F/L) used, gap descriptions are actionable, and handoff `status` correctly reflects degradation level
- **4**: Gaps documented but missing some source labels or minor details
- **3**: Some gaps documented but others missing, status may not reflect all degradations
- **2**: Minimal gap documentation, status doesn't match actual degradation
- **1**: No gap documentation despite degraded execution

### 4. Progress Signal Compliance (1-5)

- **5**: All error/fallback signals follow `[sparq] {phase} Fallback/Retry/Warning:` format, include source name, error description, and fallback action
- **4**: Signals present and mostly formatted correctly, minor omissions
- **3**: Some signals present but format inconsistent
- **2**: Few signals, mostly informal error messages
- **1**: No progress signals for error conditions

## Scoring Guide

- **Total**: Sum of all 4 dimensions (4-20)
- **Pass threshold**: 15/20 (75%)
- **Excellent**: 18-20
- **Good**: 15-17
- **Needs improvement**: 10-14
- **Failing**: 4-9

## Evaluation Instructions

1. Read the agent output carefully, looking for any MCP calls, errors, retries, or fallbacks
2. For each error encountered, trace the full handling chain: detection -> classification -> retry -> fallback -> gap reporting -> signal
3. Score each dimension independently based on the rubric above
4. Provide specific examples from the output to justify each score
5. Note any missing error handling for errors that should have been caught

## Output Format

```json
{
  "retryProtocol": 4,
  "fallbackBehavior": 3,
  "gapDocumentation": 5,
  "progressSignals": 4,
  "overallScore": 4.0,
  "feedback": "Retry protocol followed correctly with exponential backoff. Figma fallback used codebase grep as expected but Confluence skip was not documented in gaps. All signals use correct [sparq] format."
}
```
