import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'
import {
  checkNodeVersion,
  collectFiles,
  copyDirRecursive,
  ensureDir,
  hashFile,
  listDirs,
  listFiles,
  toForwardSlash,
} from '../../bin/lib/files.mjs'
import { cleanTempDir, createTempDir } from '../helpers/setup.mjs'

// ---------------------------------------------------------------------------
// toForwardSlash
// ---------------------------------------------------------------------------

describe('toForwardSlash', () => {
  it('should convert backslashes to forward slashes', () => {
    assert.equal(toForwardSlash('a\\b\\c'), 'a/b/c')
  })

  it('should not change already forward-slash paths', () => {
    assert.equal(toForwardSlash('a/b/c'), 'a/b/c')
  })
})

// ---------------------------------------------------------------------------
// copyDirRecursive
// ---------------------------------------------------------------------------

describe('copyDirRecursive', () => {
  let tempDir

  beforeEach(() => {
    tempDir = createTempDir()
  })

  afterEach(() => {
    cleanTempDir(tempDir)
  })

  it('should copy files and return copied list', () => {
    const srcDir = join(tempDir, 'src')
    const destDir = join(tempDir, 'dest')
    mkdirSync(srcDir, { recursive: true })
    writeFileSync(join(srcDir, 'file.txt'), 'hello')

    const result = copyDirRecursive(srcDir, destDir, { merge: false })

    assert.ok(result.copied.length > 0, 'should have copied files')
    assert.equal(result.errors.length, 0, 'should have no errors')
    assert.ok(existsSync(join(destDir, 'file.txt')), 'file should be copied')
    assert.equal(readFileSync(join(destDir, 'file.txt'), 'utf-8'), 'hello')
  })

  it('should skip existing files when merge=true', () => {
    const srcDir = join(tempDir, 'src')
    const destDir = join(tempDir, 'dest')
    mkdirSync(srcDir, { recursive: true })
    mkdirSync(destDir, { recursive: true })
    writeFileSync(join(srcDir, 'file.txt'), 'new content')
    writeFileSync(join(destDir, 'file.txt'), 'existing content')

    const result = copyDirRecursive(srcDir, destDir, { merge: true })

    assert.ok(result.skipped.length > 0, 'should have skipped files')
    assert.equal(
      readFileSync(join(destDir, 'file.txt'), 'utf-8'),
      'existing content',
      'existing file should not be overwritten',
    )
  })

  it('should overwrite existing files when merge=false', () => {
    const srcDir = join(tempDir, 'src')
    const destDir = join(tempDir, 'dest')
    mkdirSync(srcDir, { recursive: true })
    mkdirSync(destDir, { recursive: true })
    writeFileSync(join(srcDir, 'file.txt'), 'new content')
    writeFileSync(join(destDir, 'file.txt'), 'old content')

    const result = copyDirRecursive(srcDir, destDir, { merge: false })

    assert.ok(result.copied.length > 0, 'should have copied files')
    assert.equal(result.skipped.length, 0, 'should not skip when merge=false')
    assert.equal(
      readFileSync(join(destDir, 'file.txt'), 'utf-8'),
      'new content',
      'file should be overwritten',
    )
  })

  it('should return empty arrays for missing src', () => {
    const destDir = join(tempDir, 'dest')
    const result = copyDirRecursive(join(tempDir, 'no-such-dir'), destDir)

    assert.equal(result.copied.length, 0)
    assert.equal(result.skipped.length, 0)
    assert.equal(result.errors.length, 0)
  })

  it('should return error when max depth exceeded', () => {
    const srcDir = join(tempDir, 'src')
    const destDir = join(tempDir, 'dest')

    // Create a chain deeper than MAX_RECURSION_DEPTH (20)
    let deepDir = srcDir
    for (let i = 0; i <= 22; i++) {
      deepDir = join(deepDir, `d${i}`)
    }
    mkdirSync(deepDir, { recursive: true })
    writeFileSync(join(deepDir, 'deep.txt'), 'deep')

    const result = copyDirRecursive(srcDir, destDir, { merge: false })

    assert.ok(
      result.errors.some((e) => /recursion depth/i.test(e)),
      'should report max recursion depth error',
    )
  })

  it('should skip symlinks', () => {
    const srcDir = join(tempDir, 'src')
    const destDir = join(tempDir, 'dest')
    mkdirSync(srcDir, { recursive: true })
    writeFileSync(join(srcDir, 'real.txt'), 'real')
    symlinkSync(join(srcDir, 'real.txt'), join(srcDir, 'link.txt'))

    const result = copyDirRecursive(srcDir, destDir, { merge: false })

    assert.ok(existsSync(join(destDir, 'real.txt')), 'real file should be copied')
    assert.ok(!existsSync(join(destDir, 'link.txt')), 'symlink should be skipped')
    // The symlink should not appear in copied or errors
    const allPaths = [...result.copied, ...result.skipped]
    assert.ok(!allPaths.some((p) => p.includes('link.txt')), 'symlink should not appear in results')
  })

  it('should copy subdirectories recursively', () => {
    const srcDir = join(tempDir, 'src')
    const destDir = join(tempDir, 'dest')
    mkdirSync(join(srcDir, 'sub', 'deep'), { recursive: true })
    writeFileSync(join(srcDir, 'root.txt'), 'root')
    writeFileSync(join(srcDir, 'sub', 'mid.txt'), 'mid')
    writeFileSync(join(srcDir, 'sub', 'deep', 'leaf.txt'), 'leaf')

    const result = copyDirRecursive(srcDir, destDir, { merge: false })

    assert.equal(result.copied.length, 3, 'should copy all 3 files')
    assert.ok(existsSync(join(destDir, 'root.txt')))
    assert.ok(existsSync(join(destDir, 'sub', 'mid.txt')))
    assert.ok(existsSync(join(destDir, 'sub', 'deep', 'leaf.txt')))
  })

  it('should default merge to true', () => {
    const srcDir = join(tempDir, 'src')
    const destDir = join(tempDir, 'dest')
    mkdirSync(srcDir, { recursive: true })
    mkdirSync(destDir, { recursive: true })
    writeFileSync(join(srcDir, 'file.txt'), 'new')
    writeFileSync(join(destDir, 'file.txt'), 'old')

    // No merge option — defaults to true
    const result = copyDirRecursive(srcDir, destDir)

    assert.ok(result.skipped.length > 0, 'should skip by default (merge=true)')
    assert.equal(
      readFileSync(join(destDir, 'file.txt'), 'utf-8'),
      'old',
      'file should not be overwritten with default merge',
    )
  })
})

