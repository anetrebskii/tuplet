# Plan Mode

Plan mode enforces a two-phase workflow: **plan first**, then **execute**. This prevents agents from making changes before a plan is reviewed.

## How It Works

Set `mode` in `RunOptions`:

```typescript
import { Hive, PLAN_PATH } from 'hive-agent'

const agent = new Hive({ /* config */ })

// Phase 1: Plan (read-only)
const planResult = await agent.run("Design a caching layer", {
  workspace,
  mode: 'plan'
})

// Phase 2: Execute (full access, plan injected)
const execResult = await agent.run("Implement the plan", {
  workspace,
  mode: 'execute'
})
```

## Modes

### `mode: 'plan'`

- **Shell**: Read-only. Only `/.hive/plan.md` is writable.
- **Tools**: `__ask_user__`, `__sub_agent__` (explore + plan agents only), `TaskList`, `TaskGet`, `__shell__` (read-only).
- **System prompt**: Plan-mode instructions are prepended, instructing the agent to explore and write a plan.
- **Cleanup**: Any existing plan is cleared at the start (fresh planning session).

The agent writes its plan to `/.hive/plan.md` using the shell:

```
cat << 'EOF' > /.hive/plan.md
# Plan
1. Add caching middleware
2. Update API routes
3. Add tests
EOF
```

### `mode: 'execute'`

- **Shell**: Full access (read + write).
- **Tools**: All tools available.
- **System prompt**: Plan content is captured and appended to the system prompt as implementation guidance.
- **Cleanup**: The plan file is deleted at the start of the run (content is already captured for the prompt).

### `mode: undefined` (default)

- Full access, no plan injection. Backward compatible with existing usage.
- **Cleanup**: Any leftover plan file is deleted at the start so the agent runs with a clean slate.

## Plan Lifecycle

Every run deletes the old plan file at the start. Only `execute` mode captures the content first.

```
plan run     → delete old plan → agent writes new plan → plan file exists
execute run  → capture plan into prompt → delete file → agent implements
default run  → delete old plan → agent runs normally (no plan context)
```

## What's Enforced in Plan Mode

| Action | Allowed? |
|--------|----------|
| `cat`, `ls`, `grep`, `find`, `head`, `tail` | Yes |
| `echo` (no redirect) | Yes |
| `echo > /.hive/plan.md` | Yes |
| `echo > /anything-else` | No |
| `rm`, `mkdir` | No |
| `TaskCreate`, `TaskUpdate` | No |
| `TaskList`, `TaskGet` | Yes |
| Sub-agent: `explore`, `plan` | Yes |
| Sub-agent: others | No |

## Reading the Plan After Planning

```typescript
const plan = workspace.read<string>('.hive/plan.md')
console.log(plan)
```

## Constants

```typescript
import { PLAN_PATH, PLAN_FS_PATH } from 'hive-agent'

PLAN_PATH    // '.hive/plan.md'
PLAN_FS_PATH // '/.hive/plan.md'
```
