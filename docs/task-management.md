# Task Management

Hive provides a 4-tool task management system inspired by Claude Code, enabling agents to track progress, manage dependencies, and support multi-agent collaboration.

## Overview

The task system consists of four tools automatically available to all agents:

| Tool | Purpose |
|------|---------|
| `TaskCreate` | Create new tasks with subject and description |
| `TaskGet` | Retrieve full task details by ID |
| `TaskUpdate` | Update status, add comments, set dependencies |
| `TaskList` | List all tasks with summary info |

## When to Use Task Management

Agents should use task management for:

- Complex multi-step tasks (3+ steps)
- Non-trivial tasks requiring planning
- When the user explicitly requests tracking
- When given multiple tasks (numbered or comma-separated)
- After receiving new instructions

Skip task management for:

- Single, straightforward tasks
- Trivial tasks with no organizational benefit
- Tasks completable in < 3 steps
- Purely conversational requests

## Task Schema

```typescript
interface TaskItem {
  id: string
  subject: string          // Brief, actionable title (imperative form)
  description?: string     // Detailed requirements and context
  activeForm?: string      // Present continuous form for display
  status: 'pending' | 'in_progress' | 'completed'
  owner?: string           // Agent ID that owns this task
  blocks?: string[]        // Task IDs blocked by this task
  blockedBy?: string[]     // Task IDs that block this task
  comments?: TaskComment[] // Progress notes
  metadata?: Record<string, unknown>
  createdAt: number
  completedAt?: number
}

interface TaskComment {
  author: string           // Agent ID
  content: string
  createdAt: number
}
```

## Task States

| State | Description |
|-------|-------------|
| `pending` | Task not yet started |
| `in_progress` | Currently being worked on (only one at a time) |
| `completed` | Task finished successfully |

### Automatic Behaviors

1. **Auto-start**: First task created (when none in_progress) automatically starts
2. **Auto-progression**: Completing a task automatically starts the next unblocked pending task
3. **Single active**: Setting a task to `in_progress` pauses any other active task
4. **Blocked tasks**: Tasks with unresolved `blockedBy` dependencies won't auto-start
5. **Workspace persistence**: When Workspace is provided, tasks auto-save to `.hive/tasks.json`

## Persistence

Tasks are automatically persisted to Workspace (if provided) at `.hive/tasks.json`. This enables:

- **Resume after `__ask_user__`**: When the agent pauses for user input, tasks are preserved
- **Multi-turn conversations**: Task state persists across multiple `agent.run()` calls
- **Shared state**: Sub-agents can access the same task list via shared Workspace

```typescript
// Tasks persist automatically when Workspace is provided
const workspace = new Workspace({ paths: {} })

const result = await agent.run('Create a task list', { workspace })
// result.status === 'needs_input' (agent asks a question)

// Later, when user responds - tasks are restored automatically
const continued = await agent.run('User answer here', {
  history: result.history,
  workspace  // Same workspace - tasks restored from .hive/tasks.json
})
```

No manual setup required - persistence is automatic when Workspace is passed to `run()`.

## Dependencies

Tasks can have blocking relationships:

- **blocks**: Task IDs that cannot start until this task completes
- **blockedBy**: Task IDs that must complete before this task can start

Dependencies are bidirectional - setting `addBlockedBy` on task 2 also adds task 2 to the `blocks` list of task 1.

### Example: Setting Dependencies

```typescript
// Task 2 depends on Task 1
await agent.run('Set task 2 to be blocked by task 1')

// Agent uses TaskUpdate:
// { taskId: "2", addBlockedBy: ["1"] }
```

When Task 1 completes, Task 2 becomes unblocked and can auto-start.

## Agent Ownership

Tasks support an ownership model for multi-agent collaboration:

### Ownership Rules

1. **Unowned tasks** (`owner: undefined`) - Can be claimed by any agent
2. **Owned tasks** - Can only be updated by:
   - The owning agent itself
   - A "team-lead" type agent (has override privileges)

