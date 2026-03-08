# Confluence MCP Tool Patterns

> **NOTE:** Tool names derived from Atlassian MCP server registered as `atlassian` in `.mcp.json`. If your server key differs, adjust the `mcp__atlassian__` prefix accordingly. Verify with `ToolSearch` on first use.

## Authentication

Confluence uses the same Atlassian MCP server as Jira — **OAuth 2.1 browser-based login, no ENV vars required**. See `jira-patterns.md` `## Authentication` for full details including alternative CI/headless auth methods.

## Tools

**mcp__atlassian__confluence_search_using_cql** -- Search pages via CQL.
```
Parameters: { cql: 'space = "{SPACE_KEY}" AND title ~ "User Management"', limit: 25 }
```

**mcp__atlassian__confluence_get_page** -- Fetch single page with full content.
```
Parameters: { pageId: "12345" }
```
Key response fields: `title`, `body.storage.value` (HTML), `version.number`, `ancestors[]`, `metadata.labels.results[]`

**mcp__atlassian__confluence_get_page_descendants** -- Get child pages under a parent.
```
Parameters: { pageId: "12345", depth: "all" }
```

> Replace `{SPACE_KEY}` with the actual Confluence space key from `sparq.config.json`.

## Common CQL Patterns

```sql
space = "{SPACE_KEY}" AND title ~ "User Management"
space = "{SPACE_KEY}" AND label = "specs"
ancestor = 12345
space = "{SPACE_KEY}" AND label = "specs" AND lastModified >= now("-90d")
space = "{SPACE_KEY}" AND text ~ "authentication flow"
space = "{SPACE_KEY}" AND title ~ "API" AND label = "technical-design"
space = "{SPACE_KEY}" AND creator = "john.doe"
space = "{SPACE_KEY}" AND type = "page" AND title ~ "Requirements"
```

## Extracting Requirements from Page Content

Parse `body.storage.value` HTML. Three common formats:

**Table-based**: `<table>` with columns like ID, Description, Priority, Status. Parse header row, map columns to Requirement fields.

**Heading-structured**: `<h2>` = category, `<h3>` = individual requirement, following `<p>` and `<ul>` = details and criteria.

**Inline status macros**: `<ac:structured-macro ac:name="status"><ac:parameter ac:name="title">MUST HAVE</ac:parameter></ac:structured-macro>` -- indicates priority markers.

## Page Hierarchy Traversal

Specs often organized as parent-child trees (e.g., Feature Spec -> Functional Requirements, UI Specifications, API Design, Test Scenarios).

**Pattern**: Search for top-level spec page -> `mcp__atlassian__confluence_get_page_descendants` for children -> fetch each child with `mcp__atlassian__confluence_get_page` -> extract requirements preserving hierarchy.

## Parsing Tips

- Strip HTML tags for plain text but preserve structure for grouping
- Handle `ac:structured-macro`: expand or skip by type
- Code blocks (`ac:name="code"`): may contain API specs or test data
- Info/warning panels: often contain important requirement notes
- Embedded images: note presence for UI requirements; text in alt/title attrs
- Jira links (`href="...atlassian.net/browse/{PROJECT_KEY}-14"`): extract issue keys for cross-referencing

## Error Handling

For error handling and retry logic, see `degradation-strategy.md`.

## Example Workflow

```
1. mcp__atlassian__confluence_search_using_cql('space = "{SPACE_KEY}" AND label = "specs" AND title ~ "Login"') -> page 12345
2. mcp__atlassian__confluence_get_page("12345") -> parse body for requirements table
3. mcp__atlassian__confluence_get_page_descendants("12345") -> child 12350 "Login Validation Rules"
4. mcp__atlassian__confluence_get_page("12350") -> extract validation requirements
5. Build Requirements with source: 'confluence', sourceRef: page URL
```

## Export Patterns (Write-back)

**Create**: `mcp__atlassian__confluence_create_page` with `spaceKey`, `title` ("QA: {Feature} Test Plan"), `body` (HTML), optional `parentId`.
**Update**: `mcp__atlassian__confluence_update_page` with `pageId`, `title`, `body`, `version: { number: N+1 }`. Fetch current page first for version number.

Always search before creating to avoid duplicates: `space = "{SPACE_KEY}" AND title = "QA: {Feature} Test Plan"`. If found, update instead of create.

Page structure: Summary → Requirements Traceability → Test Cases table → Coverage Matrix → Automation Status.

Export errors: 409 (refetch version, retry) | 400 (simplify HTML, retry) | 413 (split into parent+child pages) | same retry/backoff as read operations.
