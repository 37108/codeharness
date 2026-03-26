/**
 * Provider abstraction layer.
 * Allows switching between Claude (Anthropic) and Copilot (OpenAI-compatible).
 */

export type ProviderType = 'claude' | 'copilot'

/** Unified tool definition that both providers can consume */
export interface ToolDefinition {
  name: string
  description: string
  input_schema: Record<string, unknown>
}

/** A tool call returned by the provider */
export interface ProviderToolCall {
  id: string
  name: string
  input: Record<string, unknown>
}

/** Result of a tool call to feed back to the provider */
export interface ProviderToolResult {
  toolCallId: string
  content: string
}

/** Unified message types */
export type ProviderMessage =
  | { role: 'user'; content: string }
  | { role: 'user'; toolResults: ProviderToolResult[] }
  | { role: 'assistant'; content: string; toolCalls: ProviderToolCall[] }

/** Response from a provider chat call */
export interface ProviderResponse {
  stopReason: 'end_turn' | 'tool_use'
  textContent: string
  toolCalls: ProviderToolCall[]
}

/** Chat request parameters */
export interface ChatParams {
  systemPrompt: string
  messages: ProviderMessage[]
  tools?: ToolDefinition[]
  maxTokens: number
}

/** The interface every AI provider must implement */
export interface AIProvider {
  readonly name: ProviderType
  chat(params: ChatParams): Promise<ProviderResponse>
}
