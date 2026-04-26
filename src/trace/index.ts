/**
 * Trace Module - Execution tracing and cost tracking
 */

// Types
export type {
  TraceId,
  SpanId,
  ModelPricing,
  LLMCallEvent,
  ToolCallEvent,
  TraceEvent,
  AgentSpan,
  Trace,
  TraceContext,
  TraceProvider,
  CostUpdate
} from './types.js'

export { generateTraceId, generateSpanId } from './types.js'

// Pricing
export { DEFAULT_MODEL_PRICING, calculateCost } from './pricing.js'
export { OPENROUTER_MODEL_PRICING } from './openrouter-pricing.js'

// Builder
export { TraceBuilder } from './builder.js'

// Console Provider
export type { ConsoleTraceConfig } from './console.js'
export { ConsoleTraceProvider } from './console.js'

// Langfuse Provider (zero-dep, native fetch)
export type { LangfuseTraceConfig } from './langfuse.js'
export { LangfuseTraceProvider } from './langfuse.js'

// Multi Provider (fan-out to multiple providers)
export { MultiTraceProvider } from './multi.js'
