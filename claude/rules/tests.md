# Tests Rules

Guidance for SparQ test coverage.

## Coverage Expectations

- Unit tests for CLI behavior and schema/config validation
- Integration tests for init/update/doctor/uninstall flows
- Feature-install tests for selective capability surfacing

## Contract Checks

- Keep tests updated when feature groups or command aliases change
- Prefer explicit assertions for user-facing command/skill availability

