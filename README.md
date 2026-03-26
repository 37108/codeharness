# CodeHarness

Multi-phase AI code review powered by harness engineering principles.

A GitHub Action that automatically reviews pull requests using Claude or GitHub Copilot (OpenAI), then triages findings, analyzes intent, and makes deterministic approval decisions. Works with **any language or framework**.

## Features

- **Multi-phase pipeline** — Review → Triage → Decision ensures high-quality, consistent feedback
- **Deterministic decisions** — AI never decides approve/reject; severity-based rules do
- **Intent Analysis** — Detects gaps between what the PR description says and what the code does
- **Skill system** — Auto-detects React, Next.js, Node.js, Python, Go, Terraform skills from changed files
- **Progressive Disclosure** — Reads CLAUDE.md as a "map", explores deeper only when needed
- **Provider switching** — Claude (Anthropic) or Copilot (OpenAI-compatible) with a single config change
- **Multi-language output** — Review comments in English, Japanese, Korean, or Chinese

## Quick Start

### 1. Add the workflow

Create `.github/workflows/ai-review.yml`:

```yaml
name: AI Code Review

on:
  pull_request:
    types: [opened, synchronize, ready_for_review]
  issue_comment:
    types: [created]

permissions:
  contents: read
  pull-requests: write
  issues: write

jobs:
  ai-review:
    if: >
      (github.event_name == 'pull_request' && !github.event.pull_request.draft) ||
      (github.event_name == 'issue_comment' &&
       github.event.issue.pull_request &&
       startsWith(github.event.comment.body, '/ai-review'))
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: 37108/codeharness@v1
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
          github_token: ${{ secrets.GITHUB_TOKEN }}
```

### 2. Add your API key

Go to your repository **Settings → Secrets and variables → Actions** and add `ANTHROPIC_API_KEY`.

### 3. Open a pull request

CodeHarness reviews every PR automatically. You can also trigger a review manually by commenting `/ai-review` on any PR.

## How It Works

```
PR opened / /ai-review command
        │
        ▼
┌─ Phase 0: Bootstrap ──────────────────────────────┐
│  Load config, parse diff, detect skills           │
└───────────────────────────────────────────────────┘
        │
        ▼
┌─ Phase 1: Review ─────────────────────────────────┐
│  AI + tools (read_file, search, list_dir)         │
│  explores codebase, produces structured findings  │
└───────────────────────────────────────────────────┘
        │
        ▼
┌─ Phase 2: Triage ─────────────────────────────────┐
│  Re-classify severity, intent analysis,           │
│  breaking change detection                        │
└───────────────────────────────────────────────────┘
        │
        ▼
┌─ Phase 3: Decision (deterministic) ───────────────┐
│  APPROVE / REQUEST_CHANGES / REQUEST_HUMAN_REVIEW │
└───────────────────────────────────────────────────┘
        │
        ▼
┌─ Phase 4: Publish ────────────────────────────────┐
│  Post PR comment, manage labels, submit review    │
└───────────────────────────────────────────────────┘
```

### Decision Rules (Phase 3)

The AI **never** decides to approve or reject. Instead, deterministic rules are applied:

| Condition | Decision |
|-----------|----------|
| Breaking changes, or CRITICAL + intent divergence | `REQUEST_HUMAN_REVIEW` + label |
| Any CRITICAL or IMPORTANT findings | `REQUEST_CHANGES` |
| No significant findings + auto_approve enabled | `APPROVE` |

## Configuration

### Action Inputs

| Input | Default | Description |
|-------|---------|-------------|
| `anthropic_api_key` | — | Anthropic API key (required for `claude` provider) |
| `github_token` | `github.token` | GitHub token with PR read/write access |
| `provider` | `claude` | AI provider: `claude` or `copilot` |
| `model` | `claude-sonnet-4-20250514` | Model name |
| `language` | `en` | Review output language: `en`, `ja`, `ko`, `zh` |
| `auto_approve` | `true` | Auto-approve PRs with no significant findings |
| `review_guide_path` | `REVIEW_GUIDE.md` | Path to the review guide (progressive disclosure entry point) |
| `config_path` | `.ai-review.yml` | Path to the configuration file |
| `max_diff_lines` | `3000` | Maximum diff lines before truncation |

### Configuration File (`.ai-review.yml`)

Place this at your repository root for per-project customization:

```yaml
provider: claude
model: claude-sonnet-4-20250514
language: en
auto_approve: true
severity_threshold: IMPORTANT

labels:
  approved: ai-approved
  reviewed: ai-reviewed
  human_required: human-review-required

# Force-enable skills on top of auto-detection
skills:
  - security

# Project-specific rules the reviewer must always enforce
custom_invariants:
  - "All database queries must use parameterized statements"
  - "API endpoints must validate input with Zod schemas"

exclude_patterns:
  - "**/*.lock"
  - "**/dist/**"
```

All fields are optional. See [`templates/ai-review.yml`](templates/ai-review.yml) for the full reference.

## Skills

Skills are domain-specific review guidelines that CodeHarness applies based on the files changed in a PR. They are auto-detected by default. You can also force-enable skills via the `skills` config.

### Built-in Skills

