# Tools

Every agent comes with built-in tools — no setup required. Large tool responses and big files are handled automatically (the agent reads them in chunks).

## Built-in Tools

- **[Workspace](./workspace.md)** — read, write, search, and manage files
- **API requests** — make HTTP requests with authorized credentials via environment variables
- **Web browsing** — fetch web pages and convert HTML to readable text
- **JSON processing** — extract, filter, and transform JSON data
- **Ask user** — pause execution to ask the user a clarifying question
- **[Task management](./task-management.md)** — create and track tasks during [plan mode](./plan-mode.md)
- **[Sub-agents](./sub-agents.md)** — delegate work to specialized agents

In rare cases where built-in tools aren't enough (e.g. calling a domain-specific API or querying a database), you can define custom tools.

## Custom Tools

Each tool has a name, description, parameters schema (JSON Schema), and an execute function:

```typescript
import type { Tool } from 'tuplet'

const weatherTool: Tool = {
  name: 'get_weather',
  description: 'Get current weather for a city',
  parameters: {
    type: 'object',
    properties: {
      city: { type: 'string', description: 'City name' },
      units: { type: 'string', enum: ['celsius', 'fahrenheit'] }
    },
    required: ['city']
  },
  execute: async ({ city, units = 'celsius' }) => {
    try {
      const weather = await fetchWeather(city, units)
      return { success: true, data: weather }
    } catch (error) {
      return { success: false, error: `Failed to fetch weather: ${error.message}` }
    }
  }
}

const agent = new Tuplet({
  role: 'a weather checking assistant',
  tools: [weatherTool],
  llm: provider
})
```

## Tool Context

The second argument gives access to workspace and token budget:

```typescript
execute: async ({ result }, toolCtx) => {
  // Write to shared workspace
  if (toolCtx.workspace) {
    toolCtx.workspace.write('analysis/result.md', result)
  }

  // Check remaining context window
  if (toolCtx.remainingTokens < 1000) {
    return { success: true, data: { warning: 'Low context space' } }
  }

  return { success: true, data: { saved: true } }
}
```

## Type Reference

```typescript
interface Tool {
  name: string
  description: string
  parameters: JSONSchema
  execute: (params: Record<string, unknown>, context: ToolContext) => Promise<ToolResult>
}

interface ToolResult {
  success: boolean
  data?: unknown    // Any JSON-serializable data
  error?: string    // Error message if success is false
}

interface ToolContext {
  remainingTokens: number
  conversationId?: string
  userId?: string
  workspace?: Workspace
}
```
