import { describe, expect, it } from 'vitest'
import { filterDiffFiles, parseDiff, summarizeDiff, truncateDiff } from '../src/diff.js'

const SAMPLE_DIFF = `diff --git a/src/index.ts b/src/index.ts
index abc1234..def5678 100644
--- a/src/index.ts
+++ b/src/index.ts
@@ -1,5 +1,6 @@
 import { foo } from './foo'
+import { bar } from './bar'

 export function main() {
-  console.log('hello')
+  console.log('hello world')
+  bar()
 }
diff --git a/src/utils.ts b/src/utils.ts
index 1111111..2222222 100644
--- a/src/utils.ts
+++ b/src/utils.ts
@@ -10,3 +10,7 @@
 export function helper() {
   return true
 }
+
+export function newHelper() {
+  return false
+}
diff --git a/package-lock.json b/package-lock.json
index aaa..bbb 100644
Binary files a/package-lock.json and b/package-lock.json differ
`

describe('parseDiff', () => {
  it('parses files from unified diff', () => {
    const files = parseDiff(SAMPLE_DIFF)
    expect(files).toHaveLength(3)
    expect(files[0]?.path).toBe('src/index.ts')
    expect(files[1]?.path).toBe('src/utils.ts')
    expect(files[2]?.path).toBe('package-lock.json')
  })

  it('counts additions and deletions correctly', () => {
    const files = parseDiff(SAMPLE_DIFF)
    expect(files[0]?.additions).toBe(3)
    expect(files[0]?.deletions).toBe(1)
    expect(files[1]?.additions).toBe(4)
    expect(files[1]?.deletions).toBe(0)
  })

  it('detects binary files', () => {
    const files = parseDiff(SAMPLE_DIFF)
    expect(files[0]?.isBinary).toBe(false)
    expect(files[2]?.isBinary).toBe(true)
  })

  it('returns empty array for empty diff', () => {
    expect(parseDiff('')).toEqual([])
  })
})

describe('filterDiffFiles', () => {
  it('filters binary files', () => {
    const files = parseDiff(SAMPLE_DIFF)
    const filtered = filterDiffFiles(files, [])
    expect(filtered).toHaveLength(2)
    expect(filtered.every((file) => !file.isBinary)).toBe(true)
  })

  it('filters files matching exclude patterns', () => {
    const files = parseDiff(SAMPLE_DIFF)
    const filtered = filterDiffFiles(files, ['**/utils.ts'])
    expect(filtered).toHaveLength(1)
    expect(filtered[0]?.path).toBe('src/index.ts')
  })

  it('filters with multiple patterns', () => {
    const files = parseDiff(SAMPLE_DIFF)
    const filtered = filterDiffFiles(files, ['**/*.ts'])
    expect(filtered).toHaveLength(0)
  })
})

describe('summarizeDiff', () => {
  it('produces correct summary', () => {
    const files = parseDiff(SAMPLE_DIFF)
    const filtered = filterDiffFiles(files, [])
    const summary = summarizeDiff(filtered)

    expect(summary.totalFiles).toBe(2)
    expect(summary.totalAdditions).toBe(7)
    expect(summary.totalDeletions).toBe(1)
    // Sorted by change size descending
    expect(summary.files[0]?.path).toBe('src/index.ts')
  })
})

describe('truncateDiff', () => {
  it('returns full diff when under limit', () => {
    const files = parseDiff(SAMPLE_DIFF)
    const filtered = filterDiffFiles(files, [])
    const result = truncateDiff(filtered, 1000)

    expect(result.truncated).toBe(false)
    expect(result.includedFiles).toHaveLength(2)
    expect(result.summarizedFiles).toHaveLength(0)
  })

  it('truncates when over limit', () => {
    const files = parseDiff(SAMPLE_DIFF)
    const filtered = filterDiffFiles(files, [])
    const result = truncateDiff(filtered, 5)

    expect(result.truncated).toBe(true)
    expect(result.includedFiles.length).toBeGreaterThanOrEqual(1)
  })

  it('always includes at least one file', () => {
    const files = parseDiff(SAMPLE_DIFF)
    const filtered = filterDiffFiles(files, [])
    const result = truncateDiff(filtered, 1)

    expect(result.includedFiles.length).toBeGreaterThanOrEqual(1)
  })
})
