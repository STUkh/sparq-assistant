import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  tomlMergeMcpServers,
  tomlParseMcpSections,
  tomlRemoveMcpSections,
  tomlSerialize,
} from '../../bin/lib/toml.mjs'

describe('tomlSerialize', () => {
  it('returns empty string for empty object', () => {
    assert.equal(tomlSerialize({}), '')
  })

  it('serializes top-level key-value pairs', () => {
    const result = tomlSerialize({ name: 'test', count: 42, enabled: true })
    assert.ok(result.includes('name = "test"'))
    assert.ok(result.includes('count = 42'))
    assert.ok(result.includes('enabled = true'))
  })

  it('serializes nested objects as TOML sections', () => {
    const result = tomlSerialize({
      mcp_servers: {
        playwright: { command: 'npx', args: ['-y', '@anthropic-ai/some-mcp@latest'] },
      },
    })
    assert.ok(result.includes('[mcp_servers.playwright]'))
    assert.ok(result.includes('command = "npx"'))
    assert.ok(result.includes('args = ["-y", "@anthropic-ai/some-mcp@latest"]'))
  })

  it('serializes deeply nested objects', () => {
    const result = tomlSerialize({
      level1: { level2: { key: 'value' } },
    })
    assert.ok(result.includes('[level1.level2]'))
    assert.ok(result.includes('key = "value"'))
  })

  it('handles arrays of primitives', () => {
    const result = tomlSerialize({ items: [1, 2, 3] })
    assert.ok(result.includes('items = [1, 2, 3]'))
  })

  it('handles arrays of strings', () => {
    const result = tomlSerialize({ tags: ['a', 'b', 'c'] })
    assert.ok(result.includes('tags = ["a", "b", "c"]'))
  })

  it('escapes special characters in strings', () => {
    const result = tomlSerialize({ path: 'C:\\Users\\test' })
    assert.ok(result.includes('path = "C:\\\\Users\\\\test"'))
  })

  it('escapes quotes in strings', () => {
    const result = tomlSerialize({ msg: 'say "hello"' })
    assert.ok(result.includes('msg = "say \\"hello\\""'))
  })

  it('escapes newlines and tabs', () => {
    const result = tomlSerialize({ text: 'line1\nline2\ttab' })
    assert.ok(result.includes('text = "line1\\nline2\\ttab"'))
  })

  it('skips null and undefined values', () => {
    const result = tomlSerialize({ a: 'keep', b: null, c: undefined })
    assert.ok(result.includes('a = "keep"'))
    assert.ok(!result.includes('b ='))
    assert.ok(!result.includes('c ='))
  })

  it('serializes multiple MCP servers correctly', () => {
    const result = tomlSerialize({
      mcp_servers: {
        playwright: { command: 'npx', args: ['-y', '@anthropic-ai/some-mcp@latest'] },
        atlassian: { url: 'https://mcp.atlassian.com/v1/mcp' },
      },
    })
    assert.ok(result.includes('[mcp_servers.playwright]'))
    assert.ok(result.includes('[mcp_servers.atlassian]'))
    assert.ok(result.includes('command = "npx"'))
    assert.ok(result.includes('url = "https://mcp.atlassian.com/v1/mcp"'))
  })

  it('ends with a trailing newline', () => {
    const result = tomlSerialize({ key: 'value' })
    assert.ok(result.endsWith('\n'))
  })

  it('handles mixed arrays', () => {
    const result = tomlSerialize({ mix: [1, 'two', true] })
    assert.ok(result.includes('mix = [1, "two", true]'))
  })

  it('escapes carriage returns', () => {
    const result = tomlSerialize({ text: 'line1\rline2' })
    assert.ok(result.includes('text = "line1\\rline2"'))
  })

  it('handles empty nested objects as empty sections', () => {
    const result = tomlSerialize({ section: { sub: {} } })
    // Empty sub-object has no kvPairs → no section header emitted
    assert.equal(result, '')
  })
})

