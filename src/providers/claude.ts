import Anthropic from '@anthropic-ai/sdk'
import type {
  AIProvider,
  ChatParams,
  ProviderMessage,
  ProviderResponse,
  ProviderToolCall,
  ToolDefinition,
} from './types.js'

export class ClaudeProvider implements AIProvider {
  readonly name = 'claude' as const
  private readonly client: Anthropic

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey })
  }

  async chat(params: ChatParams): Promise<ProviderResponse> {
    const messages = params.messages.map((message) => this.toAnthropicMessage(message))

    const tools: Anthropic.Tool[] | undefined = params.tools?.map((tool) =>
      this.toAnthropicTool(tool),
    )

    const response = await this.client.messages.create({
      model: params.systemPrompt.includes('triage') ? this.getModel(params) : this.getModel(params),
      max_tokens: params.maxTokens,
      system: params.systemPrompt,
      messages,
      ...(tools && tools.length > 0 ? { tools } : {}),
    })

    return this.fromAnthropicResponse(response)
  }

  private getModel(params: ChatParams): string {
    // Model is controlled by config, passed through system prompt context
    // Default fallback
    return (params as ChatParams & { model?: string }).model ?? 'claude-sonnet-4-20250514'
  }

  private toAnthropicMessage(message: ProviderMessage): Anthropic.MessageParam {
    if (message.role === 'user' && 'toolResults' in message) {
      return {
        role: 'user',
        content: message.toolResults.map((result) => ({
          type: 'tool_result' as const,
          tool_use_id: result.toolCallId,
          content: result.content,
        })),
      }
    }

    if (message.role === 'assistant') {
      const content: Array<Anthropic.TextBlock | Anthropic.ToolUseBlock> = []
      if (message.content) {
        content.push({
          type: 'text',
          text: message.content,
          citations: null,
        } as Anthropic.TextBlock)
      }
      for (const toolCall of message.toolCalls) {
        content.push({
          type: 'tool_use',
          id: toolCall.id,
          name: toolCall.name,
          input: toolCall.input,
        } as Anthropic.ToolUseBlock)
      }
      return { role: 'assistant', content: content as Anthropic.ContentBlock[] }
    }

    return {
      role: 'user',
      content: message.content,
    }
  }

  private toAnthropicTool(tool: ToolDefinition): Anthropic.Tool {
    return {
      name: tool.name,
      description: tool.description,
      input_schema: tool.input_schema as Anthropic.Tool['input_schema'],
    }
  }

  private fromAnthropicResponse(response: Anthropic.Message): ProviderResponse {
    const textContent = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('\n')

    const toolCalls: ProviderToolCall[] = response.content
      .filter((block): block is Anthropic.ToolUseBlock => block.type === 'tool_use')
      .map((block) => ({
        id: block.id,
        name: block.name,
        input: block.input as Record<string, unknown>,
      }))

    return {
      stopReason: response.stop_reason === 'tool_use' ? 'tool_use' : 'end_turn',
      textContent,
      toolCalls,
    }
  }
}
