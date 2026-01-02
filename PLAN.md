# Hive - Agent Framework Plan

**Package name:** `hive-agent` (npm)

## Overview

Minimal TypeScript agent framework replicating Claude Code's architecture.

- **Stateless** - works in Firebase Functions, serverless environments
- **No built-in tools** - you define your own tools
- **External history** - accepts/returns conversation history (for Firestore)
- **Node 20+**, PNPM, Claude API (OpenAI extensible later)

---

## Core Architecture (Claude Code Pattern)

### 1. Agent Execution Loop

The core pattern Claude Code uses:

```text
run(userMessage, history?) → {response, history}

while (!done) {
  response = await llm.chat(messages, tools)

  if (response.hasToolCalls) {
    for (toolCall of response.toolCalls) {
      result = await executeTool(toolCall)
      messages.push(toolResult)
    }
  } else {
    done = true  // LLM responded with text only
  }
}

return { response: lastTextResponse, history: messages }
```

### 2. Tool System (Rich Descriptions)

Claude Code uses **lengthy, detailed tool descriptions** with examples, usage notes, and constraints. This is critical for guiding the LLM to use tools correctly.

**Tool Description Pattern (from Claude Code):**

```typescript
const readFileTool: Tool = {
  name: 'read_file',
  description: `Reads a file from the filesystem.

Usage:
- The file_path parameter must be an absolute path, not a relative path
- By default, reads up to 2000 lines from the beginning
- You can specify offset and limit for large files
- Results are returned with line numbers starting at 1

Examples:
- Read entire file: { "file_path": "/src/index.ts" }
- Read portion: { "file_path": "/src/index.ts", "offset": 100, "limit": 50 }

When NOT to use:
- For directories, use the list_files tool instead
- For searching content, use grep tool instead

Notes:
- Lines longer than 2000 characters will be truncated
- Binary files will return an error`,

  parameters: {
    type: 'object',
    properties: {
      file_path: {
        type: 'string',
        description: 'Absolute path to the file (e.g., "/Users/project/src/index.ts")'
      },
      offset: {
        type: 'number',
        description: 'Line number to start from (0-indexed). Use for large files.'
      },
      limit: {
        type: 'number',
        description: 'Maximum lines to read. Default: 2000'
      }
    },
    required: ['file_path']
  },
  execute: async (params, context) => { /* ... */ }
}
```

**Key Elements of Rich Tool Descriptions:**

1. **What it does** - Clear, concise summary
2. **Usage notes** - Important constraints and requirements
3. **Examples** - Show exact parameter formats
4. **When NOT to use** - Prevent misuse, suggest alternatives
5. **Parameter descriptions** - Include example values
6. **Edge cases** - Binary files, large files, errors

### 3. Sub-Agent System (Built-in Agent Registry)

Like Claude Code's agent types (Explore, Plan, general-purpose), Hive supports a **built-in registry of sub-agents** that can be spawned via a Task tool.

**Defining Sub-Agents:**

```typescript
interface SubAgentConfig {
  name: string                    // e.g., 'research', 'code-review'
  description: string             // Shown in Task tool description
  systemPrompt: string            // Agent's instructions
  tools: Tool[]                   // Tools available to this agent
  model?: string                  // Optional: override model
}

// Register sub-agents when creating Hive
const hive = new Hive({
  llm: new ClaudeProvider({ apiKey }),
  tools: [readTool, writeTool],

  // Built-in sub-agents
  agents: [
    {
      name: 'research',
      description: 'Deep research on any topic, returns summary',
      systemPrompt: 'You research topics thoroughly and return concise summaries.',
      tools: [webSearchTool, readUrlTool]
    },
    {
      name: 'code-review',
      description: 'Reviews code for bugs, security issues, and improvements',
      systemPrompt: 'You are a senior code reviewer. Find bugs and suggest fixes.',
      tools: [readFileTool, grepTool]
    },
    {
      name: 'planner',
      description: 'Creates detailed implementation plans',
      systemPrompt: 'You are a software architect. Create step-by-step plans.',
      tools: [readFileTool, grepTool]
    }
  ]
})
```

