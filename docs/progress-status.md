# Progress Updates

Track what your agent is doing in real-time — thinking, calling tools, spawning sub-agents — via the `onProgress` callback on the logger. Useful for showing spinners, status lines, or live activity feeds in your UI.

```typescript
const agent = new Hive({
  role: '...',
  llm: provider,
  logger: {
    onProgress: (update) => {
      switch (update.type) {
        case 'thinking':
          showSpinner('Thinking...')
          break
        case 'tool_start':
          showSpinner(update.message)  // "Running search_food...", "$ curl ...", etc.
          break
        case 'tool_end':
          hideSpinner()
          break
        case 'sub_agent_start':
          showSpinner(`Delegating to ${update.details?.agentName}...`)
          break
        case 'sub_agent_end':
          hideSpinner()
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
| `tool_start` | Tool execution begins | `toolName` |
| `tool_end` | Tool execution completes | `toolName`, `duration`, `success` |
| `sub_agent_start` | Sub-agent spawned | `agentName` |
| `sub_agent_end` | Sub-agent finished | `agentName`, `success` |
| `status` | General status messages | — |

The `message` field always contains a human-readable description (e.g. `"Creating task: 'Fix bug'..."`, `"$ grep -r 'config'"`, `"Delegating to researcher..."`).

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
