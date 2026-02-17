// bin/lib/detect.mjs — Tech stack + E2E detection

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { listFiles } from './files.mjs'
import { style, warn } from './state.mjs'

// ---------------------------------------------------------------------------
// Tech Stack Detection
// ---------------------------------------------------------------------------

/**
 * Find the first matching package from a lookup table in the given deps.
 * Returns { name, version } or { name: null, version: null }.
 */
function findFirstDep(allDeps, lookupTable, getVersion) {
  for (const [pkgName, name] of lookupTable) {
    if (pkgName in allDeps) {
      return { name, version: getVersion(pkgName) }
    }
  }
  return { name: null, version: null }
}

/**
 * Detect the first matching package for a simple category (first match wins).
 */
function findSimpleDep(allDeps, candidates) {
  for (const [pkgName, name] of candidates) {
    if (pkgName in allDeps) return name
  }
  return null
}

/**
 * Derive framework-dependent fields (extensions, source root, route pattern).
 */
function deriveDependentFields(result, targetDir) {
  const extensionMap = {
    vue: ['.vue'],
    react: ['.tsx', '.jsx'],
    angular: ['.component.html', '.component.ts'],
    svelte: ['.svelte'],
  }
  result.componentFileExtensions = extensionMap[result.framework] || ['.tsx', '.jsx', '.vue']

  const sourceRoots = ['src', 'app', 'lib']
  result.sourceRoot = sourceRoots.find((d) => existsSync(join(targetDir, d))) || 'src'

  const routePatternMap = {
    'vue-router': '**/router/**/*.ts',
    'react-router': '**/routes/**/*.{ts,tsx}',
    angular: '**/*-routing.module.ts',
  }
  result.routeDiscoveryPattern =
    routePatternMap[result.router] || routePatternMap[result.framework] || '**/route*/**/*.ts'
}

/**
 * Detect the technology stack of the target project by scanning package.json.
 * Returns a structured object describing frameworks, libraries, and tools in use.
 */
export function detectTechStack(targetDir) {
  const result = {
    framework: null,
    frameworkVersion: null,
    router: null,
  }

  const pkgPath = join(targetDir, 'package.json')
  if (!existsSync(pkgPath)) return result

  let pkg
  try {
    pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
  } catch {
    return result
  }

  const deps = pkg.dependencies || {}
  const devDeps = pkg.devDependencies || {}
  const allDeps = { ...deps, ...devDeps }

  const getVersion = (name) => allDeps[name]?.replace(/^[\^~>=<\s]+/, '') || null

  const fw = findFirstDep(
    allDeps,
    [
      ['vue', 'vue'],
      ['react', 'react'],
      ['@angular/core', 'angular'],
      ['svelte', 'svelte'],
    ],
    getVersion,
  )
  result.framework = fw.name
  result.frameworkVersion = fw.version

  result.router = findSimpleDep(allDeps, [
    ['vue-router', 'vue-router'],
    ['react-router-dom', 'react-router'],
    ['react-router', 'react-router'],
  ])

  deriveDependentFields(result, targetDir)

  return result
}

/**
 * Display detected tech stack to the console. (#29 data-driven)
 */
export function displayTechStack(stack) {
  const line = (label, value) => {
    if (value) console.log(`    ${style.dim(label.padEnd(14))}${value}`)
  }

  const fmtVersioned = (name, version) =>
    name ? `${formatTechName(name)}${version ? ` ${version}` : ''}` : null

  const entries = [
    ['Framework:', fmtVersioned(stack.framework, stack.frameworkVersion)],
    ['Router:', stack.router ? formatTechName(stack.router) : null],
    [
      'Extensions:',
      stack.componentFileExtensions ? stack.componentFileExtensions.join(', ') : null,
    ],
    ['Source Root:', stack.sourceRoot || null],
  ]

  for (const [label, value] of entries) {
    line(label, value)
  }
}

/**
 * Format a tech name for display (e.g., 'primevue' -> 'PrimeVue', 'tailwindcss' -> 'Tailwind CSS').
 */
export function formatTechName(name) {
  const nameMap = {
    'vue-router': 'Vue Router',
    'react-router': 'React Router',
  }
  return nameMap[name] || name.charAt(0).toUpperCase() + name.slice(1)
}

/**
 * Push a diff description if two values differ.
 */
function pushDiff(diffs, label, savedVal, currentVal) {
  if (savedVal !== currentVal) {
    diffs.push(`${label}: config says '${savedVal || 'none'}', found '${currentVal || 'none'}'`)
  }
}

/**
 * Compare two tech stack objects and return an array of difference descriptions.
 */
