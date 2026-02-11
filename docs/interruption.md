# Interruption

Stop a running agent mid-execution — for example, when the user sees the agent going in the wrong direction and wants to correct it with a new message.

## AbortController

Standard approach — works in any environment:

```typescript
const controller = new AbortController()

const resultPromise = agent.run(message, {
  signal: controller.signal
})

// User clicks "Stop", timeout fires, etc.
controller.abort()

const result = await resultPromise
if (result.status === 'interrupted') {
  console.log(`Stopped after ${result.interrupted?.iterationsCompleted} iterations`)
}
```

## shouldContinue

Polling-based approach — useful when the stop signal comes from an external source (database, API, etc.):

```typescript
const result = await agent.run(message, {
  shouldContinue: async () => {
    const doc = await db.doc(taskId).get()
    return doc.data()?.status === 'running'
  }
})
```

The callback is checked before each iteration, between tool calls, and before sub-agent execution.

## Handling Interrupted Results

When interrupted, `result.history` contains partial work. You can continue from where the agent left off or start fresh:

```typescript
if (result.status === 'interrupted') {
  // Continue from partial work
  const continued = await agent.run(newMessage, {
    history: result.history
  })
}
```
