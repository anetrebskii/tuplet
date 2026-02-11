# Task Management

Agents automatically break complex work into tasks and track progress. No setup required — task tools are built-in. When [workspace](./workspace.md) is provided, task state persists to `.hive/tasks.json` across `agent.run()` calls.

## Receiving Task Updates

Subscribe to task changes via the logger to display progress in your UI:

```typescript
const agent = new Hive({
  systemPrompt: '...',
  tools: [...],
  llm: provider,
  logger: {
    onTaskUpdate: (update) => {
      console.log(`Progress: ${update.progress.completed}/${update.progress.total}`)

      if (update.current) {
        console.log(`Working on: ${update.current.subject}`)
      }
    }
  }
})
```

## Display Formatting

Use `formatTaskList` to render a human-readable task list:

```typescript
import { formatTaskList, TaskManager } from '@alexnetrebskii/hive-agent'

const tasks = manager.getAll()
console.log(formatTaskList(tasks, tasks))
```

```
1. ✅ Set up project structure
2. 🔄 Implement API endpoints [@worker-1]
3. ⬜ Write tests (blocked by: 2)
4. ⬜ Deploy to production (blocked by: 3)
```

## Using TaskManager Directly

For custom integrations, you can use the `TaskManager` class outside of an agent:

```typescript
import { TaskManager } from '@alexnetrebskii/hive-agent'

const manager = new TaskManager()

const task = manager.create(
  'Implement user auth',           // subject
  'Add login/logout endpoints',    // description
  'Implementing user auth'         // activeForm (shown in spinner)
)

manager.update(task.id, { status: 'completed' })

const progress = manager.getProgress()
// { total: 3, completed: 1, pending: 2, inProgress: 0 }
```
