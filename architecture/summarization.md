# Claude Code History Summarization Architecture

Claude Code has **three distinct summarization mechanisms** that work together to manage context:

## 1. Auto-Compaction (Primary Context Management)

**Trigger:** Automatically fires when token usage crosses a threshold. The system calculates available context as `contextWindowSize - autocompactBuffer` (where the buffer is ~13,000 tokens). When the conversation exceeds this limit, compaction triggers before each API call.

**Key function:** `CT2()` — called from the main query loop `ew()`. It checks `Sy5()` which evaluates whether `gK(messages)` (total token count) exceeds the auto-compact threshold.

**Flow:**
1. First tries **session-memory compaction** (`TJ1()`) — a lightweight path that reuses pre-existing session notes as the summary, keeping recent messages intact
2. If that's unavailable/insufficient, falls back to **full compaction** (`NJ1()`)

## 2. Full Compaction (`NJ1`)

This is the heavy-duty summarizer, also invoked via `/compact`:

1. **Runs PreCompact hooks** (user-configurable shell commands)
2. **Sends the entire conversation** to Claude with a detailed summarization prompt (`aY0()`)
3. The prompt asks for a structured summary with 9 sections:
   - Primary Request and Intent
   - Key Technical Concepts
   - Files and Code Sections (with code snippets)
   - Errors and fixes
   - Problem Solving
   - All user messages
   - Pending Tasks
   - Current Work
   - Optional Next Step
4. The response is wrapped in `<analysis>` and `<summary>` tags
5. **File state is restored** — the top 5 most recently read files are re-attached as file references so the model doesn't lose track of what it was working with
6. **Todo lists and plan files** are re-attached
7. **Session hooks** are re-run (SessionStart hooks fire after compaction)
8. Custom summarization instructions can be provided (e.g., "focus on TypeScript changes")

The summary is injected as: `"This session is being continued from a previous conversation that ran out of context. The conversation is summarized below: ..."`

## 3. Micro-Compaction (`Vd()`)

A lighter, always-on optimization that **truncates large tool results** without re-summarizing the full conversation:

- Identifies large `tool_result` blocks (from Read, Bash, Edit, Write, etc.)
- Keeps the **3 most recent** tool results intact
- Replaces older large results with a placeholder: `"[Tool result saved to: <path>]"` or `"[See Read tool for file contents]"`
- The original content is saved to disk so it can be retrieved if needed
- Only activates when context usage exceeds a warning threshold (~20K tokens from the limit)

## 4. Bash Output Summarization

A separate system specifically for large bash command outputs:

- **Threshold:** Only triggers for outputs > 5,000 characters
- Uses a **smaller/faster model** to decide whether to summarize
- The model evaluates whether output is "log spew" (build logs, test output, repetitive debug logs) vs. unique content
- If summarized, produces a markdown summary with:
  - Overview
  - Detailed summary
  - Errors list
  - Verbatim snippets (at least 3)
- The **raw output is saved to disk** and the model is told: `"The complete bash output is available at <path>"`

## Key Thresholds

| Parameter | Value |
|---|---|
| Autocompact buffer | ~13,000 tokens |
| Warning threshold | ~20,000 tokens from limit |
| Error threshold | ~20,000 tokens from limit |
| Bash summarization threshold | 5,000 characters |
| Max files restored after compact | 5 |
| Max tokens per restored file | 5,000 |
| Max total attachment tokens post-compact | 50,000 |

## Session Continuation

When context is completely exhausted and the session is resumed, the summary is wrapped with:

> "This session is being continued from a previous conversation that ran out of context."

And optionally adds: "Please continue the conversation from where we left it off without asking the user any further questions."

## Summarization Prompt Structure

The full compaction prompt instructs the model to:

1. **Chronologically analyze** each message, identifying user requests, approach taken, key decisions, file names, code snippets, function signatures, file edits, and errors
2. **Double-check** for technical accuracy and completeness
3. Wrap analysis in `<analysis>` tags before producing the final `<summary>`
4. Users can provide **custom instructions** for summarization via `/compact [instructions]` or by configuring "Compact Instructions" in their project settings

### Example Custom Instructions

```
## Compact Instructions
When summarizing the conversation focus on typescript code changes and also remember the mistakes you made and how you fixed them.
```

```
# Summary instructions
When you are using compact - please focus on test output and code changes. Include file reads verbatim.
```

## Post-Compaction Restoration

After compaction, several items are automatically re-attached to maintain continuity:

1. **Recently read files** (up to 5, capped at 5K tokens each, 50K total)
2. **Todo/task lists** for the current session
3. **Plan files** if plan mode is active
4. **Invoked skills** (sorted by most recently used)
5. **SessionStart hook results** (hooks are re-run after compaction)

Files that are excluded from restoration:
- The todo file itself
- The plan file
- Claude.md / memory files (these are always loaded via system prompt)
