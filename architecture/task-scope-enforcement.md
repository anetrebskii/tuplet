# Task Scope Enforcement in Claude Code

How Claude Code prevents agents from inventing new tasks on every iteration and keeps work scoped to the user's request.

## The Problem

A common failure mode in agentic systems: on each loop iteration the agent discovers adjacent work, creates new tasks, and never converges. Claude Code avoids this through layered prompt constraints — no technical gate, purely behavioral design.

## 1. Identity Constraint: "Nothing More, Nothing Less"

Both the main agent and subagents receive:

> "Do what has been asked; **nothing more, nothing less**. When you complete the task simply respond with a detailed writeup."

This establishes two rules at once:
- **Scope**: only what was asked
- **Termination**: when done, stop and report

Source: `cli.js:4590`, `prompts/cli-tool.system.md`, `prompts/agents/general-purpose.md`

## 2. Anti-Over-Engineering Rules

The system prompt has explicit scope-limiting instructions:

> - "Only make changes that are **directly requested or clearly necessary**"
> - "Don't add features, refactor code, or make 'improvements' **beyond what was asked**"
> - "Don't design for **hypothetical future requirements**"
> - "The right amount of complexity is the **minimum needed for the current task**"

These prevent the agent from noticing adjacent improvements and turning them into tasks.

Source: `cli.js:4388-4391`

## 3. Task Creation Has "When NOT to Use" Rules

The TodoWrite/TaskCreate prompt includes explicit negative guidance:

> Skip using this tool when:
> 1. There is only a **single, straightforward task**
> 2. The task is **trivial** and tracking provides no benefit
> 3. The task can be completed in **less than 3 trivial steps**
> 4. The task is **purely conversational or informational**

Plus 5 detailed "Don't use" examples with reasoning, teaching the model to recognize when task creation is unnecessary.

Source: `prompts/tools/todo-list.md`, `prompts/userprogress.tool.md`

## 4. Tasks Come From User Requests, Not Agent Discovery

The prompt scopes task creation triggers to user actions:

| Allowed trigger | Source |
|---|---|
| "User provides multiple tasks" | User-driven |
| "After receiving new instructions" | User-driven |
| "Complex multi-step tasks" | Decomposing what was asked |

There is no trigger for "I noticed something that could be improved" or "this related area needs work." Tasks are always **decompositions of the user's request**, never autonomous discoveries.

## 5. Completion = Stop, Not "Find More Work"

The workflow is strictly linear with a terminal state:

```
Create tasks from user request
  → Work on task
    → Mark completed
      → Check list
        → All done? → STOP and report
```

The instruction is "when you complete the task simply respond with a detailed writeup" — not "look for new opportunities" or "check if anything else needs attention."

## 6. One In-Progress Task at a Time

> "Exactly ONE task must be in_progress at any time"

This prevents the agent from juggling multiple work streams and discovering adjacent tasks while context-switching.

## 7. No Automated Task-to-Execution Pipeline

There is no scheduler, daemon, or orchestrator that reacts to task creation. Tasks are just JSON files on disk. An agent must **actively decide** to pick up work. This means creating a task doesn't trigger any automated cascade — it's inert data until an agent voluntarily claims it.

## Contrast with Common Agent Pitfalls

| Claude Code | Common pitfall |
|---|---|
| "Nothing more, nothing less" | Open-ended "be helpful" identity |
| Tasks only from user requests | Agent discovers new work autonomously |
| Explicit "when NOT to" examples | Only positive examples of when to create |
| "Stop and report when done" | "Look for more work when done" |
| Anti-over-engineering rules | "Improve things you notice" |
| One task in-progress at a time | Parallel discovery across work streams |

## Key Takeaway

There is **no technical enforcement** preventing task creation. The constraint is entirely behavioral, built through:

1. A scope-limiting identity ("nothing more, nothing less")
2. Negative examples (when NOT to create tasks)
3. A clear termination signal (report and stop)
4. Anti-scope-creep rules (no over-engineering, no hypothetical future work)

If your agent keeps inventing tasks, add explicit "when NOT to create tasks" guidance and a clear stopping condition rather than trying to technically prevent task creation.
