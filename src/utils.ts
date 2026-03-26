/**
 * Simple glob-style pattern matching (supports *, **, ?).
 * Used to avoid adding a dependency for basic pattern matching.
 */
export function minimatch(filePath: string, pattern: string): boolean {
  const regexPattern = pattern
    // Escape regex special chars except *, ?, /
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    // ** matches any number of directories
    .replace(/\*\*/g, '{{GLOBSTAR}}')
    // * matches anything except /
    .replace(/\*/g, '[^/]*')
    // ? matches single char except /
    .replace(/\?/g, '[^/]')
    // Restore globstar
    .replace(/\{\{GLOBSTAR\}\}/g, '.*')

  return new RegExp(`^${regexPattern}$`).test(filePath)
}
