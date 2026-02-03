# Workspace - Shared Data for Agents

Workspace is a virtual filesystem that enables tools and sub-agents to share structured data. Instead of relying on text responses (which can be lost or truncated), Workspace provides validated storage that persists across tool calls, sub-agent runs, and (with providers) across sessions.

## How It Works

Workspace is backed by an in-memory VirtualFS. The framework automatically provides a **shell tool** (`__shell__`) so agents can read/write workspace using bash commands (`cat /data.json`, `echo '...' > /result.json`, etc.). You define the paths and validation — the framework handles the rest.

## Basic Setup

```typescript
import { Hive, ClaudeProvider, Workspace } from '@alexnetrebskii/hive-agent'

// 1. Create workspace with paths
const workspace = new Workspace({
  paths: {
    'user/preferences.json': null,        // format validation only
    'meals/today.json': { value: [] },    // with initial value
    'plan/current.json': {                // with schema validation
      validator: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          days: { type: 'array' }
        },
        required: ['title', 'days']
      }
    }
  }
})

// 2. Create agent
const agent = new Hive({
  systemPrompt: SYSTEM_PROMPT,
  tools: [...],
  llm: new ClaudeProvider({ apiKey: '...' })
})

// 3. Pass workspace to run
const result = await agent.run('Create a meal plan', { workspace })

// 4. Read data written by agent
const plan = workspace.read('plan/current.json')
```

## System Prompt

The framework automatically provides the `__shell__` tool for workspace access. Your system prompt only needs to tell the agent **what paths exist** and **when to save**:

```typescript
const SYSTEM_PROMPT = `You are a nutrition consultant.

## Workspace Storage

Save important data to workspace so it persists:

- user/preferences.json - User dietary preferences { goal, restrictions }
- meals/today.json - Today's meals { totalCalories, meals: [] }
- plan/current.json - Meal plan (required: title, days array)
- notes/advice.md - Nutritional advice (markdown)

Always save meal plans and user preferences to workspace.`
```

## Reading Data

After `agent.run()` completes, read what the agent wrote from your application code:

```typescript
// Read with type hint
const plan = workspace.read<{ title: string; days: string[] }>('plan/current.json')

// Check if exists
if (workspace.has('plan/current.json')) {
  console.log('Plan created!')
}

// Get metadata
const entry = workspace.getEntry('meals/today.json')
console.log(entry?.writtenBy)   // 'nutrition_agent'
console.log(entry?.updatedAt)   // timestamp

// List all data
const items = workspace.list()
// [{ path: 'user/preferences.json', preview: '{goal, restrictions}', updatedAt: ... }]

// List by prefix (matches paths starting with prefix)
workspace.list('meals/')     // 'meals/today.json', 'meals/history.json'
workspace.list('meals')      // same as above
workspace.list('mea')        // also matches 'meals/*'
workspace.list('user/pref')  // 'user/preferences.json'
```

## Initialization Options

### Strict Mode

Only allow writes to defined paths:

```typescript
const workspace = new Workspace({
  strict: true,  // Reject writes to undefined paths
  paths: {
    'user/data.json': null,
    'output/result.json': null
  }
})

// Works
workspace.write('user/data.json', { name: 'Alex' })

// Fails in strict mode
workspace.write('random/path.json', { foo: 'bar' })
// Error: Path "random/path.json" is not defined
```

### Initial Values

Pre-populate paths with data:

```typescript
const workspace = new Workspace({
  paths: {
    // With initial value (format validation from .json extension)
    'config/settings.json': {
      value: { theme: 'dark', language: 'en' }
    },

    // With initial value AND schema validator
    'meals/today.json': {
      validator: {
        type: 'object',
        properties: {
          totalCalories: { type: 'number' },
          meals: { type: 'array' }
        }
      },
      value: { totalCalories: 0, meals: [] }
    }
  }
})

// Data is available immediately
const settings = workspace.read('config/settings.json')
// { theme: 'dark', language: 'en' }
```

### Format Extensions

File-like extensions provide basic type validation:

| Extension | Validates |
|-----------|-----------|
| `.json` | Object or array |
| `.md` | String |
| `.txt` | String |
| `.num` | Number |
| `.bool` | Boolean |

```typescript
const workspace = new Workspace({
  paths: {
    'data/config.json': null,    // Must be object/array
    'notes/summary.md': null,    // Must be string
    'stats/count.num': null,     // Must be number
  }
})
```

### JSON Schema Validation

```typescript
const workspace = new Workspace({
  paths: {
    'plan/current.json': {
      validator: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          goal: { type: 'string', enum: ['weight_loss', 'muscle_gain'] },
          days: { type: 'array' }
        },
        required: ['title', 'days']
      },
      description: 'Weekly meal plan'  // Shown to AI
    }
  }
})
```

### Zod Validation

```typescript
import { z } from 'zod'

const UserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  age: z.number().positive().optional()
})

const workspace = new Workspace({
  paths: {
    'user/profile.json': { validator: UserSchema }
  }
})
```

### Custom Validators

```typescript
const workspace = new Workspace({
  paths: {
    'data/items.json': {
      validator: (value: unknown) => {
        if (!Array.isArray(value)) {
          return [{ path: 'data/items.json', message: 'Must be array' }]
        }
        if (value.length > 100) {
          return [{ path: 'data/items.json', message: 'Max 100 items' }]
        }
        return null  // Valid
      }
    }
  }
})
```

## Writing Data

Pre-populate workspace from your application code before running the agent:

