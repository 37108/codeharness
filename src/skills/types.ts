/**
 * A review skill provides domain-specific knowledge and review guidelines.
 * Skills are loaded based on the changed files in a PR (auto-detection)
 * or explicitly configured in .ai-review.yml.
 */
export interface ReviewSkill {
  /** Unique skill identifier */
  name: string
  /** Human-readable description */
  description: string
  /** Glob patterns that trigger auto-detection of this skill */
  triggers: string[]
  /** Additional prompt content injected into the review system prompt */
  prompt: string
}
