/**
 * Executor - Tool Execution Loop
 *
 * Core execution loop that runs tools and handles agent responses.
 */

import type {
  Message,
  Tool,
  ToolSchema,
  ToolResult,
  ToolCallLog,
  ToolContext,
  ContentBlock,
  ToolUseBlock,
  ToolResultBlock,
  LLMProvider,
  LLMOptions,
  LogProvider,
  AgentResult,
  PendingQuestion
} from './types.js'
import { ContextManager } from './context-manager.js'
import { TaskManager } from './tools/tasks.js'

const ASK_USER_TOOL_NAME = '__ask_user__'

export interface ExecutorConfig {
  systemPrompt: string
  tools: Tool[]
  llm: LLMProvider
  logger?: LogProvider
  maxIterations: number
  contextManager: ContextManager
  taskManager: TaskManager
  llmOptions?: LLMOptions

  /** AbortSignal for cancellation */
  signal?: AbortSignal

  /** Async function to check if should continue */
  shouldContinue?: () => Promise<boolean>

  /** Trace builder for execution tracing */
  traceBuilder?: import('./trace.js').TraceBuilder
}

/**
 * Extract text from content blocks
 */
function extractText(content: ContentBlock[]): string {
  return content
    .filter((block): block is { type: 'text'; text: string } => block.type === 'text')
    .map(block => block.text)
    .join('\n')
}

/**
 * Extract thinking blocks
 */
function extractThinking(content: ContentBlock[]): string[] {
  return content
    .filter((block): block is { type: 'thinking'; thinking: string } => block.type === 'thinking')
    .map(block => block.thinking)
}

/**
 * Convert tools to schemas for LLM
 */
function toolsToSchemas(tools: Tool[]): ToolSchema[] {
  return tools.map(tool => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.parameters
  }))
}

/**
 * Truncate and stringify data for logging
 */
function truncateForLog(data: unknown, maxLength = 500): string {
  const str = JSON.stringify(data)
  if (str.length <= maxLength) return str
  return str.slice(0, maxLength) + `... (${str.length} chars total)`
}

/**
 * Execute a single tool
 */
