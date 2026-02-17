# Interruption & Error Handling

## Result Status

Every `agent.run()` call returns an `AgentResult` with a `status` field. History is **always preserved** regardless of outcome — the agent never loses progress.

```typescript
const result = await agent.run(message, { history })

switch (result.status) {
  case 'complete':
    // Agent finished successfully
    console.log(result.response)
    break

  case 'needs_input':
    // Agent is asking the user a question — see Interactive docs
    console.log(result.pendingQuestion)
    break

  case 'interrupted':
    // Execution was stopped (abort signal, shouldContinue, or max iterations)
    console.log(`Stopped after ${result.interrupted?.iterationsCompleted} iterations`)
    break

  case 'error':
    // Fatal error (LLM API failure, context overflow, etc.)
    console.log(`Error: ${result.error}`)
    break
}

// History is always available — pass it to the next run to continue
history = result.history
```

## Interruption

Stop a running agent mid-execution — for example, when the user sees the agent going in the wrong direction and wants to correct it with a new message.

### AbortController

Standard approach — works in any environment:

```typescript
const controller = new AbortController()

const resultPromise = agent.run(message, {
  signal: controller.signal
})

// User clicks "Stop", timeout fires, etc.
controller.abort()

const result = await resultPromise
// result.status === 'interrupted', history is preserved
```

### shouldContinue

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

## Error Handling

When the LLM API fails (context overflow, rate limit, network error), the agent returns `status: 'error'` instead of throwing. History up to the failure point is preserved, so you can retry or let the user continue the conversation.

```typescript
const result = await agent.run(message, { history })

if (result.status === 'error') {
  console.log(`Error: ${result.error}`)
  // History is saved — user can retry with the same context
  history = result.history
}
```

This is especially important for long-running tasks where the agent has already done significant work (explored files, made API calls, created tasks) before the error occurs. Without history preservation, all that progress would be lost.

## Continuing After Interruption or Error

In all non-complete cases, `result.history` contains the work done so far. Pass it to the next `agent.run()` call to continue:

```typescript
const continued = await agent.run(newMessage, {
  history: result.history
})
```
