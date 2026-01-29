- [ ] How they are executed? Is there specific code which runs agents for each task or agents somehow does it automatically?


# Task Management in Claude Code

This document describes how task management works in Claude Code, including who creates tasks, how they are managed, and the restrictions that apply.

## Overview

Claude Code provides two task management systems:

1. **TodoWrite** - A simple session-scoped todo list for tracking progress
2. **Task Tools** (TaskCreate, TaskGet, TaskUpdate, TaskList) - A more advanced system supporting multi-agent collaboration, dependencies, and persistence

---

## TodoWrite Tool

### Purpose
A lightweight tool for Claude to track its own progress during a session.

### When to Use

| Use TodoWrite | Don't Use TodoWrite |
|---------------|---------------------|
| Complex multi-step tasks (3+ steps) | Single, straightforward tasks |
| Non-trivial tasks requiring planning | Trivial tasks with no organizational benefit |
| User explicitly requests a todo list | Tasks completable in < 3 trivial steps |
| User provides multiple tasks (numbered/comma-separated) | Purely conversational or informational requests |
| After receiving new instructions | |
| When starting work on a task | |

### Task States

| State | Description |
|-------|-------------|
| `pending` | Task not yet started |
| `in_progress` | Currently working on (limit to ONE at a time) |
| `completed` | Task finished successfully |

### Task Fields

Each task requires two forms:
- **content**: Imperative form describing what needs to be done (e.g., "Run tests")
- **activeForm**: Present continuous form shown during execution (e.g., "Running tests")

### Key Rules

1. **Exactly ONE task must be `in_progress`** at any time
2. **Mark tasks complete IMMEDIATELY** after finishing (don't batch)
3. **Only mark as completed when FULLY accomplished**
4. Keep task `in_progress` if encountering errors/blockers
5. **Never mark completed if:**
   - Tests are failing
   - Implementation is partial
   - Unresolved errors exist
   - Necessary files/dependencies not found

---

## Task Tools (Advanced System)

The newer task management system supports team collaboration, task dependencies, and persistent storage.

### Available Tools

| Tool | Purpose |
|------|---------|
| `TaskCreate` | Create new tasks with subject and description |
| `TaskGet` | Retrieve full task details by ID |
| `TaskUpdate` | Update status, add comments, set dependencies |
| `TaskList` | List all tasks with summary info |

### Task Schema

```typescript
interface Task {
  id: string;
  subject: string;           // Brief, actionable title
  description: string;       // Detailed requirements and context
  status: 'open' | 'resolved';
  owner?: string;            // Agent ID if assigned
  references: string[];      // Related task IDs (bidirectional)
  blocks: string[];          // Task IDs that cannot start until this completes
  blockedBy: string[];       // Task IDs that must complete before this can start
  comments: Comment[];       // Progress notes and discussions
}

interface Comment {
  author: string;  // Agent ID
  content: string;
}
```

---

## Agent Ownership Model

### Who Creates Tasks

| Agent Type | Can Create Tasks | Can Update Any Task | Can Update Own Tasks |
|------------|------------------|---------------------|----------------------|
| Main Agent | Yes | Yes | Yes |
| Subagents | Yes | No* | Yes |
| Team Lead | Yes | Yes | Yes |

*Subagents can only update tasks they own or unowned tasks

### Agent Identification

- Each agent has a unique `CLAUDE_CODE_AGENT_ID` environment variable
- Tasks are scoped by `CLAUDE_CODE_TEAM_NAME` for team isolation
- Agent type is identified via `CLAUDE_CODE_AGENT_TYPE`

### Ownership Rules

1. **Unowned tasks** (`owner: undefined`) - Can be claimed by any agent
2. **Owned tasks** - Can only be updated by:
   - The owning agent itself
   - A "team-lead" type agent (has override privileges)
3. **Task assignment** - Set `owner` field when creating or updating a task

### Workflow Example

```
Main Agent (team-lead)
├── TaskCreate: "Implement user authentication" (owner: undefined)
├── TaskCreate: "Write API tests" (owner: agent-worker-1)
│
├── Spawns Subagent (agent-worker-1)
│   ├── TaskGet: Retrieves assigned task
│   ├── TaskUpdate: Marks as in_progress
│   ├── [Does work...]
│   └── TaskUpdate: Marks as resolved
│
└── TaskList: Checks for unblocked tasks
```

---

## Task Dependencies

### Blocking Relationships

- **blocks**: Tasks that cannot start until this task completes
- **blockedBy**: Tasks that must complete before this task can start

### Setting Dependencies

```json
// Task 2 is blocked by Task 1
{"taskId": "2", "addBlockedBy": ["1"]}

// Task 1 blocks Task 2 (equivalent)
{"taskId": "1", "addBlocks": ["2"]}
```

### Finding Available Tasks

Use `TaskList` to find tasks that are:
- Status: `open`
- No owner (or owned by current agent)
- Not blocked (empty `blockedBy` or all blockers resolved)

---

## Context-Specific Restrictions

### During Git Operations

When creating commits or pull requests, the system instructs:
> "DO NOT use the TodoWrite or Task tools"

This keeps git operations focused and prevents task management from interfering.

### System Reminders

The system may send gentle reminders if task tools haven't been used recently:
> "Consider using TodoWrite/TaskCreate to track progress..."

**Important**: Claude must NEVER mention these reminders to the user.

---

## Best Practices

1. **Create tasks with clear, specific subjects** that describe the outcome
2. **Include enough detail in descriptions** for another agent to understand
3. **Check TaskList first** to avoid creating duplicate tasks
4. **Add comments when starting work** to signal progress to the team
5. **Use CLAUDE_CODE_AGENT_ID as author** for comments
6. **Call TaskList after resolving** to find newly unblocked work
7. **Prefer working on tasks in ID order** (lowest ID first) when multiple are available

---

## Summary

| Feature | TodoWrite | Task Tools |
|---------|-----------|------------|
| Persistence | Session only | Across sessions |
| Multi-agent | No | Yes |
| Dependencies | No | Yes (blocks/blockedBy) |
| Ownership | No | Yes |
| Comments | No | Yes |
| Team scoping | No | Yes |
| Use case | Simple tracking | Collaborative workflows |