**Auto-Generated Task Tool:**

When agents are registered, Hive automatically creates a `__task__` tool:

```typescript
// Auto-generated tool (internal)
const taskTool: Tool = {
  name: '__task__',
  description: `Spawn a sub-agent to handle a specific task.

Available agents:
- research: Deep research on any topic, returns summary
- code-review: Reviews code for bugs, security issues, and improvements
- planner: Creates detailed implementation plans

Usage:
- Use 'research' for gathering information from the web
- Use 'code-review' when you need code analyzed
- Use 'planner' for complex multi-step tasks`,

  parameters: {
    type: 'object',
    properties: {
      agent: {
        type: 'string',
        enum: ['research', 'code-review', 'planner'],
        description: 'Which agent to spawn'
      },
      prompt: {
        type: 'string',
        description: 'Task for the agent to perform'
      }
    },
    required: ['agent', 'prompt']
  },

  execute: async ({ agent, prompt }) => {
    const subAgent = this.agents.get(agent)
    const result = await subAgent.run(prompt)
    return { success: true, data: result.response }
  }
}
```

**LLM Uses It Like:**
```
I need to research this topic before implementing.
<tool_use name="__task__">
  { "agent": "research", "prompt": "Find best practices for rate limiting in Node.js" }
</tool_use>
```

---

## File Structure

```text
hive-agent/
├── package.json
├── pnpm-lock.yaml
├── tsconfig.json
├── src/
│   ├── index.ts              # Public exports
│   ├── types.ts              # All TypeScript interfaces
│   ├── agent.ts              # Core Agent class (Hive)
│   ├── executor.ts           # Tool execution loop
│   ├── context.ts            # Context/token management
│   ├── prompt.ts             # System prompt builder
│   └── providers/
│       ├── index.ts          # Provider exports
│       ├── llm/
│       │   ├── base.ts       # LLM provider interface
│       │   └── claude.ts     # Claude API implementation
│       ├── logger/
│       │   ├── base.ts       # Logger provider interface
│       │   └── console.ts    # Default console logger
│       └── repository/
│           ├── base.ts       # Repository provider interface
│           └── memory.ts     # Default in-memory storage
```

**Total: ~12 source files** (excluding package configs)

---

## Key Interfaces

```typescript
// === types.ts ===

// Message format (matches Claude API)
interface Message {
  role: 'user' | 'assistant'
  content: string | ContentBlock[]
}

interface ContentBlock {
  type: 'text' | 'tool_use' | 'tool_result'
  // ... varies by type
}

// Tool definition
interface Tool {
  name: string
  description: string
  parameters: JSONSchema7  // Standard JSON Schema
  execute(params: Record<string, unknown>): Promise<ToolResult>
}

interface ToolResult {
  success: boolean
  data?: unknown
  error?: string
}

// Agent config
interface HiveConfig {
  systemPrompt: string
  tools: Tool[]

  // Sub-agents registry
  agents?: SubAgentConfig[]         // Optional: Built-in sub-agents

  // Providers - plug in your own implementations
  llm: LLMProvider                  // Required: LLM (Claude, OpenAI, etc.)
  logger?: LogProvider              // Optional: Logging (console, Winston, etc.)
  repository?: RepositoryProvider   // Optional: Storage (Firestore, Redis, etc.)

  maxIterations?: number  // prevent infinite loops, default 50
}

// Sub-agent definition
interface SubAgentConfig {
  name: string              // Unique identifier
  description: string       // Shown in __task__ tool
  systemPrompt: string      // Agent instructions
  tools: Tool[]             // Available tools
  model?: string            // Override model (e.g., 'haiku' for fast tasks)
}

// Agent run result (stateless - returns history for storage)
interface AgentResult {
  response: string           // Final text response
  history: Message[]         // Full conversation (store in Firestore)
  toolCalls: ToolCallLog[]   // Log of all tool invocations
}

// LLM Provider interface (for multi-provider support)
interface LLMProvider {
  chat(
    systemPrompt: string,
    messages: Message[],
    tools: ToolSchema[]
  ): Promise<LLMResponse>
}

interface LLMResponse {
  content: ContentBlock[]
  stopReason: 'end_turn' | 'tool_use' | 'max_tokens'
}

// Logging Provider - plug in your own logging solution
interface LogProvider {
  debug(message: string, data?: unknown): void
  info(message: string, data?: unknown): void
  warn(message: string, data?: unknown): void
  error(message: string, data?: unknown): void

  // Agent-specific logging
  onToolCall?(toolName: string, params: unknown): void
  onToolResult?(toolName: string, result: ToolResult): void
  onIteration?(iteration: number, messages: Message[]): void
  onComplete?(result: AgentResult): void
}

// Repository Provider - plug in your own storage (Firestore, Redis, etc.)
interface RepositoryProvider {
  // Conversation history
  getHistory(conversationId: string): Promise<Message[]>
  saveHistory(conversationId: string, messages: Message[]): Promise<void>

  // Optional: Agent state persistence
  getState?(agentId: string): Promise<Record<string, unknown> | null>
  saveState?(agentId: string, state: Record<string, unknown>): Promise<void>

  // Optional: Tool results caching
  getCached?(key: string): Promise<unknown | null>
  setCached?(key: string, value: unknown, ttl?: number): Promise<void>
}
```

