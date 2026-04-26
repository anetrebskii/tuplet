/**
 * Langfuse Trace Provider — native (no dependencies)
 *
 * Posts directly to Langfuse's ingestion API
 * (`POST {baseUrl}/api/public/ingestion`) using Node 20+ built-in fetch.
 * The user only needs credentials — no OpenTelemetry SDK required.
 *
 *   const trace = new LangfuseTraceProvider()  // reads LANGFUSE_* env vars
 *
 * Env vars (any of):
 *   LANGFUSE_PUBLIC_KEY   (required)
 *   LANGFUSE_SECRET_KEY   (required)
 *   LANGFUSE_BASE_URL  |  LANGFUSE_BASEURL  |  LANGFUSE_HOST
 *     (default: https://cloud.langfuse.com)
 */

import { randomUUID } from 'node:crypto'
import type {
  Trace,
  TraceProvider,
  AgentSpan,
  LLMCallEvent,
  ToolCallEvent,
  ModelPricing
} from './types.js'

export interface LangfuseTraceConfig {
  /** Langfuse public key. Defaults to env LANGFUSE_PUBLIC_KEY. */
  publicKey?: string
  /** Langfuse secret key. Defaults to env LANGFUSE_SECRET_KEY. */
  secretKey?: string
  /** Langfuse base URL. Defaults to env LANGFUSE_BASE_URL / LANGFUSE_BASEURL / LANGFUSE_HOST or https://cloud.langfuse.com. */
  baseUrl?: string

  /** Number of events to buffer before flushing. Default: 20. */
  flushAt?: number
  /** Max time (ms) to hold buffered events before flushing. Default: 3000. */
  flushIntervalMs?: number
  /** Network timeout (ms) per ingest request. Default: 10_000. */
  requestTimeoutMs?: number

  /** Group runs into a Langfuse session. */
  sessionId?: string
  /** Attach a Langfuse user id. */
  userId?: string
  /** Tags applied to the trace. */
  tags?: string[]
  /** Free-form metadata applied to the trace. */
  metadata?: Record<string, unknown>
  /** App release identifier (e.g. git sha). */
  release?: string
  /** App version. */
  version?: string

  /** Capture LLM messages/responses (default: true). Disable for sensitive data. */
  captureMessages?: boolean
  /** Capture tool inputs/outputs (default: true). */
  captureToolIO?: boolean
  /** Truncate captured payloads to this many characters. Default: 32_768. */
  maxPayloadChars?: number

  /** Print ingestion errors to console (default: true). */
  debug?: boolean
  /** Print a one-time confirmation line on first successful flush (default: false). */
  verbose?: boolean

  /** Custom model pricing forwarded to the trace builder. */
  modelPricing?: Record<string, ModelPricing>
}

interface IngestionEvent {
  id: string
  type: string
  timestamp: string
  body: Record<string, unknown>
}

/**
 * Sends tuplet trace events to Langfuse via the ingestion HTTP API.
 */
export class LangfuseTraceProvider implements TraceProvider {
  readonly modelPricing?: Record<string, ModelPricing>

  private readonly endpoint: string
  private readonly auth: string
  private readonly flushAt: number
  private readonly flushIntervalMs: number
  private readonly requestTimeoutMs: number

  private readonly sessionId?: string
  private readonly userId?: string
  private readonly tags?: string[]
  private readonly metadata?: Record<string, unknown>
  private readonly release?: string
  private readonly version?: string

  private readonly captureMessages: boolean
  private readonly captureToolIO: boolean
  private readonly maxPayloadChars: number
  private readonly debug: boolean
  private readonly verbose: boolean

  private queue: IngestionEvent[] = []
  private flushTimer?: ReturnType<typeof setTimeout>
  private inFlight: Promise<void> = Promise.resolve()
  private firstSendLogged = false

