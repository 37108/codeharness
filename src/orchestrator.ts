import { filterDiffFiles, parseDiff, summarizeDiff, truncateDiff } from './diff.js'
import {
  buildReviewSystemPrompt,
  buildReviewUserPrompt,
  type ReviewPromptContext,
} from './prompts/review.js'
import {
  buildTriageSystemPrompt,
  buildTriageUserPrompt,
  type TriagePromptContext,
} from './prompts/triage.js'
import type {
  AIProvider,
  ProviderMessage,
  ProviderToolCall,
  ToolDefinition,
} from './providers/index.js'
import { resolveSkills } from './skills/loader.js'
import type { ReviewSkill } from './skills/types.js'
import { getReviewTools } from './tools/definitions.js'
import { ToolExecutor } from './tools/executor.js'
import type {
  Decision,
  Finding,
  PullRequestInfo,
  ReviewConfig,
  ReviewOutput,
  ReviewResult,
  TriageOutput,
} from './types.js'
import { TriageOutputSchema } from './types.js'

const MAX_TOOL_ITERATIONS = 25

export class ReviewOrchestrator {
  constructor(
    private readonly provider: AIProvider,
    private readonly config: ReviewConfig,
    private readonly workspace: string,
  ) {}

  /**
   * Execute the full multi-phase review pipeline.
   */
  async run(
    prInfo: PullRequestInfo,
    reviewGuide: string | null,
    claudeMd: string | null,
  ): Promise<ReviewResult> {
    const startTime = Date.now()

    // Phase 0: Bootstrap — parse diff, resolve skills
    console.log('Phase 0: Bootstrap...')
    const parsedDiff = parseDiff(prInfo.diff)
    const filteredDiff = filterDiffFiles(parsedDiff, this.config.excludePatterns)
    const diffSummary = summarizeDiff(filteredDiff)
    const { diff, truncated } = truncateDiff(filteredDiff, this.config.maxDiffLines)

    console.log(
      `  ${diffSummary.totalFiles} files, +${diffSummary.totalAdditions} -${diffSummary.totalDeletions}`,
    )

    // Resolve skills
    const activeSkills = resolveSkills(prInfo.changedFiles, this.config.skills, this.workspace)
    if (activeSkills.length > 0) {
      console.log(`  Skills: ${activeSkills.map((skill) => skill.name).join(', ')}`)
    }

    // Phase 1: Review — AI explores code and produces findings
    console.log('Phase 1: Review...')
    const promptContext: ReviewPromptContext = {
      config: this.config,
      prInfo,
      diff,
      diffTruncated: truncated,
      diffSummary,
      reviewGuide,
      claudeMd,
      activeSkills,
    }

    const reviewOutput = await this.executeReviewPhase(promptContext)
    console.log(`  ${reviewOutput.findings.length} findings from review phase`)

    // Phase 2: Triage — re-classify, intent analysis, breaking changes
    console.log('Phase 2: Triage...')
    const triageContext: TriagePromptContext = {
      config: this.config,
      prInfo,
      rawFindings: reviewOutput.findings,
      explorationSummary: reviewOutput.exploration_summary,
      diffSummary,
    }

    const triageOutput = await this.executeTriagePhase(triageContext)
    console.log(`  ${triageOutput.findings.length} findings after triage (decision pending)`)

    // Phase 3: Decision — deterministic rules
    console.log('Phase 3: Decision...')
    const { decision, labelsToAdd, labelsToRemove } = this.decide(triageOutput)

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
    console.log(`  Decision: ${decision} (${elapsed}s total)`)

    // Inject decision into review comment
    const reviewComment = this.injectDecision(
      triageOutput.review_comment,
      decision,
      elapsed,
      activeSkills,
    )

    return {
      decision,
      triage: { ...triageOutput, review_comment: reviewComment },
      labelsToAdd,
      labelsToRemove,
    }
  }