async function executeTool(
  tool: Tool,
  params: Record<string, unknown>,
  context: ToolContext,
  logger?: LogProvider
): Promise<{ result: ToolResult; durationMs: number }> {
  const startTime = Date.now()

  // Progress: tool starting (with context for specific tools)
  let progressMessage = `Running ${tool.name}...`
  if (tool.name === 'TaskCreate') {
    const subject = (params as { subject?: string }).subject
    progressMessage = subject ? `Creating task: "${subject}"...` : 'Creating task...'
  } else if (tool.name === 'TaskUpdate') {
    const status = (params as { status?: string }).status
    if (status === 'completed') {
      progressMessage = 'Marking task complete...'
    } else if (status === 'in_progress') {
      progressMessage = 'Starting task...'
    } else if (status === 'deleted') {
      progressMessage = 'Deleting task...'
    } else {
      progressMessage = 'Updating task...'
    }
  } else if (tool.name === 'TaskList') {
    progressMessage = 'Checking tasks...'
  } else if (tool.name === 'TaskGet') {
    progressMessage = 'Getting task details...'
  } else if (tool.name === '__sub_agent__') {
    const agent = (params as { agent?: string }).agent
    progressMessage = `Delegating to ${agent}...`
  } else if (tool.name === '__shell__') {
    const command = (params as { command?: string }).command
    if (command) {
      // Show the full command, truncated if too long
      const truncated = command.length > 80 ? command.slice(0, 80) + '...' : command
      progressMessage = `$ ${truncated}`
    }
  }

  logger?.onProgress?.({
    type: 'tool_start',
    message: progressMessage,
    details: { toolName: tool.name }
  })

  // Log tool execution details
  logger?.debug(`[Tool: ${tool.name}] Executing with params: ${truncateForLog(params)}`)
  logger?.debug(`[Tool: ${tool.name}] Context: conversationId=${context.conversationId}, userId=${context.userId}, remainingTokens=${context.remainingTokens}`)

  logger?.onToolCall?.(tool.name, params)

  try {
    const result = await tool.execute(params, context)
    const durationMs = Date.now() - startTime

    // Log result details
    logger?.debug(`[Tool: ${tool.name}] Completed in ${durationMs}ms, success=${result.success}`)
    if (result.success) {
      if (result.data !== undefined) {
        logger?.debug(`[Tool: ${tool.name}] Result data: ${truncateForLog(result.data)}`)
      }
    } else {
      logger?.warn(`[Tool: ${tool.name}] Error: ${result.error}`)
    }

    // Progress: tool completed (with result context)
    let completionMessage = `${tool.name} completed`
    if (!result.success) {
      completionMessage = `${tool.name} failed: ${result.error}`
    } else if (tool.name === '__shell__') {
      const command = (params as { command?: string }).command
      if (command) {
        const truncated = command.length > 80 ? command.slice(0, 80) + '...' : command
        completionMessage = `$ ${truncated}`
      }
    } else {
      const isTaskTool = ['TaskCreate', 'TaskUpdate', 'TaskGet', 'TaskList'].includes(tool.name)
      if (isTaskTool && result.data) {
        const data = result.data as { message?: string }
        if (data.message) {
          completionMessage = data.message
        }
      }
    }

    logger?.onProgress?.({
      type: 'tool_end',
      message: completionMessage,
      details: { toolName: tool.name, duration: durationMs, success: result.success }
    })

    logger?.onToolResult?.(tool.name, result, durationMs)

    return { result, durationMs }
  } catch (error) {
    const durationMs = Date.now() - startTime
    const errorMessage = error instanceof Error ? error.message : String(error)
    const errorStack = error instanceof Error ? error.stack : undefined

    logger?.error(`[Tool: ${tool.name}] Exception after ${durationMs}ms: ${errorMessage}`)
    if (errorStack) {
      logger?.debug(`[Tool: ${tool.name}] Stack trace: ${errorStack}`)
    }

    const result: ToolResult = {
      success: false,
      error: errorMessage
    }

    // Progress: tool failed
    logger?.onProgress?.({
      type: 'tool_end',
      message: `${tool.name} failed`,
      details: { toolName: tool.name, duration: durationMs, success: false }
    })

    logger?.onToolResult?.(tool.name, result, durationMs)

    return { result, durationMs }
  }
}

/**
 * Check if execution should be interrupted
 */
async function checkInterruption(
  signal?: AbortSignal,
  shouldContinue?: () => Promise<boolean>
): Promise<'aborted' | 'stopped' | null> {
  // Check AbortSignal
  if (signal?.aborted) {
    return 'aborted'
  }

  // Check shouldContinue callback
  if (shouldContinue) {
    const continueExecution = await shouldContinue()
    if (!continueExecution) {
      return 'stopped'
    }
  }

  return null
}

/**
 * Build interrupted result
 */
function buildInterruptedResult(
  reason: 'aborted' | 'stopped' | 'max_iterations',
  iteration: number,
  messages: Message[],
  toolCallLogs: ToolCallLog[],
  thinkingBlocks: string[],
  taskManager: TaskManager
): AgentResult {
  const tasks = taskManager.getAll()

  return {
    response: '',
    history: messages,
    toolCalls: toolCallLogs,
    thinking: thinkingBlocks.length > 0 ? thinkingBlocks : undefined,
    tasks: tasks.length > 0 ? tasks : undefined,
    status: 'interrupted',
    interrupted: {
      reason,
      iterationsCompleted: iteration
    }
  }
}

/**
 * Main execution loop
 */
