# Hive Agent Documentation

Minimal TypeScript framework for building AI agents, inspired by Claude Code architecture.

## Quick Start

```bash
pnpm add @alexnetrebskii/hive-agent
```

```typescript
import { Hive, ClaudeProvider } from '@alexnetrebskii/hive-agent'

const agent = new Hive({
  systemPrompt: 'You are a helpful assistant.',
  tools: [],
  llm: new ClaudeProvider({ apiKey: process.env.ANTHROPIC_API_KEY })
})

const result = await agent.run('Hello!')
console.log(result.response)
```

See [Quick Start Guide](./quickstart.md) for more examples.

## Documentation

### Core Concepts

| Guide | Description |
|-------|-------------|
| [Quick Start](./quickstart.md) | Installation, basic agent, first tool |
| [Tools](./tools.md) | Creating custom tools, parameters, validation |
| [Sub-Agents](./sub-agents.md) | Delegating tasks to specialized agents |
| [Workspace](./workspace.md) | Virtual file system for sharing data |
| [Configuration](./configuration.md) | All configuration options |

### Providers

| Guide | Description |
|-------|-------------|
| [LLM Providers](./providers.md) | Claude, OpenAI, custom providers |
| [History](./history.md) | Conversation persistence (Memory, Firestore, Redis, PostgreSQL) |

### Features

| Guide | Description |
|-------|-------------|
| [Task Management](./task-management.md) | 4-tool system for tracking tasks with dependencies |
| [Prompt Builder](./prompt-builder.md) | Battle-tested templates for multi-agent prompts |
| [Interactive](./interactive.md) | Agent asking clarifying questions |
| [Interruption](./interruption.md) | Stopping and continuing agent execution |
| [Tracing](./tracing.md) | Execution monitoring with cost breakdown |
| [Caching](./caching.md) | Prompt caching for cost reduction |

### Advanced

| Guide | Description |
|-------|-------------|
| [Run Recording](./run-recording.md) | Recording and replaying agent runs |

## Key Features

- **Stateless** — Works in serverless (Firebase Functions, Vercel)
- **Multi-provider** — Claude, OpenAI, or bring your own
- **Sub-agents** — Delegate to specialized agents with different models
- **Virtual file system** — Built-in tools with validation and auto-fix
- **Cost tracking** — Full execution tree with token/cost breakdown
- **Prompt caching** — Up to 90% cost reduction with Claude

## License

MIT
