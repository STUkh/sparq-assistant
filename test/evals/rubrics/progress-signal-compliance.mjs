/**
 * Progress signal compliance rubric — validates progress signals per progress-protocol.md.
 * Checks: [sparq] prefix, phase tags, phase boundaries, error format, no emoji.
 */

/**
 * Extract lines that look like progress signals (contain [sparq]).
 */
function extractSignalLines(content) {
  return content.split('\n').filter((line) => line.includes('[sparq]'))
}

export function evaluate(content, _checks = []) {
  const findings = []
  let score = 0
  const maxScore = 5

  const signalLines = extractSignalLines(content)

  if (signalLines.length === 0) {
    findings.push('No progress signals found (expected lines containing [sparq])')
    return { score: 0, maxScore, findings }
  }

  // 1. All signal lines start with [sparq] (after optional whitespace)
  const allPrefixed = signalLines.every((line) => /^\s*\[sparq\]/.test(line))
  if (allPrefixed) {
    score++
  } else {
    const bad = signalLines.filter((line) => !/^\s*\[sparq\]/.test(line))
    findings.push(`${bad.length} signal line(s) do not start with [sparq] prefix`)
  }

  // 2. Phase tags present (P0, P1, P2, P3, etc. or --)
  const phaseTagPattern = /\[sparq\]\s+(?:P\d+(?:\.\d+)?|--)/
  const hasPhaseTag = signalLines.some((line) => phaseTagPattern.test(line))
  if (hasPhaseTag) {
    score++
  } else {
    findings.push('No phase tags found in signals (expected P0, P1, P2, P3, or --)')
  }

  // 3. Phase boundary signals (Starting/Complete)
  const hasBoundary = signalLines.some(
    (line) => /\bStarting\b/i.test(line) || /\bComplete\b/i.test(line),
  )
  if (hasBoundary) {
    score++
  } else {
    findings.push('No phase boundary signals found (expected Starting/Complete)')
  }

  // 4. Error signals follow Retry:/Fallback:/Warning: format (if errors present)
  const errorLines = signalLines.filter((line) =>
    /(?:error|fail|timeout|retry|fallback|warning)/i.test(line),
  )
  if (errorLines.length > 0) {
    const validErrorFormat = /(?:Retry:|Fallback:|Warning:)/
    const allFormatted = errorLines.every((line) => validErrorFormat.test(line))
    if (allFormatted) {
      score++
    } else {
      const bad = errorLines.filter((line) => !validErrorFormat.test(line))
      findings.push(`${bad.length} error signal(s) missing Retry:/Fallback:/Warning: format`)
    }
  } else {
    // No error signals present — auto-pass
    score++
  }

  // 5. No emoji in signal lines
  const emojiPattern = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u
  const hasEmoji = signalLines.some((line) => emojiPattern.test(line))
  if (!hasEmoji) {
    score++
  } else {
    findings.push('Emoji found in progress signal lines (plain text only)')
  }

  return { score, maxScore, findings }
}
