// bin/lib/toml.mjs — Minimal TOML serializer + MCP section parser for MCP configs

/**
 * Escape a TOML string value (double-quoted).
 * Backslash must be escaped FIRST to avoid double-escaping other sequences.
 */
function escapeString(str) {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
}

/**
 * Serialize a JavaScript value to a TOML value string.
 * Handles strings, numbers, booleans, and arrays of primitives.
 */
function serializeValue(value) {
  if (typeof value === 'string') return `"${escapeString(value)}"`
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) {
    const items = value.filter((v) => v != null).map((v) => serializeValue(v))
    return `[${items.join(', ')}]`
  }
  return `"${escapeString(String(value))}"`
}

/**
 * Collect key-value pairs and sub-tables from an object.
 */
function collectEntries(obj) {
  const kvPairs = []
  const subTables = []
  for (const [key, value] of Object.entries(obj)) {
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      subTables.push([key, value])
    } else if (value !== undefined && value !== null) {
      kvPairs.push([key, value])
    }
  }
  return { kvPairs, subTables }
}

/**
 * Recursively serialize an object into TOML sections.
 */
function serializeSection(obj, prefix, lines) {
  const { kvPairs, subTables } = collectEntries(obj)

  if (prefix && kvPairs.length > 0) {
    lines.push(`[${prefix}]`)
  }

  for (const [key, value] of kvPairs) {
    lines.push(`${key} = ${serializeValue(value)}`)
  }

  if (prefix && kvPairs.length > 0) {
    lines.push('')
  }

  for (const [key, value] of subTables) {
    const fullKey = prefix ? `${prefix}.${key}` : key
    serializeSection(value, fullKey, lines)
  }
}

/**
 * Serialize a JavaScript object to TOML format.
 * Handles the nested structure used by MCP server configs:
 *
 *   { mcp_servers: { playwright: { command: "npx", args: [...] } } }
 *   →
 *   [mcp_servers.playwright]
 *   command = "npx"
 *   args = ["--version"]
 *
 * @param {object} obj - The object to serialize
 * @returns {string} TOML-formatted string
 */
export function tomlSerialize(obj) {
  const lines = []
  serializeSection(obj, '', lines)
  // Ensure trailing newline, remove redundant blank lines
  const result = lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return result ? `${result}\n` : ''
}

// ---------------------------------------------------------------------------
// MCP Section Parser — minimal TOML reading for [mcp_servers.*] sections
// ---------------------------------------------------------------------------

const MCP_SECTION_RE = /^\[mcp_servers\.([^\]]+)\]$/
const ANY_SECTION_RE = /^\[.+\]$/

/**
 * Parse TOML content and extract [mcp_servers.*] sections.
 * Returns an object with server name -> raw TOML text block, plus all
 * non-mcp_servers content preserved verbatim.
 *
 * NOTE: Minimal parser — handles [section.name] headers with key = value pairs.
 * Does not support inline tables, array-of-tables, or complex TOML features.
 *
 * @param {string} content - Raw TOML file content
 * @returns {{ servers: Record<string, string>, other: string }}
 */
export function tomlParseMcpSections(content) {
  const servers = {}
  const otherLines = []
  const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')

  let currentServer = null
  let currentBlock = []

  for (const line of lines) {
    const mcpMatch = line.match(MCP_SECTION_RE)
    if (mcpMatch) {
      // Flush previous MCP server block
      if (currentServer) {
        servers[currentServer] = currentBlock.join('\n')
      }
      currentServer = mcpMatch[1]
      currentBlock = [line]
      continue
    }

    if (currentServer && ANY_SECTION_RE.test(line)) {
      // New non-MCP section — flush current MCP block
      servers[currentServer] = currentBlock.join('\n')
      currentServer = null
      currentBlock = []
      otherLines.push(line)
      continue
    }

    if (currentServer) {
      currentBlock.push(line)
    } else {
      otherLines.push(line)
    }
  }

  // Flush final MCP block
  if (currentServer) {
    servers[currentServer] = currentBlock.join('\n')
  }

  return { servers, other: otherLines.join('\n') }
}

/**
 * Remove specific [mcp_servers.*] sections from TOML content.
 * Preserves all other content (comments, other sections, other mcp_servers).
 *
 * @param {string} content - Raw TOML file content
 * @param {string[]} serverNames - Server names to remove
 * @returns {string} Updated TOML content
 */
export function tomlRemoveMcpSections(content, serverNames) {
  if (!serverNames || serverNames.length === 0) return content

  const namesToRemove = new Set(serverNames)
  const { servers, other } = tomlParseMcpSections(content)

  for (const name of namesToRemove) {
    delete servers[name]
  }

  const parts = [other.trim()]
  for (const block of Object.values(servers)) {
    parts.push(block.trim())
  }

  const result = parts.filter(Boolean).join('\n\n')
  return result ? `${result}\n` : ''
}

/**
 * Merge new MCP server configs into existing TOML content.
 * Preserves existing servers — if a server name already exists, it is kept.
 *
 * @param {string} existingContent - Existing TOML file content (may be empty)
 * @param {Record<string, object>} newServers - Server name -> config object
 * @returns {{ content: string, added: string[], preserved: string[] }}
 */
export function tomlMergeMcpServers(existingContent, newServers) {
  const added = []
  const preserved = []
  const { servers, other } = tomlParseMcpSections(existingContent || '')

  for (const [name, config] of Object.entries(newServers)) {
    if (name in servers) {
      preserved.push(name)
      continue
    }
    // Serialize the single server section
    const block = tomlSerialize({ mcp_servers: { [name]: config } }).trim()
    servers[name] = block
    added.push(name)
  }

  const parts = [other.trim()]
  for (const block of Object.values(servers)) {
    parts.push(block.trim())
  }

  const result = parts.filter(Boolean).join('\n\n')
  return { content: result ? `${result}\n` : '', added, preserved }
}
