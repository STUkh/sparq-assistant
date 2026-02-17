// bin/lib/eval/artifact-resolver.mjs — output artifact collection helpers

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export function collectFileResults(expectedOutputs, projectRoot) {
  const files = []
  for (const output of expectedOutputs) {
    const fullPath = resolve(projectRoot, output.path)
    if (!existsSync(fullPath)) {
      files.push({ path: output.path, status: 'missing', content: '', checks: output.checks })
      continue
    }
    const content = readFileSync(fullPath, 'utf-8')
    files.push({ path: output.path, status: 'found', content, checks: output.checks })
  }
  return files
}

export function parseArtifacts(response) {
  const artifacts = new Map()
  for (const match of response.matchAll(
    /--- ARTIFACT:\s*(.+?)\s*---\n([\s\S]*?)--- END ARTIFACT ---/g,
  )) {
    artifacts.set(match[1].trim(), match[2].trim())
  }
  return artifacts
}

export function findExactMatch(artifacts, expectedPath) {
  if (artifacts.has(expectedPath)) return artifacts.get(expectedPath)
  const normalized = expectedPath.replace(/^\.\//, '')
  for (const [path] of artifacts) {
    if (path.replace(/^\.\//, '') === normalized) return artifacts.get(path)
  }
  return null
}
