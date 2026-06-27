/**
 * Diff calculator — calculates insertions/deletions between old and new file content.
 * No external library needed. Simple line-based comparison.
 */

export interface FileDiff {
  path: string
  action: 'create' | 'modify' | 'delete'
  additions: number
  deletions: number
}

/**
 * Calculate line-level additions and deletions between old and new content.
 * Uses simple set-based comparison — not a full unified diff, but good enough
 * for summary display ("6 files changed, +198, -42").
 */
export function calcDiff(oldContent: string | undefined, newContent: string): { additions: number; deletions: number } {
  if (!oldContent) {
    // New file — all additions
    return { additions: newContent.split('\n').length, deletions: 0 }
  }

  const oldLines = oldContent.split('\n')
  const newLines = newContent.split('\n')

  // Simple approach: count lines that differ
  const maxLen = Math.max(oldLines.length, newLines.length)
  let additions = 0
  let deletions = 0

  for (let i = 0; i < maxLen; i++) {
    const oldLine = i < oldLines.length ? oldLines[i] : undefined
    const newLine = i < newLines.length ? newLines[i] : undefined

    if (oldLine === undefined && newLine !== undefined) {
      additions++
    } else if (oldLine !== undefined && newLine === undefined) {
      deletions++
    } else if (oldLine !== newLine) {
      additions++
      deletions++
    }
  }

  return { additions, deletions }
}

/**
 * Calculate diffs for multiple files.
 */
export function calcMultiDiff(
  oldFiles: Map<string, string>,
  newFiles: Array<{ path: string; content: string; action?: string }>
): { diffs: FileDiff[]; totalAdditions: number; totalDeletions: number } {
  const diffs: FileDiff[] = []
  let totalAdditions = 0
  let totalDeletions = 0

  for (const file of newFiles) {
    const oldContent = oldFiles.get(file.path)
    const { additions, deletions } = calcDiff(oldContent, file.content)
    diffs.push({
      path: file.path,
      action: (file.action as 'create' | 'modify' | 'delete') || (oldContent ? 'modify' : 'create'),
      additions,
      deletions,
    })
    totalAdditions += additions
    totalDeletions += deletions
  }

  return { diffs, totalAdditions, totalDeletions }
}