```typescript
// Simple write
workspace.write('user/preferences.json', { theme: 'dark' })

// Write with author tracking
workspace.write('meals/today.json', { meals: [...] }, 'nutrition_agent')

// Check result for validated paths
const result = workspace.write('plan/current.json', { title: 'Plan' })
if (!result.success) {
  console.log('Errors:', result.errors)
  // [{ path: 'plan/current.json.days', message: 'Missing required property: days' }]
}
```

### Runtime Path Registration

```typescript
const workspace = new Workspace({ strict: true, paths: {} })

// Add paths after construction
workspace.registerPath('dynamic/data.json', {
  validator: { type: 'object' },
  value: {}
})
```

### Other Operations

```typescript
// Delete
workspace.delete('temp/scratch')

// Clear all
workspace.clear()

// Export/Import
const data = workspace.toObject()
workspace.fromObject(savedData)

// Count
console.log(workspace.size)
```

## Shared Workspace

Workspace is automatically passed to sub-agents:

```typescript
const workspace = new Workspace({
  paths: {
    'research/findings.json': null,
    'draft/article.md': null,
    'review/feedback.json': null
  }
})

// Parent agent orchestrates sub-agents
const result = await agent.run('Write an article', { workspace })

// Each sub-agent writes to workspace:
// - researcher → 'research/findings.json'
// - writer → 'draft/article.md'
// - reviewer → 'review/feedback.json'

// Access all artifacts
const research = workspace.read('research/findings.json')
const draft = workspace.read('draft/article.md')
const review = workspace.read('review/feedback.json')
```

## Workspace Providers

By default, workspace data lives only in memory. Use a **WorkspaceProvider** to persist data to disk, a database, or any other storage backend.

### Architecture

```
Workspace (validation, JSON ser/de, path registration)
  ├── VirtualFS (in-memory cache, synchronous — Shell reads/writes here)
  │     ├── onChange hook → fires on every write/delete
  │     └── hydrate() → bulk load without triggering onChange
  └── WorkspaceProvider (async persistence layer, sits behind VirtualFS)
        ├── load() → hydrates VirtualFS on init
        ├── write/delete() → called via onChange (fire-and-forget)
        └── subscribe() → pushes external changes into VirtualFS
```

Shell commands stay synchronous. The provider is invisible to agents.

### MemoryWorkspaceProvider

No-op provider — the default behavior. Everything lives only in VirtualFS.

```typescript
import { Workspace, MemoryWorkspaceProvider } from '@alexnetrebskii/hive-agent'

const workspace = new Workspace({
  provider: new MemoryWorkspaceProvider()
})
```

### FileWorkspaceProvider

Persists workspace entries to a directory on disk:

```typescript
import { Workspace, FileWorkspaceProvider } from '@alexnetrebskii/hive-agent'

const workspace = new Workspace({
  provider: new FileWorkspaceProvider('./data/workspace')
})

// Initialize — loads existing files from disk into VirtualFS
await workspace.init()

const agent = new Hive({ ... })
const result = await agent.run('Create a meal plan', { workspace })

// Data is automatically persisted to ./data/workspace/ as files are written

// Clean up when done
await workspace.dispose()
```

On disk, workspace paths map to files:
- `user/preferences.json` → `./data/workspace/user/preferences.json`
- `notes/advice.md` → `./data/workspace/notes/advice.md`

### Custom Provider

Implement the `WorkspaceProvider` interface for any storage backend:

```typescript
import type { WorkspaceProvider, WorkspaceChangeListener } from '@alexnetrebskii/hive-agent'

class FirestoreWorkspaceProvider implements WorkspaceProvider {
  constructor(private db: Firestore, private docPath: string) {}

  async load(): Promise<Record<string, string>> {
    const doc = await this.db.doc(this.docPath).get()
    return doc.exists ? doc.data()?.entries || {} : {}
  }

  async write(path: string, content: string): Promise<void> {
    await this.db.doc(this.docPath).set(
      { entries: { [path]: content } },
      { merge: true }
    )
  }

  async delete(path: string): Promise<void> {
    await this.db.doc(this.docPath).update({
      [`entries.${path}`]: FieldValue.delete()
    })
  }

  // Optional: push real-time changes from other clients
  subscribe(listener: WorkspaceChangeListener): () => void {
    const unsubscribe = this.db.doc(this.docPath).onSnapshot(snap => {
      // Convert changes to WorkspaceChange[] and call listener
    })
    return unsubscribe
  }
}
```

### Provider Interface

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

### Key Design Decisions

- **Write-through**: Every VirtualFS write fires `onChange` → `provider.write()` (async, fire-and-forget)
- **Hydrate without feedback**: `hydrate()` loads data without triggering `onChange`, preventing echo loops
- **Subscribe for real-time**: `provider.subscribe()` pushes external changes into VirtualFS
- **Provider errors are silent**: In-memory VirtualFS is source of truth during a run; persistence failures don't block the agent
- **Backward compatible**: `new Workspace()` without a provider works exactly as before

### Persisting Without a Provider

You can also manually export/import workspace data:

```typescript
// Save after run
const result = await agent.run(message, { workspace })
await db.save(userId, workspace.toObject())

// Restore on next session
const saved = await db.load(userId)
if (saved) {
  workspace.fromObject(saved)
}
```

## Type Reference

```typescript
interface WorkspaceConfig {
  strict?: boolean  // Only allow defined paths (default: false)
  paths?: Record<string, PathConfig | JSONSchema | ValidatorFn | ZodLike | null>
  provider?: WorkspaceProvider  // Persistence layer
}

interface PathConfig {
  validator?: JSONSchema | ValidatorFn | ZodLike | null
  value?: unknown           // Initial value
  description?: string      // Shown to AI
}

interface WriteResult {
  success: boolean
  errors?: ValidationError[]
}

interface ValidationError {
  path: string
  message: string
  expected?: string
  received?: string
}
```
