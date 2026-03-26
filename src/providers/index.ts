import { ClaudeProvider } from './claude.js'
import { CopilotProvider } from './copilot.js'
import type { AIProvider, ProviderType } from './types.js'

export type {
  AIProvider,
  ChatParams,
  ProviderMessage,
  ProviderResponse,
  ProviderToolCall,
  ProviderToolResult,
  ProviderType,
  ToolDefinition,
} from './types.js'

/**
 * Create an AI provider instance based on configuration.
 */
export function createProvider(
  providerType: ProviderType,
  apiKey: string,
  options?: { baseUrl?: string },
): AIProvider {
  switch (providerType) {
    case 'claude':
      return new ClaudeProvider(apiKey)
    case 'copilot':
      return new CopilotProvider(apiKey, options?.baseUrl)
    default:
      throw new Error(`Unknown provider: ${providerType as string}`)
  }
}
