// Shared JSON extraction utilities for rubrics that parse embedded JSON from markdown content.

/**
 * Find the closing brace index for an opening brace at position `start`.
 * Returns -1 if no balanced closing brace is found.
 */
export function findClosingBrace(content, start) {
  let depth = 0
  for (let j = start; j < content.length; j++) {
    if (content[j] === '{') depth++
    if (content[j] === '}') depth--
    if (depth === 0) return j
  }
  return -1
}

/** Try to parse text as JSON and return the object if it passes the validator. */
function tryParse(text, validatorFn) {
  try {
    const parsed = JSON.parse(text)
    if (validatorFn(parsed)) return parsed
  } catch {
    // Not valid JSON
  }
  return null
}

/**
 * Extract the first JSON object from content that passes the validator function.
 * Tries three strategies in order: pure JSON parse, markdown fenced code block,
 * balanced-brace scanning for embedded JSON.
 *
 * @param {string} content - Raw content (may be pure JSON, markdown, or mixed)
 * @param {(obj: object) => boolean} validatorFn - Returns true if the parsed object is the one we want
 * @returns {object|null} Parsed JSON object or null if not found
 */
export function extractJsonBlock(content, validatorFn) {
  // Strategy 1: Pure JSON
  const pure = tryParse(content, validatorFn)
  if (pure) return pure

  // Strategy 2: Markdown fenced code block
  const fenced = content.match(/```(?:json)?\s*\n([\s\S]*?)\n```/)
  if (fenced) {
    const fromFence = tryParse(fenced[1], validatorFn)
    if (fromFence) return fromFence
  }

  // Strategy 3: Balanced-brace scanning for embedded JSON blocks
  for (let i = 0; i < content.length; i++) {
    if (content[i] !== '{') continue
    const end = findClosingBrace(content, i)
    if (end === -1) continue
    const fromBrace = tryParse(content.slice(i, end + 1), validatorFn)
    if (fromBrace) return fromBrace
  }

  return null
}
