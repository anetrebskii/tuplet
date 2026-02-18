# Workspace

Workspace is the agent's working environment — a virtual filesystem for structured data. By default it lives in memory, but you can persist it to disk with `FileWorkspaceProvider`, or implement your own provider for any storage backend (S3, database, etc.).

The framework automatically injects a **shell tool** (`__shell__`) — an emulated shell environment where agents interact with workspace using familiar bash commands (`cat /data.json`, `echo '...' > /result.json`, `ls /`, etc.).

Large files (>256 KB) and long lines are handled automatically — the agent reads them in chunks using pagination.

## Setup

```typescript
import { Tuplet, ClaudeProvider, Workspace, FileWorkspaceProvider } from 'tuplet'

const workspace = new Workspace({
  // Optional: persist to disk (default: in-memory only)
  provider: new FileWorkspaceProvider('./workspace-data'),

  // Optional: restrict writes to defined paths only (default: false)
  strict: false,

  // Define paths with validation
  paths: {
    'user/preferences.json': null,        // format validation only (from .json extension)
    'meals/today.json': { value: [] },    // with initial value
    'plan/current.json': {                // with schema validation
      validator: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          days: { type: 'array' }
        },
        required: ['title', 'days']
      },
      description: 'Weekly meal plan'     // shown to AI in system prompt
    }
  }
})

// Load existing data from provider (required for FileWorkspaceProvider)
await workspace.init()

const agent = new Tuplet({
  role: 'a meal planning assistant',
  tools: [...],
  llm: new ClaudeProvider({ apiKey: '...' })
})

const result = await agent.run('Create a meal plan', { workspace })

// Clean up when done
await workspace.dispose()
```

## Validation

Files are validated by extension automatically:

| Extension | Validates |
|-----------|-----------|
| `.json` | Object or array |
| `.md` | String |
| `.txt` | String |
| `.num` | Number |
| `.bool` | Boolean |

For stricter validation, pass a `validator` — JSON Schema, Zod schema, or a custom function:

```typescript
import { z } from 'zod'

const workspace = new Workspace({
  paths: {
    // JSON Schema
    'plan/current.json': {
      validator: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          days: { type: 'array' }
        },
        required: ['title', 'days']
      }
    },

    // Zod
    'user/profile.json': {
      validator: z.object({
        name: z.string().min(1),
        email: z.string().email()
      })
    },

    // Custom function
    'data/items.json': {
      validator: (value: unknown) => {
        if (!Array.isArray(value)) {
          return [{ path: 'data/items.json', message: 'Must be array' }]
        }
        if (value.length > 100) {
          return [{ path: 'data/items.json', message: 'Max 100 items' }]
        }
        return null  // valid
      }
    }
  }
})
```

## Reading Data

After `agent.run()` completes, read what the agent wrote:

```typescript
// Read with type hint
const plan = workspace.read<{ title: string; days: string[] }>('plan/current.json')

// Check if exists
workspace.has('plan/current.json')

// List all data
const items = workspace.list()
// [{ path: 'user/preferences.json', preview: '{goal, ...}', updatedAt: ... }]
```

## Custom Provider

Implement the `WorkspaceProvider` interface for any storage backend:

```typescript
interface WorkspaceProvider {
  load(): Promise<Record<string, string>>
  write(path: string, content: string): Promise<void>
  delete(path: string): Promise<void>
  subscribe?(listener: WorkspaceChangeListener): () => void
  flush?(): Promise<void>
  dispose?(): Promise<void>
}

interface WorkspaceChange {
  type: 'write' | 'delete'
  path: string
  content?: string
}

type WorkspaceChangeListener = (changes: WorkspaceChange[]) => void
```

`load()` is called once on `workspace.init()`. `write()` and `delete()` are called on every change (fire-and-forget — they don't block the agent). `subscribe()` is optional and lets you push external changes into the workspace in real-time.
