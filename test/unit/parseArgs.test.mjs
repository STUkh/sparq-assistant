import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { runCli } from '../helpers/setup.mjs'

describe('CLI argument parsing', () => {
  describe('help flag', () => {
    it('should exit 0 and show help text with "help" command', async () => {
      const { stdout, exitCode } = await runCli(['help'])
      assert.equal(exitCode, 0)
      assert.ok(stdout.includes('Spar[QA]ssistant'), 'Should contain tool name')
      assert.ok(stdout.includes('USAGE'), 'Should contain USAGE section')
      assert.ok(stdout.includes('COMMANDS'), 'Should contain COMMANDS section')
    })

    it('should support advanced help subcommand', async () => {
      const { stdout, exitCode } = await runCli(['help', 'advanced'])
      assert.equal(exitCode, 0)
      assert.ok(stdout.includes('Framework Development'))
    })

    it('should support advanced help flag alias', async () => {
      const { stdout, exitCode } = await runCli(['help', '--advanced'])
      assert.equal(exitCode, 0)
      assert.ok(stdout.includes('Framework Development'))
    })
  })

  describe('version flag', () => {
    it('should exit 0 and print version with --version', async () => {
      const { stdout, exitCode } = await runCli(['--version'])
      assert.equal(exitCode, 0)
      assert.match(stdout.trim(), /^\d+\.\d+\.\d+$/, 'Should print semver version')
    })

    it('should exit 0 and print version with -v', async () => {
      const { stdout, exitCode } = await runCli(['-v'])
      assert.equal(exitCode, 0)
      assert.match(stdout.trim(), /^\d+\.\d+\.\d+$/, 'Should print semver version')
    })
  })

  describe('unknown command', () => {
    it('should exit with non-zero code for unknown command', async () => {
      const { stdout, exitCode } = await runCli(['unknown-command'])
      assert.equal(exitCode, 2, 'Should exit with EXIT_USAGE (2)')
      assert.ok(stdout.includes('Unknown command'), 'Should indicate unknown command')
    })

    it('should show help text after unknown command error', async () => {
      const { stdout } = await runCli(['unknown-command'])
      assert.ok(stdout.includes('COMMANDS'), 'Should show help text with command list')
    })
  })

  describe('no arguments', () => {
    it('should exit with non-zero code when no command specified', async () => {
      const { stdout, exitCode } = await runCli([])
      assert.equal(exitCode, 2, 'Should exit with EXIT_USAGE (2)')
      assert.ok(stdout.includes('No command specified'), 'Should indicate no command')
    })

    it('should show help text when no arguments provided', async () => {
      const { stdout } = await runCli([])
      assert.ok(stdout.includes('USAGE'), 'Should show usage information')
    })
  })
})

// ---------------------------------------------------------------------------
// Direct parseArgs unit tests
// ---------------------------------------------------------------------------

import { parseArgs } from '../../bin/lib/args.mjs'

describe('per-command flag validation', () => {
  it('should return empty array for valid flags on init', () => {
    const result = parseArgs(['node', 'sparq', 'init', '--dry-run', '--force'])
    assert.equal(result.unknownFlags.length, 0)
  })

  it('should detect unknown flags for a known command', () => {
    const result = parseArgs(['node', 'sparq', 'init', '--model', 'haiku'])
    assert.ok(result.unknownFlags.length > 0, 'Should detect --model as unknown for init')
    assert.equal(result.unknownFlags[0].name, 'model')
  })

  it('should suggest close matches for mistyped flags', () => {
    const result = parseArgs(['node', 'sparq', 'lint', '--strick'])
    assert.ok(result.unknownFlags.length > 0)
    assert.equal(result.unknownFlags[0].suggestion, 'strict')
  })

  it('should always accept global flags', () => {
    const result = parseArgs(['node', 'sparq', 'init', '--quiet', '--verbose'])
    const globalUnknowns = result.unknownFlags.filter(
      (f) => f.name === 'quiet' || f.name === 'verbose',
    )
    assert.equal(globalUnknowns.length, 0)
  })

  it('should detect --dry-run as unknown for lint command', () => {
    const result = parseArgs(['node', 'sparq', 'lint', '--dry-run'])
    assert.ok(result.unknownFlags.some((f) => f.name === 'dry-run'))
  })

  it('should return empty array when command is unknown', () => {
    const result = parseArgs(['node', 'sparq', 'unknown-cmd', '--force'])
    // Unknown commands use global fallback — --force is a known option
    assert.equal(result.unknownFlags.length, 0)
  })
})

describe('subcommand', () => {
  it('should parse help advanced positional alias', () => {
    const result = parseArgs(['node', 'sparq', 'help', 'advanced'])
    assert.equal(result.command, 'help')
    assert.equal(result.subcommand, 'advanced')
  })

  it('should parse help --advanced flag alias', () => {
    const result = parseArgs(['node', 'sparq', 'help', '--advanced'])
    assert.equal(result.command, 'help')
    assert.equal(result.advanced, true)
  })
})

describe('audit command', () => {
  it('should parse audit command with target dir', () => {
    const result = parseArgs(['node', 'sparq', 'audit', '/tmp/project'])
    assert.equal(result.command, 'audit')
    assert.equal(result.targetDir, '/tmp/project')
  })

  it('should parse --fix --json combined flags', () => {
    const result = parseArgs(['node', 'sparq', 'audit', '--fix', '--json'])
    assert.equal(result.fix, true)
    assert.equal(result.json, true)
  })

  it('should parse audit --dry-run', () => {
    const result = parseArgs(['node', 'sparq', 'audit', '--dry-run'])
    assert.equal(result.dryRun, true)
  })
})