describe('tomlParseMcpSections', () => {
  it('returns empty servers for empty string', () => {
    const { servers, other } = tomlParseMcpSections('')
    assert.deepEqual(servers, {})
    assert.equal(other, '')
  })

  it('extracts a single mcp_servers section', () => {
    const content = [
      '[mcp_servers.playwright]',
      'command = "npx"',
      'args = ["-y", "@anthropic-ai/some-mcp@latest"]',
      '',
    ].join('\n')
    const { servers, other } = tomlParseMcpSections(content)
    assert.ok('playwright' in servers)
    assert.ok(servers.playwright.includes('command = "npx"'))
    assert.equal(other.trim(), '')
  })

  it('extracts multiple mcp_servers sections', () => {
    const content = [
      '[mcp_servers.playwright]',
      'command = "npx"',
      '',
      '[mcp_servers.atlassian]',
      'url = "https://mcp.atlassian.com"',
      '',
    ].join('\n')
    const { servers } = tomlParseMcpSections(content)
    assert.ok('playwright' in servers)
    assert.ok('atlassian' in servers)
  })

  it('preserves non-mcp content in other', () => {
    const content = [
      'title = "My Config"',
      '',
      '[mcp_servers.playwright]',
      'command = "npx"',
      '',
      '[other_section]',
      'key = "value"',
      '',
    ].join('\n')
    const { servers, other } = tomlParseMcpSections(content)
    assert.ok('playwright' in servers)
    assert.ok(other.includes('title = "My Config"'))
    assert.ok(other.includes('[other_section]'))
    assert.ok(other.includes('key = "value"'))
  })

  it('handles content with no mcp_servers sections', () => {
    const content = ['[settings]', 'verbose = true', ''].join('\n')
    const { servers, other } = tomlParseMcpSections(content)
    assert.deepEqual(servers, {})
    assert.ok(other.includes('[settings]'))
  })

  it('handles Windows CRLF line endings', () => {
    const content = '[mcp_servers.playwright]\r\ncommand = "npx"\r\nargs = ["-y"]\r\n'
    const { servers, other } = tomlParseMcpSections(content)
    assert.ok('playwright' in servers, 'server extracted despite CRLF')
    assert.ok(servers.playwright.includes('command = "npx"'))
    assert.equal(other.trim(), '')
  })

  it('handles mixed LF and CRLF line endings', () => {
    const content = '[mcp_servers.a]\ncommand = "one"\r\n\n[mcp_servers.b]\r\ncommand = "two"\n'
    const { servers } = tomlParseMcpSections(content)
    assert.ok('a' in servers, 'server a extracted')
    assert.ok('b' in servers, 'server b extracted')
  })

  it('handles server names with hyphens and underscores', () => {
    const content = '[mcp_servers.my-custom_server]\ncommand = "test"\n'
    const { servers } = tomlParseMcpSections(content)
    assert.ok('my-custom_server' in servers)
  })

  it('handles interspersed MCP and non-MCP sections', () => {
    const content = [
      '[mcp_servers.a]',
      'command = "one"',
      '',
      '[other_section]',
      'key = "val"',
      '',
      '[mcp_servers.b]',
      'command = "two"',
      '',
    ].join('\n')
    const { servers, other } = tomlParseMcpSections(content)
    assert.ok('a' in servers)
    assert.ok('b' in servers)
    assert.ok(other.includes('[other_section]'))
    assert.ok(other.includes('key = "val"'))
  })

  it('preserves comments within server blocks', () => {
    const content = [
      '[mcp_servers.playwright]',
      '# This server runs the browser',
      'command = "npx"',
      '',
    ].join('\n')
    const { servers } = tomlParseMcpSections(content)
    assert.ok(servers.playwright.includes('# This server runs the browser'))
  })
})

