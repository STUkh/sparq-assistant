# Pattern Adherence Rules

Rules for all agents generating or modifying E2E test code. Referenced by: orchestrator, automation-engineer, all generation skills.

<rules>
1. **Read before generate**: MUST read existing E2E files (per `e2e.structure.*` from config) before creating new ones
2. **Match code style**: generated code MUST match project's exact patterns (locator style, import paths, naming)
3. **Reuse existing objects**: never recreate existing page objects, components, or fixtures -- extend them
4. **Update barrel exports**: every new file added to its folder's `index.ts`
5. **Naming conventions**: `{feature}.page.ts`, `{feature}.steps.ts`, `{feature}.spec.ts`, `{component}.component.ts`
6. **Route constants**: import from paths discovered via `project.routeDiscoveryPattern`; detect alias from `tsconfig.json` `compilerOptions.paths`
7. **UI framework awareness**: use `project.componentFileExtensions` from config for grep scope
8. **Framework extensions**: use `project.componentFileExtensions` from config (canonical mapping in `config-schema.md` section "Framework Extension Mapping")
9. **Detect before create**: before creating any new file, check the test registry (`.sparq/tracking/test-registry.json`) and filesystem for an existing file at the target path. If a file exists, read it and extend with new methods/tests in-place. Never create a duplicate file when one already exists.
</rules>
