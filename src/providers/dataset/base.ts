/**
 * Dataset Provider - Type Definitions
 *
 * Types for recording and replaying Tuplet runs.
 */

import type {
  JSONSchema,
  Message,
  ToolCallLog,
  TodoItem,
  AgentStatus,
  ContextStrategy
} from '../../types.js'
import type { Trace } from '../../trace/types.js'

/**
 * Serialized tool (without execute function)
 */
export interface SerializedTool {
  name: string
  description: string
  parameters: JSONSchema
}

/**
 * Serialized sub-agent configuration (without non-serializable fields)
 */
export interface SerializedSubAgentConfig {
  name: string
  description: string
  systemPrompt: string
  tools: SerializedTool[]
  model?: string
  maxIterations?: number
  inputSchema?: JSONSchema
  outputSchema?: JSONSchema
}

/**
 * Serialized Tuplet configuration
 */
export interface RunRecordConfig {
  role: string
  maxIterations?: number
  maxContextTokens?: number
  contextStrategy?: ContextStrategy
  agentName?: string
  tools: SerializedTool[]
  agents?: SerializedSubAgentConfig[]
}

/**
 * Run result data
 */
export interface RunRecordResult {
  response: string
  status: AgentStatus
  history: Message[]
  toolCalls: ToolCallLog[]
  thinking?: string[]
  todos?: TodoItem[]
  interrupted?: {
    reason: string
    iterationsCompleted: number
  }
  trace?: Trace
}

/**
 * Complete run record saved to JSON
 */
export interface RunRecord {
  /** Unique run identifier */
  id: string
  /** Unix timestamp when run was recorded */
  timestamp: number
  /** User's input message that started the run */
  inputMessage: string
  /** Initial history before the run (for replay/testing) */
  initialHistory: Message[]
  /** Serialized Tuplet configuration */
  config: RunRecordConfig
  /** Run result data */
  result: RunRecordResult
}
