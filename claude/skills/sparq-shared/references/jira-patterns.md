# Jira MCP Tool Patterns

> **NOTE:** Tool names derived from Atlassian MCP server registered as `atlassian` in `.mcp.json`. If your server key differs, adjust the `mcp__atlassian__` prefix accordingly. Verify with `ToolSearch` on first use.

## Authentication

The Atlassian MCP server (`https://mcp.atlassian.com/v1/mcp`) uses **OAuth 2.1 browser-based login**. No environment variables or API tokens are required for default setup.

**How it works:**
1. On first connection, Claude Code initiates the OAuth 2.1 flow automatically
2. A browser window opens for Atlassian login and consent (select which site/products to grant access)
3. After consent, an access token is issued and used for all subsequent requests
4. Token refresh is handled automatically by the MCP client

**No `.mcp.json` credentials needed** — the minimal config is sufficient:
```json
{
  "mcpServers": {
    "atlassian": {
      "type": "http",
      "url": "https://mcp.atlassian.com/v1/mcp"
    }
  }
}
```

**Alternative auth methods** (CI/headless environments only):

- **Personal API Token** (Basic Auth): Requires org admin to enable API token auth. Generate a token at `https://id.atlassian.com/manage-profile/security/api-tokens`, then add a `headers` block:
  ```json
  "headers": { "Authorization": "Basic <base64(email:api_token)>" }
  ```
- **Service Account Bearer Token**: For non-human/CI use. Requires org admin setup:
  ```json
  "headers": { "Authorization": "Bearer <service_account_api_key>" }
  ```

> **Requires Atlassian Rovo license** (Jira, Confluence, Compass on Atlassian Cloud). The `/v1/sse` endpoint is deprecated — use `/v1/mcp`.

## Tools

**mcp__atlassian__jira_get_issue** -- Fetch single issue with description, acceptance criteria, links, subtasks.
```
Parameters: { issueKey: "{PROJECT_KEY}-14" }
```
Key response fields: `fields.summary`, `fields.description` (ADF or wiki markup), `fields.issuetype.name`, `fields.priority.name`, `fields.status.name`, `fields.issuelinks[]`, `fields.subtasks[]`, `fields.labels[]`

**mcp__atlassian__jira_search_using_jql** -- Search issues via JQL.
```
Parameters: { jql: "project = {PROJECT_KEY} AND type = Story AND sprint in openSprints()", limit: 50 }
```

> Replace `{PROJECT_KEY}` with the actual project key from `sparq.config.json`.

## Common JQL Patterns

```sql
issue = {PROJECT_KEY}-14
project = {PROJECT_KEY} AND type = Story AND sprint in openSprints()
parent = {PROJECT_KEY}-14
"Epic Link" = {PROJECT_KEY}-10
project = {PROJECT_KEY} AND type = Story AND updated >= -7d ORDER BY updated DESC
project = {PROJECT_KEY} AND labels = "user-management"
project = {PROJECT_KEY} AND sprint in openSprints() AND resolution = Unresolved
project = {PROJECT_KEY} AND status in ("In Progress", "In Review")
project = {PROJECT_KEY} AND text ~ "login authentication"
```

## Extracting Acceptance Criteria

Check description field in this order:

1. **Heading-based**: `h3. Acceptance Criteria` or `## Acceptance Criteria` followed by bullet points
2. **BDD**: `Given/When/Then` blocks anywhere in description
3. **Checkbox list**: `- [x]` / `- [ ]` items
4. **Fallback**: Extract requirements from description paragraphs

**Extraction steps**: Parse description (ADF JSON or wiki markup) -> find "Acceptance Criteria" heading (case-insensitive) -> collect bullets/numbered items until next heading or EOF -> if none, check for Given/When/Then -> if still none, extract from paragraphs.

## Following Linked Issues

Link types in `fields.issuelinks[]`:
- **Blocks / is blocked by**: Always follow (dependencies)
- **Relates to**: Follow for comprehensive feature requirements
- **Clones / is cloned by**: Skip (duplicates)
- **Epic Link**: Follow to get sibling stories

**Traversal**: Fetch primary issue -> collect linked keys -> fetch each linked issue -> extract requirements with `sourceRef` pointing to linked key.

## Error Handling

For error handling and retry logic, see `degradation-strategy.md`.

## Example Workflow

```
1. mcp__atlassian__jira_get_issue("{PROJECT_KEY}-14") -> extract title, description, AC; note links: {PROJECT_KEY}-12 (blocks), {PROJECT_KEY}-15 (relates)
2. mcp__atlassian__jira_search_using_jql("parent = {PROJECT_KEY}-14") -> get subtasks
3. mcp__atlassian__jira_get_issue("{PROJECT_KEY}-12"), mcp__atlassian__jira_get_issue("{PROJECT_KEY}-15") -> extract related requirements
4. Build Requirements: REQ-login-001 ({PROJECT_KEY}-14 AC), REQ-login-002 (subtask), REQ-login-003 ({PROJECT_KEY}-12 blocker)
```

## Export Patterns (Write-back)

**Add label**: `mcp__atlassian__jira_update_issue` with `issueKey`, `fields: { labels: { add: ["qa-covered"] } }`. Check existing labels first.
**Create sub-task**: `mcp__atlassian__jira_create_issue` with `project`, `summary` ("QA: {Feature} Test Plan"), `type: "Sub-task"`, `parent: { key }`. Use when `outputs.jira.createSubTask: true`.
**Add comment**: `mcp__atlassian__jira_update_issue` with comment field. Format as ADF for rich rendering (category table, status badges, artifact links). Comment template: `claude/templates/sparq-jira-coverage-comment.md`.

Export errors: 409 (refetch, retry) | 400 (skip invalid field, continue) | label exists (skip silently) | same retry/backoff as read operations.