---

## Implementation Steps

### Phase 1: Project Setup

1. Initialize PNPM project with TypeScript config
2. Create `package.json` with minimal deps

### Phase 2: Core Types

3. Define all interfaces in `types.ts`
   - Message, ContentBlock, Tool, ToolResult
   - AgentConfig (with thinking, context options)
   - AgentResult (with status, pendingQuestion)
   - LLMProvider, LLMResponse

### Phase 3: LLM Provider

4. Create provider interface (`providers/base.ts`)
5. Implement Claude provider (`providers/claude.ts`)
   - Support thinking mode parameter
   - Handle tool_use stop reason

### Phase 4: Context Management

6. Implement token estimation (`context.ts`)
7. Implement truncation strategies
8. Implement history summarization (optional)

### Phase 5: Agent Core

9. Implement execution loop (`executor.ts`)
   - Tool execution with context
   - Ask user interruption handling
   - Thinking block collection
10. Implement Agent class (`agent.ts`)
    - Built-in `__ask_user__` tool injection
    - Context management integration

### Phase 6: Exports

11. Create public API exports (`index.ts`)

---

## Dependencies (Minimal)

```json
{
  "dependencies": {
    "@anthropic-ai/sdk": "^0.34.0"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "@types/node": "^20.0.0"
  }
}
```

**Only 1 runtime dependency** - Anthropic SDK

---

## Usage Examples

### Basic Usage (Telegram Bot / Firebase Function)

```typescript
import { Hive, ClaudeProvider, ConsoleLogger } from 'hive-agent'

// Create providers
const llm = new ClaudeProvider({
  apiKey: process.env.ANTHROPIC_API_KEY
})

const logger = new ConsoleLogger({ level: 'info' })

// Create agent
const agent = new Hive({
  systemPrompt: 'You are a helpful Telegram assistant.',
  tools: [myCustomTool],
  llm,
  logger
})

// Simple run (stateless)
const result = await agent.run('Hello!')
console.log(result.response)
```

### With Custom Repository (Firestore)

