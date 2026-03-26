import type { DiffSummary } from '../diff.js'
import { formatSkillsPrompt } from '../skills/loader.js'
import type { ReviewSkill } from '../skills/types.js'
import type { PullRequestInfo, ReviewConfig } from '../types.js'

export interface ReviewPromptContext {
  config: ReviewConfig
  prInfo: PullRequestInfo
  diff: string
  diffTruncated: boolean
  diffSummary: DiffSummary
  reviewGuide: string | null
  claudeMd: string | null
  activeSkills: ReviewSkill[]
}

/** Language-specific instruction map */
const LANGUAGE_INSTRUCTIONS: Record<string, string> = {
  ja: `## 出力言語
全てのfinding（title, description, suggestion）および exploration_summary は**日本語**で記述してください。
ファイルパスやコードはそのままにしてください。`,
  en: '', // English is the default, no extra instruction needed
  ko: `## Output Language
Write all findings (title, description, suggestion) and exploration_summary in **Korean**.
Keep file paths and code as-is.`,
  zh: `## Output Language
Write all findings (title, description, suggestion) and exploration_summary in **Chinese**.
Keep file paths and code as-is.`,
}

/**
 * Build the system prompt for Phase 1: Review.
 *
 * Design principles applied:
 * - Progressive Disclosure: provides a "map" (CLAUDE.md/REVIEW_GUIDE.md), not a manual
 * - Invariants over Micromanagement: defines WHAT must be true, not HOW to review
 * - Agent Legibility: structured for Claude's comprehension
 * - Skills: domain-specific review guidelines injected based on changed files
 */
export function buildReviewSystemPrompt(context: ReviewPromptContext): string {
  const sections: string[] = []

  sections.push(`You are CodeHarness, an expert AI code reviewer.
Your task is to review the pull request diff below and identify issues related to
correctness, security, logic, design, and performance.

## Core Invariants (MUST be followed)

1. **SCOPE**: Only report findings about code that was CHANGED in this PR.
   If you see issues in unchanged code, you may note them in your exploration summary
   but do NOT include them as findings.

2. **SEVERITY**: Every finding MUST have exactly one severity level:
   - CRITICAL: Security vulnerability, data loss risk, crash in production, correctness bug
   - IMPORTANT: Logic error, design flaw, missing error handling at system boundaries, edge case bug
   - LOW: Style improvement, minor naming issue, documentation gap

3. **EVIDENCE**: Every finding MUST reference a specific file path and line number.

4. **FOCUS**: Report at most 15 findings. Prioritize the most important issues.
   Quality over quantity.

## Progressive Disclosure Protocol

You have the PR diff as your primary input. You also have tools to explore the codebase.
Use tools ONLY when you need more context to understand a change:
- A function is called but not defined in the diff → read_file to see its implementation
- A type is imported but you need to understand its shape → read_file
- You need to verify how many callers a changed function has → search_content
- You need to understand the project structure → list_directory

Do NOT read every file. Do NOT explore the codebase exhaustively.
Start from the diff and go deeper only when necessary.

## What NOT to Flag

- Style issues that a linter or formatter would catch (unless they affect correctness)
- Patterns that are clearly intentional and consistent across the codebase
- Test code style (focus on test correctness, not test aesthetics)
- Missing documentation (unless a public API changed without updating docs)

## Review Categories

- **security**: Injection, XSS, CSRF, auth/authz flaws, secrets in code, insecure crypto
- **correctness**: Wrong logic, off-by-one, null/undefined, type coercion, race conditions
- **logic**: Business logic inconsistencies, missing edge cases, incorrect assumptions
- **design**: Architecture violations, tight coupling, missing error handling at boundaries
- **performance**: N+1 queries, unnecessary re-renders, unbounded operations, memory leaks
- **style**: Only if it significantly impacts readability (misleading names, shadowing)

## Completion

When you have finished your review, call the \`submit_review\` tool with your findings.
Do NOT output findings as text. Always use the submit_review tool.`)

  // Language instruction
  const langInstruction =
    LANGUAGE_INSTRUCTIONS[context.config.language] ??
    LANGUAGE_INSTRUCTIONS[context.config.language.split('-')[0] ?? 'en'] ??
    ''
  if (langInstruction) {
    sections.push(langInstruction)
  }

  // Active skills (domain-specific review guidelines)
  const skillsPrompt = formatSkillsPrompt(context.activeSkills)
  if (skillsPrompt) {
    sections.push(skillsPrompt)
  }

  // Custom invariants from config
  if (context.config.customInvariants.length > 0) {
    sections.push(`## Project-Specific Invariants
${context.config.customInvariants.map((invariant) => `- ${invariant}`).join('\n')}`)
  }

  // Review guide (progressive disclosure map)
  if (context.reviewGuide) {
    sections.push(`## Repository Review Guide
This is the project's review guide. Use it as a MAP to understand conventions and priorities.
Do not treat it as exhaustive documentation.

<review-guide>
${context.reviewGuide}
</review-guide>`)
  }

  // CLAUDE.md
  if (context.claudeMd) {
    sections.push(`## Repository Context (CLAUDE.md)
<claude-md>
${context.claudeMd}
</claude-md>`)
  }

  return sections.join('\n\n')
}

/**
 * Build the user message for Phase 1: Review.
 */
export function buildReviewUserPrompt(context: ReviewPromptContext): string {
  const parts: string[] = []

  parts.push(`## Pull Request Information
- **Title**: ${context.prInfo.title}
- **Author**: ${context.prInfo.author}
- **Branch**: \`${context.prInfo.headBranch}\` → \`${context.prInfo.baseBranch}\`
- **Labels**: ${context.prInfo.labels.length > 0 ? context.prInfo.labels.join(', ') : 'none'}`)

  parts.push(`## PR Description
${context.prInfo.body || '(No description provided)'}`)

  // Diff summary
  const summary = context.diffSummary
  parts.push(`## Changed Files Summary
**${summary.totalFiles} files** changed: +${summary.totalAdditions} -${summary.totalDeletions}

${summary.files.map((file) => `- \`${file.path}\` (+${file.additions} -${file.deletions})`).join('\n')}`)

  if (context.diffTruncated) {
    parts.push(
      `> **Note**: The diff has been truncated to fit context limits. Use the \`read_file\` tool to inspect files not shown in the diff.`,
    )
  }

  parts.push(`## Diff
\`\`\`diff
${context.diff}
\`\`\`

Begin your review. Use tools to explore context as needed, then call \`submit_review\` when done.`)

  return parts.join('\n\n')
}
