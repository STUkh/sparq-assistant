// test/unit/lock.test.mjs — Unit tests for bin/lib/lock.mjs

import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, it } from 'node:test'

const LOCK_MODULE = resolve(import.meta.dirname, '..', '..', 'bin', 'lib', 'lock.mjs')

async function loadLock() {
  const mod = await import(LOCK_MODULE)
  return {
    acquireLock: mod.acquireLock,
    releaseLock: mod.releaseLock,
    forceReleaseLock: mod.forceReleaseLock,
  }
}

function makeTempDir() {
  return mkdtempSync(join(tmpdir(), 'sparq-lock-test-'))
}

function cleanDir(dir) {
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true })
}

const lockPath = (dir) => join(dir, '.sparq', '.lock')

// ---------------------------------------------------------------------------
// acquireLock — basic acquisition
// ---------------------------------------------------------------------------

describe('acquireLock — basic acquisition', () => {
  let dir
  afterEach(() => cleanDir(dir))

  it('should acquire lock when .sparq/ does not exist', async () => {
    dir = makeTempDir()
    const { acquireLock } = await loadLock()
    const result = acquireLock(dir)
    assert.equal(result.acquired, true)
    assert.ok(existsSync(lockPath(dir)), 'Lock file should be created')
  })

  it('should write lock file with current PID and ISO timestamp', async () => {
    dir = makeTempDir()
    const { acquireLock } = await loadLock()
    acquireLock(dir)
    const data = JSON.parse(readFileSync(lockPath(dir), 'utf-8'))
    assert.equal(data.pid, process.pid)
    assert.ok(typeof data.acquired === 'string', 'acquired should be ISO string')
    assert.ok(!Number.isNaN(new Date(data.acquired).getTime()), 'acquired should be valid date')
  })

  it('should acquire lock when .sparq/ already exists', async () => {
    dir = makeTempDir()
    mkdirSync(join(dir, '.sparq'), { recursive: true })
    const { acquireLock } = await loadLock()
    const result = acquireLock(dir)
    assert.equal(result.acquired, true)
  })
})

// ---------------------------------------------------------------------------
// acquireLock — contention
// ---------------------------------------------------------------------------

describe('acquireLock — contention with live lock', () => {
  let dir
  afterEach(() => cleanDir(dir))

  it('should refuse when a live process holds the lock', async () => {
    dir = makeTempDir()
    mkdirSync(join(dir, '.sparq'), { recursive: true })
    // Write a lock owned by the current process (which is definitely alive)
    writeFileSync(
      lockPath(dir),
      JSON.stringify({ pid: process.pid, acquired: new Date().toISOString() }),
      'utf-8',
    )
    const { acquireLock } = await loadLock()
    const result = acquireLock(dir)
    assert.equal(result.acquired, false)
    assert.equal(result.pid, process.pid)
    assert.ok(typeof result.ageMs === 'number')
  })

  it('should report ageMs in the contention result', async () => {
    dir = makeTempDir()
    mkdirSync(join(dir, '.sparq'), { recursive: true })
    const past = new Date(Date.now() - 5000).toISOString()
    writeFileSync(lockPath(dir), JSON.stringify({ pid: process.pid, acquired: past }), 'utf-8')
    const { acquireLock } = await loadLock()
    const result = acquireLock(dir)
    assert.equal(result.acquired, false)
    assert.ok(result.ageMs >= 5000, `ageMs should be >= 5000, got ${result.ageMs}`)
  })
})

// ---------------------------------------------------------------------------
// acquireLock — stale lock recovery
// ---------------------------------------------------------------------------

describe('acquireLock — stale lock recovery', () => {
  let dir
  afterEach(() => cleanDir(dir))

  it('should acquire lock when previous owner PID is dead', async () => {
    dir = makeTempDir()
    mkdirSync(join(dir, '.sparq'), { recursive: true })
    // PID 99999999 is almost certainly not alive on any test machine
    writeFileSync(
      lockPath(dir),
      JSON.stringify({ pid: 99999999, acquired: new Date().toISOString() }),
      'utf-8',
    )
    const { acquireLock } = await loadLock()
    const result = acquireLock(dir)
    assert.equal(result.acquired, true, 'Should steal lock from dead PID')
    const data = JSON.parse(readFileSync(lockPath(dir), 'utf-8'))
    assert.equal(data.pid, process.pid, 'Lock should now be owned by current PID')
  })

  it('should acquire lock when lock file contains corrupt JSON', async () => {
    dir = makeTempDir()
    mkdirSync(join(dir, '.sparq'), { recursive: true })
    writeFileSync(lockPath(dir), '{ not valid json !!!', 'utf-8')
    const { acquireLock } = await loadLock()
    const result = acquireLock(dir)
    assert.equal(result.acquired, true, 'Should acquire lock after corrupt file is removed')
  })

  it('should acquire lock when lock age exceeds 10-minute TTL', async () => {
    dir = makeTempDir()
    mkdirSync(join(dir, '.sparq'), { recursive: true })
    // Timestamp 11 minutes ago — past the 10-minute TTL
    const staleTime = new Date(Date.now() - 11 * 60 * 1000).toISOString()
    writeFileSync(lockPath(dir), JSON.stringify({ pid: process.pid, acquired: staleTime }), 'utf-8')
    const { acquireLock } = await loadLock()
    const result = acquireLock(dir)
    assert.equal(result.acquired, true, 'Should override expired lock even for alive PID')
  })
})

