# Interruption & Cancellation

Stop a running agent when user clicks "Stop", sends a new message, or other conditions.

## Using AbortController (in-memory)

```typescript
const controller = new AbortController()

// Start agent
const resultPromise = agent.run(message, {
  conversationId,
  signal: controller.signal
})

// User clicks "Stop" button
controller.abort()

const result = await resultPromise
if (result.status === 'interrupted') {
  console.log(`Stopped after ${result.interrupted?.iterationsCompleted} iterations`)
  // result.history contains partial work
}
```

## Using shouldContinue (Firestore)

For Telegram bots or distributed systems where the abort signal needs to come from a database:

```typescript
// Start task and store reference
const taskRef = db.collection('tasks').doc(taskId)
await taskRef.set({ status: 'running', chatId })

const result = await agent.run(message, {
  conversationId: chatId,
  shouldContinue: async () => {
    const doc = await taskRef.get()
    return doc.data()?.status === 'running'
  }
})

// Handle result
if (result.status === 'interrupted') {
  await sendMessage(chatId, 'Task stopped')
} else {
  await sendMessage(chatId, result.response)
}
```

In another handler (when user clicks Stop or sends new message):

```typescript
await taskRef.update({ status: 'stopped' })
```

## Interrupted Result

When interrupted, the result contains:

```typescript
interface AgentResult {
  status: 'interrupted'
  interrupted: {
    reason: 'aborted' | 'stopped' | 'max_iterations'
    iterationsCompleted: number
  }
  history: Message[]      // Partial work done so far
  response: string        // Last response (may be empty)
  toolCalls: ToolCallLog[]
}
```

## Continuing Partial Work

When interrupted, `result.history` contains the work done so far:

```typescript
const result = await agent.run(message, { signal })

if (result.status === 'interrupted') {
  // Option 1: Discard partial work, start fresh
  const fresh = await agent.run(newMessage, { conversationId })

  // Option 2: Continue from where we left off
  const continued = await agent.run(newMessage, {
    history: result.history  // Include partial work
  })
}
```

## Terminal UI with ESC Key

```typescript
import * as readline from 'readline'

let controller: AbortController | null = null

// Setup ESC handler
process.stdin.setRawMode(true)
process.stdin.on('data', (key) => {
  if (key[0] === 27 && controller) {  // ESC key
    console.log('\n⛔ Interrupted')
    controller.abort()
  }
})

async function chat(message: string) {
  controller = new AbortController()

  const result = await agent.run(message, {
    signal: controller.signal
  })

  controller = null

  if (result.status === 'interrupted') {
    console.log('Task was interrupted')
  } else {
    console.log(result.response)
  }
}
```

## Web API with Timeout

```typescript
export async function POST(req: Request) {
  const { message, conversationId } = await req.json()

  const controller = new AbortController()

  // Timeout after 30 seconds
  const timeout = setTimeout(() => controller.abort(), 30000)

  try {
    const result = await agent.run(message, {
      conversationId,
      signal: controller.signal
    })

    clearTimeout(timeout)

    return Response.json({
      response: result.response,
      status: result.status
    })
  } catch (error) {
    clearTimeout(timeout)
    return Response.json({ error: 'Request failed' }, { status: 500 })
  }
}
```

## Telegram Bot Pattern

```typescript
// Message handler
bot.on('message', async (ctx) => {
  const chatId = ctx.chat.id
  const taskId = `task-${chatId}-${Date.now()}`

  // Cancel any existing task for this chat
  await db.collection('tasks')
    .where('chatId', '==', chatId)
    .where('status', '==', 'running')
    .get()
    .then(snap => {
      snap.forEach(doc => doc.ref.update({ status: 'stopped' }))
    })

  // Start new task
  await db.collection('tasks').doc(taskId).set({
    chatId,
    status: 'running',
    startedAt: Date.now()
  })

  const result = await agent.run(ctx.message.text, {
    conversationId: String(chatId),
    shouldContinue: async () => {
      const doc = await db.collection('tasks').doc(taskId).get()
      return doc.data()?.status === 'running'
    }
  })

  // Mark complete
  await db.collection('tasks').doc(taskId).update({ status: 'complete' })

  // Send response
  if (result.status === 'interrupted') {
    await ctx.reply('⛔ Task was stopped')
  } else {
    await ctx.reply(result.response)
  }
})

// Stop command
bot.command('stop', async (ctx) => {
  const chatId = ctx.chat.id

  await db.collection('tasks')
    .where('chatId', '==', chatId)
    .where('status', '==', 'running')
    .get()
    .then(snap => {
      snap.forEach(doc => doc.ref.update({ status: 'stopped' }))
    })

  await ctx.reply('Stopping current task...')
})
```

## Check Frequency

The `shouldContinue` callback is checked:

1. Before each iteration starts
2. Between tool calls within an iteration
3. Before sub-agent execution

This ensures responsive cancellation even during long-running operations.
