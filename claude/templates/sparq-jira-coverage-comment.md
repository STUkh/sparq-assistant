# Jira QA Coverage Comment

Format for the structured comment added to Jira tickets by `/sparq:export jira`.

> This template uses Jira markdown syntax. For Jira Cloud (ADF required), the export skill converts this to Atlassian Document Format before posting via the Jira API.

```
> **Categories**: HP = Happy Path | VE = Validation & Error | SEC = Security | EC = Edge Case | A11Y = Accessibility

## QA Coverage Summary — {feature}

**Generated**: {date} | **Source**: {REQ file}

| Category | Count | Automated |
|----------|-------|-----------|
| Happy Path | {N} | {N}/{N} |
| Validation | {N} | {N}/{N} |
| Security | {N} | {N}/{N} |
| Edge Cases | {N} | {N}/{N} |
| Accessibility | {N} | {N}/{N} |
| **Total** | **{N}** | **{N}/{N} ({%})** |

Priority: P1({N}) P2({N}) P3({N}) P4({N})

Test cases: `.sparq/test-cases/TC-{feature}-manual.md`
Automation: project test directory (per `e2e.structure.*` config)
```

## Example

> Jira coverage comment for EP-142 (Login feature)

```
> **Categories**: HP = Happy Path | VE = Validation & Error | SEC = Security | EC = Edge Case | A11Y = Accessibility

## QA Coverage Summary — Login

**Generated**: 2026-02-13 | **Source**: .sparq/requirements/REQ-login.md

| Category | Count | Automated |
|----------|-------|-----------|
| Happy Path | 5 | 4/5 |
| Validation | 4 | 3/4 |
| Security | 3 | 3/3 |
| Edge Cases | 1 | 0/1 |
| Accessibility | 1 | 0/1 |
| **Total** | **14** | **10/14 (71%)** |

Priority: P1(8) P2(4) P3(2) P4(0)

Test cases: `.sparq/test-cases/TC-login-manual.md`
Automation: `e2e/specs/login.spec.ts`
```
