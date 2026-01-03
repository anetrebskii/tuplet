# Quick Start

Get up and running with Hive Agent in minutes.

## Installation

```bash
pnpm add @alexnetrebskii/hive-agent
```

## Basic Agent

```typescript
import { Hive, ClaudeProvider } from '@alexnetrebskii/hive-agent'

const provider = new ClaudeProvider({
  apiKey: process.env.ANTHROPIC_API_KEY
})

const agent = new Hive({
  systemPrompt: 'You are a helpful assistant.',
  tools: [],
  llm: provider
})

const result = await agent.run('Hello!')
console.log(result.response)
```

## Adding a Tool

```typescript
import { Hive, ClaudeProvider, type Tool } from '@alexnetrebskii/hive-agent'

const weatherTool: Tool = {
  name: 'get_weather',
  description: 'Get weather for a city',
  parameters: {
    type: 'object',
    properties: {
      city: { type: 'string', description: 'City name' }
    },
    required: ['city']
  },
  execute: async ({ city }) => {
    // Your API call here
    return { success: true, data: { temp: 22, condition: 'sunny' } }
  }
}

const agent = new Hive({
  systemPrompt: 'You help users check weather.',
  tools: [weatherTool],
  llm: new ClaudeProvider({ apiKey: process.env.ANTHROPIC_API_KEY })
})

const result = await agent.run('What is the weather in Tokyo?')
console.log(result.response)
// "The weather in Tokyo is 22°C and sunny."
```

## Conversation History

```typescript
let history = []

// First message
const result1 = await agent.run('My name is Alex', { history })
history = result1.history

// Second message - agent remembers
const result2 = await agent.run('What is my name?', { history })
console.log(result2.response)
// "Your name is Alex."
```

## Adding a Sub-Agent

```typescript
import { Hive, ClaudeProvider, type SubAgentConfig } from '@alexnetrebskii/hive-agent'

const researcher: SubAgentConfig = {
  name: 'researcher',
  description: 'Research topics using web search',
  systemPrompt: 'You research topics and provide summaries.',
  tools: [webSearchTool]
}

const agent = new Hive({
  systemPrompt: 'You help users with various tasks.',
  tools: [],
  agents: [researcher],
  llm: new ClaudeProvider({ apiKey: process.env.ANTHROPIC_API_KEY })
})

// Agent can now delegate research tasks
const result = await agent.run('Research the latest news about TypeScript')
```

## Using Context

```typescript
import { Hive, ClaudeProvider, Context } from '@alexnetrebskii/hive-agent'

const context = new Context()

// Pre-populate data
context.write('user/name', 'Alex')

const agent = new Hive({
  systemPrompt: `You are a helpful assistant.
Use context_read to get user data.
Use context_write to save results.`,
  tools: [],
  llm: new ClaudeProvider({ apiKey: process.env.ANTHROPIC_API_KEY })
})

const result = await agent.run('Create a personalized greeting', { context })

// Read what agent wrote
const greeting = context.read('greeting')
```

## Next Steps

- [Tools](./tools.md) - Creating custom tools
- [Sub-Agents](./sub-agents.md) - Delegating to specialized agents
- [Context](./context.md) - Sharing data between agents
- [Tracing](./tracing.md) - Monitoring execution and costs
- [Configuration](./configuration.md) - All configuration options
