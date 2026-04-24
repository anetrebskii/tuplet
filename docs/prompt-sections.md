# Prompt Sections & History Injections

Two primitives for splitting a system prompt by lifetime. Both take
`{ name, when, content }`. They differ only in **where** the rendered content
lands and **when** the trigger can fire.

- `PromptSection` — evaluated **once** at turn 1, appended to the system prompt,
  cached for the session. Use for session-stable content conditional on context
  known at conversation start (admin capabilities, session source, persona
  variant).
- `HistoryInjection` — evaluated **each turn until fired**. When `when` first
  returns `true`, the rendered content is wrapped in `<tuplet-note>` and
  inserted into the message history before the current user turn. Use for
  mid-conversation context deltas (stress signals, mode shifts, inline hints).

```typescript
import { Tuplet, type PromptSection, type HistoryInjection } from 'tuplet'

interface MyCtx {
  user: { isSuperAdmin: boolean }
  source: 'cron-winback' | 'user-initiated'
  userMood?: 'stressed'
}

const agent = new Tuplet({
  role: 'eating consultant',
  tools: [],
  llm,
  sections: [
    {
      name: 'admin-capabilities',
      when: ctx => (ctx.context as MyCtx).user.isSuperAdmin,
      content: ADMIN_GUIDE,
    },
    {
      name: 'winback-guide',
      when: ctx => (ctx.context as MyCtx).source === 'cron-winback',
      content: ctx => renderWinbackGuide((ctx.context as MyCtx)),
    },
  ],
  historyInjections: [
    {
      name: 'restoration-mode',
      when: ctx => (ctx.context as MyCtx).userMood === 'stressed',
      content: 'User shows stress signals. Switch to restoration tone: no calorie pressure, ask about the person, keep it warm and brief.',
    },
  ],
})

await agent.run('How was my week?', {
  conversationId: 'c1',
  context: {
    user: { isSuperAdmin: false },
    source: 'user-initiated',
    userMood: 'stressed',
  } satisfies MyCtx,
})
```

## Wrapping

Hosts write `content` as plain guidance. Tuplet wraps it. For both primitives
the delivered format is:

```
<tuplet-note kind="prompt-section" name="...">...</tuplet-note>
<tuplet-note kind="history-injection" name="...">...</tuplet-note>
```

`HistoryInjection`s land as a synthetic `role: 'user'` message inserted before
the current real user message. Tuplet also inserts a minimal assistant
acknowledgement to keep the user/assistant alternation valid for the API.

## Session state

The set of fired injections and the cached section results are stored alongside
conversation history via `RepositoryProvider.saveState` under the `__tuplet`
key. `MemoryRepository` and any custom repository that implements
`getState`/`saveState` support this automatically.

## Observing what fired

`AgentResult` surfaces what the `when` predicates matched, so callers can run
side effects (persist milestones, log analytics, update per-user state) without
duplicating the detection logic:

```typescript
const result = await agent.run('hi', { conversationId: 'c1', context })

// Delta for this run — only injections that fired during this invocation.
for (const name of result.firedHistoryInjections ?? []) {
  await analytics.track('injection-fired', { name, conversationId: 'c1' })
}

// Full active set for the session — sections evaluate on turn 1 and are
// cached, so each run returns the same set.
console.log('active sections:', result.firedPromptSections)
```

Semantics:

- `firedHistoryInjections` — **delta for this run**. Names of injections whose
  `when` matched during this `run()` call only. Empty `[]` when nothing fired
  (e.g. on the second run after a `once: true` injection already fired).
  `undefined` when `historyInjections` is not configured.
- `firedPromptSections` — **active set for the session**. Names of all sections
  whose `when` matched at turn 1. Stable across subsequent `run()` calls in the
  same session because sections are cached. `undefined` when `sections` is not
  configured.

Typical uses:

```typescript
// One-shot side effect: persist a milestone once the injection fires.
const injections = [{
  name: 'milestone-firstOffense',
  when: c => !c.context.user.milestones?.firstOffense && RE.test(c.lastUserMessage),
  content: FIRST_OFFENSE_NUDGE,
}]

const result = await agent.run(userMessage, { context: { user } })

for (const name of result.firedHistoryInjections ?? []) {
  if (name.startsWith('milestone-')) {
    await persistMilestone(user.id, name.slice('milestone-'.length))
  }
}

// Session debug: see which conditional persona modules are live.
console.log('active sections:', result.firedPromptSections)
```

## Immutability

- `PromptSection` only evaluates at turn 1 and is frozen for the session.
- `HistoryInjection` never touches the system prompt.

The `<system>` block hashes identically across turns — provider prompt cache
hits stay warm.

## invalidateSection

To force a section to re-evaluate mid-session:

```typescript
await agent.invalidateSection('conversation-id', 'winback-guide')
// or clear all sections for this conversation:
await agent.invalidateSection('conversation-id')
```

Warning: this breaks the prompt cache on the next turn.

## Testability

Host-side triggers can be unit-tested without running the agent:

```typescript
const fired = await agent.resolveSections({
  context: myCtx,
  conversationId: 'test',
})

const injections = await agent.evaluateInjections(
  { context: myCtx, conversationId: 'test', turnIndex: 1, lastUserMessage: 'hi' },
  []
)
```

## What goes where

| Signal | Mechanism |
|---|---|
| Identity, tone, forbidden words | `role` |
| Admin capabilities, superadmin tools | `PromptSection` |
| Session source (cron-winback, user-initiated) | `PromptSection` |
| Persona variant | `PromptSection` |
| Opening-message signals | `HistoryInjection` (`turnIndex === 1`) |
| Mid-conversation mode shift | `HistoryInjection` |
| Current timestamp, attached photo | User message |
| Fresh tool output | Tool result message |

## Resume behavior

When a run resumes from an `__ask_user__` pause, history injections are NOT
re-evaluated — resume is mid-turn, not a new turn. Sections still resolve from
cache as usual.
