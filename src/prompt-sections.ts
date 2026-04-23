/**
 * Prompt Sections & History Injections (issue #15)
 *
 * Two primitives with a shared `{ name, when, content }` shape:
 *   - PromptSection: evaluated once at turn 1, appended to the system prompt
 *   - HistoryInjection: evaluated each turn until fired, wrapped and inserted
 *     into the message history before the current user turn
 *
 * Session state (which sections/injections have fired) lives in the repository
 * alongside the conversation, under the `__tuplet` key.
 */

import type {
  Message,
  PromptSection,
  HistoryInjection,
  SectionContext,
  TurnContext,
  RepositoryProvider,
} from './types.js'

const STATE_KEY = '__tuplet'

export interface SectionCacheEntry {
  fired: boolean
  content?: string
}

export interface TupletSessionState {
  sections?: Record<string, SectionCacheEntry>
  firedInjections?: string[]
}

export interface FiredInjection {
  name: string
  content: string
  once: boolean
}

export async function loadTupletState(
  repo: RepositoryProvider | undefined,
  conversationId: string | undefined
): Promise<TupletSessionState> {
  if (!repo?.getState || !conversationId) return {}
  const state = await repo.getState(conversationId)
  if (!state) return {}
  const tuplet = state[STATE_KEY]
  if (!tuplet || typeof tuplet !== 'object') return {}
  return tuplet as TupletSessionState
}

export async function saveTupletState(
  repo: RepositoryProvider | undefined,
  conversationId: string | undefined,
  tupletState: TupletSessionState
): Promise<void> {
  if (!repo?.saveState || !conversationId) return
  const existing = (repo.getState ? await repo.getState(conversationId) : null) || {}
  await repo.saveState(conversationId, { ...existing, [STATE_KEY]: tupletState })
}

/**
 * Resolve sections against cache, evaluating only those not yet cached.
 * Sections are evaluated in registration order; fired ones are returned in the
 * same order for stable prompt rendering.
 */
export async function resolveSections(
  sections: PromptSection[],
  ctx: SectionContext,
  cache: Record<string, SectionCacheEntry> | undefined
): Promise<{
  fired: { name: string; content: string }[]
  updatedCache: Record<string, SectionCacheEntry>
}> {
  const updatedCache: Record<string, SectionCacheEntry> = { ...(cache || {}) }
  const fired: { name: string; content: string }[] = []

  for (const section of sections) {
    const existing = updatedCache[section.name]
    if (existing) {
      if (existing.fired && typeof existing.content === 'string') {
        fired.push({ name: section.name, content: existing.content })
      }
      continue
    }
    const matched = await Promise.resolve(section.when(ctx))
    if (!matched) {
      updatedCache[section.name] = { fired: false }
      continue
    }
    const rendered =
      typeof section.content === 'function'
        ? await Promise.resolve(section.content(ctx))
        : section.content
    updatedCache[section.name] = { fired: true, content: rendered }
    fired.push({ name: section.name, content: rendered })
  }

  return { fired, updatedCache }
}

/**
 * Format fired sections for appending to the system prompt.
 * Each section is wrapped in a `<tuplet-note kind="prompt-section">` tag so the
 * model can consistently recognize the boundary.
 */
export function formatSectionsForPrompt(
  fired: { name: string; content: string }[]
): string {
  if (fired.length === 0) return ''
  return fired
    .map(
      f =>
        `<tuplet-note kind="prompt-section" name="${f.name}">\n${f.content}\n</tuplet-note>`
    )
    .join('\n\n')
}

/**
 * Evaluate injections against the current turn, skipping any that already fired
 * (for `once: true`, which is the default).
 */
export async function evaluateInjections(
  injections: HistoryInjection[],
  ctx: TurnContext,
  firedNames: string[]
): Promise<FiredInjection[]> {
  const fired: FiredInjection[] = []
  for (const inj of injections) {
    const once = inj.once !== false
    if (once && firedNames.includes(inj.name)) continue
    const matched = await Promise.resolve(inj.when(ctx))
    if (!matched) continue
    const rendered =
      typeof inj.content === 'function'
        ? await Promise.resolve(inj.content(ctx))
        : inj.content
    fired.push({ name: inj.name, content: rendered, once })
  }
  return fired
}

export function wrapInjection(name: string, content: string): string {
  return `<tuplet-note kind="history-injection" name="${name}">\n${content}\n</tuplet-note>`
}

/**
 * Merge all fired injections into a single user message's worth of content so
 * we don't emit multiple consecutive user messages.
 */
export function renderInjectionsPayload(fired: FiredInjection[]): string {
  return fired.map(f => wrapInjection(f.name, f.content)).join('\n\n')
}

/**
 * Count user-originating turns in a message list.
 * A "user turn" is a user message whose content is a string or contains at
 * least one text block (i.e. not a message that only carries tool_results).
 */
export function countUserTurns(messages: Message[]): number {
  let count = 0
  for (const m of messages) {
    if (m.role !== 'user') continue
    if (typeof m.content === 'string') {
      count++
      continue
    }
    if (m.content.some(b => b.type === 'text')) count++
  }
  return count
}

/**
 * Extract the text of the latest user-originating message for TurnContext.
 */
export function extractLastUserText(messages: Message[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (m.role !== 'user') continue
    if (typeof m.content === 'string') return m.content
    const texts = m.content
      .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
      .map(b => b.text)
    if (texts.length > 0) return texts.join('\n')
  }
  return ''
}
