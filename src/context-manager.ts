/**
 * Context Management
 *
 * Token estimation and context management utilities.
 */

import type { Message, ContentBlock, ContextStrategy, ToolUseBlock, ToolResultBlock, LLMProvider } from './types.js'
import { microCompact, summarizeMessages } from './summarizer.js'

/**
 * Estimate token count from text (approximately 4 chars per token)
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

/**
 * Estimate tokens for a message
 */
export function estimateMessageTokens(message: Message): number {
  if (typeof message.content === 'string') {
    return estimateTokens(message.content)
  }

  return message.content.reduce((sum, block) => {
    return sum + estimateContentBlockTokens(block)
  }, 0)
}

/**
 * Estimate tokens for a content block
 */
export function estimateContentBlockTokens(block: ContentBlock): number {
  switch (block.type) {
    case 'text':
      return estimateTokens(block.text)
    case 'thinking':
      return estimateTokens(block.thinking)
    case 'tool_use':
      return estimateTokens(block.name) + estimateTokens(JSON.stringify(block.input))
    case 'tool_result':
      return estimateTokens(block.content)
    default:
      return 0
  }
}

/**
 * Estimate total tokens for all messages
 */
export function estimateTotalTokens(messages: Message[]): number {
  return messages.reduce((sum, msg) => sum + estimateMessageTokens(msg), 0)
}

/**
 * Check if message contains tool_use blocks
 */
function hasToolUse(message: Message): boolean {
  if (typeof message.content === 'string') return false
  return message.content.some(b => b.type === 'tool_use')
}

/**
 * Check if message contains tool_result blocks
 */
function hasToolResult(message: Message): boolean {
  if (typeof message.content === 'string') return false
  return message.content.some(b => b.type === 'tool_result')
}

/**
 * Group messages into atomic units that must be kept or removed together.
 * A tool exchange (assistant with tool_use + user with tool_result) forms one group.
 * Plain text messages form their own group.
 */
function groupMessages(messages: Message[]): Message[][] {
  const groups: Message[][] = []
  let i = 0

  while (i < messages.length) {
    const msg = messages[i]

    // Assistant message with tool_use — group with following tool_result message
    if (msg.role === 'assistant' && hasToolUse(msg) && i + 1 < messages.length && hasToolResult(messages[i + 1])) {
      groups.push([msg, messages[i + 1]])
      i += 2
    } else {
      groups.push([msg])
      i += 1
    }
  }

  return groups
}

/**
 * Ensure every tool_use block has a matching tool_result in the next message.
 * Adds dummy tool_result for any orphaned tool_use blocks (from __ask_user__
 * returns or interrupted executions).
 */
export function sanitizeHistory(messages: Message[]): Message[] {
  const result: Message[] = []

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]
    result.push(msg)

    if (msg.role !== 'assistant' || typeof msg.content === 'string') continue

    const toolUseBlocks = msg.content.filter(
      (b): b is ToolUseBlock => b.type === 'tool_use'
    )
    if (toolUseBlocks.length === 0) continue

    const next = messages[i + 1]
    const nextHasResults = next
      && next.role === 'user'
      && typeof next.content !== 'string'

    // Find tool_use ids missing a matching tool_result
    const missingIds = toolUseBlocks.filter(tu => {
      if (!nextHasResults) return true
      return !(next.content as ContentBlock[]).some(
        b => b.type === 'tool_result' && (b as ToolResultBlock).tool_use_id === tu.id
      )
    })

    if (missingIds.length === 0) continue

    const dummyResults: ToolResultBlock[] = missingIds.map(tu => ({
      type: 'tool_result' as const,
      tool_use_id: tu.id,
      content: JSON.stringify({ success: false, error: 'Operation was interrupted' }),
      is_error: true,
    }))

    if (nextHasResults) {
      // Merge dummy results into the existing user message
      const merged: Message = {
        role: 'user',
        content: [...dummyResults, ...(next.content as ContentBlock[])],
      }
      result.push(merged)
      i++ // skip original next message, we replaced it
    } else {
      // Insert a new user message with dummy results
      result.push({ role: 'user', content: dummyResults })
    }
  }

  return result
}

/**
 * Truncate old messages to fit within token limit.
 * Preserves tool_use/tool_result pairs as atomic units — never breaks them apart.
 */