export async function executeLoop(
  config: ExecutorConfig,
  initialMessages: Message[],
  toolContext: ToolContext
): Promise<AgentResult> {
  const {
    systemPrompt,
    tools,
    llm,
    logger,
    maxIterations,
    contextManager,
    taskManager,
    llmOptions,
    signal,
    shouldContinue,
    traceBuilder
  } = config

  const messages = [...initialMessages]
  const toolCallLogs: ToolCallLog[] = []
  const thinkingBlocks: string[] = []
  const toolSchemas = toolsToSchemas(tools)
  const modelId = llm.getModelId?.() || 'unknown'

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    // Check for interruption at start of each iteration
    const interruptReason = await checkInterruption(signal, shouldContinue)
    if (interruptReason) {
      logger?.onProgress?.({
        type: 'status',
        message: `Interrupted: ${interruptReason}`
      })
      return buildInterruptedResult(
        interruptReason,
        iteration,
        messages,
        toolCallLogs,
        thinkingBlocks,
        taskManager
      )
    }

    logger?.onIteration?.(iteration, messages.length)

    // Progress: thinking
    logger?.onProgress?.({
      type: 'thinking',
      message: iteration === 0 ? 'Thinking...' : 'Processing...'
    })

    // Manage context (truncate/summarize if needed)
    const managedMessages = await contextManager.manageContext(messages)

    // Call LLM with timing
    const llmStartTime = Date.now()
    const response = await llm.chat(
      systemPrompt,
      managedMessages,
      toolSchemas,
      llmOptions
    )
    const llmDurationMs = Date.now() - llmStartTime

    // Record usage in trace
    if (response.usage) {
      traceBuilder?.recordLLMCall(
        modelId,
        response.usage.inputTokens,
        response.usage.outputTokens,
        llmDurationMs,
        {
          cacheCreationTokens: response.cacheUsage?.cacheCreationInputTokens,
          cacheReadTokens: response.cacheUsage?.cacheReadInputTokens,
          systemPrompt,
          messages: managedMessages,
          response: response.content
        }
      )
    }

    // Collect thinking blocks
    thinkingBlocks.push(...extractThinking(response.content))

    // Add assistant message to history
    messages.push({ role: 'assistant', content: response.content })

    // Check if done (no tool use)
    if (response.stopReason !== 'tool_use') {
      const tasks = taskManager.getAll()
      const incompleteTasks = tasks.filter(t => t.status !== 'completed')

      // If there are incomplete tasks, force the agent to continue working
      if (incompleteTasks.length > 0) {
        logger?.onProgress?.({
          type: 'status',
          message: `${incompleteTasks.length} tasks remaining, continuing...`
        })

        // Add a reminder to continue working on tasks
        const reminderContent = `You have ${incompleteTasks.length} incomplete task(s) in your task list:\n${
          incompleteTasks.map(t => `- ${t.status === 'in_progress' ? '[IN PROGRESS] ' : ''}${t.subject}`).join('\n')
        }\n\nYou MUST continue working on these tasks. Use the TaskUpdate tool with status "completed" after finishing each task. Do not respond to the user until all tasks are completed.`

        messages.push({
          role: 'user',
          content: reminderContent
        })

        // Continue the loop instead of returning
        continue
      }

      const result: AgentResult = {
        response: extractText(response.content),
        history: messages,
        toolCalls: toolCallLogs,
        thinking: thinkingBlocks.length > 0 ? thinkingBlocks : undefined,
        tasks: tasks.length > 0 ? tasks : undefined,
        status: 'complete'
      }

      logger?.onComplete?.(result)
      return result
    }

    // Execute tool calls
    const toolUseBlocks = response.content.filter(
      (block): block is ToolUseBlock => block.type === 'tool_use'
    )

    const toolResults: ToolResultBlock[] = []

    for (const toolUse of toolUseBlocks) {
      // Check for interruption between tool calls
      const toolInterruptReason = await checkInterruption(signal, shouldContinue)
      if (toolInterruptReason) {
        logger?.onProgress?.({
          type: 'status',
          message: `Interrupted between tools: ${toolInterruptReason}`
        })
        return buildInterruptedResult(
          toolInterruptReason,
          iteration,
          messages,
          toolCallLogs,
          thinkingBlocks,
          taskManager
        )
      }

      // Handle ask_user tool specially
      if (toolUse.name === ASK_USER_TOOL_NAME) {
        const input = toolUse.input as {
          questions?: import('./types.js').EnhancedQuestion[]
        }

        // Build pendingQuestion from questions array
        const questions = input.questions && Array.isArray(input.questions) && input.questions.length > 0
          ? input.questions
          : [{ question: 'The assistant needs more information. Please provide additional details.' }]

        const pendingQuestion: PendingQuestion = { questions }

        const tasks = taskManager.getAll()
        return {
          response: '',
          history: messages,
          toolCalls: toolCallLogs,
          thinking: thinkingBlocks.length > 0 ? thinkingBlocks : undefined,
          tasks: tasks.length > 0 ? tasks : undefined,
          pendingQuestion,
          status: 'needs_input'
        }
      }

      // Find and execute the tool
      const tool = tools.find(t => t.name === toolUse.name)

      if (!tool) {
        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: JSON.stringify({ success: false, error: `Unknown tool: ${toolUse.name}` }),
          is_error: true
        })
        continue
      }

      const { result, durationMs } = await executeTool(
        tool,
        toolUse.input,
        toolContext,
        logger
      )

      toolCallLogs.push({
        name: toolUse.name,
        input: toolUse.input,
        output: result,
        durationMs
      })

      // Record in trace
      traceBuilder?.recordToolCall(toolUse.name, toolUse.input, result, durationMs)

      // If a sub-agent needs user input, propagate needs_input immediately
      // We add the __sub_agent__ tool result to history, then synthesize an __ask_user__
      // tool call so the existing resume logic in agent.ts works correctly
      if (toolUse.name === '__sub_agent__' && !result.success && result.error === 'Sub-agent needs user input' && result.data) {
        const subAgentData = result.data as { questions?: import('./types.js').EnhancedQuestion[] }
        if (subAgentData.questions && Array.isArray(subAgentData.questions) && subAgentData.questions.length > 0) {
          // Add the __sub_agent__ tool result to close the pending tool_use
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: JSON.stringify(result),
            is_error: true
          })
          messages.push({ role: 'user', content: toolResults })

          // Synthesize an __ask_user__ tool call so resume logic works
          const syntheticAskUserId = `synthetic_ask_user_${Date.now()}`
          messages.push({
            role: 'assistant',
            content: [{
              type: 'tool_use',
              id: syntheticAskUserId,
              name: ASK_USER_TOOL_NAME,
              input: { questions: subAgentData.questions }
            }]
          })

          const pendingQuestion: PendingQuestion = { questions: subAgentData.questions }
          const tasks = taskManager.getAll()
          return {
            response: '',
            history: messages,
            toolCalls: toolCallLogs,
            thinking: thinkingBlocks.length > 0 ? thinkingBlocks : undefined,
            tasks: tasks.length > 0 ? tasks : undefined,
            pendingQuestion,
            status: 'needs_input'
          }
        }
      }

      toolResults.push({
        type: 'tool_result',
        tool_use_id: toolUse.id,
        content: JSON.stringify(result),
        is_error: !result.success
      })
    }

    // Add tool results as user message
    messages.push({ role: 'user', content: toolResults })
  }

  // Max iterations reached - return as interrupted instead of throwing
  logger?.onProgress?.({
    type: 'status',
    message: `Max iterations (${maxIterations}) reached`
  })

  return buildInterruptedResult(
    'max_iterations',
    maxIterations,
    messages,
    toolCallLogs,
    thinkingBlocks,
    taskManager
  )
}
