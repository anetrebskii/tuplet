# Conversation History

Hive supports multiple ways to manage conversation history: automatic with a repository provider, or manual.

## Automatic (with Repository Provider)

Pass a `conversationId` and Hive automatically loads/saves history:

```typescript
import { Hive, ClaudeProvider, MemoryRepository } from '@alexnetrebskii/hive-agent'

const agent = new Hive({
  systemPrompt: '...',
  tools: [...],
  llm: new ClaudeProvider({ apiKey: '...' }),
  repository: new MemoryRepository()  // Or your custom provider
})

// Hive automatically loads and saves history using conversationId
const result = await agent.run(userMessage, {
  conversationId: 'user-123-chat-456'
})

// Next message continues the conversation automatically
const result2 = await agent.run(nextMessage, {
  conversationId: 'user-123-chat-456'
})
```

## Manual History Management

Manage history yourself without a repository:

```typescript
// Load history from database
const history = await db.collection('chats').doc(chatId).get()

// Run agent with history
const result = await agent.run(userMessage, {
  history: history.data()?.messages || []
})

// Save updated history
await db.collection('chats').doc(chatId).set({
  messages: result.history
})
```

## Repository Provider Interface

```typescript
interface RepositoryProvider {
  // Required: Load conversation history
  getHistory(conversationId: string): Promise<Message[]>

  // Required: Save conversation history
  saveHistory(conversationId: string, messages: Message[]): Promise<void>

  // Optional: Custom state storage
  getState?(conversationId: string): Promise<Record<string, unknown> | null>
  saveState?(conversationId: string, state: Record<string, unknown>): Promise<void>

  // Optional: Caching layer
  getCached?(key: string): Promise<unknown | null>
  setCached?(key: string, value: unknown, ttlMs?: number): Promise<void>
}
```

## Built-in: MemoryRepository

In-memory storage for development and testing:

```typescript
import { MemoryRepository } from '@alexnetrebskii/hive-agent'

const agent = new Hive({
  systemPrompt: '...',
  tools: [],
  llm: provider,
  repository: new MemoryRepository()
})
```

## Firestore Repository

```typescript
import type { RepositoryProvider, Message } from '@alexnetrebskii/hive-agent'
import { Firestore } from '@google-cloud/firestore'

class FirestoreRepository implements RepositoryProvider {
  constructor(private db: Firestore) {}

  async getHistory(conversationId: string): Promise<Message[]> {
    const doc = await this.db.collection('chats').doc(conversationId).get()
    return doc.exists ? doc.data()?.messages || [] : []
  }

  async saveHistory(conversationId: string, messages: Message[]): Promise<void> {
    await this.db.collection('chats').doc(conversationId).set({ messages })
  }
}

const agent = new Hive({
  systemPrompt: '...',
  tools: [...],
  llm: provider,
  repository: new FirestoreRepository(db)
})
```

## Redis Repository

```typescript
import type { RepositoryProvider, Message } from '@alexnetrebskii/hive-agent'
import { Redis } from 'ioredis'

class RedisRepository implements RepositoryProvider {
  constructor(private redis: Redis, private ttlSeconds = 86400) {}

  async getHistory(conversationId: string): Promise<Message[]> {
    const data = await this.redis.get(`chat:${conversationId}`)
    return data ? JSON.parse(data) : []
  }

  async saveHistory(conversationId: string, messages: Message[]): Promise<void> {
    await this.redis.setex(
      `chat:${conversationId}`,
      this.ttlSeconds,
      JSON.stringify(messages)
    )
  }
}
```

## PostgreSQL Repository

```typescript
import type { RepositoryProvider, Message } from '@alexnetrebskii/hive-agent'
import { Pool } from 'pg'

class PostgresRepository implements RepositoryProvider {
  constructor(private pool: Pool) {}

  async getHistory(conversationId: string): Promise<Message[]> {
    const result = await this.pool.query(
      'SELECT messages FROM conversations WHERE id = $1',
      [conversationId]
    )
    return result.rows[0]?.messages || []
  }

  async saveHistory(conversationId: string, messages: Message[]): Promise<void> {
    await this.pool.query(
      `INSERT INTO conversations (id, messages, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (id) DO UPDATE SET messages = $2, updated_at = NOW()`,
      [conversationId, JSON.stringify(messages)]
    )
  }
}
```

## MongoDB Repository

```typescript
import type { RepositoryProvider, Message } from '@alexnetrebskii/hive-agent'
import { MongoClient, Db } from 'mongodb'

class MongoRepository implements RepositoryProvider {
  constructor(private db: Db) {}

  async getHistory(conversationId: string): Promise<Message[]> {
    const doc = await this.db.collection('conversations').findOne({ _id: conversationId })
    return doc?.messages || []
  }

  async saveHistory(conversationId: string, messages: Message[]): Promise<void> {
    await this.db.collection('conversations').updateOne(
      { _id: conversationId },
      { $set: { messages, updatedAt: new Date() } },
      { upsert: true }
    )
  }
}
```

## Message Format

```typescript
interface Message {
  role: 'user' | 'assistant'
  content: string | ContentBlock[]
}

type ContentBlock = TextBlock | ThinkingBlock | ToolUseBlock | ToolResultBlock

interface TextBlock {
  type: 'text'
  text: string
}

interface ToolUseBlock {
  type: 'tool_use'
  id: string
  name: string
  input: Record<string, unknown>
}

interface ToolResultBlock {
  type: 'tool_result'
  tool_use_id: string
  content: string
  is_error?: boolean
}
```

## History with Context

Combine history with shared context:

```typescript
const context = new Context()

// Load saved context data
const savedContext = await db.collection('contexts').doc(userId).get()
if (savedContext.exists) {
  context.fromObject(savedContext.data())
}

// Run with both history and context
const result = await agent.run(message, {
  conversationId: `${userId}-${chatId}`,
  context
})

// Save context after run
await db.collection('contexts').doc(userId).set(context.toObject())
```