describe('tomlRemoveMcpSections', () => {
  it('removes a single server section', () => {
    const content = [
      '[mcp_servers.playwright]',
      'command = "npx"',
      '',
      '[mcp_servers.atlassian]',
      'url = "https://mcp.atlassian.com"',
      '',
    ].join('\n')
    const result = tomlRemoveMcpSections(content, ['playwright'])
    assert.ok(!result.includes('[mcp_servers.playwright]'))
    assert.ok(result.includes('[mcp_servers.atlassian]'))
  })

  it('removes multiple server sections', () => {
    const content = [
      '[mcp_servers.playwright]',
      'command = "npx"',
      '',
      '[mcp_servers.atlassian]',
      'url = "https://mcp.atlassian.com"',
      '',
      '[mcp_servers.figma]',
      'url = "https://figma.com"',
      '',
    ].join('\n')
    const result = tomlRemoveMcpSections(content, ['playwright', 'figma'])
    assert.ok(!result.includes('[mcp_servers.playwright]'))
    assert.ok(!result.includes('[mcp_servers.figma]'))
    assert.ok(result.includes('[mcp_servers.atlassian]'))
  })

  it('preserves non-mcp content', () => {
    const content = [
      'title = "Config"',
      '',
      '[mcp_servers.playwright]',
      'command = "npx"',
      '',
      '[settings]',
      'verbose = true',
      '',
    ].join('\n')
    const result = tomlRemoveMcpSections(content, ['playwright'])
    assert.ok(!result.includes('[mcp_servers.playwright]'))
    assert.ok(result.includes('title = "Config"'))
    assert.ok(result.includes('[settings]'))
  })

  it('returns empty string when all sections removed', () => {
    const content = ['[mcp_servers.playwright]', 'command = "npx"', ''].join('\n')
    const result = tomlRemoveMcpSections(content, ['playwright'])
    assert.equal(result, '')
  })

  it('returns content unchanged when no names match', () => {
    const content = ['[mcp_servers.playwright]', 'command = "npx"', ''].join('\n')
    const result = tomlRemoveMcpSections(content, ['nonexistent'])
    assert.ok(result.includes('[mcp_servers.playwright]'))
  })

  it('returns content unchanged when serverNames is empty', () => {
    const content = '[mcp_servers.playwright]\ncommand = "npx"\n'
    const result = tomlRemoveMcpSections(content, [])
    assert.equal(result, content)
  })

  it('handles duplicate names in serverNames without error', () => {
    const content = [
      '[mcp_servers.playwright]',
      'command = "npx"',
      '',
      '[mcp_servers.atlassian]',
      'url = "https://mcp.atlassian.com"',
      '',
    ].join('\n')
    const result = tomlRemoveMcpSections(content, ['playwright', 'playwright'])
    assert.ok(!result.includes('[mcp_servers.playwright]'))
    assert.ok(result.includes('[mcp_servers.atlassian]'))
  })

  it('preserves order of remaining servers', () => {
    const content = [
      '[mcp_servers.alpha]',
      'command = "a"',
      '',
      '[mcp_servers.beta]',
      'command = "b"',
      '',
      '[mcp_servers.gamma]',
      'command = "c"',
      '',
    ].join('\n')
    const result = tomlRemoveMcpSections(content, ['beta'])
    const alphaIdx = result.indexOf('[mcp_servers.alpha]')
    const gammaIdx = result.indexOf('[mcp_servers.gamma]')
    assert.ok(alphaIdx < gammaIdx, 'alpha appears before gamma')
  })

  it('handles Windows CRLF line endings', () => {
    const content =
      '[mcp_servers.playwright]\r\ncommand = "npx"\r\n\r\n[mcp_servers.other]\r\nurl = "x"\r\n'
    const result = tomlRemoveMcpSections(content, ['playwright'])
    assert.ok(!result.includes('[mcp_servers.playwright]'))
    assert.ok(result.includes('[mcp_servers.other]'))
  })
})