// ---------------------------------------------------------------------------
// releaseLock
// ---------------------------------------------------------------------------

describe('releaseLock', () => {
  let dir
  afterEach(() => cleanDir(dir))

  it('should remove lock file owned by current process', async () => {
    dir = makeTempDir()
    const { acquireLock, releaseLock } = await loadLock()
    acquireLock(dir)
    assert.ok(existsSync(lockPath(dir)))
    releaseLock(dir)
    assert.ok(!existsSync(lockPath(dir)), 'Lock file should be removed')
  })

  it('should not remove lock owned by another PID', async () => {
    dir = makeTempDir()
    mkdirSync(join(dir, '.sparq'), { recursive: true })
    writeFileSync(
      lockPath(dir),
      JSON.stringify({ pid: 99999999, acquired: new Date().toISOString() }),
      'utf-8',
    )
    const { releaseLock } = await loadLock()
    releaseLock(dir)
    assert.ok(existsSync(lockPath(dir)), 'Should not remove a lock owned by another PID')
  })

  it('should be safe to call when no lock file exists', async () => {
    dir = makeTempDir()
    const { releaseLock } = await loadLock()
    // Should not throw
    assert.doesNotThrow(() => releaseLock(dir))
  })

  it('should be safe to call when .sparq/ directory does not exist', async () => {
    dir = makeTempDir()
    const { releaseLock } = await loadLock()
    assert.doesNotThrow(() => releaseLock(dir))
  })
})

// ---------------------------------------------------------------------------
// forceReleaseLock
// ---------------------------------------------------------------------------

describe('forceReleaseLock', () => {
  let dir
  afterEach(() => cleanDir(dir))

  it('should return false when no lock file exists', async () => {
    dir = makeTempDir()
    const { forceReleaseLock } = await loadLock()
    const result = forceReleaseLock(dir)
    assert.equal(result, false)
  })

  it('should remove lock owned by dead PID and return true', async () => {
    dir = makeTempDir()
    mkdirSync(join(dir, '.sparq'), { recursive: true })
    writeFileSync(
      lockPath(dir),
      JSON.stringify({ pid: 99999999, acquired: new Date().toISOString() }),
      'utf-8',
    )
    const { forceReleaseLock } = await loadLock()
    const result = forceReleaseLock(dir)
    assert.equal(result, true)
    assert.ok(!existsSync(lockPath(dir)), 'Lock file should be removed')
  })

  it('should refuse to remove lock held by a live process and return false', async () => {
    dir = makeTempDir()
    mkdirSync(join(dir, '.sparq'), { recursive: true })
    // Current process is alive — forceReleaseLock must refuse
    writeFileSync(
      lockPath(dir),
      JSON.stringify({ pid: process.pid, acquired: new Date().toISOString() }),
      'utf-8',
    )
    const { forceReleaseLock } = await loadLock()
    const result = forceReleaseLock(dir)
    assert.equal(result, false, 'Should not force-release a live lock')
    assert.ok(existsSync(lockPath(dir)), 'Lock file should still be present')
  })

  it('should remove corrupt lock file (cannot verify ownership) and return true', async () => {
    dir = makeTempDir()
    mkdirSync(join(dir, '.sparq'), { recursive: true })
    writeFileSync(lockPath(dir), 'not json at all', 'utf-8')
    const { forceReleaseLock } = await loadLock()
    const result = forceReleaseLock(dir)
    assert.equal(result, true, 'Corrupt lock should be cleaned up')
    assert.ok(!existsSync(lockPath(dir)))
  })
})

// ---------------------------------------------------------------------------
// Lock round-trip
// ---------------------------------------------------------------------------

describe('lock round-trip', () => {
  let dir
  afterEach(() => cleanDir(dir))

  it('should support acquire → release → acquire cycle', async () => {
    dir = makeTempDir()
    const { acquireLock, releaseLock } = await loadLock()
    assert.equal(acquireLock(dir).acquired, true)
    releaseLock(dir)
    assert.ok(!existsSync(lockPath(dir)))
    assert.equal(acquireLock(dir).acquired, true)
    releaseLock(dir)
  })
})
