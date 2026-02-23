# Exploration-Planning Workflow: Product Owner Pattern

## The Pattern

Claude Code transforms vague user requests into structured requirements before delegating to a planning agent. The main agent acts as a **product owner** — it explores first, synthesizes findings, formulates a structured brief, then sends that enriched prompt to the plan agent.

The structured brief template:

- **Context**: current state and exploration findings
- **Goal**: what the user wants to achieve
- **Affected areas**: workspace paths and components involved
- **Constraints**: limitations and dependencies
- **Success criteria**: how to verify completion

## What Hive Had Before

The main agent prompt said "explore first, plan if needed, delegate" but never instructed the agent to **formulate structured requirements** between exploration and planning. The plan agent received whatever free-form text the LLM decided to send. Domain sub-agents got the same treatment — the only guidance was a vague "supply clear and comprehensive prompts".

## Code Changes

### 1. `src/prompt/main-agent-builder.ts` — "Your Role" section

Added "Formulate requirements" as step 2 between "Explore" and "Plan":

```
1. Explore first
2. Formulate requirements  <-- NEW
3. Plan if needed
4. Delegate
5. Present results
```

The step includes the full template (context, goal, affected areas, constraints, success criteria).

Also updated the "Built-in Agents — Mandatory Usage" section to instruct: before calling the plan agent, formulate a structured requirements brief.

### 2. `src/agent.ts` — PLAN_MODE_INSTRUCTIONS

Added "Formulate requirements" as step 2 in the plan mode workflow:

```
1. Explore first
2. Formulate requirements  <-- NEW
3. Write the plan (using structured requirements as input)
```

### 3. `src/built-in-agents/plan.ts` — Plan agent config

- Added `inputSchema` with a `prompt` field whose `description` contains the requirement template. This makes the template visible in the `__sub_agent__` tool's parameter descriptions, so the LLM sees the expected format when composing the tool call.
- Updated `systemPrompt` wording to reference "structured requirements" instead of just "a set of requirements".

### 4. `src/tools/sub-agent.ts` — `__sub_agent__` tool description

Updated the "Key considerations" bullet about prompt quality. Changed from vague "supply clear and comprehensive prompts" to explicit lead-style briefing: "provide each agent with a clear brief — what to accomplish, relevant context from your exploration, constraints, and how to verify success."

### 5. `src/prompt/main-agent-builder.ts` — "Delegate" step

Updated the Delegate step to reinforce the briefing pattern: "Call __sub_agent__ tool with a clear brief: what to accomplish, relevant context from exploration, and how to verify success."

## Design Decisions

- **Prompt-only approach** — no code logic changes, just prompt engineering + inputSchema. Zero breaking changes.
- **Reinforcement at 4 levels** — "Your Role" steps, plan mode instructions, tool parameter description, and `__sub_agent__` tool description. The LLM sees the template at every decision point.
- **inputSchema on plan agent** — the `prompt` param description includes the template, so the LLM sees it at the tool-call level. Still flexible (it's a string field, not a rigid object schema).
- **Lead pattern applies to ALL sub-agents** — not just plan. The "Delegate" step and `__sub_agent__` tool description both tell the main agent to brief every sub-agent with context, goal, and success criteria.

## Verification

1. Run the coder example with a non-trivial request (e.g., "create a REST API with authentication")
2. Check logs — the main agent should explore first, then formulate a structured brief before calling the plan agent
3. Verify the plan agent receives requirements with context/goal/affected areas/constraints/success criteria
4. Verify no regressions for simple requests (agent should skip planning for trivial tasks)
