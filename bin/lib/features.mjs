// bin/lib/features.mjs — Feature groups for selective installation

// ---------------------------------------------------------------------------
// Feature Group Definitions
// ---------------------------------------------------------------------------

/**
 * Each feature group maps a logical capability to the agents, skills,
 * MCP servers, and templates it requires.  The `core` group is always
 * installed regardless of user selection.
 */
function deepFreeze(obj) {
  Object.freeze(obj)
  for (const val of Object.values(obj)) {
    if (typeof val === 'object' && val !== null && !Object.isFrozen(val)) {
      deepFreeze(val)
    }
  }
  return obj
}

export const FEATURE_GROUPS = deepFreeze({
  core: {
    name: 'Core',
    description: 'Workflow entry, orchestration, config, history, and execution planning',
    agents: ['sparq-orchestrator.md'],
    skills: ['sparq-analyze', 'sparq-init', 'sparq-start', 'sparq-config', 'sparq-resume'],
    mcpServers: [],
    templates: ['sparq-execution-plan.md'],
    alwaysIncluded: true,
  },

  'manual-tests': {
    name: 'Manual Tests',
    description: 'Requirements analysis and manual test case generation',
    agents: ['sparq-requirements-analyst.md', 'sparq-manual-test-writer.md'],
    skills: ['sparq-generate', 'sparq-generate-manual', 'sparq-manual-to-e2e'],
    mcpServers: [],
    templates: ['sparq-requirements.md', 'sparq-test-case.md', 'sparq-coverage-matrix.md'],
    alwaysIncluded: false,
  },

  e2e: {
    name: 'E2E Tests',
    description: 'E2E automation engineering and test validation (Playwright/Cypress)',
    agents: ['sparq-automation-engineer.md', 'sparq-test-validator.md'],
    skills: ['sparq-generate-e2e', 'sparq-sync', 'sparq-validate', 'sparq-refactor'],
    mcpServers: [],
    templates: ['sparq-validation-report.md', 'sparq-coverage-matrix.md', 'sparq-refresh-diff.md'],
    alwaysIncluded: false,
  },

  jira: {
    name: 'Jira',
    description: 'Jira integration via Atlassian MCP server',
    agents: [],
    skills: [],
    mcpServers: ['atlassian'],
    templates: [],
    alwaysIncluded: false,
  },

  confluence: {
    name: 'Confluence',
    description: 'Confluence integration via Atlassian MCP server',
    agents: [],
    skills: [],
    mcpServers: ['atlassian'],
    templates: [],
    alwaysIncluded: false,
  },

  figma: {
    name: 'Figma',
    description: 'Figma design integration via Figma MCP server',
    agents: [],
    skills: [],
    mcpServers: ['figma'],
    templates: [],
    alwaysIncluded: false,
  },

  testrail: {
    name: 'TestRail',
    description: 'TestRail export via TestRail MCP server',
    agents: [],
    skills: ['sparq-export', 'sparq-publish-results'],
    mcpServers: ['testrail'],
    templates: [],
    alwaysIncluded: false,
  },

  qase: {
    name: 'Qase',
    description: 'Qase export via Qase MCP server',
    agents: [],
    skills: ['sparq-export', 'sparq-publish-results'],
    mcpServers: ['qase'],
    templates: [],
    alwaysIncluded: false,
  },

  zephyr: {
    name: 'Zephyr Scale',
    description: 'Zephyr Scale export via Zephyr Scale MCP server',
    agents: [],
    skills: ['sparq-export'],
    mcpServers: ['zephyr'],
    templates: [],
    alwaysIncluded: false,
  },

  'tms-local': {
    name: 'TMS Local',
    description: 'Local file-based test case export',
    agents: [],
    skills: ['sparq-export'],
    mcpServers: [],
    templates: [],
    alwaysIncluded: false,
  },

  'playwright-mcp': {
    name: 'Playwright MCP',
    description: 'Playwright browser automation via MCP server',
    agents: [],
    skills: [],
    mcpServers: ['playwright'],
    templates: [],
    alwaysIncluded: false,
  },

  export: {
    name: 'Export',
    description: 'Export skill for pushing artifacts to external systems',
    agents: [],
    skills: ['sparq-export'],
    mcpServers: [],
    templates: [],
    alwaysIncluded: false,
  },

  'playwright-best-practices': {
    name: 'Playwright Best Practices',
    description:
      'Playwright consulting skill with patterns, anti-patterns, and architecture guides',
    agents: [],
    skills: ['sparq-playwright-best-practices'],
    mcpServers: [],
    templates: [],
    alwaysIncluded: false,
  },

  'cypress-best-practices': {
    name: 'Cypress Best Practices',
    description: 'Cypress consulting skill with patterns, anti-patterns, and architecture guides',
    agents: [],
    skills: ['sparq-cypress-best-practices'],
    mcpServers: [],
    templates: [],
    alwaysIncluded: false,
  },

  'dev-tools': {
    name: 'Developer Tools',
    description: 'Advanced requirement-gathering and analysis workflow',
    agents: [],
    skills: ['sparq-analyze'],
    mcpServers: [],
    templates: [],
    alwaysIncluded: false,
  },
})

