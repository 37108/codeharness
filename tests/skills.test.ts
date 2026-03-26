import { describe, expect, it } from 'vitest'
import { formatSkillsPrompt, resolveSkills } from '../src/skills/loader.js'

describe('resolveSkills', () => {
  it('auto-detects frontend-react for .tsx files', () => {
    const skills = resolveSkills(['src/App.tsx', 'src/index.ts'], [], '/tmp')

    const names = skills.map((skill) => skill.name)
    expect(names).toContain('frontend-react')
    expect(names).toContain('backend-node') // .ts triggers this
  })

  it('auto-detects frontend-nextjs for app router files', () => {
    const skills = resolveSkills(['src/app/page.tsx', 'next.config.ts'], [], '/tmp')

    const names = skills.map((skill) => skill.name)
    expect(names).toContain('frontend-nextjs')
  })

  it('auto-detects backend-python for .py files', () => {
    const skills = resolveSkills(['src/main.py', 'requirements.txt'], [], '/tmp')

    const names = skills.map((skill) => skill.name)
    expect(names).toContain('backend-python')
  })

  it('auto-detects backend-go for .go files', () => {
    const skills = resolveSkills(['cmd/server/main.go'], [], '/tmp')

    const names = skills.map((skill) => skill.name)
    expect(names).toContain('backend-go')
  })

  it('auto-detects infrastructure for Dockerfiles', () => {
    const skills = resolveSkills(['Dockerfile', 'docker-compose.yml'], [], '/tmp')

    const names = skills.map((skill) => skill.name)
    expect(names).toContain('infrastructure')
  })

  it('does not auto-detect security skill (requires explicit config)', () => {
    const skills = resolveSkills(['src/auth.ts'], [], '/tmp')

    const names = skills.map((skill) => skill.name)
    expect(names).not.toContain('security')
  })

  it('adds explicitly configured skills', () => {
    const skills = resolveSkills([], ['security'], '/tmp')

    const names = skills.map((skill) => skill.name)
    expect(names).toContain('security')
  })

  it('does not duplicate skills', () => {
    const skills = resolveSkills(['src/App.tsx'], ['frontend-react'], '/tmp')

    const reactSkills = skills.filter((skill) => skill.name === 'frontend-react')
    expect(reactSkills).toHaveLength(1)
  })

  it('returns empty for non-matching files', () => {
    const skills = resolveSkills(['README.md', 'docs/guide.txt'], [], '/tmp')
    expect(skills).toHaveLength(0)
  })
})

describe('formatSkillsPrompt', () => {
  it('returns empty string for no skills', () => {
    expect(formatSkillsPrompt([])).toBe('')
  })

  it('formats skills into prompt sections', () => {
    const skills = resolveSkills(['src/App.tsx'], [], '/tmp')
    const prompt = formatSkillsPrompt(skills)

    expect(prompt).toContain('Active Review Skills')
    expect(prompt).toContain('frontend-react')
    expect(prompt).toContain('Hooks Rules')
  })
})
