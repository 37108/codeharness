/**
 * Simple glob-style pattern matching (supports *, **, ?).
 * Used to avoid adding a dependency for basic pattern matching.
 *
 * Rules:
 * - `*` matches anything except `/`
 * - `**` matches any number of path segments (including zero)
 * - `?` matches a single character except `/`
 */
export function minimatch(filePath: string, pattern: string): boolean {
  // Split pattern into segments by /
  // Handle ** specially: it matches zero or more path segments
  const regexParts: string[] = []
  const segments = pattern.split('/')

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]!

    if (segment === '**') {
      if (i === 0 && i === segments.length - 1) {
        // Pattern is just "**" — match everything
        regexParts.push('.*')
      } else if (i === 0) {
        // "**/" at start — match zero or more directories
        regexParts.push('(?:.+/)?')
      } else if (i === segments.length - 1) {
        // "/**" at end — match anything remaining
        regexParts.push('(?:/.*)?')
      } else {
        // "/**/" in middle — match one or more directory segments
        regexParts.push('(?:/.*)?/')
      }
    } else {
      if (i > 0 && segments[i - 1] !== '**') {
        regexParts.push('/')
      }
      // Convert glob wildcards to regex within a segment
      const segmentRegex = segment
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '[^/]*')
        .replace(/\?/g, '[^/]')
      regexParts.push(segmentRegex)
    }
  }

  const fullRegex = new RegExp(`^${regexParts.join('')}$`)
  return fullRegex.test(filePath)
}
