import type { ReviewSkill } from './types.js'

/**
 * Built-in review skills shipped with CodeHarness.
 * Modeled after Claude Code's global skills system.
 */

export const BUILTIN_SKILLS: ReviewSkill[] = [
  // --- Frontend ---
  {
    name: 'frontend-react',
    description: 'React component and hooks review',
    triggers: ['*.tsx', '*.jsx', '*.css', '*.scss', '*.module.css'],
    prompt: `## React Review Guidelines

### Hooks Rules
- Hooks must be called at the top level of a component or custom hook, never inside conditions, loops, or nested functions
- Custom hooks must start with "use" prefix
- Dependencies arrays in useEffect/useMemo/useCallback must be complete and accurate
- Flag stale closures: effects that capture variables but don't include them in deps

### Component Patterns
- Flag direct DOM manipulation (document.querySelector etc.) — prefer refs
- Verify keys in lists are stable and unique (not array index for dynamic lists)
- Check for missing error boundaries around components that may throw
- Flag state that can be derived from other state or props (unnecessary state)

### Performance
- Flag expensive computations inside render without useMemo
- Flag inline object/array/function creation in JSX props of memoized children
- Flag missing React.memo on components that receive stable props but re-render often
- Check that event handlers are not recreated on every render unnecessarily

### Accessibility
- Verify interactive elements have accessible names (aria-label, aria-labelledby, or visible text)
- Flag click handlers on non-interactive elements without role and keyboard support
- Check img tags have meaningful alt text (not just "image" or empty for decorative)`,
  },

  {
    name: 'frontend-nextjs',
    description: 'Next.js App Router patterns and conventions',
    triggers: ['**/app/**/*.tsx', '**/app/**/*.ts', 'next.config.*', 'middleware.ts'],
    prompt: `## Next.js App Router Review Guidelines

### Server/Client Boundary
- Verify "use client" directive is only on components that need browser APIs or interactivity
- Flag importing client-only libraries in Server Components
- Check that server actions use "use server" directive
- Flag passing non-serializable props across the server/client boundary

### Data Fetching
- Prefer Server Components for data fetching over client-side useEffect
- Flag waterfall fetches — parallel fetching with Promise.all where possible
- Check that dynamic routes use generateStaticParams for static generation when appropriate

### Metadata & SEO
- Verify pages export metadata or generateMetadata
- Check for missing OpenGraph / Twitter card metadata on public pages

### Performance
- Flag large client bundles — suggest dynamic import with next/dynamic
- Check Image component usage (next/image) instead of raw <img>
- Verify fonts use next/font`,
  },

  {
    name: 'frontend-css',
    description: 'CSS and styling review',
    triggers: ['*.css', '*.scss', '*.less', '*.styled.ts', '*.styled.tsx', 'tailwind.config.*'],
    prompt: `## CSS / Styling Review Guidelines

### Layout
- Flag fixed dimensions (px) where responsive units (rem, %, vw/vh) are more appropriate
- Check for missing overflow handling on containers
- Flag z-index values without clear stacking context management

### Responsiveness
- Verify media queries cover mobile, tablet, and desktop breakpoints
- Flag layouts that only work at one viewport size

### Accessibility
- Check color contrast ratios (text on background)
- Flag font-size below 12px / 0.75rem
- Verify focus styles are visible and not removed (outline: none without replacement)`,
  },

  // --- Backend ---
  {
    name: 'backend-node',
    description: 'Node.js backend review',
    triggers: ['*.ts', '*.js', '*.mts', '*.mjs'],
    prompt: `## Node.js Backend Review Guidelines

### Error Handling
- Verify async functions have proper error handling (try/catch or .catch())
- Flag swallowed errors (empty catch blocks)
- Check that error responses include appropriate status codes and messages
- Flag errors that leak internal details (stack traces, DB queries) to clients

### Security
- Flag SQL/NoSQL injection vectors — verify parameterized queries
- Check for path traversal in file operations — verify input sanitization
- Flag hardcoded secrets, API keys, or credentials
- Verify authentication middleware is applied to protected routes
- Check CORS configuration is not overly permissive (origin: "*" in production)

### Performance
- Flag synchronous file I/O (fs.readFileSync) in request handlers
- Check for missing pagination on list endpoints
- Flag N+1 query patterns in database operations
- Verify database connections are pooled, not created per request

### API Design
- Check that API responses have consistent structure
- Verify input validation at API boundaries (request body, query params, path params)
- Flag missing rate limiting on public endpoints`,
  },

  {
    name: 'backend-python',
    description: 'Python backend review',
    triggers: ['*.py', 'requirements.txt', 'pyproject.toml', 'Pipfile'],
    prompt: `## Python Backend Review Guidelines

### Type Safety
- Check for type annotations on function signatures
- Flag use of Any type where a more specific type is possible
- Verify dataclass/Pydantic model usage for structured data

### Security
- Flag SQL injection: verify parameterized queries or ORM usage
- Check for command injection (subprocess, os.system with user input)
- Flag pickle/eval/exec with untrusted data
- Verify CSRF protection on state-changing endpoints

### Django / FastAPI
- Check for missing authentication/permission decorators
- Flag N+1 queries — verify select_related/prefetch_related usage
- Verify serializer validation for input data
- Check migration safety (data-loss operations, long-running migrations)

### Performance
- Flag blocking I/O in async handlers
- Check for missing database indexes on frequently queried fields
- Flag unbounded list operations without pagination`,
  },

  {
    name: 'backend-go',
    description: 'Go backend review',
    triggers: ['*.go', 'go.mod', 'go.sum'],
    prompt: `## Go Review Guidelines

### Error Handling
- Flag ignored errors (_, err := ... without checking err)
- Check that errors are wrapped with context (fmt.Errorf with %w)
- Verify error types are used for distinguishing error cases

### Concurrency
- Flag goroutine leaks (goroutines without cancellation context)
- Check for race conditions on shared state (missing mutex or channels)
- Verify context.Context is propagated through call chains

### Security
- Flag SQL injection — verify parameterized queries
- Check for path traversal in file operations
- Verify TLS configuration is not disabled

### Performance
- Flag unnecessary allocations in hot paths
- Check for missing connection pooling
- Verify defer is used correctly (not in loops creating many defers)`,
  },

  // --- Infrastructure ---
  {
    name: 'infrastructure',
    description: 'Infrastructure as Code review',
    triggers: [
      '*.tf',
      '*.tfvars',
      'Dockerfile',
      'docker-compose.*',
      '*.yaml',
      '*.yml',
      'Makefile',
      '.github/workflows/*',
    ],
    prompt: `## Infrastructure Review Guidelines

### Terraform
- Verify resources have appropriate tags for cost tracking
- Flag hardcoded values that should be variables
- Check for missing lifecycle rules on critical resources
- Verify state backend is configured (not local)

### Docker
- Flag running as root in production containers
- Check for pinned base image versions (not :latest)
- Verify multi-stage builds to minimize image size
- Flag COPY of unnecessary files (check .dockerignore)

### CI/CD
- Flag secrets exposed in workflow logs (ensure masking)
- Verify workflow permissions follow least-privilege principle
- Check for missing timeout on jobs
- Flag unversioned action references (use SHA instead of @main)`,
  },

  // --- Security (always-on deep scan) ---
  {
    name: 'security',
    description: 'Deep security review across all languages',
    triggers: [], // Must be explicitly enabled or triggered by sensitive file patterns
    prompt: `## Security Deep Scan Guidelines

### OWASP Top 10
1. **Injection**: SQL, NoSQL, OS command, LDAP injection vectors
2. **Broken Authentication**: Weak password policies, missing MFA, insecure session management
3. **Sensitive Data Exposure**: Unencrypted data at rest/in transit, excessive data in responses
4. **XXE**: XML external entity processing
5. **Broken Access Control**: Missing authorization checks, IDOR vulnerabilities
6. **Security Misconfiguration**: Default credentials, unnecessary features enabled
7. **XSS**: Reflected, stored, DOM-based cross-site scripting
8. **Insecure Deserialization**: Untrusted data deserialization
9. **Using Components with Known Vulnerabilities**: Outdated dependencies
10. **Insufficient Logging**: Missing audit trails for security events

### Secrets Detection
- API keys, tokens, passwords in source code
- Private keys, certificates committed to the repo
- Connection strings with embedded credentials

### Cryptography
- Flag weak algorithms (MD5, SHA1 for security, DES, RC4)
- Verify proper IV/nonce usage (not reused, not zero)
- Check for proper random number generation (crypto.randomBytes, not Math.random)`,
  },
]