### Configuration

```typescript
import { createTaskTools, TaskManager } from '@alexnetrebskii/hive-agent'

const taskManager = new TaskManager()

const tools = createTaskTools(taskManager, {
  agentId: 'worker-1',           // This agent's ID
  agentType: 'team-lead',        // Optional: grants override privileges
  logger: myLogger,
  agentName: 'my-sub-agent'
})
```

Defaults to environment variables:
- `CLAUDE_CODE_AGENT_ID` - Agent identifier
- `CLAUDE_CODE_AGENT_TYPE` - Set to `team-lead` for override privileges

## Comments

Tasks support progress notes via comments:

```typescript
// Agent uses TaskUpdate:
// { taskId: "1", comment: "Started implementing the API endpoint" }
```

Comments include author and timestamp for audit trails.

## Using TaskManager Directly

You can use the TaskManager class directly for custom integrations:

```typescript
import { TaskManager } from '@alexnetrebskii/hive-agent'

const manager = new TaskManager()

// Create a task
const task = manager.create(
  'Implement user auth',           // subject
  'Add login/logout endpoints',    // description
  'Implementing user auth'         // activeForm
)

// Update with dependencies
manager.update(task.id, {
  addBlocks: ['2', '3'],           // Block tasks 2 and 3
  comment: { author: 'agent-1', content: 'Starting work' }
})

// Complete and auto-start next
const result = manager.update(task.id, { status: 'completed' })
console.log('Next task:', result.next?.subject)

// Check progress
const progress = manager.getProgress()
// { total: 3, completed: 1, pending: 2, inProgress: 0 }
```

## Receiving Task Updates

Subscribe to task changes via the logger:

```typescript
const logger = {
  onTaskUpdate: (update) => {
    console.log(`Action: ${update.action}`)
    console.log(`Tasks: ${update.tasks.length}`)
    console.log(`Progress: ${update.progress.completed}/${update.progress.total}`)

    if (update.current) {
      console.log(`Working on: ${update.current.subject}`)
    }
  }
}

const agent = new Hive({
  systemPrompt: '...',
  tools: [...],
  llm: provider,
  logger
})
```

## Format Display

Use `formatTaskList` for human-readable output:

```typescript
import { formatTaskList, TaskManager } from '@alexnetrebskii/hive-agent'

const manager = new TaskManager()
// ... create tasks ...

const tasks = manager.getAll()
console.log(formatTaskList(tasks, tasks))
```

Output:
```
1. ✅ Set up project structure
2. 🔄 Implement API endpoints [@worker-1]
3. ⬜ Write tests (blocked by: 2)
4. ⬜ Deploy to production (blocked by: 3)
```

## Example: Multi-Agent Workflow

```typescript
// Main agent creates tasks and assigns to workers
const mainAgent = new Hive({
  systemPrompt: `You are a team lead. Create tasks and assign them to workers.
Use TaskCreate to create tasks with appropriate owners.`,
  tools: [...],
  agents: [
    {
      name: 'api-worker',
      description: 'Implements API endpoints',
      systemPrompt: `You are an API developer.
Use TaskList to find tasks assigned to you, then work on them.`,
      tools: [apiTools]
    }
  ],
  llm: provider
})

// Worker finds and claims tasks
// TaskList shows: 2. ⬜ Implement endpoints [@api-worker]
// Worker uses TaskUpdate: { taskId: "2", status: "in_progress" }
// Worker completes: { taskId: "2", status: "completed" }
```

## Backward Compatibility

The old `TodoManager` and `createTodoTool` are still available but deprecated:

```typescript
// Old (deprecated)
import { TodoManager, createTodoTool } from '@alexnetrebskii/hive-agent'

// New (recommended)
import { TaskManager, createTaskTools } from '@alexnetrebskii/hive-agent'
```

The deprecated `__todo__` tool with `set`/`complete`/`list` actions still works but won't have access to new features like dependencies, comments, and ownership.
