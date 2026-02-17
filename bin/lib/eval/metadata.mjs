// bin/lib/eval/metadata.mjs — shared eval metadata

export const SCENARIO_PIPELINES = Object.freeze({
  classification: [{ agent: 'orchestrator', phase: 'P0' }],
  S1: [
    { agent: 'requirements-analyst', phase: 'P1' },
    { agent: 'manual-test-writer', phase: 'P2' },
  ],
  S2: [{ agent: 'automation-engineer', phase: 'P2' }],
  S3: [
    { agent: 'requirements-analyst', phase: 'P1' },
    { agent: 'automation-engineer', phase: 'P2' },
  ],
  S4: [{ agent: 'test-validator', phase: 'P2' }],
  S5: [
    { agent: 'requirements-analyst', phase: 'P1' },
    { agent: 'test-validator', phase: 'P1' },
  ],
  S6: [{ agent: 'automation-engineer', phase: 'P2' }],
  'S1+S2': [
    { agent: 'requirements-analyst', phase: 'P1' },
    { agent: 'manual-test-writer', phase: 'P2' },
    { agent: 'automation-engineer', phase: 'P2' },
  ],
})

const SUBSTANCE_RUBRICS = new Set([
  'assertion-detection',
  'requirement-coverage',
  'executability-check',
  'coverage-completeness',
  'playwright-syntax',
  'cypress-syntax',
])

const BEHAVIORAL_RUBRICS = new Set(['error-handling-compliance', 'progress-signal-compliance'])

const MODEL_REQUIRED_RUBRICS = new Set([
  'test-quality-grader',
  'code-quality-grader',
  'error-handling-grader',
])

const SCENARIO_ALL = ['classification', 'S1', 'S1+S2', 'S2', 'S3', 'S4', 'S5', 'S6']

const RUBRIC_METADATA = Object.freeze({
  'format-compliance': { kind: 'structural', applicableScenarios: SCENARIO_ALL },
  'naming-conventions': { kind: 'structural', applicableScenarios: SCENARIO_ALL },
  'handoff-compliance': { kind: 'structural', applicableScenarios: SCENARIO_ALL },
  'template-compliance': { kind: 'structural', applicableScenarios: ['S1', 'S1+S2', 'S4', 'S5'] },
  'parallel-merge': { kind: 'structural', applicableScenarios: ['S3'] },
  'resume-state-compliance': { kind: 'structural', applicableScenarios: ['S3'] },
  'regression-compliance': { kind: 'structural', applicableScenarios: ['S6'] },
  'assertion-detection': { kind: 'substance', applicableScenarios: ['S1+S2', 'S2', 'S3', 'S6'] },
  'requirement-coverage': {
    kind: 'substance',
    applicableScenarios: ['S1', 'S1+S2', 'S2', 'S3', 'S5', 'S6'],
  },
  'executability-check': { kind: 'substance', applicableScenarios: ['S1+S2', 'S2', 'S3', 'S6'] },
  'coverage-completeness': { kind: 'substance', applicableScenarios: ['S1', 'S1+S2', 'S5'] },
  'playwright-syntax': { kind: 'substance', applicableScenarios: ['S1+S2', 'S2', 'S3', 'S6'] },
  'cypress-syntax': { kind: 'substance', applicableScenarios: ['S2', 'S3'] },
  'error-handling-compliance': {
    kind: 'behavioral',
    applicableScenarios: ['S1', 'S2', 'S3', 'S5'],
  },
  'progress-signal-compliance': {
    kind: 'behavioral',
    applicableScenarios: ['S1', 'S2', 'S3', 'S5'],
  },
  'test-quality-grader': { kind: 'model_required', applicableScenarios: ['S1', 'S1+S2'] },
  'code-quality-grader': { kind: 'model_required', applicableScenarios: ['S2', 'S3', 'S6'] },
  'error-handling-grader': {
    kind: 'model_required',
    applicableScenarios: ['S1', 'S2', 'S3', 'S5'],
  },
})

export function getRubricWeight(name) {
  if (SUBSTANCE_RUBRICS.has(name)) return 2
  if (BEHAVIORAL_RUBRICS.has(name)) return 1.5
  return 1
}

export function getRubricKind(name) {
  if (MODEL_REQUIRED_RUBRICS.has(name)) return 'model_required'
  return RUBRIC_METADATA[name]?.kind ?? 'structural'
}

export function isModelRequiredRubric(name) {
  return getRubricKind(name) === 'model_required'
}

export function getRubricMetadata(name) {
  const base = RUBRIC_METADATA[name] ?? {
    kind: getRubricKind(name),
    applicableScenarios: SCENARIO_ALL,
  }
  return {
    name,
    kind: base.kind,
    weight: getRubricWeight(name),
    applicableScenarios: base.applicableScenarios,
  }
}

export function isRubricApplicable(name, scenario) {
  const meta = getRubricMetadata(name)
  return meta.applicableScenarios.includes(scenario)
}

export function getScenarioPipeline(scenario) {
  return SCENARIO_PIPELINES[scenario] ?? null
}
