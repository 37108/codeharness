import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { z } from 'zod'
import { parse as parseYaml } from 'yaml'
import type { ReviewConfig } from './types.js'

const ConfigFileSchema = z.object({
  model: z.string().optional(),
  auto_approve: z.boolean().optional(),
  severity_threshold: z.enum(['CRITICAL', 'IMPORTANT', 'LOW']).optional(),
  max_diff_lines: z.number().optional(),
  max_review_passes: z.number().min(1).max(5).optional(),
  review_guide_path: z.string().optional(),
  labels: z
    .object({
      approved: z.string().optional(),
      reviewed: z.string().optional(),
      human_required: z.string().optional(),
    })
    .optional(),
  exclude_patterns: z.array(z.string()).optional(),
  custom_invariants: z.array(z.string()).optional(),
})

const DEFAULT_EXCLUDE_PATTERNS = [
  '**/*.lock',
  '**/package-lock.json',
  '**/pnpm-lock.yaml',
  '**/yarn.lock',
  '**/*.min.js',
  '**/*.min.css',
  '**/dist/**',
  '**/build/**',
  '**/node_modules/**',
  '**/.git/**',
  '**/*.generated.*',
]

function getDefaults(): ReviewConfig {
  return {
    model: 'claude-sonnet-4-20250514',
    autoApprove: true,
    severityThreshold: 'IMPORTANT',
    maxDiffLines: 3000,
    maxReviewPasses: 3,
    reviewGuidePath: 'REVIEW_GUIDE.md',
    labels: {
      approved: 'ai-approved',
      reviewed: 'ai-reviewed',
      humanRequired: 'human-review-required',
    },
    excludePatterns: DEFAULT_EXCLUDE_PATTERNS,
    customInvariants: [],
  }
}

export function loadConfig(workspace: string): ReviewConfig {
  const defaults = getDefaults()

  // Try to load config file
  const configPaths = [
    process.env['INPUT_CONFIG_PATH']
      ? resolve(workspace, process.env['INPUT_CONFIG_PATH'])
      : null,
    resolve(workspace, '.ai-review.yml'),
    resolve(workspace, '.ai-review.yaml'),
    resolve(workspace, '.github/ai-review.yml'),
  ].filter((path): path is string => path !== null)

  let fileConfig: z.infer<typeof ConfigFileSchema> = {}
  for (const configPath of configPaths) {
    if (existsSync(configPath)) {
      try {
        const content = readFileSync(configPath, 'utf-8')
        fileConfig = ConfigFileSchema.parse(parseYaml(content))
        console.log(`Loaded config from ${configPath}`)
        break
      } catch (error) {
        console.warn(
          `Failed to parse config from ${configPath}:`,
          error instanceof Error ? error.message : String(error),
        )
      }
    }
  }

  // Merge: env overrides > file config > defaults
  return {
    model: process.env['INPUT_MODEL'] ?? fileConfig.model ?? defaults.model,
    autoApprove:
      process.env['INPUT_AUTO_APPROVE'] !== undefined
        ? process.env['INPUT_AUTO_APPROVE'] === 'true'
        : fileConfig.auto_approve ?? defaults.autoApprove,
    severityThreshold:
      fileConfig.severity_threshold ?? defaults.severityThreshold,
    maxDiffLines: envNumber('INPUT_MAX_DIFF_LINES') ?? fileConfig.max_diff_lines ?? defaults.maxDiffLines,
    maxReviewPasses: fileConfig.max_review_passes ?? defaults.maxReviewPasses,
    reviewGuidePath:
      process.env['INPUT_REVIEW_GUIDE_PATH'] ??
      fileConfig.review_guide_path ??
      defaults.reviewGuidePath,
    labels: {
      approved: fileConfig.labels?.approved ?? defaults.labels.approved,
      reviewed: fileConfig.labels?.reviewed ?? defaults.labels.reviewed,
      humanRequired:
        fileConfig.labels?.human_required ?? defaults.labels.humanRequired,
    },
    excludePatterns:
      fileConfig.exclude_patterns ?? defaults.excludePatterns,
    customInvariants: fileConfig.custom_invariants ?? defaults.customInvariants,
  }
}

function envNumber(name: string): number | undefined {
  const value = process.env[name]
  if (value === undefined) return undefined
  const parsed = parseInt(value, 10)
  return Number.isNaN(parsed) ? undefined : parsed
}