  /**
   * Phase 1: Review with tool use loop.
   * Provider-agnostic — works with Claude and Copilot.
   */
  private async executeReviewPhase(context: ReviewPromptContext): Promise<ReviewOutput> {
    const systemPrompt = buildReviewSystemPrompt(context)
    const userPrompt = buildReviewUserPrompt(context)
    const tools: ToolDefinition[] = getReviewTools()
    const toolExecutor = new ToolExecutor(this.workspace)

    const messages: ProviderMessage[] = [{ role: 'user', content: userPrompt }]

    let iterations = 0

    while (iterations < MAX_TOOL_ITERATIONS) {
      iterations++

      const response = await this.provider.chat({
        systemPrompt,
        messages,
        tools,
        maxTokens: 16384,
        model: this.config.model,
      } as Parameters<AIProvider['chat']>[0] & { model: string })

      if (response.stopReason === 'tool_use' && response.toolCalls.length > 0) {
        // Add assistant message with tool calls
        messages.push({
          role: 'assistant',
          content: response.textContent,
          toolCalls: response.toolCalls,
        })

        // Execute tools
        const toolResults = this.executeToolCalls(response.toolCalls, toolExecutor, iterations)

        // Check if submit_review was called
        const submitted = toolExecutor.getSubmittedReview()
        if (submitted) return submitted

        messages.push({ role: 'user', toolResults })
        continue
      }

      // End turn — check for submitted review
      const submitted = toolExecutor.getSubmittedReview()
      if (submitted) return submitted

      // Fallback: extract from text
      return this.extractReviewFromText(response.textContent)
    }

    // Safety: hit max iterations
    const submitted = toolExecutor.getSubmittedReview()
    if (submitted) return submitted

    console.warn('  Warning: reached max tool iterations without submit_review')
    return {
      findings: [],
      exploration_summary: 'Review terminated after reaching maximum tool iterations.',
    }
  }

  /**
   * Phase 2: Triage (single AI call, no tools needed).
   */
  private async executeTriagePhase(context: TriagePromptContext): Promise<TriageOutput> {
    const systemPrompt = buildTriageSystemPrompt(this.config.language)
    const userPrompt = buildTriageUserPrompt(context)

    const response = await this.provider.chat({
      systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
      maxTokens: 8192,
      model: this.config.model,
    } as Parameters<AIProvider['chat']>[0] & { model: string })

    const triageOutput = this.parseTriageJson(response.textContent)
    if (triageOutput) return triageOutput

    // Retry once
    console.warn('  Triage output parsing failed, retrying...')
    const retryResponse = await this.provider.chat({
      systemPrompt,
      messages: [
        { role: 'user', content: userPrompt },
        { role: 'assistant', content: response.textContent, toolCalls: [] },
        {
          role: 'user',
          content:
            'Your response could not be parsed as valid JSON. Please respond with ONLY the JSON object, no markdown fences, no additional text.',
        },
      ],
      maxTokens: 8192,
      model: this.config.model,
    } as Parameters<AIProvider['chat']>[0] & { model: string })

    const retryOutput = this.parseTriageJson(retryResponse.textContent)
    if (retryOutput) return retryOutput

    console.warn('  Triage parsing failed after retry, using fallback')
    return this.buildFallbackTriageOutput(context.rawFindings, context.prInfo)
  }

  /**
   * Phase 3: Deterministic decision based on triage output.
   */
  private decide(triage: TriageOutput): {
    decision: Decision
    labelsToAdd: string[]
    labelsToRemove: string[]
  } {
    const hasCritical = triage.findings.some((finding) => finding.severity === 'CRITICAL')
    const hasImportant = triage.findings.some((finding) => finding.severity === 'IMPORTANT')
    const hasBreakingChanges = triage.breaking_changes.detected
    const intentDiverges = triage.intent_analysis.alignment === 'DIVERGES'

    if (hasBreakingChanges || (hasCritical && intentDiverges)) {
      return {
        decision: 'REQUEST_HUMAN_REVIEW',
        labelsToAdd: [this.config.labels.humanRequired, this.config.labels.reviewed],
        labelsToRemove: [this.config.labels.approved],
      }
    }

    if (hasCritical || hasImportant) {
      return {
        decision: 'REQUEST_CHANGES',
        labelsToAdd: [this.config.labels.reviewed],
        labelsToRemove: [this.config.labels.approved],
      }
    }

    if (this.config.autoApprove) {
      return {
        decision: 'APPROVE',
        labelsToAdd: [this.config.labels.approved, this.config.labels.reviewed],
        labelsToRemove: [this.config.labels.humanRequired],
      }
    }

    return {
      decision: 'APPROVE',
      labelsToAdd: [this.config.labels.reviewed],
      labelsToRemove: [],
    }
  }

  // --- Helper methods ---

