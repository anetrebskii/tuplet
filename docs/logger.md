# Logger

The logger handles internal logging and provides callbacks for real-time UI feedback — tool calls, agent activity, task progress.

## ConsoleLogger

Built-in logger that writes to the console:

```typescript
import { ConsoleLogger } from '@alexnetrebskii/hive-agent'

const agent = new Hive({
  role: '...',
  llm: provider,
  logger: new ConsoleLogger({
    level: 'info',       // 'debug' | 'info' | 'warn' | 'error' (default: 'info')
    prefix: '[MyApp]',   // default: '[Hive]'
    timestamps: true      // default: true
  })
})
```

## Custom Logger

Implement the `LogProvider` interface. Only the four log methods are required — all callbacks are optional:

```typescript
import type { LogProvider } from '@alexnetrebskii/hive-agent'

const logger: LogProvider = {
  debug: (msg, data) => console.debug(msg, data),
  info: (msg, data) => console.info(msg, data),
  warn: (msg, data) => console.warn(msg, data),
  error: (msg, data) => console.error(msg, data),

  // Optional callbacks
  onToolCall: (name, params) => { /* tool execution started */ },
  onToolResult: (name, result, durationMs) => { /* tool execution finished */ },
  onIteration: (iteration, messageCount) => { /* new agent loop iteration */ },
  onComplete: (result) => { /* agent run finished */ },
  onProgress: (update) => { /* real-time status updates */ },
  onTaskUpdate: (update) => { /* task list changes */ },
}
```

## Callbacks

| Callback | When | Parameters |
| -------- | ---- | ---------- |
| `onToolCall` | Tool execution starts | `toolName`, `params` |
| `onToolResult` | Tool execution ends | `toolName`, `result`, `durationMs` |
| `onIteration` | New agent loop iteration | `iteration`, `messageCount` |
| `onComplete` | Agent run finishes | `result` |
| `onProgress` | Real-time status updates | `update` — see [Progress Status](./progress-status.md) |
| `onTaskUpdate` | Task list changes | `update` — see [Task Management](./task-management.md) |

## Extending ConsoleLogger

Add callbacks while keeping console output:

```typescript
const logger = {
  ...new ConsoleLogger({ level: 'warn' }),
  onProgress: (update) => {
    if (update.type === 'tool_start') showSpinner(update.message)
    if (update.type === 'tool_end') hideSpinner()
  }
}
```
