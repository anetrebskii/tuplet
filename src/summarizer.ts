/**
 * Summarization
 *
 * Full compaction (LLM-based summarization) and micro-compaction
 * (truncating old large tool results) to manage context window usage
 * while preserving prompt cache stability.
 */

import type { Message, ToolResultBlock, LLMProvider } from './types.js'

const SUMMARIZATION_PROMPT = `You are summarizing a conversation between a user and an AI assistant.

Analyze each message chronologically and produce a structured summary covering:

1. **Primary Request and Intent** — What the user originally asked for
2. **Key Technical Concepts** — Important technical details, decisions, patterns
3. **Files and Code Sections** — File paths, function names, code snippets that were discussed or modified
4. **Errors and Fixes** — Any errors encountered and how they were resolved
5. **Problem Solving** — Approach taken, alternatives considered
6. **User Messages** — Key points from all user messages (preserve intent)
7. **Pending Tasks** — Anything still incomplete
8. **Current Work** — What was being actively worked on
9. **Next Step** — What should happen next

Wrap your thinking in <analysis> tags, then provide the final summary in <summary> tags.
Be thorough — include code snippets, file paths, and specific details. The summary replaces
the full conversation, so nothing important should be lost.`

/**
 * Parse summary content from LLM response containing <summary> tags.
 * Falls back to the full response if no tags are found.
 */
export function parseSummary(response: string): string {
  const match = response.match(/<summary>([\s\S]*?)<\/summary>/)
  if (match) {
    return match[1].trim()
  }
  // Fallback: use the full response if no <summary> tags found
  return response.trim()
}

/**
 * Full compaction: send conversation to LLM for structured summarization.
 * Returns the summary text extracted from <summary> tags.
 */
export async function summarizeMessages(
  messages: Message[],
  llm: LLMProvider,
  options?: { customInstructions?: string }
): Promise<string> {
  // Build the conversation text for summarization
  const conversationText = messages.map(msg => {
    const role = msg.role === 'user' ? 'User' : 'Assistant'
    if (typeof msg.content === 'string') {
      return `${role}: ${msg.content}`
    }
    const parts: string[] = []
    for (const block of msg.content) {
      switch (block.type) {
        case 'text':
          parts.push(block.text)
          break
        case 'tool_use':
          parts.push(`[Tool call: ${block.name}(${JSON.stringify(block.input)})]`)
          break
        case 'tool_result':
          parts.push(`[Tool result: ${block.content}]`)
          break
        case 'thinking':
          // Skip thinking blocks in summarization input
          break
      }
    }
    return `${role}: ${parts.join('\n')}`
  }).join('\n\n')

  let prompt = SUMMARIZATION_PROMPT
  if (options?.customInstructions) {
    prompt += `\n\nAdditional context:\n${options.customInstructions}`
  }

  const response = await llm.chat(
    prompt,
    [{ role: 'user', content: `Here is the conversation to summarize:\n\n${conversationText}` }],
    [], // no tools
  )

  const responseText = response.content
    .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
    .map(b => b.text)
    .join('\n')

  return parseSummary(responseText)
}

/**
 * Micro-compaction: truncate old large tool_result contents.
 * Keeps the `keepRecent` most recent tool_result contents intact.
 * Older tool_results with content > 1000 chars are replaced with a placeholder.
 * Returns cloned messages (does not mutate input).
 */
export function microCompact(
  messages: Message[],
  keepRecent: number = 3
): Message[] {
  // Find all tool_result positions (message index + block index within that message)
  const toolResultPositions: { msgIdx: number; blockIdx: number; contentLength: number }[] = []

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]
    if (typeof msg.content === 'string') continue
    for (let j = 0; j < msg.content.length; j++) {
      const block = msg.content[j]
      if (block.type === 'tool_result') {
        toolResultPositions.push({
          msgIdx: i,
          blockIdx: j,
          contentLength: block.content.length,
        })
      }
    }
  }

  // Determine which tool_results to truncate (all except the last `keepRecent`)
  const truncateSet = new Set<string>()
  const truncateCount = Math.max(0, toolResultPositions.length - keepRecent)
  for (let i = 0; i < truncateCount; i++) {
    const pos = toolResultPositions[i]
    // Only truncate if content is large enough to matter
    if (pos.contentLength > 1000) {
      truncateSet.add(`${pos.msgIdx}:${pos.blockIdx}`)
    }
  }

  if (truncateSet.size === 0) {
    return messages
  }

  // Clone and truncate
  return messages.map((msg, msgIdx) => {
    if (typeof msg.content === 'string') return msg

    let modified = false
    const newContent = msg.content.map((block, blockIdx) => {
      const key = `${msgIdx}:${blockIdx}`
      if (block.type === 'tool_result' && truncateSet.has(key)) {
        modified = true
        return {
          ...block,
          content: `[tool result truncated — was ${block.content.length} chars]`,
        } as ToolResultBlock
      }
      return block
    })

    if (!modified) return msg
    return { ...msg, content: newContent }
  })
}
