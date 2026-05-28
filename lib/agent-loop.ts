/**
 * MAYA Agent Loop — QueryEngine-inspired agentic execution
 *
 * Adapted from Claude Code's QueryEngine pattern:
 * observe → plan → select tool → execute → feed result back → loop
 *
 * Each agent call is a controlled loop with:
 * - Max iteration guard (prevents runaway)
 * - Token tracking per call
 * - Tool permission checks before execution
 * - Structured result extraction
 */

import { getNimClient, nimCallWithRetry, type ModelConfig, type ChatMessage } from './nim-client'
import type { MayaTool } from './tools/registry'
import type { ChatCompletion } from 'openai/resources/chat/completions'
import type { ChatCompletionCreateParamsNonStreaming } from 'openai/resources/chat/completions'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AgentConfig {
  model: ModelConfig
  systemPrompt: string
  userInput: string
  tools?: MayaTool[]
  maxIterations?: number
  maxTokensOverride?: number
  /** Inject caveman prefix into system prompt */
  caveman?: boolean
}

export interface AgentResult {
  content: string
  messages: ChatMessage[]
  toolCalls: number
  iterations: number
  model: string
}

// ─── Agent Loop ───────────────────────────────────────────────────────────────

export async function agentLoop(config: AgentConfig): Promise<AgentResult> {
  const {
    model,
    systemPrompt,
    userInput,
    tools = [],
    maxIterations = 10,
    maxTokensOverride,
    caveman = true,
  } = config

  const prefix = caveman ? '[CAVEMAN] ' : ''
  const messages: ChatMessage[] = [
    { role: 'system', content: `${prefix}${systemPrompt}` },
    { role: 'user', content: userInput },
  ]

  let totalToolCalls = 0

  // Convert MAYA tools to OpenAI function-calling format
  const openAITools = tools.length > 0
    ? tools.map(t => t.toOpenAITool())
    : undefined

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    const response = await nimCallWithRetry(async (client) => {
      const params: Record<string, unknown> = {
        model: model.id,
        messages,
        max_tokens: maxTokensOverride ?? model.maxTokens,
        temperature: model.temperature ?? 1,
        top_p: model.topP ?? 1,
      }

      if (model.thinking) {
        params.chat_template_kwargs = model.thinking
      }

      if (openAITools) {
        params.tools = openAITools
      }

      return client.chat.completions.create(params as unknown as ChatCompletionCreateParamsNonStreaming) as Promise<ChatCompletion>
    })

    const choice = response.choices[0]
    if (!choice) {
      return {
        content: '',
        messages,
        toolCalls: totalToolCalls,
        iterations: iteration + 1,
        model: model.id,
      }
    }

    const assistantMessage = choice.message

    // No tool calls = agent is done
    if (
      choice.finish_reason === 'stop' ||
      !assistantMessage.tool_calls ||
      assistantMessage.tool_calls.length === 0
    ) {
      return {
        content: assistantMessage.content ?? '',
        messages,
        toolCalls: totalToolCalls,
        iterations: iteration + 1,
        model: model.id,
      }
    }

    // Push assistant message with tool calls
    messages.push({
      role: 'assistant',
      content: assistantMessage.content ?? '',
      tool_calls: assistantMessage.tool_calls,
    })

    // Execute each tool call sequentially (Claude Code isConcurrencySafe pattern)
    for (const toolCall of assistantMessage.tool_calls) {
      // Skip non-function tool calls (OpenAI SDK v4 union type)
      if (toolCall.type !== 'function') continue

      totalToolCalls++
      const toolName = toolCall.function.name
      const tool = tools.find(t => t.name === toolName)

      if (!tool) {
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify({ error: `Unknown tool: ${toolName}` }),
        })
        continue
      }

      // Permission check (Claude Code checkPermissions pattern)
      let args: Record<string, unknown>
      try {
        args = JSON.parse(toolCall.function.arguments)
      } catch {
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify({ error: 'Invalid JSON arguments' }),
        })
        continue
      }

      const permitted = await tool.checkPermission(args)
      if (!permitted) {
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify({ error: `Permission denied: ${toolName}` }),
        })
        continue
      }

      // Execute tool
      try {
        const result = await tool.execute(args)
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: typeof result === 'string' ? result : JSON.stringify(result),
        })
      } catch (e: unknown) {
        const errorMsg = e instanceof Error ? e.message : String(e)
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify({ error: errorMsg }),
        })
      }
    }
  }

  // Max iterations reached — return last content
  const lastAssistant = messages.filter(m => m.role === 'assistant').pop()
  return {
    content: typeof lastAssistant?.content === 'string' ? lastAssistant.content : '',
    messages,
    toolCalls: totalToolCalls,
    iterations: maxIterations,
    model: model.id,
  }
}

// ─── Simple Chat (no tool loop) ───────────────────────────────────────────────
// For agents that just need a single completion (Observer, Intent, autoDream)

export async function simpleChat(config: {
  model: ModelConfig
  systemPrompt: string
  userInput: string
  caveman?: boolean
  responseFormat?: { type: 'json_object' | 'text' }
  maxTokensOverride?: number
}): Promise<string> {
  const {
    model,
    systemPrompt,
    userInput,
    caveman = true,
    responseFormat,
    maxTokensOverride,
  } = config

  const prefix = caveman ? '[CAVEMAN] ' : ''

  const result = await nimCallWithRetry(async (client) => {
    const params: Record<string, unknown> = {
      model: model.id,
      messages: [
        { role: 'system', content: `${prefix}${systemPrompt}` },
        { role: 'user', content: userInput },
      ],
      max_tokens: maxTokensOverride ?? model.maxTokens,
      temperature: model.temperature ?? 1,
      top_p: model.topP ?? 1,
    }

    if (model.thinking) {
      params.chat_template_kwargs = model.thinking
    }

    if (responseFormat) {
      params.response_format = responseFormat
    }

    return client.chat.completions.create(params as unknown as ChatCompletionCreateParamsNonStreaming)
  })

  return result.choices[0]?.message?.content ?? ''
}

// ─── JSON Chat (with parsing) ─────────────────────────────────────────────────

export async function simpleChatJSON<T = unknown>(config: {
  model: ModelConfig
  systemPrompt: string
  userInput: string
  caveman?: boolean
  maxTokensOverride?: number
}): Promise<T> {
  const raw = await simpleChat({
    ...config,
    responseFormat: { type: 'json_object' },
  })

  try {
    return JSON.parse(raw) as T
  } catch {
    // Attempt extraction from markdown code block
    const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (jsonMatch?.[1]) {
      return JSON.parse(jsonMatch[1].trim()) as T
    }
    throw new Error(`[agent] Invalid JSON: ${raw.slice(0, 300)}`)
  }
}
