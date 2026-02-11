# Plan Mode

Two-phase workflow: the agent explores and writes a plan first, then executes it. In plan mode the [workspace](./workspace.md) is read-only — the agent can only write to the plan file. This lets you review the plan before any changes are made.

```typescript
const agent = new Hive({ /* config */ })

// Phase 1: agent explores workspace and writes a plan (read-only)
const planResult = await agent.run('Design a caching layer', {
  workspace,
  mode: 'plan'
})

// Review the plan
const plan = workspace.read<string>('.hive/plan.md')
console.log(plan)

// Phase 2: plan is injected into the system prompt, full access granted
const execResult = await agent.run('Implement the plan', {
  workspace,
  mode: 'execute'
})
```

## Modes

| Mode | Workspace | Plan |
| ---- | --------- | ---- |
| `'plan'` | Read-only (only `/.hive/plan.md` is writable) | Agent writes a new plan |
| `'execute'` | Full access | Previous plan is injected into the system prompt |
| `undefined` | Full access | No plan — agent works directly (default) |

Plan mode is always explicit — the agent cannot enter it on its own. You control the workflow from your application code.
