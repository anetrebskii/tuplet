# Conversation History

Two ways to persist conversation history across `agent.run()` calls. When history grows large, the framework automatically summarizes older messages to fit within the context window — no manual truncation needed.

## Automatic (Repository)

Pass a `RepositoryProvider` and a `conversationId` — history is loaded and saved automatically:

```typescript
import { Hive, ClaudeProvider, MemoryRepository } from '@alexnetrebskii/hive-agent'

const agent = new Hive({
  role: '...',
  llm: new ClaudeProvider({ apiKey: '...' }),
  repository: new MemoryRepository()  // in-memory, for development
})

const result = await agent.run('Hello', {
  conversationId: 'user-123-chat-456'
})

// Next message continues the conversation automatically
const result2 = await agent.run('What did I just say?', {
  conversationId: 'user-123-chat-456'
})
```

`MemoryRepository` is the only built-in provider (in-memory, no persistence). For production, implement the `RepositoryProvider` interface with your database — just two methods:

```typescript
interface RepositoryProvider {
  getHistory(conversationId: string): Promise<Message[]>
  saveHistory(conversationId: string, messages: Message[]): Promise<void>
}
```

## Manual

Manage history yourself — pass it in and save it after each run:

```typescript
const history = await db.loadMessages(chatId)

const result = await agent.run(message, { history })

await db.saveMessages(chatId, result.history)
```