describe('tomlMergeMcpServers', () => {
  it('adds servers to empty content', () => {
    const { content, added, preserved } = tomlMergeMcpServers('', {
      playwright: { command: 'npx', args: ['-y', '@anthropic-ai/some-mcp@latest'] },
    })
    assert.ok(content.includes('[mcp_servers.playwright]'))
    assert.ok(content.includes('command = "npx"'))
    assert.deepEqual(added, ['playwright'])
    assert.deepEqual(preserved, [])
  })

  it('preserves existing servers with same name', () => {
    const existing = ['[mcp_servers.playwright]', 'command = "custom-playwright"', ''].join('\n')
    const { content, added, preserved } = tomlMergeMcpServers(existing, {
      playwright: { command: 'npx' },
    })
    assert.ok(content.includes('command = "custom-playwright"'))
    assert.ok(!content.includes('command = "npx"'))
    assert.deepEqual(added, [])
    assert.deepEqual(preserved, ['playwright'])
  })

  it('adds new servers while preserving existing', () => {
    const existing = ['[mcp_servers.custom]', 'command = "my-server"', ''].join('\n')
    const { content, added, preserved } = tomlMergeMcpServers(existing, {
      playwright: { command: 'npx' },
    })
    assert.ok(content.includes('[mcp_servers.custom]'))
    assert.ok(content.includes('[mcp_servers.playwright]'))
    assert.deepEqual(added, ['playwright'])
    assert.deepEqual(preserved, [])
  })

  it('preserves non-mcp content during merge', () => {
    const existing = [
      'title = "My Config"',
      '',
      '[mcp_servers.custom]',
      'command = "my-server"',
      '',
    ].join('\n')
    const { content } = tomlMergeMcpServers(existing, {
      playwright: { command: 'npx' },
    })
    assert.ok(content.includes('title = "My Config"'))
    assert.ok(content.includes('[mcp_servers.custom]'))
    assert.ok(content.includes('[mcp_servers.playwright]'))
  })

  it('handles null existing content', () => {
    const { content, added } = tomlMergeMcpServers(null, {
      playwright: { command: 'npx' },
    })
    assert.ok(content.includes('[mcp_servers.playwright]'))
    assert.deepEqual(added, ['playwright'])
  })

  it('returns empty when no servers to add', () => {
    const { content, added, preserved } = tomlMergeMcpServers('', {})
    assert.equal(content, '')
    assert.deepEqual(added, [])
    assert.deepEqual(preserved, [])
  })

  it('handles empty server config objects', () => {
    const { content, added } = tomlMergeMcpServers('', { empty: {} })
    // Empty config produces no key-value pairs, serializes to empty string
    assert.deepEqual(added, ['empty'])
    // Empty server block serialized as empty, filtered out in join
    assert.equal(content, '')
  })

  it('handles nested objects in server configs (env)', () => {
    const { content, added } = tomlMergeMcpServers('', {
      myserver: { command: 'npx', env: { DEBUG: 'true', PORT: '3000' } },
    })
    assert.deepEqual(added, ['myserver'])
    assert.ok(content.includes('command = "npx"'))
    assert.ok(content.includes('DEBUG = "true"'))
    assert.ok(content.includes('PORT = "3000"'))
  })

  it('handles Windows CRLF in existing content', () => {
    const existing = '[mcp_servers.old]\r\ncommand = "keep"\r\n'
    const { content, added, preserved } = tomlMergeMcpServers(existing, {
      newserver: { command: 'new' },
    })
    assert.ok(content.includes('[mcp_servers.old]'), 'existing preserved')
    assert.ok(content.includes('[mcp_servers.newserver]'), 'new added')
    assert.deepEqual(added, ['newserver'])
    assert.deepEqual(preserved, [])
  })
})

describe('toml — round-trip', () => {
  it('serialize then parse produces consistent sections', () => {
    const obj = {
      mcp_servers: {
        playwright: { command: 'npx', args: ['-y', '@anthropic-ai/some-mcp@latest'] },
        atlassian: { url: 'https://mcp.atlassian.com' },
      },
    }
    const serialized = tomlSerialize(obj)
    const { servers } = tomlParseMcpSections(serialized)
    assert.ok('playwright' in servers, 'playwright section round-tripped')
    assert.ok('atlassian' in servers, 'atlassian section round-tripped')
    assert.ok(servers.playwright.includes('command = "npx"'))
    assert.ok(servers.atlassian.includes('url = "https://mcp.atlassian.com"'))
  })
})
