# Hive Agent

**Claude Code-like AI agent for your own application. Add a few lines — get a multi-agent system that asks clarifying questions, plans tasks, and works with your data.**

Claude Code is impressive: you open a terminal, ask it to code something, and it plans, clarifies, executes. But it's locked to the terminal and local filesystem. What if you need that same intelligence inside your SaaS product, web app, or serverless function — working with your database, your blob storage, your users' data?

Hive gives you exactly that. A powerful, multi-agent framework you plug into your application. Your users get an AI that feels custom-built. You get a library that handles the hard parts.

## You Need Hive Agent If

- You want your own AI agent in your app that codes, manages documents, or works with any workspace you share with it
- You're building on Firebase, Vercel, AWS Lambda, or any serverless platform — Hive is stateless by design
- You're building a SaaS and want to give users a smart AI chat without building an agent framework from scratch
- Your data lives in databases, blob storage, or APIs — not just the local filesystem
- You want Claude Code-level intelligence but inside a web application, without VMs or infrastructure to manage
- You don't want to spend time teaching AI how to work well — Hive handles planning, task tracking, clarifying questions, and tool use out of the box

## Features

### Agent Intelligence

- **Built-in planning & exploration sub-agents** — AI plans its work before executing, just like Claude Code
- **Task generation & tracking** — AI generates tasks and follows them, showing progress in real time
- **Clarifying questions** — AI asks one question or a series of questions when it needs more context
- **Interruption mode** — Correct the AI mid-execution if it goes in the wrong direction, just like Claude Code
- **Optimized built-in prompts** — Carefully tuned prompts for better results across all providers

### Built-in Capabilities

- **Workspace** — Like projects in Claude Code. Hive works with workspace files (virtual or real) the same way Claude Code works with your project
- **Large file processing** — AI reads files >256KB in chunks, just like Claude Code does
- **Web browsing** — Navigate websites, extract data, interact with pages
- **API requests with authentication** — Make HTTP requests to external services

### Multi-Provider

- **Claude** (Anthropic) — First-class support with caching and extended thinking
- **OpenAI** — GPT-4o and other models
- **OpenRouter** — Access to 100+ models via [openrouter.ai](https://openrouter.ai), with optimized prompts so non-Claude models use built-in tools effectively

### Cost & Performance

- **Prompt caching** — Up to 90% cost reduction with Claude's prompt caching
- **Chat history summarization** — Automatic summarization of long conversations to stay within context limits
- **Execution tracing** — Full cost breakdown per request, per model, per sub-agent

### Production-Ready

- **Stateless design** — Works in Firebase Functions, AWS Lambda, any serverless environment
- **Conversation history management** — Automatic load/save with pluggable repository providers
- **Secrets management** — Keep credentials for external systems outside AI context. AI can use them without seeing actual values
- **Interruption & cancellation** — AbortController support, Firestore-based stop signals, graceful partial results

### Extensibility

- **Custom tools** — Define any tool with typed parameters and execution logic
- **Custom sub-agents** — Spawn specialized agents with their own tools, prompts, and even different LLM providers
- **Pluggable storage** — Bring your own chat history provider (Firestore, Redis, Postgres, anything)
- **Pluggable logging & tracing** — Integrate with Datadog, custom dashboards, or any observability platform
- **Pluggable workspaces** — Virtual file systems, database-backed storage, or real file system

## Installation

```bash
npm install @alexnetrebskii/hive-agent
```

```bash
pnpm add @alexnetrebskii/hive-agent
```

## Quick Start

```typescript
import { Hive, ClaudeProvider } from '@alexnetrebskii/hive-agent'

const agent = new Hive({
  systemPrompt: 'You are a helpful assistant.',
  tools: [myTool],
  llm: new ClaudeProvider({ apiKey: process.env.ANTHROPIC_API_KEY })
})

const result = await agent.run('Hello!')
console.log(result.response)
```

## Examples

- [**Coder**](https://github.com/anetrebskii/hive-agent/tree/main/examples/coder) — AI software developer that creates projects from scratch using built-in shell, workspace, planning, and task tracking. Zero custom tools.
- [**Eating Consultant**](https://github.com/anetrebskii/hive-agent/tree/main/examples/eating-consultant) — Nutrition assistant with custom tools (OpenFoodFacts API), sub-agents (meal planner), workspace persistence, and run recording.

## Documentation

- [Quick Start Guide](https://github.com/anetrebskii/hive-agent/blob/main/docs/README.md)
- [Configuration](https://github.com/anetrebskii/hive-agent/blob/main/docs/configuration.md)
- [Defining Tools](https://github.com/anetrebskii/hive-agent/blob/main/docs/tools.md)
- [Sub-Agents](https://github.com/anetrebskii/hive-agent/blob/main/docs/sub-agents.md)
- [Workspace](https://github.com/anetrebskii/hive-agent/blob/main/docs/workspace.md)
- [Conversation History](https://github.com/anetrebskii/hive-agent/blob/main/docs/history.md)
- [Interactive Questions](https://github.com/anetrebskii/hive-agent/blob/main/docs/interactive.md)
- [Interruption & Cancellation](https://github.com/anetrebskii/hive-agent/blob/main/docs/interruption.md)
- [Execution Tracing](https://github.com/anetrebskii/hive-agent/blob/main/docs/tracing.md)
- [Prompt Caching](https://github.com/anetrebskii/hive-agent/blob/main/docs/caching.md)
- [Task Management](https://github.com/anetrebskii/hive-agent/blob/main/docs/task-management.md)
- [Plan Mode](https://github.com/anetrebskii/hive-agent/blob/main/docs/plan-mode.md)
- [Providers](https://github.com/anetrebskii/hive-agent/blob/main/docs/providers.md)

## License

MIT
