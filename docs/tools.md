# Defining Tools

Tools are the primary way agents interact with the outside world. Each tool has a name, description, parameters schema, and an execute function.

## Basic Tool

```typescript
import type { Tool } from '@alexnetrebskii/hive-agent'

const weatherTool: Tool = {
  name: 'get_weather',
  description: 'Get current weather for a city',
  parameters: {
    type: 'object',
    properties: {
      city: { type: 'string', description: 'City name' }
    },
    required: ['city']
  },
  execute: async ({ city }) => {
    const weather = await fetchWeather(city)
    return { success: true, data: weather }
  }
}

const agent = new Hive({
  systemPrompt: 'You help users check weather.',
  tools: [weatherTool],
  llm: provider
})
```

## Tool Result

Tools must return a `ToolResult`:

```typescript
interface ToolResult {
  success: boolean
  data?: unknown    // Any JSON-serializable data
  error?: string    // Error message if success is false
}
```

### Success

```typescript
execute: async ({ city }) => {
  const weather = await fetchWeather(city)
  return {
    success: true,
    data: {
      temperature: 22,
      condition: 'sunny',
      humidity: 45
    }
  }
}
```

### Error

```typescript
execute: async ({ city }) => {
  try {
    const weather = await fetchWeather(city)
    return { success: true, data: weather }
  } catch (error) {
    return {
      success: false,
      error: `Failed to fetch weather: ${error.message}`
    }
  }
}
```

## Tool Context

Tools receive a context object with useful information:

```typescript
interface ToolContext {
  remainingTokens: number      // Tokens left in context window
  conversationId?: string      // Current conversation ID
  userId?: string              // Current user ID
  workspace?: Workspace        // Shared workspace for data storage
}
```

### Using Workspace

```typescript
const saveTool: Tool = {
  name: 'save_result',
  description: 'Save analysis result to workspace',
  parameters: {
    type: 'object',
    properties: {
      result: { type: 'string' }
    },
    required: ['result']
  },
  execute: async ({ result }, toolCtx) => {
    // Access shared workspace
    if (toolCtx.workspace) {
      toolCtx.workspace.write('analysis/result.md', result, 'save_tool')
    }

    // Check remaining tokens
    if (toolCtx.remainingTokens < 1000) {
      return {
        success: true,
        data: { saved: true, warning: 'Low context space' }
      }
    }

    return { success: true, data: { saved: true } }
  }
}
```

## Parameters Schema

Tools use JSON Schema for parameter validation:

```typescript
const searchTool: Tool = {
  name: 'search',
  description: 'Search for items',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query'
      },
      limit: {
        type: 'number',
        description: 'Maximum results (default: 10)'
      },
      category: {
        type: 'string',
        description: 'Filter by category',
        enum: ['books', 'movies', 'music', 'all']
      }
    },
    required: ['query']
  },
  execute: async ({ query, limit = 10, category = 'all' }) => {
    const results = await search(query, { limit, category })
    return { success: true, data: results }
  }
}
```

## Async Operations

Tools can perform any async operation:

```typescript
const fetchTool: Tool = {
  name: 'fetch_url',
  description: 'Fetch content from a URL',
  parameters: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'URL to fetch' }
    },
    required: ['url']
  },
  execute: async ({ url }) => {
    const response = await fetch(url)

    if (!response.ok) {
      return {
        success: false,
        error: `HTTP ${response.status}: ${response.statusText}`
      }
    }

    const content = await response.text()
    return {
      success: true,
      data: {
        status: response.status,
        contentType: response.headers.get('content-type'),
        content: content.slice(0, 5000)  // Truncate for context
      }
    }
  }
}
```

## Database Operations

```typescript
const dbTool: Tool = {
  name: 'query_users',
  description: 'Query users from database',
  parameters: {
    type: 'object',
    properties: {
      filter: { type: 'string', description: 'Filter expression' },
      limit: { type: 'number', description: 'Max results' }
    }
  },
  execute: async ({ filter, limit = 100 }, toolCtx) => {
    const users = await db.collection('users')
      .where('active', '==', true)
      .limit(limit)
      .get()

    return {
      success: true,
      data: {
        count: users.docs.length,
        users: users.docs.map(d => d.data())
      }
    }
  }
}
```

## File Operations

```typescript
const readFileTool: Tool = {
  name: 'read_file',
  description: 'Read contents of a file',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path' }
    },
    required: ['path']
  },
  execute: async ({ path }) => {
    try {
      const content = await fs.readFile(path, 'utf-8')
      return { success: true, data: { content } }
    } catch (error) {
      return { success: false, error: `Cannot read file: ${error.message}` }
    }
  }
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
  data?: unknown
  error?: string
}

interface ToolContext {
  remainingTokens: number
  conversationId?: string
  userId?: string
  workspace?: Workspace
}

interface JSONSchema {
  type: 'object'
  properties: Record<string, {
    type: string
    description?: string
    enum?: string[]
    items?: JSONSchema
  }>
  required?: string[]
  additionalProperties?: boolean
}
```
