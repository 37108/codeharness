import { describe, expect, it } from 'vitest'
import { minimatch } from '../src/utils.js'

describe('minimatch', () => {
  it('matches exact file names', () => {
    expect(minimatch('Dockerfile', 'Dockerfile')).toBe(true)
    expect(minimatch('Makefile', 'Dockerfile')).toBe(false)
  })

  it('matches wildcard (*) patterns', () => {
    expect(minimatch('index.ts', '*.ts')).toBe(true)
    expect(minimatch('index.js', '*.ts')).toBe(false)
    expect(minimatch('src/index.ts', '*.ts')).toBe(false) // * does not match /
  })

  it('matches globstar (**) patterns', () => {
    expect(minimatch('src/index.ts', '**/*.ts')).toBe(true)
    expect(minimatch('src/deep/nested/file.ts', '**/*.ts')).toBe(true)
    expect(minimatch('index.ts', '**/*.ts')).toBe(true)
    expect(minimatch('src/index.js', '**/*.ts')).toBe(false)
  })

  it('matches directory patterns', () => {
    expect(minimatch('node_modules/foo/bar.js', '**/node_modules/**')).toBe(true)
    expect(minimatch('dist/index.js', '**/dist/**')).toBe(true)
    expect(minimatch('src/dist.ts', '**/dist/**')).toBe(false)
  })

  it('matches question mark (?) patterns', () => {
    expect(minimatch('file.ts', 'file.t?')).toBe(true)
    expect(minimatch('file.tsx', 'file.t?')).toBe(false)
  })

  it('matches combined patterns', () => {
    expect(minimatch('src/app/page.tsx', '**/app/**/*.tsx')).toBe(true)
    expect(minimatch('src/app/nested/page.tsx', '**/app/**/*.tsx')).toBe(true)
    expect(minimatch('src/lib/page.tsx', '**/app/**/*.tsx')).toBe(false)
  })

  it('escapes regex special characters in pattern', () => {
    expect(minimatch('file.test.ts', '*.test.ts')).toBe(true)
    expect(minimatch('filetestts', '*.test.ts')).toBe(false)
  })
})
