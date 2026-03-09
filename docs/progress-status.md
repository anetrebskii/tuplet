# Progress Updates

Track what your agent is doing in real-time — thinking, calling tools, spawning sub-agents, AI reasoning text, token usage — via the `onProgress` callback on the logger. Useful for showing spinners, status lines, or live activity feeds in your UI.

## Quick Start — Just Use `label`

Every progress event now includes a `label` field with a user-friendly description, auto-populated by the framework. No mapping, no parsing — just display it:

```typescript
const agent = new Tuplet({
  role: '...',
  llm: provider,
  logger: {
    onProgress: (update) => {
      statusBar.setText(update.label ?? update.message)
    }
  }
})
```

| Scenario | `message` (raw) | `label` (user-friendly) |
|---|---|---|
| `curl https://api.stripe.com/...` | `$ curl https://api.stripe.com/...` | `Requesting api.stripe.com...` |
| `cat src/utils/format.ts` | `$ cat src/utils/format.ts` | `Reading format.ts...` |
| `grep -ri "TODO" src/` | `$ grep -ri "TODO" src/` | `Searching for "TODO"...` |
| Read tool on `src/index.ts` | `Running Read...` | `Reading index.ts...` |
| Glob tool `**/*.ts` | `Running Glob...` | `Finding **/*.ts files...` |
| WebFetch `https://api.github.com` | `Running WebFetch...` | `Fetching api.github.com...` |
| Sub-agent `researcher` | `Starting researcher...` | `Delegating to researcher...` |
| Thinking | `Thinking...` | `Thinking...` |

## Activity — Typed Semantic Classification

For richer UIs (localization, custom icons, filtering), use the `activity` field — a typed discriminated union:

```typescript
onProgress: (update) => {
  if (!update.activity) return statusBar.setText(update.message)

  switch (update.activity.type) {
    case 'shell:http_request':
      statusBar.setText(`🌐 ${update.label}`)
      break
    case 'tool:read_file':
      statusBar.setText(`📖 Reading ${update.activity.path}`)
      break
    case 'agent:thinking':
      statusBar.setText('🤔 Pondering...')
      break
    default:
      statusBar.setText(update.label!)
  }
}
```

### Localization Example

```typescript
onProgress: (update) => {
  if (!update.activity) return statusBar.setText(update.message)

  switch (update.activity.type) {
    case 'shell:http_request':
      statusBar.setText(`Запрос к ${update.activity.url}...`)
      break
    case 'tool:read_file':
      statusBar.setText(`Чтение ${update.activity.path}...`)
      break
    default:
      statusBar.setText(update.label!)
  }
}
```

### Activity Types

**Shell activities** — classified from shell commands:

| Type | Source Commands | Key Fields |
|---|---|---|
| `shell:http_request` | `curl`, `wget` | `url?`, `method` |
| `shell:browse` | `browse` | `url?` |
| `shell:file_read` | `cat`, `head`, `tail` | `path?`, `lines?` |
| `shell:file_write` | `echo` (redirect), `sed` | `path?`, `target?`, `pattern?` |
| `shell:file_search` | `grep`, `find` | `pattern?`, `path?`, `namePattern?`, `fileType?`, `flags?` |
| `shell:file_manage` | `ls`, `mkdir`, `rm`, `cp`, `mv` | `path?`, `recursive?` |
| `shell:file_info` | `file`, `wc` | `path?`, `mode?` |
| `shell:data_transform` | `jq`, `sort` | `filter?`, `path?`, `numeric?`, `reverse?` |
| `shell:system` | `env`, `date`, `help` | `command?`, `format?` |
| `shell:other` | Unknown commands | — |

**Tool activities** — classified from built-in tool calls:

| Type | Tools | Key Fields |
|---|---|---|
| `tool:read_file` | Read, workspace_read | `path` |
| `tool:edit_file` | Edit | `path` |
| `tool:write_file` | Write, workspace_write | `path` |
| `tool:search_files` | Glob, workspace_list | `pattern` |
| `tool:search_content` | Grep | `pattern`, `path?` |
| `tool:web_fetch` | WebFetch | `url`, `method` |
| `tool:web_search` | WebSearch | `query` |
| `tool:sub_agent` | __sub_agent__ | `agentName` |
| `tool:task_manage` | TaskCreate/Update/List/Get | `action`, `subject?` |
| `tool:other` | Any unrecognized tool | `toolName` |

**Agent lifecycle activities:**

| Type | When | Key Fields |
|---|---|---|
| `agent:thinking` | Agent is processing | — |
| `agent:responding` | AI emitting intermediate text | — |
| `agent:interrupted` | Execution interrupted | `reason?` |

### Pipe Handling

