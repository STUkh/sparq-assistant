import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const CLI_PATH = resolve(import.meta.dirname, '../../bin/sparq.mjs')

/**
 * Create a unique temporary directory for test isolation.
 */
export function createTempDir() {
  return mkdtempSync(join(tmpdir(), 'sparq-test-'))
}

/**
 * Remove a temporary directory and all contents.
 */
export function cleanTempDir(dir) {
  if (!dir || !existsSync(dir)) {
    if (!dir) console.warn('cleanTempDir called with no dir — check beforeEach setup')
    return
  }
  rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
}

/**
 * Create a minimal mock project structure for CLI testing.
 */
export function createMockProject(dir, options = {}) {
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify(
      {
        name: options.name || 'test-project',
        version: '1.0.0',
        dependencies: options.dependencies || {},
        devDependencies: options.devDependencies || {},
      },
      null,
      2,
    ),
  )
  writeFileSync(join(dir, '.gitignore'), options.gitignore || 'node_modules/\n')
  if (options.withGit) {
    mkdirSync(join(dir, '.git'), { recursive: true })
  }
}

/**
 * Run the sparq CLI as a subprocess and capture output.
 */
export async function runCli(args, options = {}) {
  const env = {
    ...process.env,
    // Prevent env vars from leaking into test subprocess behavior
    CI: '',
    ANTHROPIC_API_KEY: '',
    SPARQ_LOCAL_MODEL_URL: '',
    SPARQ_LOCAL_MODEL_NAME: '',
    // User overrides + mandatory test settings
    ...options.env,
    NO_COLOR: '1',
  }
  try {
    const { stdout, stderr } = await execFileAsync('node', [CLI_PATH, ...args], {
      cwd: options.cwd,
      env,
      timeout: options.timeout || 15000,
    })
    return { stdout, stderr, exitCode: 0 }
  } catch (err) {
    return {
      stdout: err.stdout || '',
      stderr: err.stderr || '',
      exitCode: err.code ?? err.status ?? 1,
    }
  }
}

/**
 * Read a JSON file from the temp project directory.
 */
export function readJsonFile(dir, relPath) {
  const filePath = join(dir, relPath)
  if (!existsSync(filePath)) return null
  return JSON.parse(readFileSync(filePath, 'utf-8'))
}

/**
 * Read a text file from the temp project directory.
 */
export function readTextFile(dir, relPath) {
  const filePath = join(dir, relPath)
  if (!existsSync(filePath)) return null
  return readFileSync(filePath, 'utf-8')
}

/**
 * Create a reusable output capture for beforeEach/afterEach patterns.
 * Usage:
 *   const capture = createOutputCapture()
 *   beforeEach(() => capture.start())
 *   afterEach(() => capture.stop())
 *   // in test: capture.text() returns all captured output
 */
export function createOutputCapture() {
  const origLog = console.log
  let output = []
  return {
    start() {
      output = []
      console.log = (...args) => output.push(args.join(' '))
    },
    stop() {
      console.log = origLog
    },
    text() {
      return output.join('\n')
    },
    lines() {
      return [...output]
    },
  }
}

/**
 * Capture console.log output during a synchronous function call.
 * Uses try-finally for exception safety.
 */
export function captureLog(fn) {
  const logs = []
  const orig = console.log
  console.log = (...args) => logs.push(args.join(' '))
  try {
    fn()
  } finally {
    console.log = orig
  }
  return logs.join('\n')
}

export { CLI_PATH }