```typescript
import { Hive, ClaudeProvider } from 'hive-agent'
import type { RepositoryProvider } from 'hive-agent'

// Custom Firestore repository
const firestoreRepo: RepositoryProvider = {
  async getHistory(conversationId: string) {
    const doc = await db.collection('chats').doc(conversationId).get()
    return doc.data()?.messages || []
  },
  async saveHistory(conversationId: string, messages: Message[]) {
    await db.collection('chats').doc(conversationId).set({ messages })
  }
}

const agent = new Hive({
  systemPrompt: 'You are a helpful assistant.',
  tools: [myTool],
  llm: new ClaudeProvider({ apiKey: process.env.ANTHROPIC_API_KEY }),
  repository: firestoreRepo
})

// Firebase Function handler
export const onTelegramMessage = async (req, res) => {
  const { text, chatId } = req.body

  // Run with conversation ID - history loaded/saved automatically
  const result = await agent.run(text, { conversationId: chatId })

  await sendTelegramMessage(chatId, result.response)
  res.status(200).send('OK')
}
```

### With Sub-Agents

```typescript
// Create specialized sub-agent
const researchAgent = new Agent({
  systemPrompt: 'You research topics and summarize findings.',
  tools: [webSearchTool],
  provider
})

// Main agent with sub-agent tool
const mainAgent = new Agent({
  systemPrompt: 'You help users with various tasks.',
  tools: [
    {
      name: 'research',
      description: 'Research a topic in depth',
      parameters: {
        type: 'object',
        properties: { topic: { type: 'string' } },
        required: ['topic']
      },
      execute: async ({ topic }) => {
        const result = await researchAgent.run(`Research: ${topic}`)
        return { success: true, data: result.response }
      }
    }
  ],
  provider
})
```

---

## Critical Implementation Details

### 1. Stateless Design

- Agent has no internal state
- `run(message, history?)` accepts optional history
- Returns `{ response, history }` for external storage
- Perfect for serverless (Firebase Functions)

### 2. Ask User Questions (Interactive Mode)

Like Claude Code, agent can pause to ask clarifying questions. **Context is automatically saved/restored via the repository provider.**

```typescript
interface AgentResult {
  response: string
  history: Message[]
  toolCalls: ToolCallLog[]
  pendingQuestion?: {           // If agent needs user input
    question: string
    options?: string[]          // Optional multiple choice
  }
  status: 'complete' | 'needs_input'
}

// Run options - identifies the conversation
interface RunOptions {
  conversationId: string        // Required when using repository
  userId?: string               // Optional: for user-specific context
  metadata?: Record<string, unknown>  // Optional: passed to repository
}
```

**Automatic Context Handling:**

When a repository is configured, the framework automatically:
1. **Loads history** before running (via `repository.getHistory()`)
2. **Saves history** after each run (via `repository.saveHistory()`)
3. **Persists pending state** when asking for clarification

```typescript
// Internal flow in Hive.run():
async run(message: string, options: RunOptions): Promise<AgentResult> {
  const { conversationId } = options

  // 1. Auto-load history from repository
  const history = this.repository
    ? await this.repository.getHistory(conversationId)
    : []

  // 2. Execute agent loop
  const result = await this.executor.run(message, history)

  // 3. Auto-save history to repository
  if (this.repository) {
    await this.repository.saveHistory(conversationId, result.history)
  }

  return result
}
```

**Simple Telegram Bot (no manual history management):**

```typescript
const agent = new Hive({
  llm: new ClaudeProvider({ apiKey }),
  repository: firestoreRepo,  // Auto-handles history
  tools: [myTool]
})

// Firebase Function - super simple!
export const onTelegramMessage = async (req, res) => {
  const { text, chatId, userId } = req.body

  // Run - history automatically loaded/saved via repository
  const result = await agent.run(text, {
    conversationId: `${userId}:${chatId}`  // Per-user, per-chat
  })

  if (result.status === 'needs_input') {
    // Agent asked a question - just send it
    // History already saved, will resume on next message
    await sendTelegramMessage(chatId, result.pendingQuestion.question)
  } else {
    await sendTelegramMessage(chatId, result.response)
  }

  res.status(200).send('OK')
}
```

**Key Points:**
- No manual history loading/saving needed
- `conversationId` uniquely identifies the conversation
- Can use `userId:chatId` pattern for per-user, per-chat context
- Pending questions automatically resume on next message

