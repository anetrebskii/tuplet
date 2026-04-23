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
