import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { SPARQ_RULE_CONTENT, SPARQ_RULE_FILE } from '../../bin/lib/constants.mjs'
import {
  ensureGitignore,
  getSparqMcpServerNames,
  installAndReport,
  installRuleFile,
} from '../../bin/lib/install.mjs'
import { resetState, setDryRun } from '../../bin/lib/state.mjs'
import { cleanTempDir, createOutputCapture, createTempDir } from '../helpers/setup.mjs'

// ---------------------------------------------------------------------------
// Console capture
// ---------------------------------------------------------------------------

const capture = createOutputCapture()

beforeEach(() => {
  capture.start()
  resetState()
})

afterEach(() => {
  capture.stop()
})

// ---------------------------------------------------------------------------
// installAndReport
// ---------------------------------------------------------------------------

describe('installAndReport', () => {
  let tempDir
  let srcDir
  let destDir

  beforeEach(() => {
    tempDir = createTempDir()
    srcDir = join(tempDir, 'src')
    destDir = join(tempDir, 'dest')
    mkdirSync(srcDir, { recursive: true })
    mkdirSync(destDir, { recursive: true })
  })

  afterEach(() => {
    cleanTempDir(tempDir)
  })

  it('should copy files from source to dest and return count info', () => {
    writeFileSync(join(srcDir, 'file1.md'), 'content1')
    writeFileSync(join(srcDir, 'file2.md'), 'content2')

    const result = installAndReport(srcDir, destDir, 'agents')
    assert.equal(result.copied, 2)
    assert.equal(result.errors, 0)
    assert.ok(existsSync(join(destDir, 'file1.md')))
    assert.ok(existsSync(join(destDir, 'file2.md')))
  })

  it('should handle empty source directory', () => {
    const result = installAndReport(srcDir, destDir, 'agents')
    assert.equal(result.copied, 0)
    assert.equal(result.errors, 0)
  })

  it('should report info for missing source gracefully', () => {
    const missingSrc = join(tempDir, 'nonexistent')
    const result = installAndReport(missingSrc, destDir, 'agents')
    assert.equal(result.copied, 0)
    assert.equal(result.errors, 0)
    assert.ok(capture.lines().some((line) => line.includes('No agents files')))
  })

  it('should skip existing files in merge mode', () => {
    writeFileSync(join(srcDir, 'file.md'), 'new content')
    writeFileSync(join(destDir, 'file.md'), 'existing content')

    const result = installAndReport(srcDir, destDir, 'agents', { merge: true })
    assert.equal(result.copied, 0)
    // File should still have original content
    assert.equal(readFileSync(join(destDir, 'file.md'), 'utf-8'), 'existing content')
  })

  it('should overwrite existing files when merge is false', () => {
    writeFileSync(join(srcDir, 'file.md'), 'new content')
    writeFileSync(join(destDir, 'file.md'), 'existing content')

    const result = installAndReport(srcDir, destDir, 'agents', { merge: false })
    assert.equal(result.copied, 1)
    assert.equal(readFileSync(join(destDir, 'file.md'), 'utf-8'), 'new content')
  })
})

// ---------------------------------------------------------------------------
// installRuleFile
// ---------------------------------------------------------------------------

describe('installRuleFile', () => {
  let tempDir

  beforeEach(() => {
    tempDir = createTempDir()
    mkdirSync(join(tempDir, '.claude'), { recursive: true })
  })

  afterEach(() => {
    setDryRun(false)
    cleanTempDir(tempDir)
  })

  it('should create .claude/rules/sparq.md with default content when no detection', () => {
    installRuleFile(tempDir)

    const rulePath = join(tempDir, '.claude', 'rules', SPARQ_RULE_FILE)
    assert.ok(existsSync(rulePath), 'rule file should be created')
    const content = readFileSync(rulePath, 'utf-8')
    assert.equal(content, SPARQ_RULE_CONTENT, 'should contain default rule content')
  })

  it('should create .claude/rules/sparq.md with enhanced content from detection', () => {
    const techStack = {
      framework: 'vue',
      frameworkVersion: '3.4.0',
      componentFileExtensions: ['.vue'],
    }
    const e2eConfig = { framework: 'playwright', configFile: 'playwright.config.ts' }
    installRuleFile(tempDir, techStack, e2eConfig)

    const rulePath = join(tempDir, '.claude', 'rules', SPARQ_RULE_FILE)
    assert.ok(existsSync(rulePath), 'rule file should be created')
    const content = readFileSync(rulePath, 'utf-8')
    assert.ok(content.includes('vue'), 'should include framework name')
    assert.ok(content.includes('playwright'), 'should include e2e framework')
    assert.ok(content.includes('Selector Strategy'), 'should include selector strategy')
  })

  it('should regenerate when rule file already exists', () => {
    const rulesDir = join(tempDir, '.claude', 'rules')
    mkdirSync(rulesDir, { recursive: true })
    const rulePath = join(rulesDir, SPARQ_RULE_FILE)
    writeFileSync(rulePath, '# Old content\n')

    installRuleFile(tempDir)

    const content = readFileSync(rulePath, 'utf-8')
    assert.equal(content, SPARQ_RULE_CONTENT, 'should regenerate with latest content')
  })

  it('should NOT write in dry-run mode', () => {
    setDryRun(true)
    installRuleFile(tempDir)

    const rulePath = join(tempDir, '.claude', 'rules', SPARQ_RULE_FILE)
    assert.ok(!existsSync(rulePath), 'rule file should not be created in dry-run')
  })
})

