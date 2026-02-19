# Quick Start

Get up and running with Tuplet.

## Installation

```bash
pnpm add tuplet
```

## Basic Agent

```typescript
import { Tuplet, ClaudeProvider } from 'tuplet'

const agent = new Tuplet({
  role: 'a helpful assistant',
  tools: [],
  llm: new ClaudeProvider({ apiKey: process.env.ANTHROPIC_API_KEY })
})

const result = await agent.run('Hello!')

if (result.status === 'error') {
  console.error('Error:', result.error)
} else {
  console.log(result.response)
}

// result.history is always available — even on error or interruption
// Pass it to the next run to continue the conversation
```

### Result Status

`agent.run()` never throws. It always returns an `AgentResult` with one of these statuses:

| Status | Meaning | Key fields |
|--------|---------|------------|
| `complete` | Agent finished successfully | `response`, `history` |
| `needs_input` | Agent is asking the user a question | `pendingQuestion`, `history` |
| `interrupted` | Execution stopped early (abort, timeout, max iterations) | `interrupted`, `history` |
| `error` | Fatal error (LLM API failure, context overflow) | `error`, `history` |

History is **always preserved** regardless of outcome — pass `result.history` to the next `agent.run()` call to continue.
```

## Extended Example

Workspace, sub-agents, secrets, progress tracking, and tracing — all in one setup:

```typescript
import {
  Tuplet, ClaudeProvider, OpenAIProvider,
  SubAgentBuilder,
  Workspace, FileWorkspaceProvider, MemoryEnvironmentProvider,
  ConsoleLogger, ConsoleTraceProvider,
  type SubAgentConfig, type Tool
} from 'tuplet'

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
const agent = new Tuplet({
  role: 'a nutrition consultant',
  tools: [],
  agents: [researcher],
  llm: new ClaudeProvider({ apiKey: process.env.ANTHROPIC_API_KEY }),

  // Progress & logging
  logger: {
    ...new ConsoleLogger({ level: 'warn' }),
    onProgress: (update) => {
      // update.depth: nesting level (0=root, 1=sub-agent, ...)
      // update.id: correlates start/end pairs (tool_start↔tool_end, sub_agent_start↔sub_agent_end)
      // update.parentId: links to parent sub_agent_start for tree building
      const indent = '  '.repeat(update.depth ?? 0)
      switch (update.type) {
        case 'thinking':        console.log(`${indent}🤔 ${update.message}`); break
        case 'text':            console.log(`${indent}💬 ${update.message}`); break
        case 'tool_start':      console.log(`${indent}🔧 ${update.message}`); break
        case 'tool_end':        console.log(`${indent}✅ ${update.message}`); break
        case 'sub_agent_start': console.log(`${indent}🤖 ${update.message}`); break
        case 'sub_agent_end':   console.log(`${indent}✅ ${update.message}`); break
        case 'usage':           console.log(`${indent}📊 ${update.message}`); break
        case 'status':          console.log(`${indent}ℹ️  ${update.message}`); break
      }
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

- [**Coder**](https://github.com/anetrebskii/tuplet/tree/main/examples/coder) — AI software developer that creates projects from scratch using built-in shell, workspace, planning, and task tracking. Zero custom tools.
- [**Eating Consultant**](https://github.com/anetrebskii/tuplet/tree/main/examples/eating-consultant) — Nutrition assistant with custom tools (OpenFoodFacts API), sub-agents (meal planner), workspace persistence, and run recording.

## Documentation

- [Tools](./tools.md) - Built-in tools and creating custom ones
- [Sub-Agents](./sub-agents.md) - Delegating to specialized agents
- [Workspace](./workspace.md) - Virtual filesystem with validation
- [Secrets](./secrets.md) - Secure credential management
- [Providers](./providers.md) - Claude, OpenAI, OpenRouter
- [History](./history.md) - Conversation persistence and summarization
- [Interactive](./interactive.md) - Agent asking clarifying questions
- [Interruption & Error Handling](./interruption.md) - Stopping, error recovery, and continuing execution
- [Plan Mode](./plan-mode.md) - Two-phase plan and execute workflow
- [Task Management](./task-management.md) - Task tracking with dependencies
- [Progress Status](./progress-status.md) - Real-time activity tracking
- [Logger](./logger.md) - Logging and event callbacks
- [Tracing](./tracing.md) - Execution monitoring and cost breakdown
- [Run Recording](./run-recording.md) - Recording and replaying agent runs