// ---------------------------------------------------------------------------
// Derived Constants
// ---------------------------------------------------------------------------

/** All valid individual feature names. */
export const ALL_FEATURE_NAMES = Object.freeze(Object.keys(FEATURE_GROUPS))

/** Named presets that expand to sets of feature names. */
export const PRESET_FEATURES = deepFreeze({
  all: ALL_FEATURE_NAMES,
  minimal: ['core'],
  'cypress-e2e': ['core', 'e2e'],
  'e2e-only': ['core', 'e2e', 'playwright-mcp'],
  'full-qa': ALL_FEATURE_NAMES,
})

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

/**
 * Resolve a user selection (feature names and/or preset names) into a
 * deduplicated Set of feature group keys.  The `core` group is always
 * included.  Throws on unrecognised names.
 *
 * @param {string[]} selection — feature and/or preset names
 * @returns {Set<string>}
 */
export function resolveFeatures(selection) {
  if (!Array.isArray(selection)) {
    throw new TypeError(`resolveFeatures expects an array, got ${typeof selection}`)
  }

  const resolved = new Set(['core'])

  for (const name of selection) {
    if (name in PRESET_FEATURES) {
      for (const f of PRESET_FEATURES[name]) {
        resolved.add(f)
      }
    } else if (name in FEATURE_GROUPS) {
      resolved.add(name)
    } else {
      const valid = [...ALL_FEATURE_NAMES, ...Object.keys(PRESET_FEATURES)].sort()
      throw new Error(`Unknown feature "${name}". Valid names: ${valid.join(', ')}`)
    }
  }

  return resolved
}

// ---------------------------------------------------------------------------
// Accessors
// ---------------------------------------------------------------------------

/**
 * Return a deduplicated array of agent filenames required by the given
 * resolved feature set.
 *
 * @param {Set<string>} features — output of resolveFeatures()
 * @returns {string[]}
 */
export function getAgentsForFeatures(features) {
  const agents = new Set()
  for (const key of features) {
    const group = FEATURE_GROUPS[key]
    if (!group) continue
    for (const a of group.agents) {
      agents.add(a)
    }
  }
  return [...agents]
}

/**
 * Return a deduplicated array of skill directory names required by the
 * given resolved feature set.  Always includes `sparq-shared`.
 *
 * @param {Set<string>} features — output of resolveFeatures()
 * @returns {string[]}
 */
export function getSkillsForFeatures(features) {
  const skills = new Set(['sparq-shared'])
  for (const key of features) {
    const group = FEATURE_GROUPS[key]
    if (!group) continue
    for (const s of group.skills) {
      skills.add(s)
    }
  }
  return [...skills]
}

/**
 * Return a deduplicated array of MCP server names required by the given
 * resolved feature set.
 *
 * @param {Set<string>} features — output of resolveFeatures()
 * @returns {string[]}
 */
export function getMcpServersForFeatures(features) {
  const servers = new Set()
  for (const key of features) {
    const group = FEATURE_GROUPS[key]
    if (!group) continue
    for (const m of group.mcpServers) {
      servers.add(m)
    }
  }
  return [...servers]
}

/**
 * Return a deduplicated array of template filenames required by the
 * given resolved feature set.
 *
 * @param {Set<string>} features — output of resolveFeatures()
 * @returns {string[]}
 */
export function getTemplatesForFeatures(features) {
  const templates = new Set()
  for (const key of features) {
    const group = FEATURE_GROUPS[key]
    if (!group) continue
    for (const t of group.templates) {
      templates.add(t)
    }
  }
  return [...templates]
}
