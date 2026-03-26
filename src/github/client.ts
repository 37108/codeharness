import { Octokit } from '@octokit/rest'
import type { PullRequestInfo } from '../types.js'

const COMMENT_MARKER = '<!-- codeharness-review-v1 -->'

export class GitHubClient {
  private readonly octokit: Octokit

  constructor(
    token: string,
    private readonly owner: string,
    private readonly repo: string,
  ) {
    this.octokit = new Octokit({ auth: token })
  }

  /**
   * Fetch full PR information including diff and changed files.
   */
  async getPullRequest(prNumber: number): Promise<PullRequestInfo> {
    const [prResponse, diffResponse, filesResponse] = await Promise.all([
      this.octokit.pulls.get({
        owner: this.owner,
        repo: this.repo,
        pull_number: prNumber,
      }),
      this.octokit.pulls.get({
        owner: this.owner,
        repo: this.repo,
        pull_number: prNumber,
        mediaType: { format: 'diff' },
      }),
      this.octokit.pulls.listFiles({
        owner: this.owner,
        repo: this.repo,
        pull_number: prNumber,
        per_page: 100,
      }),
    ])

    const prData = prResponse.data

    return {
      number: prNumber,
      title: prData.title,
      body: prData.body ?? '',
      author: prData.user?.login ?? 'unknown',
      baseBranch: prData.base.ref,
      headBranch: prData.head.ref,
      labels: prData.labels.map((label) =>
        typeof label === 'string' ? label : label.name ?? '',
      ),
      diff: diffResponse.data as unknown as string,
      changedFiles: filesResponse.data.map((file) => file.filename),
    }
  }

  /**
   * Create or update the CodeHarness review comment on a PR.
   * Uses a hidden marker to identify previous comments.
   */
  async upsertReviewComment(
    prNumber: number,
    body: string,
  ): Promise<void> {
    const markedBody = `${body}\n\n${COMMENT_MARKER}`

    // Find existing CodeHarness comment
    const existingCommentId = await this.findBotComment(prNumber)

    if (existingCommentId) {
      await this.octokit.issues.updateComment({
        owner: this.owner,
        repo: this.repo,
        comment_id: existingCommentId,
        body: markedBody,
      })
    } else {
      await this.octokit.issues.createComment({
        owner: this.owner,
        repo: this.repo,
        issue_number: prNumber,
        body: markedBody,
      })
    }
  }

  /**
   * Submit a PR review (approve, request changes, or comment).
   */
  async submitReview(
    prNumber: number,
    event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT',
    body: string,
  ): Promise<void> {
    // Dismiss previous bot reviews
    await this.dismissPreviousBotReviews(prNumber)

    await this.octokit.pulls.createReview({
      owner: this.owner,
      repo: this.repo,
      pull_number: prNumber,
      event,
      body,
    })
  }

  /**
   * Add labels to a PR, creating them if they don't exist.
   */
  async addLabels(prNumber: number, labels: string[]): Promise<void> {
    if (labels.length === 0) return

    // Ensure labels exist
    await Promise.all(
      labels.map((label) => this.ensureLabelExists(label)),
    )

    await this.octokit.issues.addLabels({
      owner: this.owner,
      repo: this.repo,
      issue_number: prNumber,
      labels,
    })
  }

  /**
   * Remove labels from a PR (ignoring errors for non-existent labels).
   */
  async removeLabels(prNumber: number, labels: string[]): Promise<void> {
    await Promise.all(
      labels.map(async (label) => {
        try {
          await this.octokit.issues.removeLabel({
            owner: this.owner,
            repo: this.repo,
            issue_number: prNumber,
            name: label,
          })
        } catch {
          // Label might not exist on the issue, ignore
        }
      }),
    )
  }

  /**
   * Check if a PR has a specific label.
   */
  async hasLabel(prNumber: number, label: string): Promise<boolean> {
    const response = await this.octokit.issues.listLabelsOnIssue({
      owner: this.owner,
      repo: this.repo,
      issue_number: prNumber,
    })
    return response.data.some((existingLabel) => existingLabel.name === label)
  }

  // --- Private helpers ---

  private async findBotComment(prNumber: number): Promise<number | null> {
    const comments = await this.octokit.issues.listComments({
      owner: this.owner,
      repo: this.repo,
      issue_number: prNumber,
      per_page: 100,
    })

    const botComment = comments.data.find((comment) =>
      comment.body?.includes(COMMENT_MARKER),
    )

    return botComment?.id ?? null
  }

  private async dismissPreviousBotReviews(prNumber: number): Promise<void> {
    const reviews = await this.octokit.pulls.listReviews({
      owner: this.owner,
      repo: this.repo,
      pull_number: prNumber,
    })

    const dismissableReviews = reviews.data.filter(
      (review) =>
        review.user?.type === 'Bot' &&
        review.body?.includes('CodeHarness') &&
        (review.state === 'APPROVED' || review.state === 'CHANGES_REQUESTED'),
    )

    for (const review of dismissableReviews) {
      try {
        await this.octokit.pulls.dismissReview({
          owner: this.owner,
          repo: this.repo,
          pull_number: prNumber,
          review_id: review.id,
          message: 'Superseded by new CodeHarness review',
        })
      } catch {
        // May not have permission to dismiss, ignore
      }
    }
  }

  private async ensureLabelExists(label: string): Promise<void> {
    try {
      await this.octokit.issues.getLabel({
        owner: this.owner,
        repo: this.repo,
        name: label,
      })
    } catch {
      const colorMap: Record<string, string> = {
        'human-review-required': 'e4e669',
        'ai-reviewed': '1d76db',
        'ai-approved': '0e8a16',
      }
      await this.octokit.issues.createLabel({
        owner: this.owner,
        repo: this.repo,
        name: label,
        color: colorMap[label] ?? '5319e7',
        description: `Managed by CodeHarness`,
      }).catch(() => {
        // Race condition: label may have been created by another run
      })
    }
  }
}
