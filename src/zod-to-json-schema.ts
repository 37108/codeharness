/**
 * JSON Schema definition for a single Finding, matching FindingSchema in types.ts.
 * Written inline rather than converting Zod → JSON Schema dynamically,
 * to avoid relying on Zod's internal _def API.
 */
export const FindingJsonSchema = {
  type: 'object' as const,
  properties: {
    id: { type: 'string' as const, description: 'Unique finding ID (e.g., "F001")' },
    file: { type: 'string' as const, description: 'File path relative to repository root' },
    line: { type: 'number' as const, description: 'Line number (1-based)' },
    severity: {
      type: 'string' as const,
      enum: ['CRITICAL', 'IMPORTANT', 'LOW'],
      description: 'Severity level',
    },
    category: {
      type: 'string' as const,
      enum: ['security', 'correctness', 'logic', 'design', 'performance', 'style'],
      description: 'Finding category',
    },
    title: { type: 'string' as const, description: 'Short title of the issue' },
    description: { type: 'string' as const, description: 'Detailed description of the issue' },
    suggestion: { type: 'string' as const, description: 'Suggested fix or approach' },
  },
  required: ['id', 'file', 'severity', 'category', 'title', 'description'],
}