### 3. Think/Plan Mode (Extended Reasoning)

Claude Code uses extended thinking for complex tasks. We support this via:

```typescript
interface AgentConfig {
  // ... existing fields
  thinkingMode?: 'none' | 'enabled' | 'extended'  // NEW
  thinkingBudget?: number  // Max thinking tokens (for extended)
}
```

**Provider passes to Claude API:**

```typescript
// In claude.ts provider
if (config.thinkingMode === 'extended') {
  apiParams.thinking = {
    type: 'enabled',
    budget_tokens: config.thinkingBudget || 10000
  }
}
```

**Thinking content included in response for transparency:**

```typescript
interface AgentResult {
  // ... existing fields
  thinking?: string[]  // Thinking blocks from the run
}
```

### 4. Context Management (Read Files in Portions)

Prevent context overflow by tracking token usage:

```typescript
interface AgentConfig {
  // ... existing fields
  maxContextTokens?: number    // Default: 100000
  contextStrategy?: 'truncate_old' | 'summarize' | 'error'
}

interface ToolContext {
  remainingTokens: number      // Tools can check available space
  requestTruncation: (maxChars: number) => void  // Request smaller output
}
```

**File reading with portions:**

```typescript
// User-defined read tool can use context
const readFileTool: Tool = {
  name: 'read_file',
  description: 'Read file contents. Use offset/limit for large files.',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string' },
      offset: { type: 'number', description: 'Start line (optional)' },
      limit: { type: 'number', description: 'Max lines (optional, default 500)' }
    },
    required: ['path']
  },
  execute: async ({ path, offset = 0, limit = 500 }, context) => {
    const lines = await readLines(path)
    const total = lines.length
    const chunk = lines.slice(offset, offset + limit)

    return {
      success: true,
      data: {
        content: chunk.join('\n'),
        totalLines: total,
        offset,
        hasMore: offset + limit < total
      }
    }
  }
}
```

**Token counting in executor:**

```typescript
// Simple token estimation (4 chars ≈ 1 token)
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

// In execution loop
const contextTokens = estimateTokens(JSON.stringify(messages))
if (contextTokens > config.maxContextTokens) {
  if (config.contextStrategy === 'truncate_old') {
    messages = truncateOldMessages(messages, config.maxContextTokens)
  } else if (config.contextStrategy === 'summarize') {
    messages = await summarizeHistory(messages, provider)
  } else {
    throw new Error('Context limit exceeded')
  }
}
```

### 5. Tool Execution Loop (Updated)

```typescript
async run(userMessage: string, history: Message[] = []): Promise<AgentResult> {
  const messages = [...history, { role: 'user', content: userMessage }]
  const thinkingBlocks: string[] = []

  for (let i = 0; i < this.maxIterations; i++) {
    // Context management
    this.manageContext(messages)

    const response = await this.provider.chat(
      this.systemPrompt,
      messages,
      this.toolSchemas,
      { thinking: this.config.thinkingMode }
    )

    // Collect thinking blocks
    for (const block of response.content) {
      if (block.type === 'thinking') {
        thinkingBlocks.push(block.thinking)
      }
    }

    messages.push({ role: 'assistant', content: response.content })

    if (response.stopReason !== 'tool_use') {
      return {
        response: extractText(response.content),
        history: messages,
        toolCalls: this.toolLog,
        thinking: thinkingBlocks,
        status: 'complete'
      }
    }

    // Execute tools
    for (const block of response.content) {
      if (block.type === 'tool_use') {
        // Special handling for ask_user tool
        if (block.name === '__ask_user__') {
          return {
            response: '',
            history: messages,
            toolCalls: this.toolLog,
            thinking: thinkingBlocks,
            pendingQuestion: block.input,
            status: 'needs_input'
          }
        }

        const tool = this.tools.find(t => t.name === block.name)
        const result = await tool.execute(block.input, this.toolContext)
        messages.push({
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result) }]
        })
      }
    }
  }

  throw new Error('Max iterations reached')
}
```

