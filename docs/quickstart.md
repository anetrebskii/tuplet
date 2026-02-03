# Quick Start

Get up and running with Hive Agent.

## Installation

```bash
pnpm add @alexnetrebskii/hive-agent
```

## Basic Agent

```typescript
import { Hive, ClaudeProvider, MainAgentBuilder } from '@alexnetrebskii/hive-agent'

const provider = new ClaudeProvider({
  apiKey: process.env.ANTHROPIC_API_KEY
})

const systemPrompt = new MainAgentBuilder()
  .role('a helpful assistant')
  .build()

const agent = new Hive({
  systemPrompt,
  tools: [],
  llm: provider
})

const result = await agent.run('Hello!')
console.log(result.response)
```

## Adding a Tool

```typescript
import { Hive, ClaudeProvider, MainAgentBuilder, type Tool } from '@alexnetrebskii/hive-agent'

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

const systemPrompt = new MainAgentBuilder()
  .role('a weather assistant')
  .tools([weatherTool])
  .build()

const agent = new Hive({
  systemPrompt,
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
import {
  Hive, ClaudeProvider, MainAgentBuilder, SubAgentBuilder,
  type SubAgentConfig, type Tool
} from '@alexnetrebskii/hive-agent'

const webSearchTool: Tool = { /* ... */ }

const researcher: SubAgentConfig = {
  name: 'researcher',
  description: 'Research topics using web search',
  systemPrompt: new SubAgentBuilder()
    .role('a research specialist')
    .task('Research topics thoroughly and summarize findings.')
    .tools([webSearchTool])
    .build(),
  tools: [webSearchTool]
}

const systemPrompt = new MainAgentBuilder()
  .role('the orchestrator of a research app')
  .agents([researcher])
  .build()

const agent = new Hive({
  systemPrompt,
  tools: [],
  agents: [researcher],
  llm: new ClaudeProvider({ apiKey: process.env.ANTHROPIC_API_KEY })
})

// Agent can now delegate research tasks
const result = await agent.run('Research the latest news about TypeScript')
```

## Using Workspace

```typescript
import { Hive, ClaudeProvider, MainAgentBuilder, Workspace } from '@alexnetrebskii/hive-agent'

const workspace = new Workspace()

// Pre-populate data
workspace.write('user/name.txt', 'Alex')

const systemPrompt = new MainAgentBuilder()
  .role('a helpful assistant')
  .addWorkspacePath('user/name.txt', 'User name')
  .addWorkspacePath('output/greeting.md', 'Generated greeting')
  .build()

const agent = new Hive({
  systemPrompt,
  tools: [],
  llm: new ClaudeProvider({ apiKey: process.env.ANTHROPIC_API_KEY })
})

const result = await agent.run('Create a personalized greeting', { workspace })

// Read what agent wrote
const greeting = workspace.read('output/greeting.md')
```

## Next Steps

- [Tools](./tools.md) - Creating custom tools
- [Sub-Agents](./sub-agents.md) - Delegating to specialized agents
- [Workspace](./workspace.md) - Sharing data between agents
- [Prompt Builder](./prompt-builder.md) - Fluent API for system prompts
- [Tracing](./tracing.md) - Monitoring execution and costs
- [Configuration](./configuration.md) - All configuration options
