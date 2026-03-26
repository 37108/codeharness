import type Anthropic from '@anthropic-ai/sdk'
import { FindingJsonSchema } from '../zod-to-json-schema.js'

/**
 * Tool definitions for the review phase.
 * These implement progressive disclosure: Claude starts with the diff
 * and uses these tools to explore deeper context as needed.
 */
export function getReviewTools(): Anthropic.Tool[] {
  return [
    {
      name: 'read_file',
      description:
        'Read the contents of a file in the repository. Use this to understand code that is referenced or affected by the PR changes. Follow progressive disclosure: start with the diff, then read related files only when needed to understand context.',
      input_schema: {
        type: 'object' as const,
        properties: {
          path: {
            type: 'string',
            description: 'File path relative to the repository root',
          },
          start_line: {
            type: 'number',
            description: 'Start reading from this line (1-based). Omit to read from the beginning.',
          },
          end_line: {
            type: 'number',
            description: 'Stop reading at this line (1-based). Omit to read to the end.',
          },
        },
        required: ['path'],
      },
    },
    {
      name: 'search_content',
      description:
        'Search file contents using a regex pattern. Returns matching lines with file paths and line numbers. Use this to find usages of functions, types, or patterns across the codebase.',
      input_schema: {
        type: 'object' as const,
        properties: {
          pattern: {
            type: 'string',
            description: 'Regular expression pattern to search for',
          },
          path: {
            type: 'string',
            description: 'Directory or file to search within (relative to repo root). Defaults to "."',
          },
          file_pattern: {
            type: 'string',
            description: 'Glob pattern to filter files (e.g., "*.ts", "*.py")',
          },
        },
        required: ['pattern'],
      },
    },
    {
      name: 'list_directory',
      description:
        'List files and directories at a given path. Use this to understand project structure when needed.',
      input_schema: {
        type: 'object' as const,
        properties: {
          path: {
            type: 'string',
            description: 'Directory path relative to repo root. Defaults to "."',
          },
        },
        required: [],
      },
    },
    {
      name: 'submit_review',
      description:
        'Submit your review findings. Call this ONCE when you have completed your review. Your findings will be triaged and processed by the next phase.',
      input_schema: {
        type: 'object' as const,
        properties: {
          findings: {
            type: 'array',
            description: 'Array of findings from the review',
            items: FindingJsonSchema,
          },
          exploration_summary: {
            type: 'string',
            description:
              'Brief summary of what files you explored and why, to help the triage phase understand your review scope.',
          },
        },
        required: ['findings', 'exploration_summary'],
      },
    },
  ]
}