// ---------------------------------------------------------------------------
// ensureGitignore
// ---------------------------------------------------------------------------

describe('ensureGitignore', () => {
  let tempDir

  beforeEach(() => {
    tempDir = createTempDir()
  })

  afterEach(() => {
    setDryRun(false)
    cleanTempDir(tempDir)
  })

  it('should create .gitignore when not exists', () => {
    const gitignorePath = join(tempDir, '.gitignore')
    ensureGitignore(gitignorePath)

    assert.ok(existsSync(gitignorePath), '.gitignore should be created')
    const content = readFileSync(gitignorePath, 'utf-8')
    assert.ok(content.includes('.sparq/'), 'should contain .sparq/')
  })

  it('should append .sparq/ to existing .gitignore', () => {
    const gitignorePath = join(tempDir, '.gitignore')
    writeFileSync(gitignorePath, 'node_modules/\ndist/\n')

    ensureGitignore(gitignorePath)

    const content = readFileSync(gitignorePath, 'utf-8')
    assert.ok(content.includes('node_modules/'), 'should preserve existing entries')
    assert.ok(content.includes('.sparq/'), 'should add .sparq/')
  })

  it('should skip when already contains .sparq/ (with slash)', () => {
    const gitignorePath = join(tempDir, '.gitignore')
    const originalContent = 'node_modules/\n.sparq/\n'
    writeFileSync(gitignorePath, originalContent)

    ensureGitignore(gitignorePath)

    const content = readFileSync(gitignorePath, 'utf-8')
    assert.equal(content, originalContent, 'should not modify file')
    assert.ok(capture.lines().some((line) => line.includes('already includes')))
  })

  it('should skip when already contains .sparq (without slash)', () => {
    const gitignorePath = join(tempDir, '.gitignore')
    const originalContent = 'node_modules/\n.sparq\n'
    writeFileSync(gitignorePath, originalContent)

    ensureGitignore(gitignorePath)

    const content = readFileSync(gitignorePath, 'utf-8')
    assert.equal(content, originalContent, 'should not modify file')
  })

  it('should add newline separator when file does not end with newline', () => {
    const gitignorePath = join(tempDir, '.gitignore')
    writeFileSync(gitignorePath, 'node_modules/')

    ensureGitignore(gitignorePath)

    const content = readFileSync(gitignorePath, 'utf-8')
    assert.ok(content.startsWith('node_modules/'), 'should preserve original content')
    assert.ok(content.includes('.sparq/'), 'should add .sparq/')
    // Should have newline before the comment block
    assert.ok(content.includes('node_modules/\n'), 'should add separator newline')
  })

  it('should NOT write in dry-run mode', () => {
    setDryRun(true)
    const gitignorePath = join(tempDir, '.gitignore')
    ensureGitignore(gitignorePath)

    assert.ok(!existsSync(gitignorePath), '.gitignore should not be created in dry-run')
    assert.ok(capture.lines().some((line) => line.includes('dry-run')))
  })
})

// ---------------------------------------------------------------------------
// getSparqMcpServerNames
// ---------------------------------------------------------------------------

describe('getSparqMcpServerNames', () => {
  it('should return array of server names from package MCP configs', () => {
    const names = getSparqMcpServerNames()
    assert.ok(Array.isArray(names), 'should return an array')
    assert.ok(names.length > 0, 'should have at least one server name')
    // The mcp/ directory contains atlassian, figma, playwright, testrail configs
    assert.ok(names.includes('atlassian'), 'should include atlassian')
    assert.ok(names.includes('playwright'), 'should include playwright')
  })

  it('should return unique server names', () => {
    const names = getSparqMcpServerNames()
    const uniqueNames = [...new Set(names)]
    assert.equal(names.length, uniqueNames.length, 'names should be unique')
  })
})