  constructor(config: LangfuseTraceConfig = {}) {
    const publicKey = config.publicKey ?? process.env.LANGFUSE_PUBLIC_KEY
    const secretKey = config.secretKey ?? process.env.LANGFUSE_SECRET_KEY
    const baseUrl =
      config.baseUrl ??
      process.env.LANGFUSE_BASE_URL ??
      process.env.LANGFUSE_BASEURL ??
      process.env.LANGFUSE_HOST ??
      'https://cloud.langfuse.com'

    if (!publicKey || !secretKey) {
      throw new Error(
        'LangfuseTraceProvider: missing credentials. Set LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY env vars or pass them in config.'
      )
    }

    this.endpoint = `${baseUrl.replace(/\/+$/, '')}/api/public/ingestion`
    this.auth = Buffer.from(`${publicKey}:${secretKey}`).toString('base64')

    this.flushAt = config.flushAt ?? 20
    this.flushIntervalMs = config.flushIntervalMs ?? 3000
    this.requestTimeoutMs = config.requestTimeoutMs ?? 10_000

    this.sessionId = config.sessionId
    this.userId = config.userId
    this.tags = config.tags
    this.metadata = config.metadata
    this.release = config.release
    this.version = config.version

    this.captureMessages = config.captureMessages ?? true
    this.captureToolIO = config.captureToolIO ?? true
    this.maxPayloadChars = config.maxPayloadChars ?? 32_768
    this.debug = config.debug ?? true
    this.verbose = config.verbose ?? false

    this.modelPricing = config.modelPricing
  }

  // ----- TraceProvider hooks ------------------------------------------------

  onTraceStart(trace: Trace): void {
    const root = trace.rootSpan
    this.enqueue('trace-create', {
      id: trace.traceId,
      timestamp: isoFrom(trace.startTime),
      name: root.agentName,
      input: this.captureMessages ? this.cap(root.inputMessage) : undefined,
      userId: this.userId,
      sessionId: this.sessionId,
      tags: this.tags,
      metadata: this.metadata,
      release: this.release,
      version: this.version
    })
  }

  onTraceEnd(trace: Trace): void {
    this.enqueue('trace-create', {
      id: trace.traceId,
      timestamp: isoFrom(trace.startTime),
      name: trace.rootSpan.agentName,
      output: this.captureMessages ? this.cap(trace.rootSpan.outputResponse) : undefined,
      metadata: {
        ...this.metadata,
        durationMs: trace.durationMs,
        totalCost: trace.totalCost,
        totalInputTokens: trace.totalInputTokens,
        totalOutputTokens: trace.totalOutputTokens,
        totalCacheReadTokens: trace.totalCacheReadTokens,
        totalCacheCreationTokens: trace.totalCacheCreationTokens,
        totalLLMCalls: trace.totalLLMCalls,
        totalToolCalls: trace.totalToolCalls,
        costByModel: trace.costByModel
      }
    })
    void this.flush()
  }

  onAgentStart(span: AgentSpan, trace: Trace): void {
    if (span.depth === 0) return // root agent is the trace itself
    this.enqueue('span-create', {
      id: span.spanId,
      traceId: trace.traceId,
      name: span.agentName,
      startTime: isoFrom(span.startTime),
      parentObservationId: this.observationParent(span),
      input: this.captureMessages ? this.cap(span.inputMessage) : undefined
    })
  }

  onAgentEnd(span: AgentSpan, trace: Trace): void {
    if (span.depth === 0) return
    this.enqueue('span-update', {
      id: span.spanId,
      traceId: trace.traceId,
      endTime: isoFrom(span.endTime ?? Date.now()),
      output: this.captureMessages ? this.cap(span.outputResponse) : undefined,
      level: span.status === 'error' ? 'ERROR' : 'DEFAULT',
      statusMessage: span.status === 'interrupted' ? 'interrupted' : undefined
    })
  }

  onLLMCall(event: LLMCallEvent, span: AgentSpan, trace: Trace): void {
    const startTime = event.timestamp - event.durationMs

    const usageDetails: Record<string, number> = {
      input: event.inputTokens,
      output: event.outputTokens,
      total: event.inputTokens + event.outputTokens
    }
    if (event.cacheReadTokens) usageDetails.cache_read_input = event.cacheReadTokens
    if (event.cacheCreationTokens) usageDetails.cache_creation_input = event.cacheCreationTokens

    let input: unknown
    if (this.captureMessages) {
      const wrapped: Record<string, unknown> = {}
      if (event.systemPrompt) wrapped.system = event.systemPrompt
      if (event.messages) wrapped.messages = event.messages
      if (Object.keys(wrapped).length > 0) input = wrapped
    }

    this.enqueue('generation-create', {
      id: event.spanId,
      traceId: trace.traceId,
      name: `llm.${event.modelId}`,
      startTime: isoFrom(startTime),
      endTime: isoFrom(event.timestamp),
      parentObservationId: span.depth === 0 ? undefined : span.spanId,
      model: event.modelId,
      input: this.cap(input),
      output: this.captureMessages ? this.cap(event.response) : undefined,
      usageDetails,
      costDetails: event.cost > 0 ? { total: event.cost } : undefined
    })
  }

