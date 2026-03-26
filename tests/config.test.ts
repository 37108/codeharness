import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { loadConfig } from '../src/config.js'

describe('loadConfig', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    // Clear relevant env vars
    for (const key of Object.keys(process.env)) {
      if (key.startsWith('INPUT_')) {
        delete process.env[key]
      }
    }
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it('returns defaults when no config file exists', () => {
    const config = loadConfig('/nonexistent/path')

    expect(config.provider).toBe('claude')
    expect(config.model).toBe('claude-sonnet-4-20250514')
    expect(config.language).toBe('en')
    expect(config.autoApprove).toBe(true)
    expect(config.severityThreshold).toBe('IMPORTANT')
    expect(config.maxDiffLines).toBe(3000)
    expect(config.labels.approved).toBe('ai-approved')
    expect(config.labels.reviewed).toBe('ai-reviewed')
    expect(config.labels.humanRequired).toBe('human-review-required')
    expect(config.skills).toEqual([])
  })

  it('applies environment variable overrides', () => {
    process.env.INPUT_MODEL = 'claude-opus-4-20250514'
    process.env.INPUT_LANGUAGE = 'ja'
    process.env.INPUT_AUTO_APPROVE = 'false'
    process.env.INPUT_PROVIDER = 'copilot'

    const config = loadConfig('/nonexistent/path')

    expect(config.model).toBe('claude-opus-4-20250514')
    expect(config.language).toBe('ja')
    expect(config.autoApprove).toBe(false)
    expect(config.provider).toBe('copilot')
  })

  it('ignores invalid provider values', () => {
    process.env.INPUT_PROVIDER = 'invalid'

    const config = loadConfig('/nonexistent/path')
    expect(config.provider).toBe('claude')
  })

  it('parses max_diff_lines as number', () => {
    process.env.INPUT_MAX_DIFF_LINES = '5000'
    const config = loadConfig('/nonexistent/path')
    expect(config.maxDiffLines).toBe(5000)
  })

  it('ignores non-numeric max_diff_lines', () => {
    process.env.INPUT_MAX_DIFF_LINES = 'abc'
    const config = loadConfig('/nonexistent/path')
    expect(config.maxDiffLines).toBe(3000)
  })
})
