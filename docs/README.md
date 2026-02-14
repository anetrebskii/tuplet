# Quick Start

Get up and running with Hive Agent.

## Installation

```bash
pnpm add @alexnetrebskii/hive-agent
```

## Basic Agent

```typescript
import { Hive, ClaudeProvider } from '@alexnetrebskii/hive-agent'

const agent = new Hive({
  role: 'a helpful assistant',
  tools: [],
  llm: new ClaudeProvider({ apiKey: process.env.ANTHROPIC_API_KEY })
})

const result = await agent.run('Hello!')
console.log(result.response)
```

## Extended Example

Workspace, sub-agents, secrets, progress tracking, and tracing — all in one setup:

```typescript
import {
  Hive, ClaudeProvider, OpenAIProvider,
  SubAgentBuilder,
  Workspace, FileWorkspaceProvider, MemoryEnvironmentProvider,
  ConsoleLogger, ConsoleTraceProvider,
  type SubAgentConfig, type Tool
} from '@alexnetrebskii/hive-agent'

// Custom tool
const searchFoodTool: Tool = {
  name: 'search_food',
  description: 'Search for food nutrition data',
  parameters: {
    type: 'object',
    properties: { query: { type: 'string' } },
    required: ['query']
  },
  execute: async ({ query }) => {
    const res = await fetch(`https://world.openfoodfacts.org/cgi/search.pl?search_terms=${query}&json=1`)
    return { success: true, data: await res.json() }
  }
}

// Sub-agent with a different provider
const researcher: SubAgentConfig = {
  name: 'researcher',
  description: 'Research nutrition data for ingredients',
  systemPrompt: new SubAgentBuilder()
    .role('a nutrition research specialist')
    .task('Find nutrition data for requested ingredients.')
    .tools([searchFoodTool])
    .build(),
  tools: [searchFoodTool],
  llm: new OpenAIProvider({ apiKey: process.env.OPENAI_API_KEY, model: 'gpt-4o-mini' })
}

// Workspace with validation
const workspace = new Workspace({
  provider: new FileWorkspaceProvider('./workspace-data'),
  paths: {
    'user/preferences.json': { value: { allergies: [], goal: 'healthy eating' } },
    'plan/meals.json': {
      validator: { type: 'object', required: ['meals'] },
      description: 'Generated meal plan'
    }
  }
})
await workspace.init()

// Agent
const agent = new Hive({
  role: 'a nutrition consultant',
  tools: [],
  agents: [researcher],
  llm: new ClaudeProvider({ apiKey: process.env.ANTHROPIC_API_KEY }),

  // Progress & logging
  logger: {
    ...new ConsoleLogger({ level: 'warn' }),
    onProgress: (update) => {
      if (update.type === 'tool_start') console.log(`> ${update.message}`)
    },
    onTaskUpdate: (update) => {
      console.log(`Tasks: ${update.progress.completed}/${update.progress.total}`)
    }
  },

  // Cost tracking
  trace: new ConsoleTraceProvider({ showCosts: true })
})

// Run with workspace and secrets
const result = await agent.run('Create a meal plan for today', {
  workspace,
  env: new MemoryEnvironmentProvider({
    FOOD_API_KEY: process.env.FOOD_API_KEY!
  })
})

// Read structured output
const plan = await workspace.read('plan/meals.json')
console.log(plan)

await workspace.dispose()
```

## Examples

- [**Coder**](https://github.com/anetrebskii/hive-agent/tree/main/examples/coder) — AI software developer that creates projects from scratch using built-in shell, workspace, planning, and task tracking. Zero custom tools.
- [**Eating Consultant**](https://github.com/anetrebskii/hive-agent/tree/main/examples/eating-consultant) — Nutrition assistant with custom tools (OpenFoodFacts API), sub-agents (meal planner), workspace persistence, and run recording.

## Documentation

- [Tools](./tools.md) - Built-in tools and creating custom ones
- [Sub-Agents](./sub-agents.md) - Delegating to specialized agents
- [Workspace](./workspace.md) - Virtual filesystem with validation
- [Secrets](./secrets.md) - Secure credential management
- [Providers](./providers.md) - Claude, OpenAI, OpenRouter
- [History](./history.md) - Conversation persistence and summarization
- [Interactive](./interactive.md) - Agent asking clarifying questions
- [Interruption](./interruption.md) - Stopping and continuing execution
- [Plan Mode](./plan-mode.md) - Two-phase plan and execute workflow
- [Task Management](./task-management.md) - Task tracking with dependencies
- [Progress Status](./progress-status.md) - Real-time activity tracking
- [Logger](./logger.md) - Logging and event callbacks
- [Tracing](./tracing.md) - Execution monitoring and cost breakdown
- [Run Recording](./run-recording.md) - Recording and replaying agent runs