  private executeToolCalls(
    toolCalls: ProviderToolCall[],
    toolExecutor: ToolExecutor,
    iteration: number,
  ): { toolCallId: string; content: string }[] {
    return toolCalls.map((toolCall) => {
      const inputSummary = JSON.stringify(toolCall.input).substring(0, 120)
      console.log(`  Tool[${iteration}]: ${toolCall.name}(${inputSummary})`)

      const result = toolExecutor.execute(toolCall.name, toolCall.input)

      return {
        toolCallId: toolCall.id,
        content: result.substring(0, 50000),
      }
    })
  }

  private extractReviewFromText(textContent: string): ReviewOutput {
    const jsonMatch = textContent.match(/```json\s*([\s\S]*?)\s*```/)
    if (jsonMatch?.[1]) {
      try {
        const parsed = JSON.parse(jsonMatch[1])
        return {
          findings: Array.isArray(parsed.findings) ? parsed.findings : [],
          exploration_summary:
            typeof parsed.exploration_summary === 'string'
              ? parsed.exploration_summary
              : 'Extracted from text response.',
        }
      } catch {
        // Fall through
      }
    }

    return {
      findings: [],
      exploration_summary: 'Review completed but findings could not be structured.',
    }
  }

  private parseTriageJson(text: string): TriageOutput | null {
    // Try raw JSON
    try {
      const result = TriageOutputSchema.safeParse(JSON.parse(text))
      if (result.success) return result.data
    } catch {
      // Not raw JSON
    }

    // Try code fences
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
    if (jsonMatch?.[1]) {
      try {
        const result = TriageOutputSchema.safeParse(JSON.parse(jsonMatch[1]))
        if (result.success) return result.data
      } catch {
        // Fall through
      }
    }

    // Try finding JSON object
    const objectMatch = text.match(/\{[\s\S]*\}/)
    if (objectMatch?.[0]) {
      try {
        const result = TriageOutputSchema.safeParse(JSON.parse(objectMatch[0]))
        if (result.success) return result.data
      } catch {
        // Fall through
      }
    }

    return null
  }

  private buildFallbackTriageOutput(rawFindings: Finding[], prInfo: PullRequestInfo): TriageOutput {
    const findingsText = rawFindings
      .map(
        (finding) =>
          `- **${finding.severity}** [${finding.category}] ${finding.title} (\`${finding.file}:${finding.line ?? '?'}\`)`,
      )
      .join('\n')

    return {
      findings: rawFindings,
      intent_analysis: {
        pr_stated_intent: prInfo.body || '(No description)',
        implementation_summary: 'Automated analysis incomplete.',
        alignment: prInfo.body ? 'PARTIAL_MATCH' : 'NO_DESCRIPTION',
        gaps: [],
      },
      breaking_changes: { detected: false, changes: [] },
      summary: 'Triage could not be completed automatically.',
      review_comment: `## CodeHarness Review

**Decision**: (pending) | **Findings**: ${rawFindings.length}

### Findings
${findingsText || 'No findings.'}

---
<sub>Reviewed by CodeHarness v1.0.0 (triage fallback mode)</sub>`,
    }
  }

  private injectDecision(
    reviewComment: string,
    decision: Decision,
    elapsed: string,
    activeSkills: ReviewSkill[],
  ): string {
    const decisionEmoji: Record<Decision, string> = {
      APPROVE: '✅',
      REQUEST_CHANGES: '⚠️',
      REQUEST_HUMAN_REVIEW: '🔍',
    }

    const decisionLabel: Record<Decision, string> = {
      APPROVE: 'Approved',
      REQUEST_CHANGES: 'Changes Requested',
      REQUEST_HUMAN_REVIEW: 'Human Review Required',
    }

    let comment = reviewComment.replace(
      /\*\*Decision\*\*: \[will be set by the system\]/,
      `**Decision**: ${decisionEmoji[decision]} ${decisionLabel[decision]}`,
    )

    // Add skills and timing metadata
    const skillNames =
      activeSkills.length > 0
        ? ` | Skills: ${activeSkills.map((skill) => skill.name).join(', ')}`
        : ''
    const providerLabel = `Provider: ${this.provider.name}`

    if (!comment.includes('Review time')) {
      comment = comment.replace(
        /<sub>Reviewed by CodeHarness/,
        `<sub>${providerLabel}${skillNames} | Review time: ${elapsed}s | Reviewed by CodeHarness`,
      )
    }

    return comment
  }
}
