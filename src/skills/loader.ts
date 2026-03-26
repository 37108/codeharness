import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { minimatch } from '../utils.js'
import { BUILTIN_SKILLS } from './builtin.js'
import type { ReviewSkill } from './types.js'

/**
 * Load and resolve review skills based on configuration and changed files.
 *
 * Resolution order:
 * 1. Explicitly configured skills from .ai-review.yml
 * 2. Custom skills from .ai-review/skills/ directory
 * 3. Auto-detected built-in skills based on changed file patterns
 */
export function resolveSkills(
  changedFiles: string[],
  configuredSkills: string[],
  workspace: string,
): ReviewSkill[] {
  const allSkills = new Map<string, ReviewSkill>()

  // Load built-in skills
  for (const skill of BUILTIN_SKILLS) {
    allSkills.set(skill.name, skill)
  }

  // Load custom skills from repo
  const customSkills = loadCustomSkills(workspace)
  for (const skill of customSkills) {
    allSkills.set(skill.name, skill) // Custom skills override built-in
  }

  const selectedSkills: ReviewSkill[] = []
  const selectedNames = new Set<string>()

  // 1. Add explicitly configured skills
  for (const skillName of configuredSkills) {
    const skill = allSkills.get(skillName)
    if (skill && !selectedNames.has(skill.name)) {
      selectedSkills.push(skill)
      selectedNames.add(skill.name)
    }
  }

  // 2. Auto-detect skills based on changed files
  for (const [, skill] of allSkills) {
    if (selectedNames.has(skill.name)) continue
    if (skill.triggers.length === 0) continue // Skills without triggers require explicit config

    const triggered = changedFiles.some((file) =>
      skill.triggers.some((trigger) => matchesTrigger(file, trigger)),
    )
    if (triggered) {
      selectedSkills.push(skill)
      selectedNames.add(skill.name)
    }
  }

  return selectedSkills
}

/**
 * Load custom skill files from .ai-review/skills/ directory.
 * Each .md file is parsed as a skill definition.
 *
 * Expected format:
 * ---
 * name: my-custom-skill
 * description: Custom review rules for our project
 * triggers:
 *   - "src/api/**"
 * ---
 * [prompt content]
 */
function loadCustomSkills(workspace: string): ReviewSkill[] {
  const skillsDir = resolve(workspace, '.ai-review', 'skills')
  if (!existsSync(skillsDir)) return []

  const skills: ReviewSkill[] = []

  try {
    const files = readdirSync(skillsDir).filter((file) => file.endsWith('.md'))

    for (const file of files) {
      const skill = parseSkillFile(join(skillsDir, file))
      if (skill) skills.push(skill)
    }
  } catch {
    // Directory read error, skip custom skills
  }

  return skills
}

function parseSkillFile(filePath: string): ReviewSkill | null {
  try {
    const content = readFileSync(filePath, 'utf-8')

    // Parse frontmatter
    const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/)
    if (!frontmatterMatch) return null

    const frontmatter = frontmatterMatch[1] ?? ''
    const prompt = frontmatterMatch[2]?.trim() ?? ''

    const name = extractField(frontmatter, 'name')
    const description = extractField(frontmatter, 'description')
    if (!name) return null

    const triggers = extractListField(frontmatter, 'triggers')

    return {
      name,
      description: description ?? name,
      triggers,
      prompt,
    }
  } catch {
    return null
  }
}

function extractField(text: string, field: string): string | null {
  const match = text.match(new RegExp(`^${field}:\\s*(.+)$`, 'm'))
  return match?.[1]?.trim().replace(/^["']|["']$/g, '') ?? null
}

function extractListField(text: string, field: string): string[] {
  const items: string[] = []
  const lines = text.split('\n')
  let inList = false

  for (const line of lines) {
    if (line.match(new RegExp(`^${field}:`))) {
      inList = true
      continue
    }
    if (inList) {
      const itemMatch = line.match(/^\s+-\s*["']?(.+?)["']?\s*$/)
      if (itemMatch?.[1]) {
        items.push(itemMatch[1])
      } else if (!line.match(/^\s/)) {
        inList = false
      }
    }
  }

  return items
}

/**
 * Match a file path against a trigger pattern.
 * Supports both full-path patterns (with /) and basename patterns (without /).
 */
function matchesTrigger(filePath: string, trigger: string): boolean {
  // If the trigger contains a path separator, match against the full path
  if (trigger.includes('/')) {
    return minimatch(filePath, trigger)
  }
  // Otherwise, match against the basename only
  const basename = filePath.split('/').pop() ?? filePath
  return minimatch(basename, trigger)
}

/**
 * Format selected skills into a prompt section.
 */
export function formatSkillsPrompt(skills: ReviewSkill[]): string {
  if (skills.length === 0) return ''

  const skillSections = skills
    .map((skill) => `### Skill: ${skill.name}\n_${skill.description}_\n\n${skill.prompt}`)
    .join('\n\n---\n\n')

  return `## Active Review Skills
The following domain-specific review skills are active for this PR.
Apply these guidelines in addition to the general review rules.

${skillSections}`
}
