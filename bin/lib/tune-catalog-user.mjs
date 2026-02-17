// bin/lib/tune-catalog-user.mjs — Pre-authored Layer 1 enhancements for model tier optimization

import { MODEL_TIER_MAP } from './constants.mjs'

/**
 * Deterministic catalog of prompt enhancements per agent per tier transition.
 * Each entry injects a single marked line into an XML section of the agent prompt.
 *
 * Fields:
 *   agent      — agent short name (without 'sparq-' prefix or '.md' suffix)
 *   fromModel  — source model this enhancement compensates for downgrading FROM
 *   section    — XML tag name to inject into
 *   marker     — idempotency marker (prevents duplicate injection)
 *   pe         — prompt engineering technique reference
 *   content    — exact text line to insert (must start with '- ')
 */
export const TUNE_CATALOG = Object.freeze([
  // -----------------------------------------------------------------------
  // orchestrator: opus → sonnet
  // -----------------------------------------------------------------------
  {
    agent: 'orchestrator',
    fromModel: 'opus',
    section: 'classification_rules',
    marker: '[sparq:tier:balanced]',
    pe: 'PE-2',
    content:
      '- [sparq:tier:balanced] NEVER classify as S1+S2 unless user explicitly requests BOTH manual AND automated tests',
  },
  {
    agent: 'orchestrator',
    fromModel: 'opus',
    section: 'rules',
    marker: '[sparq:tier:balanced-dispatch]',
    pe: 'PE-7',
    content:
      '- [sparq:tier:balanced-dispatch] EVERY dispatch handoff MUST include: version, from, to, scenario, phase, status — verify all 6 fields before sending',
  },

  // orchestrator: opus → haiku (additional)
  {
    agent: 'orchestrator',
    fromModel: 'opus',
    section: 'classification_rules',
    marker: '[sparq:tier:economy]',
    pe: 'PE-5',
    content:
      '- [sparq:tier:economy] Classification priority: check for bug ticket ID first (→S6), then file path (→S4), then ticket ID (→S1+S2), then keywords',
  },
  {
    agent: 'orchestrator',
    fromModel: 'opus',
    section: 'rules',
    marker: '[sparq:tier:economy-phase]',
    pe: 'PE-8',
    content:
      '- [sparq:tier:economy-phase] Before dispatching: 1) identify scenario, 2) list required agents, 3) prepare handoff JSON, 4) dispatch — follow this exact order',
  },

  // -----------------------------------------------------------------------
  // requirements-analyst: opus → sonnet
  // -----------------------------------------------------------------------
  {
    agent: 'requirements-analyst',
    fromModel: 'opus',
    section: 'constants',
    marker: '[sparq:tier:balanced]',
    pe: 'PE-4',
    content:
      '- [sparq:tier:balanced] REQ ID format: REQ-{feature}-{NNN} (e.g., REQ-login-001, REQ-checkout-012). NEVER use other formats',
  },
  {
    agent: 'requirements-analyst',
    fromModel: 'opus',
    section: 'rules',
    marker: '[sparq:tier:balanced-src]',
    pe: 'PE-2',
    content:
      '- [sparq:tier:balanced-src] EVERY requirement MUST have a source label: SRC-J (Jira), SRC-C (Confluence), SRC-F (Figma), SRC-L (local). NEVER omit source',
  },

  // requirements-analyst: opus → haiku (additional)
  {
    agent: 'requirements-analyst',
    fromModel: 'opus',
    section: 'done_criteria',
    marker: '[sparq:tier:economy]',
    pe: 'PE-7',
    content:
      '- [sparq:tier:economy] Minimum 3 acceptance criteria per requirement. Each criterion must be testable (starts with a verb: "displays", "validates", "prevents")',
  },

  // -----------------------------------------------------------------------
  // manual-test-writer: sonnet → haiku
  // -----------------------------------------------------------------------
  {
    agent: 'manual-test-writer',
    fromModel: 'sonnet',
    section: 'constants',
    marker: '[sparq:tier:economy]',
    pe: 'PE-4',
    content:
      '- [sparq:tier:economy] TC ID format: TC-{feature}-{HP|VE|SEC|EC|A11Y}-{NNN} (e.g., TC-login-HP-001). Use EXACTLY these 5 category codes',
  },
  {
    agent: 'manual-test-writer',
    fromModel: 'sonnet',
    section: 'done_criteria',
    marker: '[sparq:tier:economy-count]',
    pe: 'PE-7',
    content:
      '- [sparq:tier:economy-count] EVERY test suite MUST have tests in ALL 5 categories: HP, VE, SEC, EC, A11Y — verify count per category before handoff',
  },
  {
    agent: 'manual-test-writer',
    fromModel: 'sonnet',
    section: 'rules',
    marker: '[sparq:tier:economy-matrix]',
    pe: 'PE-2',
    content:
      '- [sparq:tier:economy-matrix] NEVER skip the coverage matrix. Every REQ-ID must map to at least one TC-ID. Output as markdown table',
  },

  // -----------------------------------------------------------------------
  // automation-engineer: opus → sonnet
  // -----------------------------------------------------------------------
  {
    agent: 'automation-engineer',
    fromModel: 'opus',
    section: 'rules',
    marker: '[sparq:tier:balanced]',
    pe: 'PE-2',
    content:
      '- [sparq:tier:balanced] NEVER import from `@playwright/test` directly — always use the project fixture index import pattern',
  },
  {
    agent: 'automation-engineer',
    fromModel: 'opus',
    section: 'rules',
    marker: '[sparq:tier:balanced-po]',
    pe: 'PE-2',
    content:
      '- [sparq:tier:balanced-po] NEVER create duplicate page objects — search existing pages/ directory first and reuse',
  },
  {
    agent: 'automation-engineer',
    fromModel: 'opus',
    section: 'done_criteria',
    marker: '[sparq:tier:balanced-assert]',
    pe: 'PE-7',
    content:
      '- [sparq:tier:balanced-assert] EVERY test file MUST contain >= 3 explicit assertions (expect/assert calls)',
  },

  // automation-engineer: opus → haiku (additional)
  {
    agent: 'automation-engineer',
    fromModel: 'opus',
    section: 'rules',
    marker: '[sparq:tier:economy]',
    pe: 'PE-5',
    content:
      '- [sparq:tier:economy] Page object locators: ALWAYS use `get` accessor pattern (not methods). Use `getByTestId` first, fall back to `getByRole`',
  },
  {
    agent: 'automation-engineer',
    fromModel: 'opus',
    section: 'done_criteria',
    marker: '[sparq:tier:economy-barrel]',
    pe: 'PE-7',
    content:
      '- [sparq:tier:economy-barrel] EVERY new page object or fixture MUST be added to the barrel index.ts file — verify export exists before handoff',
  },

  // -----------------------------------------------------------------------
  // test-validator: sonnet → haiku
  // -----------------------------------------------------------------------
  {
    agent: 'test-validator',
    fromModel: 'sonnet',
    section: 'constants',
    marker: '[sparq:tier:economy]',
    pe: 'PE-4',
    content:
      '- [sparq:tier:economy] VF ID format: VF-{NNN} (e.g., VF-001). Severity levels: Critical (blocks test), Warning (degraded), Info (style/optimization)',
  },
  {
    agent: 'test-validator',
    fromModel: 'sonnet',
    section: 'done_criteria',
    marker: '[sparq:tier:economy-fix]',
    pe: 'PE-7',
    content:
      '- [sparq:tier:economy-fix] EVERY Critical finding MUST include a concrete fix proposal with before/after code. Warning findings SHOULD include fix proposals',
  },
  {
    agent: 'test-validator',
    fromModel: 'sonnet',
    section: 'rules',
    marker: '[sparq:tier:economy-verify]',
    pe: 'PE-8',
    content:
      '- [sparq:tier:economy-verify] Validation sequence: 1) check selectors exist in codebase, 2) check assertions are web-first, 3) check test isolation, 4) classify severity',
  },
])

/**
 * Get catalog enhancements applicable for a given agent and tier transition.
 * For 'balanced' tier: returns entries where fromModel matches the premium model.
 * For 'economy' tier: returns entries for ALL downgrades (opus→sonnet + opus→haiku + sonnet→haiku).
 */
export function getEnhancementsForAgent(agentShortName, targetTier) {
  if (targetTier === 'premium') return []

  const premiumModel = MODEL_TIER_MAP.premium[agentShortName]
  if (!premiumModel) return []

  return TUNE_CATALOG.filter((entry) => {
    if (entry.agent !== agentShortName) return false
    if (targetTier === 'balanced') {
      // Only apply enhancements for downgrading from the premium model
      return entry.fromModel === premiumModel && premiumModel !== 'sonnet'
    }
    // economy: apply all enhancements (any downgrade)
    return true
  })
}