### 6. Error Handling

- Tool errors return `{ success: false, error: message }` to LLM
- LLM decides how to proceed (retry, inform user, etc.)
- Max iterations prevents infinite loops
- Context overflow handled gracefully

### 7. System Prompt Builder

Claude Code uses detailed system prompts with dynamic sections. The framework should support this:

```typescript
interface SystemPromptConfig {
  basePrompt: string           // Core instructions
  tools: Tool[]                // Tools inject their descriptions
  environment?: {              // Dynamic context
    workingDirectory?: string
    platform?: string
    date?: string
    customVars?: Record<string, string>
  }
  reminders?: string[]         // Injected as <system-reminder> tags
}

// Builder constructs full prompt
function buildSystemPrompt(config: SystemPromptConfig): string {
  let prompt = config.basePrompt

  // Add environment info
  if (config.environment) {
    prompt += `\n\n<env>
Working directory: ${config.environment.workingDirectory}
Platform: ${config.platform}
Today's date: ${config.date}
</env>`
  }

  // Tool descriptions are passed separately to API
  // But some context about available tools can be in prompt

  return prompt
}
```

**System Prompt Sections (Claude Code pattern):**

1. **Identity** - Who the agent is
2. **Capabilities** - What it can do
3. **Constraints** - What it must NOT do
4. **Tone/Style** - How to communicate
5. **Tool Usage Policy** - When to use which tools
6. **Environment** - Current context (directory, date, etc.)
7. **Reminders** - Dynamic hints injected during execution

---

## Files to Create (in order)

| File                              | Purpose                                    | ~Lines |
| --------------------------------- | ------------------------------------------ | ------ |
| `package.json`                    | Project config                             | 25     |
| `tsconfig.json`                   | TypeScript config                          | 20     |
| `src/types.ts`                    | All interfaces                             | 180    |
| `src/providers/llm/base.ts`       | LLM provider interface                     | 25     |
| `src/providers/llm/claude.ts`     | Claude implementation                      | 80     |
| `src/providers/logger/base.ts`    | Logger provider interface                  | 20     |
| `src/providers/logger/console.ts` | Default console logger                     | 40     |
| `src/providers/repository/base.ts`| Repository provider interface              | 25     |
| `src/providers/repository/memory.ts` | Default in-memory storage               | 50     |
| `src/providers/index.ts`          | Provider exports                           | 15     |
| `src/context.ts`                  | Token estimation, truncation               | 70     |
| `src/prompt.ts`                   | System prompt builder                      | 60     |
| `src/executor.ts`                 | Tool execution loop                        | 100    |
| `src/agent.ts`                    | Hive class (main agent)                    | 80     |
| `src/index.ts`                    | Public exports                             | 30     |

**Total: ~820 lines of code**

---

## Summary of Hive Features

| Feature              | Implementation                                            |
| -------------------- | --------------------------------------------------------- |
| **Tool Loop**        | Executes tools until LLM returns text-only response       |
| **Rich Tool Desc**   | Multi-line descriptions with usage, examples, constraints |
| **Sub-agents**       | Built-in agent registry, auto-generated `__task__` tool   |
| **Ask User**         | Auto-saves context, resumes on next message via repository  |
| **Think Mode**       | `thinkingMode: 'extended'` passes to Claude API           |
| **Context Mgmt**     | Token counting, truncation, summarization strategies      |
| **File Portions**    | Tools receive `ToolContext` with remaining tokens         |
| **System Prompts**   | Builder with env injection, reminders, dynamic sections   |
| **Auto History**     | Automatic load/save via repository, per-user per-chat     |
| **Stateless**        | Works in Firebase Functions, no in-memory state           |
| **LLM Provider**     | Pluggable LLM (Claude, OpenAI, etc.)                      |
| **Logger Provider**  | Pluggable logging (console, Winston, custom)              |
| **Repository Provider** | Pluggable storage (Firestore, Redis, memory, custom)   |
