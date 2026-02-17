import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { after, before, describe, it } from 'node:test'
import { atomicWriteSync } from '../../bin/lib/atomic-write.mjs'
import { cleanTempDir, createTempDir } from '../helpers/setup.mjs'

describe('atomicWriteSync', () => {
  let tempDir

  before(() => {
    tempDir = createTempDir()
  })

  after(() => {
    cleanTempDir(tempDir)
  })

  it('should write data to a new file', () => {
    const filePath = join(tempDir, 'test-write.json')
    atomicWriteSync(filePath, '{"key":"value"}')
    assert.equal(readFileSync(filePath, 'utf-8'), '{"key":"value"}')
  })

  it('should overwrite an existing file', () => {
    const filePath = join(tempDir, 'test-overwrite.json')
    atomicWriteSync(filePath, 'first')
    atomicWriteSync(filePath, 'second')
    assert.equal(readFileSync(filePath, 'utf-8'), 'second')
  })

  it('should not leave .tmp file on success', () => {
    const filePath = join(tempDir, 'test-no-tmp.json')
    atomicWriteSync(filePath, 'data')
    assert.equal(existsSync(`${filePath}.tmp`), false)
  })
})
