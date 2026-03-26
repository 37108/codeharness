import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ToolExecutor } from '../src/tools/executor.js'

describe('ToolExecutor', () => {
  const testDir = join(import.meta.dirname ?? '/tmp', '.test-workspace')

  beforeEach(() => {
    mkdirSync(join(testDir, 'src'), { recursive: true })
    writeFileSync(join(testDir, 'src', 'index.ts'), 'export const x = 1\nexport const y = 2\n')
    writeFileSync(
      join(testDir, 'src', 'helper.ts'),
      'export function add(a: number, b: number) {\n  return a + b\n}\n',
    )
    writeFileSync(join(testDir, '.env'), 'SECRET=abc123')
  })

  afterEach(() => {
    const { rmSync } = require('node:fs')
    try {
      rmSync(testDir, { recursive: true, force: true })
    } catch {
      // cleanup best effort
    }
  })

  it('reads a file successfully', () => {
    const executor = new ToolExecutor(testDir)
    const result = executor.execute('read_file', { path: 'src/index.ts' })

    expect(result).toContain('export const x')
    expect(result).toContain('1\t')
  })

  it('reads partial file with line range', () => {
    const executor = new ToolExecutor(testDir)
    const result = executor.execute('read_file', {
      path: 'src/index.ts',
      start_line: 2,
      end_line: 2,
    })

    expect(result).toContain('export const y')
    expect(result).not.toContain('export const x')
  })

  it('blocks access to .env files', () => {
    const executor = new ToolExecutor(testDir)
    const result = executor.execute('read_file', { path: '.env' })

    expect(result).toContain('blocked for security')
  })

  it('returns error for non-existent files', () => {
    const executor = new ToolExecutor(testDir)
    const result = executor.execute('read_file', { path: 'nonexistent.ts' })

    expect(result).toContain('not found')
  })

  it('prevents path traversal', () => {
    const executor = new ToolExecutor(testDir)
    const result = executor.execute('read_file', { path: '../../../etc/passwd' })

    expect(result).toContain('outside the repository')
  })

  it('lists directory contents', () => {
    const executor = new ToolExecutor(testDir)
    const result = executor.execute('list_directory', { path: 'src' })

    expect(result).toContain('helper.ts')
    expect(result).toContain('index.ts')
  })

  it('handles submit_review with valid findings', () => {
    const executor = new ToolExecutor(testDir)
    const result = executor.execute('submit_review', {
      findings: [
        {
          id: 'F001',
          file: 'src/index.ts',
          line: 1,
          severity: 'LOW',
          category: 'style',
          title: 'Test finding',
          description: 'This is a test',
        },
      ],
      exploration_summary: 'Reviewed index.ts',
    })

    expect(result).toContain('submitted successfully')
    expect(executor.getSubmittedReview()?.findings).toHaveLength(1)
  })

  it('rejects submit_review with invalid schema', () => {
    const executor = new ToolExecutor(testDir)
    const result = executor.execute('submit_review', {
      findings: [{ invalid: true }],
      exploration_summary: 'test',
    })

    expect(result).toContain('Validation errors')
    expect(executor.getSubmittedReview()).toBeNull()
  })

  it('returns error for unknown tools', () => {
    const executor = new ToolExecutor(testDir)
    const result = executor.execute('unknown_tool', {})

    expect(result).toContain('Unknown tool')
  })
})
