/**
 * Multi Trace Provider — fans out trace events to multiple TraceProviders.
 *
 * Useful when you want to record traces in two places at once (e.g. an internal
 * Firestore/Postgres store *and* Langfuse for observability) without having to
 * write a wrapper that forwards every callback by hand.
 *
 *   const trace = new MultiTraceProvider([
 *     new ConsoleTraceProvider(),
 *     new LangfuseTraceProvider()
 *   ])
 *
 *   new Tuplet({ ..., trace })
 *
 * Behavior:
 *  - Every callback fans out to all child providers in parallel via Promise.all.
 *  - Errors from any single child are caught and logged so one bad sink can't
 *    take down the agent run or block the other providers.
 *  - `modelPricing` resolves to the first child that defines one, so cost
 *    calculations stay consistent.
 *  - `flush()` / `shutdown()` fan out to children that implement them
 *    (e.g. LangfuseTraceProvider).
 */

import type {
  Trace,
  TraceProvider,
  AgentSpan,
  LLMCallEvent,
  ToolCallEvent,
  ModelPricing,
  CostUpdate
} from './types.js'

interface FlushableProvider {
  flush?: () => void | Promise<void>
  shutdown?: () => void | Promise<void>
}

export class MultiTraceProvider implements TraceProvider {
  readonly modelPricing?: Record<string, ModelPricing>
  private readonly providers: TraceProvider[]

  constructor(providers: TraceProvider[]) {
    this.providers = providers
    this.modelPricing = providers.find((p) => p.modelPricing)?.modelPricing
  }

  async onTraceStart(trace: Trace): Promise<void> {
    await this.fanOut((p) => p.onTraceStart?.(trace))
  }

  async onTraceEnd(trace: Trace): Promise<void> {
    await this.fanOut((p) => p.onTraceEnd?.(trace))
  }

  async onAgentStart(span: AgentSpan, trace: Trace): Promise<void> {
    await this.fanOut((p) => p.onAgentStart?.(span, trace))
  }

  async onAgentEnd(span: AgentSpan, trace: Trace): Promise<void> {
    await this.fanOut((p) => p.onAgentEnd?.(span, trace))
  }

  async onLLMCall(event: LLMCallEvent, span: AgentSpan, trace: Trace): Promise<void> {
    await this.fanOut((p) => p.onLLMCall?.(event, span, trace))
  }

  async onToolCall(event: ToolCallEvent, span: AgentSpan, trace: Trace): Promise<void> {
    await this.fanOut((p) => p.onToolCall?.(event, span, trace))
  }

  async onCostUpdate(update: CostUpdate): Promise<void> {
    await this.fanOut((p) => p.onCostUpdate?.(update))
  }

  /** Fan out flush() to children that implement it. Best-effort. */
  async flush(): Promise<void> {
    await this.fanOut((p) => (p as FlushableProvider).flush?.())
  }

  /** Fan out shutdown() to children that implement it. Best-effort. */
  async shutdown(): Promise<void> {
    await this.fanOut((p) => (p as FlushableProvider).shutdown?.())
  }

  private async fanOut(
    invoke: (p: TraceProvider) => void | Promise<void>
  ): Promise<void> {
    await Promise.all(
      this.providers.map(async (p) => {
        try {
          await invoke(p)
        } catch (err) {
          console.error('[multi-trace] provider failed:', err)
        }
      })
    )
  }
}
