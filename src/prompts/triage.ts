import type {
  Finding,
  ReviewConfig,
  PullRequestInfo,
} from '../types.js'
import type { DiffSummary } from '../diff.js'

export interface TriagePromptContext {
  config: ReviewConfig
  prInfo: PullRequestInfo
  rawFindings: Finding[]
  explorationSummary: string
  diffSummary: DiffSummary
}

/**
 * Build the system prompt for Phase 2: Triage.
 *
 * The triage phase re-evaluates raw findings with a fresh perspective,
 * performs intent analysis, and detects breaking changes.
 */
export function buildTriageSystemPrompt(): string {
  return `You are the Triage Agent for CodeHarness.
You receive raw findings from the Review phase and must:

1. **Re-classify severity** using strict criteria:
   - CRITICAL: Would cause a production incident, security breach, data loss, or crash
   - IMPORTANT: Would cause bugs, degraded UX, or significant maintenance burden
   - LOW: Nice-to-have improvement with no functional impact

2. **Scope filter**: Remove any finding about code NOT changed in this PR.
   If a finding's file is not in the changed files list, remove it.

3. **Deduplicate**: Merge findings that describe the same underlying issue.

4. **Intent analysis**: Compare the PR description with the actual changes:
   - MATCHES: Description accurately describes all changes
   - PARTIAL_MATCH: Description covers some changes but misses others
   - DIVERGES: Implementation does something materially different from description
   - NO_DESCRIPTION: PR has no meaningful description

5. **Breaking change detection**: Flag changes that could break consumers:
   - Public API signature changes (added/removed/changed parameters)
   - Type changes that affect callers
   - Behavior changes in existing functions
   - Dependency changes (added/removed/version bumped)
   - Configuration format changes

## Output

Respond with ONLY a JSON object (no markdown fences, no explanation before or after).
The JSON must match this exact structure:

{
  "findings": [
    {
      "id": "F001",
      "file": "path/to/file.ts",
      "line": 42,
      "severity": "CRITICAL",
      "category": "security",
      "title": "Short title",
      "description": "Why this matters",
      "suggestion": "How to fix it"
    }
  ],
  "intent_analysis": {
    "pr_stated_intent": "What the PR description says",
    "implementation_summary": "What the code actually does",
    "alignment": "MATCHES",
    "gaps": ["Any gaps between intent and implementation"]
  },
  "breaking_changes": {
    "detected": false,
    "changes": []
  },
  "summary": "2-3 sentence overall summary",
  "review_comment": "Full markdown comment for the PR (see format below)"
}

## Review Comment Format

The review_comment field should be a well-formatted markdown comment for the PR.
Use this exact format:

## CodeHarness Review

**Decision**: [will be set by the system] | **Model**: [model name] | **Files reviewed**: N

### Intent Analysis
| PR Description | Implementation | Alignment |
|---------------|----------------|-----------|
| [stated intent] | [what code does] | [MATCHES/PARTIAL_MATCH/DIVERGES/NO_DESCRIPTION] |

[If there are gaps, list them as bullet points]

### Findings ([N] Critical, [N] Important, [N] Low)

[For each CRITICAL finding:]
#### 🔴 [F00X] [title]
**File**: \`[file]:[line]\` | **Category**: [category]

[description]

**Suggestion**: [suggestion]

---

[For each IMPORTANT finding:]
#### 🟡 [F00X] [title]
**File**: \`[file]:[line]\` | **Category**: [category]

[description]

**Suggestion**: [suggestion]

---

[For LOW findings, use a collapsed section:]
<details>
<summary>🟢 Low findings ([N])</summary>

[list each briefly]
</details>

### Breaking Changes
[List or "None detected"]

---
<sub>Reviewed by CodeHarness v1.0.0</sub>`
}

/**
 * Build the user message for Phase 2: Triage.
 */
export function buildTriageUserPrompt(context: TriagePromptContext): string {
  return `## Pull Request Context
- **Title**: ${context.prInfo.title}
- **Author**: ${context.prInfo.author}
- **Branch**: \`${context.prInfo.headBranch}\` → \`${context.prInfo.baseBranch}\`
- **Description**: ${context.prInfo.body || '(No description provided)'}

## Changed Files
${context.prInfo.changedFiles.map((file) => `- ${file}`).join('\n')}

## Diff Summary
${context.diffSummary.totalFiles} files changed, +${context.diffSummary.totalAdditions} -${context.diffSummary.totalDeletions}

## Reviewer's Exploration Summary
${context.explorationSummary}

## Raw Findings (${context.rawFindings.length} total)
${JSON.stringify(context.rawFindings, null, 2)}

## Configuration
- Severity threshold: ${context.config.severityThreshold}
- Auto-approve enabled: ${context.config.autoApprove}

Triage these findings and produce the output JSON.`
}
