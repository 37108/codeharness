import type {
  AIProvider,
  ChatParams,
  ProviderMessage,
  ProviderResponse,
  ProviderToolCall,
  ToolDefinition,
} from './types.js'

/**
 * OpenAI-compatible provider for GitHub Copilot / GitHub Models / OpenAI API.
 *
 * Uses the OpenAI Chat Completions API format, which is compatible with:
 * - GitHub Models (https://models.github.com/v1)
 * - OpenAI API (https://api.openai.com/v1)
 * - Azure OpenAI
 *
 * No SDK dependency — uses native fetch for maximum portability.
 */
export class CopilotProvider implements AIProvider {
  readonly name = 'copilot' as const
  private readonly apiKey: string
  private readonly baseUrl: string

  constructor(apiKey: string, baseUrl?: string) {
    this.apiKey = apiKey
    // Default to GitHub Models endpoint; falls back to OpenAI if OPENAI_BASE_URL is set
    this.baseUrl = baseUrl ?? process.env.OPENAI_BASE_URL ?? 'https://models.github.com/v1'
  }

  async chat(params: ChatParams): Promise<ProviderResponse> {
    const messages = this.buildMessages(params.systemPrompt, params.messages)
    const tools = params.tools?.map((tool) => this.toOpenAITool(tool))

    const body: Record<string, unknown> = {
      model: (params as ChatParams & { model?: string }).model ?? 'gpt-4o',
      messages,
      max_tokens: params.maxTokens,
    }

    if (tools && tools.length > 0) {
      body.tools = tools
      body.tool_choice = 'auto'
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Copilot API error (${response.status}): ${errorText}`)
    }

    const data = (await response.json()) as OpenAIResponse
    return this.fromOpenAIResponse(data)
  }

  private buildMessages(systemPrompt: string, messages: ProviderMessage[]): OpenAIMessage[] {
    const result: OpenAIMessage[] = [{ role: 'system', content: systemPrompt }]

    for (const message of messages) {
      if (message.role === 'user' && 'toolResults' in message) {
        for (const toolResult of message.toolResults) {
          result.push({
            role: 'tool',
            tool_call_id: toolResult.toolCallId,
            content: toolResult.content,
          })
        }
      } else if (message.role === 'assistant') {
        const assistantMessage: OpenAIMessage = {
          role: 'assistant',
          content: message.content || null,
        }
        if (message.toolCalls.length > 0) {
          assistantMessage.tool_calls = message.toolCalls.map((toolCall) => ({
            id: toolCall.id,
            type: 'function' as const,
            function: {
              name: toolCall.name,
              arguments: JSON.stringify(toolCall.input),
            },
          }))
        }
        result.push(assistantMessage)
      } else {
        result.push({
          role: 'user',
          content: message.content,
        })
      }
    }

    return result
  }

  private toOpenAITool(tool: ToolDefinition): OpenAITool {
    return {
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.input_schema,
      },
    }
  }

  private fromOpenAIResponse(data: OpenAIResponse): ProviderResponse {
    const choice = data.choices[0]
    if (!choice) {
      return { stopReason: 'end_turn', textContent: '', toolCalls: [] }
    }

    const message = choice.message
    const toolCalls: ProviderToolCall[] = (message.tool_calls ?? []).map((toolCall) => ({
      id: toolCall.id,
      name: toolCall.function.name,
      input: JSON.parse(toolCall.function.arguments) as Record<string, unknown>,
    }))

    return {
      stopReason: choice.finish_reason === 'tool_calls' ? 'tool_use' : 'end_turn',
      textContent: message.content ?? '',
      toolCalls,
    }
  }
}

// --- OpenAI API types (minimal, no SDK needed) ---

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_calls?: OpenAIToolCall[]
  tool_call_id?: string
}

interface OpenAIToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

interface OpenAITool {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

interface OpenAIResponse {
  choices: Array<{
    message: {
      content: string | null
      tool_calls?: OpenAIToolCall[]
    }
    finish_reason: string
  }>
}
