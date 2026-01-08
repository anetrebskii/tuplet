/**
 * Run Replayer
 *
 * Loads and displays saved run records.
 */

import { readFile } from 'fs/promises'
import type { Message, ToolCallLog } from '../../types.js'
import type { Trace } from '../../trace/types.js'
import type { RunRecord, RunRecordConfig } from './base.js'

/**
 * Loads and displays saved run records
 */
export class RunReplayer {
  /**
   * Load a run record from a JSON file
   */
  async load(filePath: string): Promise<RunRecord> {
    const content = await readFile(filePath, 'utf-8')
    return JSON.parse(content) as RunRecord
  }

  /**
   * Pretty print a run record to console
   */
  display(record: RunRecord): void {
    const timestamp = new Date(record.timestamp).toISOString()

    console.log(`\n${'='.repeat(60)}`)
    console.log(`Run Record: ${record.id}`)
    console.log(`Timestamp: ${timestamp}`)
    console.log(`${'='.repeat(60)}`)

    // Configuration
    console.log(`\n--- Configuration ---`)
    const systemPromptPreview = record.config.systemPrompt.length > 200
      ? record.config.systemPrompt.slice(0, 200) + '...'
      : record.config.systemPrompt
    console.log(`System Prompt: ${systemPromptPreview}`)
    console.log(`Max Iterations: ${record.config.maxIterations ?? 'default'}`)
    console.log(`Max Context Tokens: ${record.config.maxContextTokens ?? 'default'}`)
    console.log(`Context Strategy: ${record.config.contextStrategy ?? 'default'}`)
    console.log(`Tools: ${record.config.tools.map(t => t.name).join(', ') || 'none'}`)
    if (record.config.agents && record.config.agents.length > 0) {
      console.log(`Sub-Agents: ${record.config.agents.map(a => a.name).join(', ')}`)
    }

    // Initial History
    if (record.initialHistory && record.initialHistory.length > 0) {
      console.log(`\n--- Initial History (${record.initialHistory.length} messages) ---`)
      record.initialHistory.forEach((msg, i) => {
        const roleLabel = `[${msg.role}]`
        let content: string
        if (typeof msg.content === 'string') {
          content = msg.content
        } else {
          const textBlocks = msg.content
            .filter(b => b.type === 'text')
            .map(b => (b as { type: 'text'; text: string }).text)
          content = textBlocks.join('\n') || '(non-text content)'
        }
        const contentPreview = content.length > 100 ? content.slice(0, 100) + '...' : content
        console.log(`${i + 1}. ${roleLabel}: ${contentPreview}`)
      })
    }

    // Input
    console.log(`\n--- Input ---`)
    console.log(record.inputMessage)

    // Result
    console.log(`\n--- Result ---`)
    console.log(`Status: ${record.result.status}`)
    if (record.result.interrupted) {
      console.log(`Interrupted: ${record.result.interrupted.reason} (after ${record.result.interrupted.iterationsCompleted} iterations)`)
    }
    console.log(`\nResponse:`)
    console.log(record.result.response || '(empty)')

    // Tool Calls
    if (record.result.toolCalls.length > 0) {
      console.log(`\n--- Tool Calls (${record.result.toolCalls.length}) ---`)
      record.result.toolCalls.forEach((call, i) => {
        const inputStr = JSON.stringify(call.input)
        const inputPreview = inputStr.length > 50 ? inputStr.slice(0, 50) + '...' : inputStr
        const status = call.output.success ? 'success' : 'error'
        console.log(`${i + 1}. ${call.name}(${inputPreview}) -> ${status} (${call.durationMs}ms)`)
      })
    }

    // Todos
    if (record.result.todos && record.result.todos.length > 0) {
      console.log(`\n--- Todos (${record.result.todos.length}) ---`)
      record.result.todos.forEach(todo => {
        const statusIcon = todo.status === 'completed' ? '✓' : todo.status === 'in_progress' ? '→' : '○'
        console.log(`${statusIcon} ${todo.content}`)
      })
    }

    // Message History
    console.log(`\n--- Message History (${record.result.history.length} messages) ---`)
    record.result.history.forEach((msg, i) => {
      const roleLabel = `[${msg.role}]`
      let content: string
      if (typeof msg.content === 'string') {
        content = msg.content
      } else {
        // Content blocks
        const textBlocks = msg.content
          .filter(b => b.type === 'text')
          .map(b => (b as { type: 'text'; text: string }).text)
        const toolUseCount = msg.content.filter(b => b.type === 'tool_use').length
        const toolResultCount = msg.content.filter(b => b.type === 'tool_result').length
        content = textBlocks.join('\n')
        if (toolUseCount > 0) content += ` [${toolUseCount} tool_use]`
        if (toolResultCount > 0) content += ` [${toolResultCount} tool_result]`
      }
      const contentPreview = content.length > 100 ? content.slice(0, 100) + '...' : content
      console.log(`${i + 1}. ${roleLabel}: ${contentPreview}`)
    })

    // Trace summary
    if (record.result.trace) {
      console.log(`\n--- Trace Summary ---`)
      console.log(`Total Cost: $${record.result.trace.totalCost.toFixed(4)}`)
      console.log(`Input Tokens: ${record.result.trace.totalInputTokens}`)
      console.log(`Output Tokens: ${record.result.trace.totalOutputTokens}`)
      console.log(`LLM Calls: ${record.result.trace.totalLLMCalls}`)
      console.log(`Tool Calls: ${record.result.trace.totalToolCalls}`)
      if (record.result.trace.durationMs) {
        console.log(`Duration: ${record.result.trace.durationMs}ms`)
      }
    }

    console.log(`\n${'='.repeat(60)}\n`)
  }

  /**
   * Get the configuration from a run record
   */
  getConfig(record: RunRecord): RunRecordConfig {
    return record.config
  }

  /**
   * Get the initial history from a run record (before the run started)
   */
  getInitialHistory(record: RunRecord): Message[] {
    return record.initialHistory
  }

  /**
   * Get the final message history from a run record (after the run completed)
   */
  getHistory(record: RunRecord): Message[] {
    return record.result.history
  }

  /**
   * Get the response from a run record
   */
  getResponse(record: RunRecord): string {
    return record.result.response
  }

  /**
   * Get the tool calls from a run record
   */
  getToolCalls(record: RunRecord): ToolCallLog[] {
    return record.result.toolCalls
  }

  /**
   * Get the trace from a run record
   */
  getTrace(record: RunRecord): Trace | undefined {
    return record.result.trace
  }
}
