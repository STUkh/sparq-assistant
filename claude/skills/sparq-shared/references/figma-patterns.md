# Figma MCP Tool Patterns

Tool inventory with parameters: see `mcp-tool-inventory.md` section "Figma". Key tools for QA: `get_design_context` (component tree), `get_screenshot` (visual capture), `get_metadata` (variants/properties).

## Retry & Rate-Limit Strategy

Figma MCP endpoints may rate-limit under heavy use. Apply this strategy:
- **Retry with 2s backoff, max 3 attempts** for transient failures (5xx, timeouts)
- **429 Rate limited**: Wait `Retry-After` header value (or 5s default), then retry
- **Batch requests**: When fetching multiple nodes, add 1s delay between calls
- **Cache screenshots**: Reuse `get_screenshot` results within the same workflow run; screenshots do not change between calls

## Component Type Mapping

- Button, IconButton -> `button` (names: btn-, button-, cta-)
- Input, TextField, TextInput -> `input` (names: input-, field-, txt-)
- Select, Dropdown, Combobox -> `select` (names: select-, dropdown-, combo-)
- Checkbox -> `checkbox` (names: check-, cb-)
- RadioButton, RadioGroup -> `radio` (names: radio-, rb-)
- Link, TextLink -> `link` (names: link-, nav-)
- Dialog, Modal, Overlay -> `dialog` (names: dialog-, modal-, overlay-)
- Table, DataGrid -> `table` (names: table-, grid-, list-)
- Menu, MenuBar, ContextMenu -> `menu` (names: menu-, nav-)
- Tab, TabBar, TabGroup -> `tab` (names: tab-, tabs-)

## Identification Rules

**Include as UIElement** (interactive):
- Named Figma components map directly to UIElements
- Instance text overrides indicate labels
- Auto-layout frames with text + interactive elements = likely form groups
- Components with interaction states (hover, pressed, focused, disabled variants)
- Text fields with placeholder text, elements with click/tap annotations, navigation items

**Exclude** (decorative):
- Hidden layers (visibility: false)
- Elements named "icon-decorative", "divider", "spacer", "background"
- Background shapes/fills, decorative icons, layout spacers
- Read-only badges, progress bars, status indicators

## Deriving Playwright Selectors

Priority order:

1. **Role + accessible name** (best): `this.page.getByRole('button', { name: 'Submit' })` / `this.page.getByRole('textbox', { name: 'Email Address' })`
2. **Label text** (form fields): `this.page.getByLabel('Password')`
3. **Text content** (links, headings): `this.page.getByText('Forgot Password?')` / `this.page.getByRole('heading', { name: 'User Management' })`
4. **Test ID** (fallback): `this.page.getByTestId('user-table-row')`

> In page object classes, use `this.page.getByRole(...)`. In standalone test blocks, use `page.getByRole(...)`.

**Figma-to-ARIA Role Mapping**:
- Button->`button`, Input/TextField->`textbox`, Select/Dropdown->`combobox`, Checkbox->`checkbox`, Radio->`radio`, Link->`link`, Dialog/Modal->`dialog`, Table->`table`, Tab->`tab`, TabList->`tablist`, Menu->`menu`, MenuItem->`menuitem`, Navigation->`navigation`

## Example Extraction Workflow

```
1. mcp__figma__get_screenshot(login_page_url) -> visual context: form with email, password, submit, forgot link
2. mcp__figma__get_design_context(login_page_url) -> node tree:
   Frame "Login Page" > Text "Welcome Back", Instance "Input/Email", Instance "Input/Password",
   Instance "Button/Primary" ("Sign In"), Instance "Link/Text" ("Forgot Password?")
3. Map to UIElements:
   - { name: "Email Input", type: "input", label: "Email Address", suggestedSelector: "this.page.getByLabel('Email Address')", screen: "Login" }
   - { name: "Sign In Button", type: "button", suggestedSelector: "this.page.getByRole('button', { name: 'Sign In' })", screen: "Login" }
   - { name: "Forgot Password Link", type: "link", suggestedSelector: "this.page.getByRole('link', { name: 'Forgot Password?' })", screen: "Login" }
4. mcp__figma__get_metadata(button_url) -> Variants: Default, Hover, Pressed, Disabled, Loading -> informs test states
5. mcp__figma__get_variable_defs(file_url) -> Extract spacing/color tokens for visual regression baselines
6. mcp__figma__get_code_connect_map(file_url) -> Verify which components have existing code implementations
```

## Error Handling

- **Invalid link**: Ask user for valid Figma file/node URL
- **File not accessible**: Inform user to check sharing permissions
- **Node not found**: Try parent frame, ask for updated link
- **Empty frame**: Log warning, skip
- **Complex component sets**: Focus on default variant, note others for edge case tests
- **Rate limited**: Retry with 2s backoff, max 3 attempts (see Retry strategy above)
