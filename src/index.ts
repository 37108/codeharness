import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { ReviewOrchestrator } from './orchestrator.js'
import { GitHubClient } from './github/client.js'
import { loadConfig } from './config.js'

async function main(): Promise<void> {
  // --- Validate environment ---
  const anthropicApiKey = requireEnv('ANTHROPIC_API_KEY')
  const githubToken = requireEnv('GITHUB_TOKEN')
  const workspace = process.env['GITHUB_WORKSPACE'] ?? process.cwd()
  const eventPath = process.env['GITHUB_EVENT_PATH']
  const repository = process.env['GITHUB_REPOSITORY'] ?? ''
  const eventName = process.env['GITHUB_EVENT_NAME'] ?? ''

  if (!eventPath) {
    console.error(
      'GITHUB_EVENT_PATH is not set. Are you running in GitHub Actions?',
    )
    process.exit(1)
  }

  const [owner, repo] = repository.split('/')
  if (!owner || !repo) {
    console.error('GITHUB_REPOSITORY is not set or invalid.')
    process.exit(1)
  }

  // --- Parse GitHub event ---
  const event = JSON.parse(readFileSync(eventPath, 'utf-8'))

  const prNumber = determinePRNumber(event, eventName)
  if (!prNumber) {
    console.error('Could not determine PR number from the event payload.')
    process.exit(1)
  }

  // For issue_comment events, check for /ai-review command
  if (eventName === 'issue_comment') {
    const commentBody: string = event.comment?.body ?? ''
    if (!commentBody.trimStart().startsWith('/ai-review')) {
      console.log('Comment does not start with /ai-review. Skipping.')
      process.exit(0)
    }
    console.log('/ai-review command detected.')
  }

  // --- Load configuration ---
  const config = loadConfig(workspace)
  console.log(`Config: model=${config.model}, auto_approve=${config.autoApprove}`)

  // --- Load review guide and CLAUDE.md ---
  const reviewGuide = loadFileIfExists(workspace, config.reviewGuidePath)
  const claudeMd = loadFileIfExists(workspace, 'CLAUDE.md')

  if (reviewGuide) console.log(`Loaded review guide from ${config.reviewGuidePath}`)
  if (claudeMd) console.log('Loaded CLAUDE.md')

  // --- Initialize clients ---
  const github = new GitHubClient(githubToken, owner, repo)
  const orchestrator = new ReviewOrchestrator(anthropicApiKey, config, workspace)

  // --- Fetch PR info ---
  console.log(`\nFetching PR #${prNumber} from ${owner}/${repo}...`)
  const prInfo = await github.getPullRequest(prNumber)
  console.log(`PR: "${prInfo.title}" by ${prInfo.author}`)
  console.log(`Branch: ${prInfo.headBranch} → ${prInfo.baseBranch}`)
  console.log(`Changed files: ${prInfo.changedFiles.length}`)
  console.log(`Labels: ${prInfo.labels.join(', ') || 'none'}`)

  // --- Check existing human-review-required label ---
  const hasHumanReviewLabel = prInfo.labels.includes(
    config.labels.humanRequired,
  )

  // --- Execute review pipeline ---
  console.log('\n--- Starting CodeHarness Review Pipeline ---\n')
  const result = await orchestrator.run(prInfo, reviewGuide, claudeMd)

  // --- Publish results ---
  console.log('\nPhase 4: Publish...')

  // Post review comment
  await github.upsertReviewComment(prNumber, result.triage.review_comment)
  console.log('  Review comment posted.')

  // Manage labels
  await github.addLabels(prNumber, result.labelsToAdd)
  if (result.labelsToRemove.length > 0) {
    await github.removeLabels(prNumber, result.labelsToRemove)
  }
  console.log(`  Labels: +[${result.labelsToAdd.join(', ')}] -[${result.labelsToRemove.join(', ')}]`)

  // Submit GitHub review
  if (result.decision === 'APPROVE' && !hasHumanReviewLabel) {
    await github.submitReview(prNumber, 'APPROVE', 'CodeHarness: All checks passed.')
    console.log('  PR approved.')
  } else if (result.decision === 'REQUEST_CHANGES') {
    await github.submitReview(
      prNumber,
      'REQUEST_CHANGES',
      `CodeHarness: ${result.triage.findings.length} finding(s) require attention.`,
    )
    console.log('  Changes requested.')
  } else {
    const reason =
      result.decision === 'REQUEST_HUMAN_REVIEW'
        ? 'CodeHarness: Human review recommended (breaking changes or intent divergence detected).'
        : `CodeHarness: Review complete. ${result.triage.findings.length} finding(s).`
    await github.submitReview(prNumber, 'COMMENT', reason)
    console.log('  Review comment submitted.')
  }

  // --- Summary ---
  console.log('\n--- Review Complete ---')
  console.log(`Decision: ${result.decision}`)
  console.log(`Findings: ${result.triage.findings.length}`)
  console.log(
    `  CRITICAL: ${result.triage.findings.filter((finding) => finding.severity === 'CRITICAL').length}`,
  )
  console.log(
    `  IMPORTANT: ${result.triage.findings.filter((finding) => finding.severity === 'IMPORTANT').length}`,
  )
  console.log(
    `  LOW: ${result.triage.findings.filter((finding) => finding.severity === 'LOW').length}`,
  )
  console.log(`Breaking changes: ${result.triage.breaking_changes.detected ? 'YES' : 'No'}`)
  console.log(`Intent alignment: ${result.triage.intent_analysis.alignment}`)
}

// --- Helpers ---

function determinePRNumber(
  event: Record<string, unknown>,
  eventName: string,
): number | null {
  if (eventName === 'pull_request' || eventName === 'pull_request_target') {
    const pr = event['pull_request'] as Record<string, unknown> | undefined
    return (pr?.['number'] as number) ?? null
  }

  if (eventName === 'issue_comment') {
    const issue = event['issue'] as Record<string, unknown> | undefined
    // Only handle comments on PRs (not issues)
    if (issue?.['pull_request']) {
      return (issue['number'] as number) ?? null
    }
    return null
  }

  return null
}

function loadFileIfExists(
  workspace: string,
  relativePath: string,
): string | null {
  const fullPath = resolve(workspace, relativePath)
  if (!existsSync(fullPath)) return null

  try {
    const content = readFileSync(fullPath, 'utf-8')
    // Truncate very large guide files to avoid overwhelming the prompt
    if (content.length > 10000) {
      return content.substring(0, 10000) + '\n\n(... truncated for context limits ...)'
    }
    return content
  } catch {
    return null
  }
}

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    console.error(`Required environment variable ${name} is not set.`)
    process.exit(1)
  }
  return value
}

main().catch((error) => {
  console.error('CodeHarness review failed:', error)
  process.exit(1)
})