  onToolCall(event: ToolCallEvent, span: AgentSpan, trace: Trace): void {
    const startTime = event.timestamp - event.durationMs
    this.enqueue('span-create', {
      id: event.spanId,
      traceId: trace.traceId,
      name: `tool.${event.toolName}`,
      startTime: isoFrom(startTime),
      endTime: isoFrom(event.timestamp),
      parentObservationId: span.depth === 0 ? undefined : span.spanId,
      input: this.captureToolIO ? this.cap(event.input) : undefined,
      output: this.captureToolIO ? this.cap(event.output) : undefined,
      level: event.output.success ? 'DEFAULT' : 'ERROR',
      statusMessage: event.output.success ? undefined : event.output.error
    })
  }

  // ----- public lifecycle ---------------------------------------------------

  /** Force-send any buffered events. Awaits the in-flight request too. */
  async flush(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
      this.flushTimer = undefined
    }
    if (this.queue.length === 0) {
      await this.inFlight
      return
    }
    const batch = this.queue
    this.queue = []
    this.inFlight = this.inFlight.then(() => this.send(batch))
    await this.inFlight
  }

  /** Flush remaining events. Call before process exit. */
  async shutdown(): Promise<void> {
    await this.flush()
  }

  // ----- internals ----------------------------------------------------------

  private observationParent(span: AgentSpan): string | undefined {
    // Sub-agent at depth 1 is parented directly to the trace (root has no observation).
    // Deeper agents parent to the enclosing sub-agent observation.
    if (!span.parentSpanId) return undefined
    const parentDepth = (span.depth ?? 0) - 1
    return parentDepth >= 1 ? span.parentSpanId : undefined
  }

  private enqueue(type: string, body: Record<string, unknown>): void {
    this.queue.push({
      id: randomUUID(),
      type,
      timestamp: new Date().toISOString(),
      body: stripUndefined(body)
    })
    if (this.queue.length >= this.flushAt) {
      void this.flush()
    } else if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => void this.flush(), this.flushIntervalMs)
      this.flushTimer.unref?.()
    }
  }

  private async send(batch: IngestionEvent[]): Promise<void> {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), this.requestTimeoutMs)
    try {
      const res = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Basic ${this.auth}`
        },
        body: JSON.stringify({ batch }),
        signal: ctrl.signal
      })

      const text = await res.text().catch(() => '')
      const parsed = parseJson(text) as
        | {
            successes?: Array<{ id?: string; status?: number }>
            errors?: Array<{ id?: string; status?: number; message?: string; error?: unknown }>
          }
        | null

      if (!res.ok && res.status !== 207) {
        if (this.debug) {
          console.error(`[langfuse] ${res.status} ${res.statusText}: ${truncateForLog(text)}`)
        }
        return
      }

      const successCount = parsed?.successes?.length ?? 0
      const errors = parsed?.errors ?? []

      if (this.verbose && !this.firstSendLogged) {
        this.firstSendLogged = true
        console.log(
          `[langfuse] connected → ${this.endpoint} (sent ${batch.length}, accepted ${successCount}, rejected ${errors.length})`
        )
      }

      if (this.debug && errors.length > 0) {
        for (const err of errors) {
          const detail =
            typeof err.error === 'string'
              ? err.error
              : err.error
                ? JSON.stringify(err.error)
                : err.message ?? 'unknown'
          console.error(
            `[langfuse] event ${err.id ?? '?'} rejected (${err.status ?? '?'}): ${truncateForLog(detail)}`
          )
        }
      }
    } catch (err) {
      if (this.debug) {
        console.error('[langfuse] ingest failed:', err instanceof Error ? err.message : err)
      }
    } finally {
      clearTimeout(timer)
    }
  }

  private cap(value: unknown): unknown {
    if (value == null) return undefined
    if (typeof value === 'string') {
      return value.length <= this.maxPayloadChars
        ? value
        : value.slice(0, this.maxPayloadChars - 14) + '…[truncated]'
    }
    let serialized: string
    try {
      serialized = JSON.stringify(value)
    } catch {
      return String(value).slice(0, this.maxPayloadChars)
    }
    if (serialized.length <= this.maxPayloadChars) return value
    return serialized.slice(0, this.maxPayloadChars - 14) + '…[truncated]'
  }
}

function isoFrom(ms?: number): string | undefined {
  return ms == null ? undefined : new Date(ms).toISOString()
}

function parseJson(text: string): unknown {
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function truncateForLog(text: string): string {
  return text.length > 500 ? text.slice(0, 500) + '…' : text
}

function stripUndefined(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) out[key] = value
  }
  return out
}