Piped commands are classified by the **first command** (data source), enriched with downstream context:

| Command | Activity Type | Label |
|---|---|---|
| `cat data.json \| jq '.items'` | `shell:data_transform` | `Processing data.json...` |
| `curl https://api.com \| jq '.results'` | `shell:http_request` | `Requesting api.com...` |
| `grep 'TODO' src/ \| wc -l` | `shell:file_search` | `Searching for "TODO"...` |
| `cat data.csv \| sort -n` | `shell:data_transform` | `Processing data.csv...` |

### `describeActivity()` — Regenerating Labels

The `describeActivity` function is also exported for consumers who want to regenerate labels:

```typescript
import { describeActivity } from 'tuplet'

const label = describeActivity({ type: 'tool:read_file', path: 'src/index.ts' })
// "Reading index.ts..."
```

## Full Example

```typescript
const agent = new Tuplet({
  role: '...',
  llm: provider,
  logger: {
    onProgress: (update) => {
      const indent = '  '.repeat(update.depth ?? 0)

      switch (update.type) {
        case 'thinking':
          showSpinner(update.label ?? 'Thinking...')
          break
        case 'text':
          console.log(`${indent}${update.message}`)
          break
        case 'tool_start':
          showSpinner(`${indent}${update.label ?? update.message}`)
          break
        case 'tool_end':
          hideSpinner()
          break
        case 'sub_agent_start':
          showSpinner(`${indent}${update.label ?? update.message}`)
          break
        case 'sub_agent_end':
          hideSpinner()
          break
        case 'usage':
          const { inputTokens, outputTokens, elapsed, callCost, cumulativeCost } = update.details?.usage ?? {}
          console.log(`${indent}Tokens: ${inputTokens} in / ${outputTokens} out (${(elapsed! / 1000).toFixed(1)}s)`)
          console.log(`${indent}Cost: $${callCost?.toFixed(4)} this call, $${cumulativeCost?.toFixed(4)} total`)
          break
      }
    }
  }
})
```

## Event Types

| Type | When | Details |
| ---- | ---- | ------- |
| `thinking` | Agent is processing | — |
| `text` | AI emits intermediate text | `text` (full content) |
| `tool_start` | Tool execution begins | `toolName` |
| `tool_end` | Tool execution completes | `toolName`, `duration`, `success` |
| `sub_agent_start` | Sub-agent spawned | `agentName` |
| `sub_agent_end` | Sub-agent finished | `agentName`, `success` |
| `usage` | Token stats & cost after LLM call | `usage.inputTokens`, `usage.outputTokens`, `usage.elapsed`, `usage.callCost`, `usage.cumulativeCost`, `usage.modelId` |
| `status` | General status messages | — |

The `message` field always contains the raw technical text (e.g. `"$ grep -r 'config'"`, `"Running Read..."`). The `label` field contains the user-friendly version (e.g. `"Searching for 'config'..."`, `"Reading index.ts..."`). Both are always present when `activity` is set.

## Common Fields

Every `ProgressUpdate` includes `type` and `message`. These optional fields enable richer UIs:

| Field | Type | Description |
| ----- | ---- | ----------- |
| `activity` | `Activity` | Typed semantic classification of what the agent is doing |
| `label` | `string` | User-friendly label auto-populated from `activity` |
| `id` | `string` | Correlation ID — matches `tool_start` with its `tool_end`, or `sub_agent_start` with `sub_agent_end` |
| `depth` | `number` | Nesting depth: `0` for root agent, `1` for sub-agent, `2` for nested sub-agent, etc. |
| `parentId` | `string` | Parent event ID — use with `id` to build a tree of nested events |
| `details` | `object` | Event-specific data (see Event Types table above) |

## Depth & Hierarchy

Sub-agent events are automatically tagged with increasing `depth`. Use it for indented rendering:

```typescript
onProgress: (update) => {
  const indent = update.depth ? '  '.repeat(update.depth) + '└ ' : ''
  console.log(`${indent}${update.label ?? update.message}`)
}
```

Events from a sub-agent's sub-agent get `depth: 2`, and so on. The `parentId` field links child events to the `sub_agent_start` that spawned them, enabling tree-structured UIs.

## Task Progress

For [task management](./task-management.md) updates specifically, use `onTaskUpdate`:

```typescript
logger: {
  onTaskUpdate: (update) => {
    console.log(`Progress: ${update.progress.completed}/${update.progress.total}`)

    if (update.current) {
      console.log(`Working on: ${update.current.activeForm}`)
      // "Implementing API endpoints"
    }
  }
}
```

Both callbacks can be used together — `onProgress` for real-time activity, `onTaskUpdate` for high-level task tracking.
