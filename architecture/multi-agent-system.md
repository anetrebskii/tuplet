# Multi-Agent System in Claude Code

This document describes how multi-agent architecture works in Claude Code, including agent definitions, built-in agents, and how the main agent discovers and uses them.

## Overview

Claude Code uses a **multi-agent architecture** where the main Claude agent can spawn specialized subagents via the **Task tool**. Each agent runs as a subprocess with its own context, tools, and system prompt.

## Agent Definition Schema

Agents are defined with the following properties:

```typescript
interface AgentDefinition {
  agentType: string;           // Unique identifier (e.g., "Explore", "Plan")
  whenToUse: string;           // Description of when to use this agent
  tools?: string[];            // Restricted tool list (undefined = all tools)
  source: AgentSource;         // Where the agent is defined
  baseDir: string;             // Base directory for the agent
  model?: string;              // Model override (e.g., "sonnet", "haiku")
  color?: string;              // UI color for the agent
  forkContext?: boolean;       // Whether agent has access to parent context
  getSystemPrompt: () => string; // Function returning the system prompt
}

type AgentSource =
  | "built-in"        // Hardcoded in Claude Code
  | "userSettings"    // ~/.claude/agents/*.md
  | "projectSettings" // .claude/agents/*.md (in project)
  | "policySettings"  // Organization policy agents
  | "plugin"          // From installed plugins
  | "localSettings"   // Local settings file
  | "flagSettings";   // Feature flag settings
```

## Who Does the Coding?

**The main Claude agent does all the coding directly.** There is no dedicated "coding agent" or "code review agent" because:

1. The main agent already has access to all tools (`Edit`, `Write`, `Bash`, etc.)
2. The main agent has full conversation context (understands what the user wants)
3. Spawning a subagent adds overhead (new context, subprocess creation)
4. Subagents are designed for **parallel/specialized work**, not the core coding task

### Main Agent vs Subagents

| Agent | Can Write Code? | Primary Role |
| ----- | --------------- | ------------ |
| **Main Agent** | **Yes** | Does all coding, editing, and user interaction |
| `general-purpose` | Yes (has all tools) | Research tasks that may incidentally need edits |
| `Explore` | No (read-only) | Understanding codebase structure |
| `Plan` | No (read-only) | Designing implementation approach |
| `Bash` | No (bash only) | Running terminal commands |

### Typical Coding Workflow

```text
User: "Add a login feature"
│
Main Agent (does the coding directly):
├── May spawn Explore agent → understand existing auth patterns
├── May spawn Plan agent → design the implementation
├── DIRECTLY uses Edit tool → writes the code
├── DIRECTLY uses Write tool → creates new files
└── DIRECTLY uses Bash tool → runs tests
```

The main agent orchestrates subagents for research/planning, but **performs all code modifications itself**.

---

## Built-in Agents

These agents are hardcoded in Claude Code and always available:

| Agent Type | Purpose | Tools | Model |
| ---------- | ------- | ----- | ----- |
| `Bash` | Command execution specialist for running bash commands, git operations, and terminal tasks | Bash only | Default |
| `general-purpose` | General-purpose agent for researching questions, searching code, and multi-step tasks | All tools | Default |
| `Explore` | Fast agent for exploring codebases - finding files by patterns, searching code, answering questions about architecture | All except Task, Edit, Write, NotebookEdit, ExitPlanMode | Default |
| `Plan` | Software architect agent for designing implementation plans, identifying critical files, considering trade-offs | All except Task, Edit, Write, NotebookEdit, ExitPlanMode | Default |
| `statusline-setup` | Configures user's Claude Code status line setting | Read, Edit | Sonnet |
| `claude-code-guide` | Answers questions about Claude Code features, hooks, MCP servers, settings, IDE integrations, and Claude Agent SDK | Glob, Grep, Read, WebFetch, WebSearch | Default |

**Note**: There are no built-in "coding" or "code review" agents because the main agent handles these tasks directly.

### Explore Agent

Fast, read-only agent optimized for codebase exploration:

- Searches for files by patterns (e.g., `src/components/**/*.tsx`)
- Searches code for keywords (e.g., "API endpoints")
- Answers questions about codebase structure
- Supports thoroughness levels: "quick", "medium", "very thorough"

### Plan Agent

Read-only planning agent that:

- Analyzes existing patterns and architecture
- Designs implementation strategies
- Returns step-by-step plans
- Identifies critical files to modify
- Considers architectural trade-offs

**Critical restriction**: Plan agent is STRICTLY PROHIBITED from creating or modifying files.

## Custom Agent Sources

### User-Defined Agents (`~/.claude/agents/`)

Users can define custom agents by creating markdown files:

```
~/.claude/agents/
  my-custom-agent.md
  another-agent.md
```

### Project-Defined Agents (`.claude/agents/`)

Projects can define their own agents:

