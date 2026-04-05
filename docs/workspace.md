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
  strict: true,

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
    },

    // Regex pattern: allow any date-named file under meals/
    'meals/\\d{4}-\\d{2}-\\d{2}\\.json': { pattern: true }
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

All writes — including shell redirections (`echo '{}' > file.json`, `sed -i`, etc.) — are validated automatically. Files are validated by extension:

| Extension | Validates |
|-----------|-----------|
| `.json` | Object or array |
| `.md` | String |
| `.txt` | String |
| `.num` | Number |
| `.bool` | Boolean |

When validation fails through the shell, the AI sees the error in stderr along with the expected schema (if defined), so it can fix its output.

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

## Strict Mode

When `strict: true`, agents can only write to paths defined in `paths`. Any write to an undefined path fails with a validation error listing available paths. Defined paths are also **protected from deletion** — they cannot be removed by the agent. Creating new directories is blocked as well.

The `.tuplet/` directory is **exempt from strict mode** — it is used internally by the framework for plan storage, task management, and temporary files. Reads, writes, deletes, and directory creation under `.tuplet/` always succeed regardless of strict mode.

```typescript
const workspace = new Workspace({
  strict: true,
  paths: {
    'config.json': null,
    'output/result.json': { validator: { type: 'object' } }
  }
})

// ✓ Allowed — defined path
workspace.write('config.json', { theme: 'dark' })

// ✗ Fails — path not defined
workspace.write('unknown/file.json', {})

// ✗ Fails — cannot delete a defined path
// shell: rm config.json

// ✗ Fails — cannot create directories in strict mode
// shell: mkdir newdir

// ✓ Always allowed — .tuplet/ is internal
// shell: cat << 'EOF' > .tuplet/plan.md
```

When strict mode is enabled, the framework **automatically** injects a prompt section into the AI's system prompt at run time. This section:

- Tells the AI that strict mode is enabled and only listed paths are writable
- Lists all defined paths with their descriptions
- Shows the expected JSON schema for each path (when a validator is defined)
- Warns that writing to unlisted paths, creating directories, or deleting defined files will fail

No manual prompt configuration is needed — just set `strict: true` and define your paths.

### Patterns

For dynamic paths that follow a naming convention, use `pattern: true` to treat the key as a regex. The pattern is auto-anchored with `^...$`.

```typescript
const workspace = new Workspace({
  strict: true,
  paths: {
    // Exact paths
    'preferences.json': null,

    // Allow any date-named JSON file under meals/
    'meals/\\d{4}-\\d{2}-\\d{2}\\.json': { pattern: true },

    // Allow any .md file under notes/ — with validator
    'notes/.+\\.md': { pattern: true, validator: { type: 'string' } }
  }
})

// ✓ Matches pattern
workspace.write('meals/2026-03-29.json', { breakfast: 'oatmeal' })
workspace.write('notes/shopping.md', '# Shopping list')

// ✗ Fails — no matching path or pattern
workspace.write('meals/invalid.json', {})
```

Patterns can also be registered at runtime:

```typescript
workspace.registerPattern('logs/.+\\.json', null)
```

## Internal Files (.tuplet/)

The `.tuplet/` directory stores framework internals:

| Path | Purpose |
|------|---------|
| `.tuplet/plan.md` | Agent's current plan |
| `.tuplet/tasks.json` | Task management state |
| `.tuplet/tmp/*` | Temporary files (e.g., large output spill) |

By default, `.tuplet/` files are kept **in memory only** — they are not sent to custom workspace providers. This prevents internal framework data from polluting your storage backend.

To persist `.tuplet/` files through the provider (e.g., for debugging or cross-session plan recovery), set `persistInternal: true`:

```typescript
const workspace = new Workspace({
  provider: new FirebaseWorkspaceProvider(...),
  persistInternal: true,  // .tuplet/ files go to Firebase too
  strict: true,
  paths: { ... }
})
```

## URL Restrictions

To restrict which URLs the agent can access via `curl` and `browse`, use `allowedUrls` on the agent — not on the workspace. See [URL Allowlisting](./url-allowlist.md).

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