// ---------------------------------------------------------------------------
// checkNodeVersion
// ---------------------------------------------------------------------------

describe('checkNodeVersion', () => {
  it('should return true for current Node.js version (>= 22)', () => {
    const result = checkNodeVersion(22)
    const currentMajor = parseInt(process.versions.node.split('.')[0], 10)
    assert.equal(result, currentMajor >= 22)
  })

  it('should return true when minMajor is lower than current version', () => {
    assert.equal(checkNodeVersion(1), true)
  })

  it('should return false when minMajor is higher than current version', () => {
    assert.equal(checkNodeVersion(999), false)
  })

  it('should default to 22 as minimum major version', () => {
    const result = checkNodeVersion()
    const currentMajor = parseInt(process.versions.node.split('.')[0], 10)
    assert.equal(result, currentMajor >= 22)
  })
})

// ---------------------------------------------------------------------------
// ensureDir
// ---------------------------------------------------------------------------

describe('ensureDir', () => {
  let tempDir

  beforeEach(() => {
    tempDir = createTempDir()
  })

  afterEach(() => {
    cleanTempDir(tempDir)
  })

  it('should create directory and return true', () => {
    const newDir = join(tempDir, 'new-dir', 'sub')
    const result = ensureDir(newDir)

    assert.equal(result, true)
    assert.ok(existsSync(newDir), 'directory should be created')
  })

  it('should return true for existing directory', () => {
    const existingDir = join(tempDir, 'existing')
    mkdirSync(existingDir, { recursive: true })

    const result = ensureDir(existingDir)
    assert.equal(result, true)
  })
})

// ---------------------------------------------------------------------------
// listFiles
// ---------------------------------------------------------------------------

describe('listFiles', () => {
  let tempDir

  beforeEach(() => {
    tempDir = createTempDir()
  })

  afterEach(() => {
    cleanTempDir(tempDir)
  })

  it('should filter by extension', () => {
    writeFileSync(join(tempDir, 'a.txt'), 'a')
    writeFileSync(join(tempDir, 'b.md'), 'b')
    writeFileSync(join(tempDir, 'c.txt'), 'c')

    const files = listFiles(tempDir, '.txt')
    assert.equal(files.length, 2)
    assert.ok(files.includes('a.txt'))
    assert.ok(files.includes('c.txt'))
    assert.ok(!files.includes('b.md'))
  })

  it('should return empty array for missing directory', () => {
    const files = listFiles(join(tempDir, 'nonexistent'))
    assert.deepEqual(files, [])
  })
})

// ---------------------------------------------------------------------------
// listDirs
// ---------------------------------------------------------------------------