```
.claude/agents/
  project-specific-agent.md
  team-workflow-agent.md
```

### Agent Markdown Format

Custom agents use frontmatter for configuration:

```markdown
---
name: my-agent
description: Description of what this agent does
tools:
  - Read
  - Glob
  - Grep
model: haiku
---

System prompt content goes here.

You are a specialized agent for...
```

## How the Main Agent Discovers Agents

### 1. At Startup

Claude Code loads agents from multiple sources in priority order:

1. **Built-in agents** - Always loaded first
2. **Policy agents** - From organization settings
3. **User agents** - From `~/.claude/agents/`
4. **Project agents** - From `.claude/agents/` in project hierarchy
5. **Plugin agents** - From installed plugins

### 2. System Prompt Injection

The main agent receives a list of available agents in its system prompt:

```
Available agent types and the tools they have access to:
- Bash: Command execution specialist... (Tools: Bash)
- general-purpose: General-purpose agent... (Tools: All tools)
- Explore: Fast agent for exploring... (Tools: Read, Glob, Grep, ...)
- Plan: Software architect agent... (Tools: Read, Glob, Grep, ...)
- my-custom-agent: Description... (Tools: Read, Glob)
```

### 3. Dynamic Discovery

Custom agents from project/user settings are highlighted separately:

```
**Available custom agents configured:**
- my-agent: Use this agent when...
- team-workflow: Use this agent when...
```

## How Agents Are Executed

### Task Tool Invocation

The main agent uses the **Task tool** to spawn subagents:

```json
{
  "name": "Task",
  "parameters": {
    "subagent_type": "Explore",
    "prompt": "Find all files that handle authentication",
    "description": "Search for auth files"
  }
}
```

### Execution Flow

```
1. Main Agent calls Task tool with subagent_type
   │
2. Task tool looks up agent definition from activeAgents
   │
3. Agent's getSystemPrompt() is called to build system prompt
   │
4. New subprocess is spawned with:
   ├── Agent's system prompt
   ├── Restricted tools (if specified)
   ├── Model override (if specified)
   └── Parent context (if forkContext: true)
   │
5. Subagent runs autonomously until completion
   │
6. Result returned to main agent
```

### Context Inheritance

Agents with `forkContext: true` receive:

- Full conversation history before the Task tool call
- Can reference earlier context (e.g., "investigate the error discussed above")
- Don't need repeated information in the prompt

Agents without `forkContext`:

- Start with a fresh context
- Need detailed, self-contained prompts
- More isolated but predictable

## Tool Availability

### Static Tool Assignment

Each agent has a predefined set of available tools:

| Agent | Tool Access |
| ----- | ----------- |
| Bash | Only `Bash` tool |
| Explore | All except Task, Edit, Write, NotebookEdit, ExitPlanMode |
| Plan | All except Task, Edit, Write, NotebookEdit, ExitPlanMode |
| general-purpose | All tools |
| Custom agents | Defined in frontmatter `tools` field |

### Dynamic Tool Filtering

Tools are filtered at runtime based on:

1. Agent's `tools` array (if defined)
2. Permission context (always-allow/always-deny rules)
3. MCP server availability

## Agent Communication

### Background Agents

Agents can run in background using `run_in_background: true`:

```json
{
  "subagent_type": "Explore",
  "prompt": "Analyze the entire codebase structure",
  "run_in_background": true
}
```

Main agent can:

- Continue working while background agents run
- Check progress with `TaskOutput` (block=false)
- Wait for results with `TaskOutput` (block=true)

### Resuming Agents

Agents can be resumed using their ID:

```json
{
  "resume": "agent-id-from-previous-call",
  "prompt": "Continue with the next step"
}
```

## Environment Variables

Subagents receive special environment variables:

| Variable | Description |
| -------- | ----------- |
| `CLAUDE_CODE_AGENT_ID` | Unique ID for this agent instance |
| `CLAUDE_CODE_AGENT_TYPE` | Type of agent (e.g., "team-lead") |
| `CLAUDE_CODE_TEAM_NAME` | Team scope for task management |

## Best Practices

1. **Use Explore for discovery** - Fast, read-only, efficient for codebase questions
2. **Use Plan for architecture** - Before implementing complex features
3. **Parallel agents** - Launch multiple agents in a single message for efficiency
4. **Appropriate thoroughness** - Match agent effort to task complexity
5. **Clear prompts** - Provide detailed context for agents without `forkContext`
6. **Trust agent outputs** - Results are generally reliable

## Summary Table

| Aspect | Static | Dynamic |
| ------ | ------ | ------- |
| Agent definitions | Built-in agents | User/project/plugin agents |
| Tool assignment | Hardcoded in agent definition | - |
| System prompt | `getSystemPrompt()` function | Loaded from markdown files |
| Discovery | Always available | Loaded at startup from directories |
| Model selection | Agent's `model` field | Can be overridden in Task call |