| Skill | Auto-detect triggers | Key checks |
|-------|---------------------|------------|
| `frontend-react` | `*.tsx`, `*.jsx` | Hooks rules, performance, accessibility |
| `frontend-nextjs` | `**/app/**/*.tsx`, `next.config.*` | Server/client boundary, data fetching, metadata |
| `frontend-css` | `*.css`, `*.scss` | Responsive design, color contrast, focus styles |
| `backend-node` | `*.ts`, `*.js` | Error handling, SQL injection, N+1 queries, API design |
| `backend-python` | `*.py`, `requirements.txt` | Type safety, Django/FastAPI patterns, migration safety |
| `backend-go` | `*.go`, `go.mod` | Error handling, goroutine leaks, race conditions |
| `infrastructure` | `*.tf`, `Dockerfile`, `*.yml` | Terraform, Docker security, CI/CD best practices |
| `security` | _(explicit only)_ | OWASP Top 10, secrets detection, cryptography |

### Custom Skills

Add `.md` files to `.ai-review/skills/` in your repository:

```markdown
---
name: my-api-rules
description: API-specific review guidelines
triggers:
  - "src/api/**"
---

## API Review Rules

- All endpoints must have authentication middleware
- Responses must follow the shared schema
- Rate limiting is required on public endpoints
```

Custom skills override built-in skills with the same name.

## Provider Switching

### Claude (default)

```yaml
- uses: 37108/codeharness@v1
  with:
    claude_api_key: ${{ secrets.CLAUDE_API_KEY }}
    provider: claude
    model: claude-sonnet-4-20250514
```

### GitHub Copilot / OpenAI

```yaml
- uses: 37108/codeharness@v1
  with:
    provider: copilot
    model: gpt-4o
    # Uses GITHUB_TOKEN automatically — no extra API key needed
```

The Copilot provider uses `GITHUB_TOKEN` to authenticate with GitHub Models API — no extra API key needed when your organization has Copilot enabled. Set `OPENAI_BASE_URL` to override the endpoint.

## Progressive Disclosure

CodeHarness does not read the entire codebase. It applies the "Map, not Manual" principle from [harness engineering](https://openai.com/index/harness-engineering/):

1. **Start with the diff** — the PR diff is the primary input
2. **Read the map** — `CLAUDE.md` or `REVIEW_GUIDE.md` provides project context
3. **Explore on demand** — tools (`read_file`, `search_content`, `list_directory`) are used only when the reviewer needs deeper context

This keeps reviews fast and focused, even on large codebases.

See [`templates/REVIEW_GUIDE.md`](templates/REVIEW_GUIDE.md) for a starter template.

## PR Comment Format

CodeHarness posts a structured review comment on each PR:

```
## CodeHarness Review

Decision: ✅ Approved | Provider: claude | Skills: frontend-react | Review time: 12.3s

### Intent Analysis
| PR Description | Implementation | Alignment |
|…             |…              | MATCHES   |

### Findings (0 Critical, 1 Important, 2 Low)

#### 🟡 [F001] Missing error boundary
File: `src/App.tsx:42` | Category: design
…

### Breaking Changes
None detected

---
Reviewed by CodeHarness v1.0.0
```

The comment is updated in-place on subsequent pushes (no comment spam).

## Development

```bash
npm install         # Install dependencies
npm run typecheck   # TypeScript type check
npm run test        # Run tests (Vitest)
npm run check       # Lint + format (Biome)
npm run build       # Bundle with tsup
```

## Architecture

```
src/
├── index.ts              Entry point (GitHub event parsing)
├── orchestrator.ts       Multi-phase review pipeline
├── types.ts              Zod schemas and type definitions
├── config.ts             Configuration loading and validation
├── diff.ts               Diff parsing, filtering, truncation
├── providers/
│   ├── types.ts          AIProvider interface
│   ├── claude.ts         Anthropic SDK provider
│   └── copilot.ts        OpenAI-compatible provider (fetch-based, no SDK)
├── skills/
│   ├── builtin.ts        Built-in skill definitions
│   └── loader.ts         Skill resolution + custom skill loading
├── tools/
│   ├── definitions.ts    Tool definitions for the AI provider
│   └── executor.ts       Tool execution with security controls
├── github/
│   └── client.ts         GitHub API (comments, labels, reviews)
└── prompts/
    ├── review.ts         Phase 1 review prompt
    └── triage.ts         Phase 2 triage prompt
```

## Harness Engineering Principles

CodeHarness applies the [harness engineering](https://openai.com/index/harness-engineering/) framework:

| Principle | How CodeHarness applies it |
|-----------|---------------------------|
| **Progressive Disclosure** | CLAUDE.md as a map; tools for on-demand exploration |
| **Invariants over Micromanagement** | 3 core invariants (Scope, Severity, Evidence) instead of step-by-step instructions |
| **Parse, Don't Validate** | All AI outputs validated through Zod schemas; `submit_review` tool ensures structured JSON |
| **Deterministic Decision Layer** | Phase 3 uses rules, not AI judgment, to approve or reject |
| **Agent Legibility** | Prompts structured for AI comprehension, not human readability |

## License

MIT