export function truncateOldMessages(
  messages: Message[],
  maxTokens: number,
  preserveFirst: number = 1
): Message[] {
  if (messages.length <= preserveFirst) {
    return messages
  }

  const result: Message[] = []
  let totalTokens = 0

  // Always preserve first N messages (usually system context)
  for (let i = 0; i < preserveFirst && i < messages.length; i++) {
    result.push(messages[i])
    totalTokens += estimateMessageTokens(messages[i])
  }

  // Group remaining messages to keep tool_use/tool_result pairs together
  const remainingMessages = messages.slice(preserveFirst)
  const groups = groupMessages(remainingMessages)

  // Add groups from the end until we hit the limit
  const kept: Message[] = []
  for (let i = groups.length - 1; i >= 0; i--) {
    const groupTokens = groups[i].reduce((sum, msg) => sum + estimateMessageTokens(msg), 0)
    if (totalTokens + groupTokens <= maxTokens) {
      kept.unshift(...groups[i])
      totalTokens += groupTokens
    } else {
      break
    }
  }

  return sanitizeHistory([...result, ...kept])
}

/** Summary message prefix used to detect existing summaries */
const SUMMARY_PREFIX = 'This session is being continued from a previous conversation that ran out of context.'

/** Assistant acknowledgment after a summary message */
const SUMMARY_ACK = "I'll continue from where we left off. I have the full context from the summary above."

/**
 * Context manager for tracking token usage during execution
 */
export class ContextManager {
  private maxTokens: number
  private strategy: ContextStrategy
  private currentTokens: number = 0
  private llm?: LLMProvider
  private compactBuffer: number

  constructor(
    maxTokens: number = 100000,
    strategy: ContextStrategy = 'summarize',
    llm?: LLMProvider,
    compactBuffer?: number
  ) {
    this.maxTokens = maxTokens
    this.strategy = strategy
    this.llm = llm
    // Default buffer: 10% of maxTokens
    this.compactBuffer = compactBuffer ?? Math.floor(maxTokens * 0.1)
  }

  /**
   * Update current token count
   */
  updateTokenCount(messages: Message[]): void {
    this.currentTokens = estimateTotalTokens(messages)
  }

  /**
   * Get remaining tokens available
   */
  getRemainingTokens(): number {
    return Math.max(0, this.maxTokens - this.currentTokens)
  }

  /**
   * Check if context is within limits (accounting for compact buffer)
   */
  isWithinLimits(): boolean {
    return this.currentTokens <= this.maxTokens - this.compactBuffer
  }

  /**
   * Manage context according to strategy
   */
  async manageContext(messages: Message[]): Promise<Message[]> {
    this.updateTokenCount(messages)

    if (this.isWithinLimits()) {
      return sanitizeHistory(messages)
    }

    switch (this.strategy) {
      case 'summarize':
        return this.summarizeAndCompact(messages)
      case 'error':
        throw new Error(`Context limit exceeded: ${this.currentTokens} > ${this.maxTokens} tokens`)
      default:
        return messages
    }
  }

  /**
   * Summarize strategy: micro-compact first, then full compaction if still over limit.
   */
  private async summarizeAndCompact(messages: Message[]): Promise<Message[]> {
    // Step 1: Apply micro-compaction (truncate old large tool results)
    let managed = microCompact(messages)
    const afterMicroTokens = estimateTotalTokens(managed)

    if (afterMicroTokens <= this.maxTokens - this.compactBuffer) {
      return sanitizeHistory(managed)
    }

    // Step 2: Full compaction — need LLM
    if (!this.llm) {
      // No LLM available, fall back to truncation
      return truncateOldMessages(managed, this.maxTokens)
    }

    // Determine how many recent messages to keep.
    // Keep messages from the end that fit in ~40% of maxTokens.
    const keepBudget = Math.floor(this.maxTokens * 0.4)
    const groups = groupMessages(managed)
    const recentGroups: Message[][] = []
    let recentTokens = 0

    for (let i = groups.length - 1; i >= 0; i--) {
      const groupTokens = groups[i].reduce((sum, msg) => sum + estimateMessageTokens(msg), 0)
      if (recentTokens + groupTokens > keepBudget) break
      recentGroups.unshift(groups[i])
      recentTokens += groupTokens
    }

    const recentMessages = recentGroups.flat()
    const recentStartIdx = managed.length - recentMessages.length
    const messagesToSummarize = managed.slice(0, recentStartIdx)

    if (messagesToSummarize.length === 0) {
      // Nothing to summarize, fall back to truncation
      return truncateOldMessages(managed, this.maxTokens)
    }

    // Run full compaction
    const summary = await summarizeMessages(messagesToSummarize, this.llm)

    // Build result: summary user message + assistant ack + recent messages
    const summaryMessage: Message = {
      role: 'user',
      content: `${SUMMARY_PREFIX} The conversation is summarized below:\n\n<summary>\n${summary}\n</summary>\n\nPlease continue from where we left off.`,
    }

    const ackMessage: Message = {
      role: 'assistant',
      content: SUMMARY_ACK,
    }

    // Ensure alternating roles are correct
    const result = [summaryMessage, ackMessage, ...recentMessages]

    return sanitizeHistory(result)
  }
}
