import { minimatch } from './utils.js'

export interface ParsedDiffFile {
  path: string
  additions: number
  deletions: number
  isBinary: boolean
  hunks: string[]
  rawContent: string
}

export interface DiffSummary {
  totalFiles: number
  totalAdditions: number
  totalDeletions: number
  files: Array<{
    path: string
    additions: number
    deletions: number
  }>
}

/**
 * Parse unified diff into structured file-level data.
 */
export function parseDiff(rawDiff: string): ParsedDiffFile[] {
  const files: ParsedDiffFile[] = []
  const fileSections = rawDiff.split(/^diff --git /m).filter(Boolean)

  for (const section of fileSections) {
    const lines = section.split('\n')
    const pathMatch = lines[0]?.match(/b\/(.+)$/)
    if (!pathMatch?.[1]) continue

    const isBinary = section.includes('Binary files')
    const hunks: string[] = []
    let additions = 0
    let deletions = 0
    let currentHunk = ''

    for (const line of lines) {
      if (line.startsWith('@@')) {
        if (currentHunk) hunks.push(currentHunk)
        currentHunk = `${line}\n`
        continue
      }

      if (currentHunk) {
        currentHunk += `${line}\n`
        if (line.startsWith('+') && !line.startsWith('+++')) additions++
        if (line.startsWith('-') && !line.startsWith('---')) deletions++
      }
    }

    if (currentHunk) hunks.push(currentHunk)

    files.push({
      path: pathMatch[1],
      additions,
      deletions,
      isBinary,
      hunks,
      rawContent: `diff --git ${section}`,
    })
  }

  return files
}

/**
 * Filter out files matching exclude patterns and binary files.
 */
export function filterDiffFiles(
  files: ParsedDiffFile[],
  excludePatterns: string[],
): ParsedDiffFile[] {
  return files.filter((file) => {
    if (file.isBinary) return false
    return !excludePatterns.some((pattern) => minimatch(file.path, pattern))
  })
}

/**
 * Build diff summary for display.
 */
export function summarizeDiff(files: ParsedDiffFile[]): DiffSummary {
  return {
    totalFiles: files.length,
    totalAdditions: files.reduce((sum, file) => sum + file.additions, 0),
    totalDeletions: files.reduce((sum, file) => sum + file.deletions, 0),
    files: files
      .map((file) => ({
        path: file.path,
        additions: file.additions,
        deletions: file.deletions,
      }))
      .sort(
        (first, second) =>
          second.additions + second.deletions - (first.additions + first.deletions),
      ),
  }
}

/**
 * Progressive diff truncation to fit context window limits.
 *
 * Strategy:
 * 1. Keep all files if under maxLines
 * 2. Remove context lines (keep only +/- lines)
 * 3. Truncate large files to first N hunks
 * 4. Keep only the N most-changed files, summarize the rest
 */
export function truncateDiff(
  files: ParsedDiffFile[],
  maxLines: number,
): { diff: string; truncated: boolean; includedFiles: string[]; summarizedFiles: string[] } {
  // Sort by change size (largest first = highest priority)
  const sorted = [...files].sort(
    (first, second) => second.additions + second.deletions - (first.additions + first.deletions),
  )

  const totalLines = sorted.reduce((sum, file) => sum + file.additions + file.deletions, 0)

  // If within limits, return full diff
  if (totalLines <= maxLines) {
    return {
      diff: sorted.map((file) => file.rawContent).join('\n'),
      truncated: false,
      includedFiles: sorted.map((file) => file.path),
      summarizedFiles: [],
    }
  }

  // Progressive truncation: include files until we hit the limit
  const includedFiles: ParsedDiffFile[] = []
  const summarizedFiles: string[] = []
  let currentLines = 0

  for (const file of sorted) {
    const fileLines = file.additions + file.deletions
    if (currentLines + fileLines <= maxLines) {
      includedFiles.push(file)
      currentLines += fileLines
    } else if (includedFiles.length === 0) {
      // Always include at least the first (largest) file, even if it exceeds limit
      // But truncate its hunks
      const truncatedFile = { ...file, hunks: file.hunks.slice(0, 3) }
      truncatedFile.rawContent =
        `diff --git a/${file.path} b/${file.path}\n` +
        `(truncated: showing first 3 hunks of ${file.hunks.length})\n` +
        truncatedFile.hunks.join('\n')
      includedFiles.push(truncatedFile)
      currentLines += maxLines
    } else {
      summarizedFiles.push(file.path)
    }
  }

  let diff = includedFiles.map((file) => file.rawContent).join('\n')

  if (summarizedFiles.length > 0) {
    diff +=
      '\n\n# Summarized files (use read_file tool to inspect):\n' +
      summarizedFiles.map((path) => `# - ${path}`).join('\n')
  }

  return {
    diff,
    truncated: true,
    includedFiles: includedFiles.map((file) => file.path),
    summarizedFiles,
  }
}