describe('listDirs', () => {
  let tempDir

  beforeEach(() => {
    tempDir = createTempDir()
  })

  afterEach(() => {
    cleanTempDir(tempDir)
  })

  it('should list only directories', () => {
    mkdirSync(join(tempDir, 'dir-a'))
    mkdirSync(join(tempDir, 'dir-b'))
    writeFileSync(join(tempDir, 'file.txt'), 'content')

    const dirs = listDirs(tempDir)
    assert.ok(dirs.includes('dir-a'))
    assert.ok(dirs.includes('dir-b'))
    assert.ok(!dirs.includes('file.txt'), 'files should not be listed')
  })

  it('should return empty array for missing directory', () => {
    const dirs = listDirs(join(tempDir, 'nonexistent'))
    assert.deepEqual(dirs, [])
  })

  it('should return empty array for directory with only files', () => {
    writeFileSync(join(tempDir, 'a.txt'), 'a')
    writeFileSync(join(tempDir, 'b.txt'), 'b')

    const dirs = listDirs(tempDir)
    assert.deepEqual(dirs, [])
  })
})

// ---------------------------------------------------------------------------
// hashFile
// ---------------------------------------------------------------------------

describe('hashFile', () => {
  let tempDir

  beforeEach(() => {
    tempDir = createTempDir()
  })

  afterEach(() => {
    cleanTempDir(tempDir)
  })

  it('should return hex string for existing file', () => {
    const filePath = join(tempDir, 'test.txt')
    writeFileSync(filePath, 'hello world')

    const hash = hashFile(filePath)
    assert.ok(typeof hash === 'string', 'hash should be a string')
    assert.ok(/^[a-f0-9]{64}$/.test(hash), 'hash should be a 64-char hex SHA-256')
  })

  it('should return null for missing file', () => {
    const hash = hashFile(join(tempDir, 'nonexistent.txt'))
    assert.equal(hash, null)
  })

  it('should return consistent hash for same content', () => {
    const file1 = join(tempDir, 'file1.txt')
    const file2 = join(tempDir, 'file2.txt')
    writeFileSync(file1, 'identical content')
    writeFileSync(file2, 'identical content')

    assert.equal(hashFile(file1), hashFile(file2))
  })

  it('should return different hash for different content', () => {
    const file1 = join(tempDir, 'file1.txt')
    const file2 = join(tempDir, 'file2.txt')
    writeFileSync(file1, 'content A')
    writeFileSync(file2, 'content B')

    assert.notEqual(hashFile(file1), hashFile(file2))
  })
})

// ---------------------------------------------------------------------------
// collectFiles
// ---------------------------------------------------------------------------

describe('collectFiles', () => {
  let tempDir

  beforeEach(() => {
    tempDir = createTempDir()
  })

  afterEach(() => {
    cleanTempDir(tempDir)
  })

  it('should collect all files recursively', () => {
    mkdirSync(join(tempDir, 'sub'), { recursive: true })
    writeFileSync(join(tempDir, 'root.txt'), 'root')
    writeFileSync(join(tempDir, 'sub', 'nested.txt'), 'nested')

    const files = collectFiles(tempDir)
    assert.ok(files.includes('root.txt'), 'should include root file')
    assert.ok(files.includes('sub/nested.txt'), 'should include nested file')
  })

  it('should return empty array for missing directory', () => {
    const files = collectFiles(join(tempDir, 'nonexistent'))
    assert.deepEqual(files, [])
  })

  it('should return empty array for empty directory', () => {
    const emptyDir = join(tempDir, 'empty')
    mkdirSync(emptyDir)

    const files = collectFiles(emptyDir)
    assert.deepEqual(files, [])
  })

  it('should use forward slashes in paths', () => {
    mkdirSync(join(tempDir, 'a', 'b'), { recursive: true })
    writeFileSync(join(tempDir, 'a', 'b', 'file.txt'), 'content')

    const files = collectFiles(tempDir)
    const nested = files.find((f) => f.includes('file.txt'))
    assert.ok(nested, 'should find the nested file')
    assert.ok(!nested.includes('\\'), 'paths should use forward slashes')
    assert.ok(nested.includes('a/b/file.txt'), 'path should be relative with forward slashes')
  })

  it('should skip symlinks', () => {
    mkdirSync(join(tempDir, 'dir'), { recursive: true })
    writeFileSync(join(tempDir, 'dir', 'real.txt'), 'real')
    symlinkSync(join(tempDir, 'dir', 'real.txt'), join(tempDir, 'dir', 'link.txt'))

    const files = collectFiles(tempDir)
    assert.ok(
      files.some((f) => f.includes('real.txt')),
      'real files should be collected',
    )
    assert.ok(!files.some((f) => f.includes('link.txt')), 'symlinks should not be collected')
  })

  it('should not include directories in results', () => {
    mkdirSync(join(tempDir, 'subdir'), { recursive: true })
    writeFileSync(join(tempDir, 'subdir', 'file.txt'), 'content')

    const files = collectFiles(tempDir)
    // Every entry should be a file path, not a directory
    for (const f of files) {
      assert.ok(f.includes('.'), `entry "${f}" should be a file, not a directory`)
    }
  })
})
