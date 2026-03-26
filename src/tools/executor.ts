import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import type { ReviewOutput } from '../types.js'
import { ReviewOutputSchema } from '../types.js'

/** Files that should never be read for security reasons */
const BLOCKED_PATTERNS = [
  /\.env($|\.)/,
  /secret/i,
  /credential/i,
  /\.pem$/,
  /\.key$/,
  /id_rsa/,
  /id_ed25519/,
]

const MAX_FILE_SIZE = 100 * 1024 // 100KB per file
const MAX_TOTAL_BYTES = 2 * 1024 * 1024 // 2MB total reads
const MAX_SEARCH_RESULTS = 50

export class ToolExecutor {
  private totalBytesRead = 0
  private submittedReview: ReviewOutput | null = null

  constructor(private readonly repoRoot: string) {}

  getSubmittedReview(): ReviewOutput | null {
    return this.submittedReview
  }

  execute(toolName: string, input: Record<string, unknown>): string {
    switch (toolName) {
      case 'read_file':
        return this.readFile(input)
      case 'search_content':
        return this.searchContent(input)
      case 'list_directory':
        return this.listDirectory(input)
      case 'submit_review':
        return this.submitReview(input)
      default:
        return `Unknown tool: ${toolName}`
    }
  }

  private readFile(input: Record<string, unknown>): string {
    const path = input.path as string
    if (!path) return 'Error: path is required'

    const fullPath = this.resolveSafePath(path)
    if (!fullPath) return `Error: path "${path}" is outside the repository`

    if (BLOCKED_PATTERNS.some((pattern) => pattern.test(path))) {
      return `Error: access to "${path}" is blocked for security reasons`
    }

    if (!existsSync(fullPath)) {
      return `Error: file not found: ${path}`
    }

    try {
      const stat = statSync(fullPath)
      if (stat.isDirectory()) {
        return `Error: "${path}" is a directory, not a file. Use list_directory instead.`
      }
      if (stat.size > MAX_FILE_SIZE) {
        return `Error: file "${path}" is too large (${Math.round(stat.size / 1024)}KB, max ${MAX_FILE_SIZE / 1024}KB). Use start_line/end_line to read a portion.`
      }

      if (this.totalBytesRead + stat.size > MAX_TOTAL_BYTES) {
        return `Error: total read limit reached (${Math.round(MAX_TOTAL_BYTES / 1024)}KB). Focus on the most critical files.`
      }

      const content = readFileSync(fullPath, 'utf-8')
      this.totalBytesRead += stat.size

      const lines = content.split('\n')
      const startLine = (input.start_line as number | undefined) ?? 1
      const endLine = (input.end_line as number | undefined) ?? lines.length

      const clampedStart = Math.max(1, startLine)
      const clampedEnd = Math.min(lines.length, endLine)

      const selectedLines = lines.slice(clampedStart - 1, clampedEnd)
      return selectedLines.map((line, index) => `${clampedStart + index}\t${line}`).join('\n')
    } catch (error) {
      return `Error reading file: ${error instanceof Error ? error.message : String(error)}`
    }
  }

  private searchContent(input: Record<string, unknown>): string {
    const pattern = input.pattern as string
    if (!pattern) return 'Error: pattern is required'

    const searchPath = (input.path as string | undefined) ?? '.'
    const filePattern = input.file_pattern as string | undefined

    const fullPath = this.resolveSafePath(searchPath)
    if (!fullPath) return `Error: path "${searchPath}" is outside the repository`

    try {
      const args = ['-rn', '--max-count=3', '-E', pattern]

      if (filePattern) {
        args.push('--include', filePattern)
      }

      args.push(fullPath)

      const result = execFileSync('grep', args, {
        encoding: 'utf-8',
        timeout: 10000,
        maxBuffer: 1024 * 1024,
      })

      const lines = result.trim().split('\n')
      // Make paths relative to repo root
      const relativized = lines.slice(0, MAX_SEARCH_RESULTS).map((line) => {
        const absPrefix = `${this.repoRoot}/`
        if (line.startsWith(absPrefix)) {
          return line.substring(absPrefix.length)
        }
        return line
      })

      return relativized.join('\n') || 'No matches found.'
    } catch (error) {
      // grep returns exit code 1 when no matches found
      if (
        error instanceof Error &&
        'status' in error &&
        (error as NodeJS.ErrnoException & { status: number }).status === 1
      ) {
        return 'No matches found.'
      }
      return 'No matches found.'
    }
  }

  private listDirectory(input: Record<string, unknown>): string {
    const path = (input.path as string | undefined) ?? '.'

    const fullPath = this.resolveSafePath(path)
    if (!fullPath) return `Error: path "${path}" is outside the repository`

    if (!existsSync(fullPath)) {
      return `Error: directory not found: ${path}`
    }

    try {
      const entries = readdirSync(fullPath)
      return entries
        .filter((entry) => !entry.startsWith('.'))
        .map((entry) => {
          const entryPath = join(fullPath, entry)
          try {
            const stat = statSync(entryPath)
            return stat.isDirectory() ? `${entry}/` : entry
          } catch {
            return entry
          }
        })
        .sort((first, second) => {
          // Directories first
          const firstIsDir = first.endsWith('/')
          const secondIsDir = second.endsWith('/')
          if (firstIsDir && !secondIsDir) return -1
          if (!firstIsDir && secondIsDir) return 1
          return first.localeCompare(second)
        })
        .join('\n')
    } catch (error) {
      return `Error listing directory: ${error instanceof Error ? error.message : String(error)}`
    }
  }

  private submitReview(input: Record<string, unknown>): string {
    const parsed = ReviewOutputSchema.safeParse(input)
    if (!parsed.success) {
      return `Error: invalid review output. Validation errors:\n${parsed.error.issues.map((issue) => `- ${issue.path.join('.')}: ${issue.message}`).join('\n')}\n\nPlease fix the issues and call submit_review again.`
    }

    this.submittedReview = parsed.data
    return `Review submitted successfully. ${parsed.data.findings.length} findings recorded.`
  }

  /**
   * Resolve a path safely within the repository root.
   * Returns null if the resolved path escapes the repo root.
   */
  private resolveSafePath(inputPath: string): string | null {
    const resolved = resolve(this.repoRoot, inputPath)
    const rel = relative(this.repoRoot, resolved)
    if (rel.startsWith('..') || resolve(resolved) !== resolved.replace(/\/$/, '')) {
      // Additional check: the resolved path must be within or equal to repoRoot
      if (!resolved.startsWith(this.repoRoot)) {
        return null
      }
    }
    if (!resolved.startsWith(this.repoRoot)) {
      return null
    }
    return resolved
  }
}
