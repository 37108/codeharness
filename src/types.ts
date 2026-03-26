import { z } from 'zod'

// --- Severity & Category Enums ---

export const SeveritySchema = z.enum(['CRITICAL', 'IMPORTANT', 'LOW'])
export type Severity = z.infer<typeof SeveritySchema>

export const FindingCategorySchema = z.enum([
  'security',
  'correctness',
  'logic',
  'design',
  'performance',
  'style',
])
export type FindingCategory = z.infer<typeof FindingCategorySchema>

// --- Finding ---

export const FindingSchema = z.object({
  id: z.string(),
  file: z.string(),
  line: z.number().optional(),
  severity: SeveritySchema,
  category: FindingCategorySchema,
  title: z.string(),
  description: z.string(),
  suggestion: z.string().optional(),
})
export type Finding = z.infer<typeof FindingSchema>

// --- Phase 1: Review Output (via submit_review tool) ---

export const ReviewOutputSchema = z.object({
  findings: z.array(FindingSchema),
  exploration_summary: z.string(),
})
export type ReviewOutput = z.infer<typeof ReviewOutputSchema>

// --- Intent Analysis ---

export const IntentAlignmentSchema = z.enum([
  'MATCHES',
  'PARTIAL_MATCH',
  'DIVERGES',
  'NO_DESCRIPTION',
])
export type IntentAlignment = z.infer<typeof IntentAlignmentSchema>

export const IntentAnalysisSchema = z.object({
  pr_stated_intent: z.string(),
  implementation_summary: z.string(),
  alignment: IntentAlignmentSchema,
  gaps: z.array(z.string()),
})
export type IntentAnalysis = z.infer<typeof IntentAnalysisSchema>

// --- Breaking Changes ---

export const BreakingChangeTypeSchema = z.enum([
  'api_signature',
  'type_change',
  'behavior_change',
  'dependency',
  'config',
])

export const BreakingChangeSchema = z.object({
  detected: z.boolean(),
  changes: z.array(
    z.object({
      type: BreakingChangeTypeSchema,
      description: z.string(),
      file: z.string(),
    }),
  ),
})
export type BreakingChange = z.infer<typeof BreakingChangeSchema>

// --- Phase 2: Triage Output ---

export const TriageOutputSchema = z.object({
  findings: z.array(FindingSchema),
  intent_analysis: IntentAnalysisSchema,
  breaking_changes: BreakingChangeSchema,
  summary: z.string(),
  review_comment: z.string(),
})
export type TriageOutput = z.infer<typeof TriageOutputSchema>

// --- Decision ---

export const DecisionSchema = z.enum(['APPROVE', 'REQUEST_CHANGES', 'REQUEST_HUMAN_REVIEW'])
export type Decision = z.infer<typeof DecisionSchema>

// --- PR Information ---

export interface PullRequestInfo {
  number: number
  title: string
  body: string
  author: string
  baseBranch: string
  headBranch: string
  labels: string[]
  diff: string
  changedFiles: string[]
}

// --- Review Result ---

export interface ReviewResult {
  decision: Decision
  triage: TriageOutput
  labelsToAdd: string[]
  labelsToRemove: string[]
}

// --- Provider ---

export type ProviderType = 'claude' | 'copilot'

// --- Config ---

export interface ReviewConfig {
  provider: ProviderType
  model: string
  language: string
  autoApprove: boolean
  severityThreshold: Severity
  maxDiffLines: number
  maxReviewPasses: number
  reviewGuidePath: string
  labels: {
    approved: string
    reviewed: string
    humanRequired: string
  }
  excludePatterns: string[]
  customInvariants: string[]
  skills: string[]
}
