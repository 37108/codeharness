# Review Guide

> This file is the **progressive disclosure entry point** for CodeHarness.
> It provides a "map" of the project — enough context for the AI reviewer
> to know WHERE to look and WHAT matters, without exhaustive documentation.

## Project Overview
<!-- What does this project do? (1-2 sentences) -->

## Architecture
<!-- Key directories and their responsibilities -->
<!-- Example:
- `src/features/` — Feature-based modules (API, components, models)
- `src/components/` — Shared UI components
- `src/app/` — Next.js App Router pages
-->

## Key Conventions
<!-- Most important coding conventions to enforce -->
<!-- Example:
- All API responses are validated with Zod schemas at the boundary
- Error handling: throw at boundaries, return Result types internally
- Prefer composition over inheritance
-->

## Critical Paths
<!-- Code paths that require extra-careful review -->
<!-- Example:
- Authentication: `src/auth/` — any changes here need human review
- Payment processing: `src/billing/` — security-sensitive
- Data migrations: `prisma/migrations/` — irreversible in production
-->

## Known Technical Debt
<!-- Issues that should NOT be flagged in reviews -->
<!-- Example:
- Legacy `any` types in `src/legacy/` — planned migration in Q2
- Duplicate validation in `src/api/handlers.ts` — will be consolidated
-->

## Security Considerations
<!-- Areas needing extra attention -->
<!-- Example:
- User input is sanitized in `src/middleware/sanitize.ts`
- API keys are stored in environment variables, never in code
-->

## Testing Requirements
<!-- What testing standards to enforce -->
<!-- Example:
- New features require unit tests
- API endpoint changes require integration tests
- Minimum coverage: 80% for new code
-->