export function compareTechStacks(saved, current) {
  const diffs = []

  const fields = [
    ['framework', 'Framework'],
    ['router', 'Router'],
  ]

  for (const [key, label] of fields) {
    pushDiff(diffs, label, saved[key], current[key])
  }

  pushDiff(
    diffs,
    'Component Extensions',
    JSON.stringify(saved.componentFileExtensions || []),
    JSON.stringify(current.componentFileExtensions || []),
  )
  pushDiff(diffs, 'Source Root', saved.sourceRoot || null, current.sourceRoot || null)
  pushDiff(
    diffs,
    'Route Discovery Pattern',
    saved.routeDiscoveryPattern || null,
    current.routeDiscoveryPattern || null,
  )

  return diffs
}

// ---------------------------------------------------------------------------
// E2E Project Discovery
// ---------------------------------------------------------------------------

/**
 * Detect a framework config file from a list of candidates.
 * Returns { found, framework, configFile } or { found: false }.
 */
function detectFrameworkConfig(targetDir, framework, candidates) {
  for (const cfgFile of candidates) {
    if (existsSync(join(targetDir, cfgFile))) {
      return { found: true, framework, configFile: cfgFile }
    }
  }
  return { found: false, framework: null, configFile: null }
}

/**
 * Scan the e2e directory structure and populate result fields.
 */
function scanE2EStructure(result, e2eDir, e2eDirRelative) {
  const subdirs = ['pages', 'components', 'steps', 'fixtures', 'specs']
  for (const dirName of subdirs) {
    if (existsSync(join(e2eDir, dirName))) {
      result.structure[dirName] = `${e2eDirRelative}/${dirName}`
    }
  }

  // Check for abstract/base page class
  const pagesDir = join(e2eDir, 'pages')
  if (existsSync(pagesDir)) {
    const baseClassFile = listFiles(pagesDir).find((f) => {
      const lower = f.toLowerCase()
      return lower.includes('abstract') || lower.includes('base')
    })
    if (baseClassFile) {
      result.hasAbstractPage = true
      result.baseClass = `${e2eDirRelative}/pages/${baseClassFile}`
    }
  }

  // Check for fixture index
  const fixturesDir = join(e2eDir, 'fixtures')
  for (const ext of ['index.ts', 'index.js']) {
    if (existsSync(join(fixturesDir, ext))) {
      result.hasFixtureIndex = true
      result.fixtureIndex = `${e2eDirRelative}/fixtures/${ext}`
      break
    }
  }
}

/**
 * Scan Cypress-specific directory structure and populate result fields.
 */
function scanCypressStructure(result, targetDir) {
  const cypressDir = join(targetDir, 'cypress')
  if (!existsSync(cypressDir)) return

  const mappings = [
    ['support/pages', 'pages'],
    ['support/components', 'components'],
    ['support/steps', 'steps'],
    ['fixtures', 'fixtures'],
    ['e2e', 'specs'],
  ]
  for (const [subdir, field] of mappings) {
    if (existsSync(join(cypressDir, subdir)) && !result.structure[field]) {
      result.structure[field] = `cypress/${subdir}`
    }
  }
}

/**
 * Detect existing E2E testing setup in the target project directory.
 */
export function detectE2ESetup(targetDir) {
  const result = {
    detected: false,
    framework: null,
    configFile: null,
    structure: { pages: null, components: null, steps: null, fixtures: null, specs: null },
    hasAbstractPage: false,
    baseClass: null,
    hasFixtureIndex: false,
    fixtureIndex: null,
  }

  const pw = detectFrameworkConfig(targetDir, 'playwright', [
    'playwright.config.ts',
    'playwright.config.js',
  ])
  const cy = detectFrameworkConfig(targetDir, 'cypress', [
    'cypress.config.ts',
    'cypress.config.js',
    'cypress.config.mjs',
  ])

  if (pw.found) {
    result.framework = pw.framework
    result.configFile = pw.configFile
  } else if (cy.found) {
    result.framework = cy.framework
    result.configFile = cy.configFile
  }

  if (pw.found && cy.found) {
    warn('Both Playwright and Cypress configs found. Preferring Playwright.')
  }

  // Find e2e directory
  const e2eDirCandidates = ['e2e', 'cypress', 'tests/e2e', 'test/e2e', '__tests__/e2e']
  const e2eDirRelative = e2eDirCandidates.find((c) => existsSync(join(targetDir, c)))

  if (!e2eDirRelative) {
    result.detected = result.framework !== null
    return result
  }

  result.detected = true
  scanE2EStructure(result, join(targetDir, e2eDirRelative), e2eDirRelative)

  if (result.framework === 'cypress') {
    scanCypressStructure(result, targetDir)
  }

  return result
}
