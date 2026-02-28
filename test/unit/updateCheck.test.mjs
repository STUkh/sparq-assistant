import assert from 'node:assert/strict'
import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { after, afterEach, before, describe, it } from 'node:test'
import {
  _resetCacheDir,
  _setCacheDir,
  compareVersions,
  readCache,
  showUpdateNotification,
  writeCache,
} from '../../bin/lib/update-check.mjs'
import { cleanTempDir, createOutputCapture, createTempDir } from '../helpers/setup.mjs'

// ---------------------------------------------------------------------------
// compareVersions
// ---------------------------------------------------------------------------

describe('compareVersions', () => {
  it('should return 0 for equal versions', () => {
    assert.equal(compareVersions('1.0.0', '1.0.0'), 0)
  })

  it('should return -1 when a < b (patch)', () => {
    assert.equal(compareVersions('1.0.0', '1.0.1'), -1)
  })

  it('should return 1 when a > b (patch)', () => {
    assert.equal(compareVersions('1.0.1', '1.0.0'), 1)
  })

  it('should return 0 for malformed input (string)', () => {
    assert.equal(compareVersions('abc', '1.0.0'), 0)
  })

  it('should return 0 for null input', () => {
    assert.equal(compareVersions(null, '1.0.0'), 0)
  })
})

// ---------------------------------------------------------------------------
// Cache read/write
// ---------------------------------------------------------------------------

describe('cache operations', () => {
  let tempDir

  before(() => {
    tempDir = createTempDir()
    _setCacheDir(tempDir)
  })

  after(() => {
    _resetCacheDir()
    cleanTempDir(tempDir)
  })

  it('should return null when cache file does not exist', () => {
    _setCacheDir(join(tempDir, 'nonexistent'))
    assert.equal(readCache(), null)
    _setCacheDir(tempDir)
  })

  it('should write and read cache correctly', () => {
    writeCache('1.0.1', '1.0.0')
    const cached = readCache()
    assert.equal(cached.latestVersion, '1.0.1')
    assert.equal(cached.currentAtCheck, '1.0.0')
    assert.equal(typeof cached.lastChecked, 'number')
  })

  it('should return null for corrupted JSON', () => {
    const cacheFile = join(tempDir, 'update-check.json')
    writeFileSync(cacheFile, '{invalid json!!!', 'utf-8')
    assert.equal(readCache(), null)
  })

  it('should return null for missing required fields', () => {
    const cacheFile = join(tempDir, 'update-check.json')
    writeFileSync(cacheFile, JSON.stringify({ foo: 'bar' }), 'utf-8')
    assert.equal(readCache(), null)
  })

  it('should create cache directory if missing', () => {
    const nestedDir = join(tempDir, 'nested', 'dir')
    _setCacheDir(nestedDir)
    writeCache('2.0.0', '1.0.0')
    assert.ok(existsSync(nestedDir))
    const cached = readCache()
    assert.equal(cached.latestVersion, '2.0.0')
    _setCacheDir(tempDir)
  })
})

// ---------------------------------------------------------------------------
// showUpdateNotification
// ---------------------------------------------------------------------------

describe('showUpdateNotification', () => {
  let tempDir
  const capture = createOutputCapture()

  before(() => {
    tempDir = createTempDir()
    _setCacheDir(tempDir)
  })

  afterEach(() => {
    capture.stop()
  })

  after(() => {
    _resetCacheDir()
    cleanTempDir(tempDir)
  })

  it('should show notification when latest > current', () => {
    writeCache('2.0.0', '1.0.0')
    capture.start()
    showUpdateNotification('1.0.0')
    const text = capture.text()
    assert.ok(text.includes('Update available!'))
    assert.ok(text.includes('2.0.0'))
  })

  it('should be silent when current >= latest', () => {
    writeCache('1.0.0', '1.0.0')
    capture.start()
    showUpdateNotification('1.0.0')
    assert.equal(capture.text(), '')
  })

  it('should be silent when current > latest', () => {
    writeCache('1.0.0', '2.0.0')
    capture.start()
    showUpdateNotification('2.0.0')
    assert.equal(capture.text(), '')
  })

  it('should be silent when cache is missing', () => {
    _setCacheDir(join(tempDir, 'empty'))
    capture.start()
    showUpdateNotification('1.0.0')
    assert.equal(capture.text(), '')
    _setCacheDir(tempDir)
  })

  it('should be silent when command is update', () => {
    writeCache('2.0.0', '1.0.0')
    capture.start()
    showUpdateNotification('1.0.0', { command: 'update' })
    assert.equal(capture.text(), '')
  })

  it('should include install command in notification', () => {
    writeCache('2.0.0', '1.0.0')
    capture.start()
    showUpdateNotification('1.0.0')
    const text = capture.text()
    assert.ok(text.includes('npx sparq-assistant@latest update'))
  })
})
