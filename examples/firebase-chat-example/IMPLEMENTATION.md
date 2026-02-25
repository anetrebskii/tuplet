# Implementation Plan

Ordered by dependency — each phase builds on the previous.

## Phase 1: Backend — SSE streaming endpoint

Replace `POST /api/chat` returning a single JSON with an SSE stream that sends
events as the agent works.

### Files

- **`server/src/index.ts`** — modify

### Steps

1. Add `POST /api/chat` SSE handler:
   - Set headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`
   - Create a per-conversation `Workspace` + `FileWorkspaceProvider`
   - Wire Tuplet logger callbacks to emit SSE events
2. Logger callbacks → SSE events:
   - `onProgress(update)` → emit `event: progress` with `{ type, message, details }`
   - `onTaskUpdate(update)` → emit `event: task_update` with task list snapshot
   - `onToolCall(name, params)` → emit `event: tool_start` with `{ id, toolName, input }`
   - `onToolResult(name, result, durationMs)` → emit `event: tool_end` with `{ id, toolName, output, durationMs, success }`
3. After `agent.run()` completes, emit:
   - `event: done` with `{ response, status, tasks, trace }` (trace = token counts + cost)
   - If `status === 'needs_input'`, include `pendingQuestion` data
4. Handle client disconnect (`req.on('close')`) — abort the agent via `AbortController`
5. Keep `GET /api/conversations/:id` and `GET /api/health` as-is (JSON)

### SSE event format

```
event: progress
data: {"type":"tool_start","message":"Searching...","toolName":"__shell__"}

event: tool_start
data: {"id":"tc_1","toolName":"__shell__","input":{"command":"ls"}}

event: tool_end
data: {"id":"tc_1","toolName":"__shell__","output":"file1.txt","durationMs":42,"success":true}

event: task_update
data: {"tasks":[{"id":"1","subject":"Search docs","status":"in_progress"}],"progress":{"total":3,"completed":1}}

event: content
data: {"text":"Here are the results..."}

event: done
data: {"response":"...","status":"complete","trace":{"inputTokens":500,"outputTokens":200,"totalCost":0.003}}
```

## Phase 2: Frontend — Dark theme & three-column layout

Rework CSS and component structure to match the CodePilot-style dark layout.

### Files

- **`client/src/App.css`** — rewrite (dark theme, layout grid)
- **`client/src/App.tsx`** — rewrite (layout shell with sidebar, chat, detail panel)
- **`client/src/components/Sidebar.tsx`** — new
- **`client/src/components/Header.tsx`** — new
- **`client/index.html`** — update `<title>`

### Steps

1. Define CSS custom properties for dark palette:
   - `--bg-primary: #1a1a2e` (main bg)
   - `--bg-secondary: #16213e` (panels)
   - `--bg-surface: #1e2a45` (cards, inputs)
   - `--text-primary: #e0e0e0`
   - `--text-secondary: #8892a0`
   - `--accent: #0abab5` (teal/cyan for input border, active icons)
2. Layout grid: `sidebar (48px) | chat (1fr) | detail (0 or 360px)`
3. `Sidebar` — icon column: Chat (default), Workspace, Settings
4. `Header` — centered "Tuplet Chat [AI]" badge, "+ New" button (resets conversation)
5. `App.tsx` becomes the layout shell, delegates to child components

## Phase 3: Frontend — Chat core components

Extract chat into dedicated components, add markdown + streaming.

### Files

- **`client/src/components/ChatMessages.tsx`** — new
- **`client/src/components/ChatInput.tsx`** — new
- **`client/src/components/MessageBubble.tsx`** — new
- **`client/src/hooks/useChat.ts`** — new (SSE client logic)
- **`client/src/types.ts`** — new (shared types)

### Dependencies

- `react-markdown`, `remark-gfm` — add to client `package.json`

### Steps

1. **`types.ts`** — define shared interfaces:
   - `ChatMessage { role, content, activity?, tasks?, interrupted?, error? }`
   - `ActivityEntry { id, type, toolName, input, output, durationMs, status, ... }`
   - `TaskItem { id, subject, status, activeForm, owner }`
   - `CostInfo { totalCost, inputTokens, outputTokens }`
   - `Question { question, header, options, multiSelect }`
2. **`useChat.ts`** — custom hook:
   - Manages `messages`, `loading`, `streamingContent`, `liveActivity`, `liveTasks`, `cost`
   - `send(text)` — opens `fetch()` to SSE endpoint, parses `EventSource`-style chunks
   - Accumulates `tool_start`/`tool_end` into `liveActivity`
   - Accumulates `task_update` into `liveTasks`
   - Accumulates `content` into `streamingContent`
   - On `done` — finalizes message with activity/tasks snapshot, updates cost
   - `stop()` — aborts the fetch (triggers server-side abort)
   - `loadHistory(conversationId)` — fetches `GET /api/conversations/:id`
   - `newConversation()` — resets state, generates new ID
3. **`MessageBubble.tsx`**:
   - Avatar circle (user icon / bot icon) + role label
   - AI messages: render content with `ReactMarkdown` + `remarkGfm`
   - User messages: plain text
   - Error messages: red styling with retry hint
   - Interrupted: amber indicator
4. **`ChatMessages.tsx`**:
   - Scrollable message list
   - Streaming message bubble at bottom when loading
   - Empty state placeholder
5. **`ChatInput.tsx`**:
   - Auto-resize textarea
   - Send button → Stop button toggle when loading
   - Escape to cancel
   - Hint text: "Press Enter to send, Shift+Enter for new line"
   - Model name display (from server config or hardcoded)

## Phase 4: Frontend — Activity log (inline in messages)

### Files

- **`client/src/components/ActivityLog.tsx`** — new

### Steps

1. Render inside `MessageBubble` for assistant messages with `activity` data
2. Timeline rows:
   - Tool calls: status icon (spinner/check/x) + tool name + duration
   - Shell: show actual command text
   - Sub-agents: show agent name + prompt preview
3. Expandable details: click row to show input/output JSON
4. Collapsible "+N more" when > 5 entries
5. Currently running tool shown at bottom with spinner (live only)

## Phase 5: Frontend — Task tracking (inline in messages)

### Files

- **`client/src/components/TaskPlan.tsx`** — new

### Steps

1. Collapsible card with progress bar header (completed/total + percentage)
2. Task list: status icon + subject text, `in_progress` highlighted
3. Shown inside `MessageBubble` when `tasks` data exists
4. Live version auto-expanded during streaming, collapsed in history

## Phase 6: Frontend — Question input UI

### Files

- **`client/src/components/QuestionInput.tsx`** — new

### Steps

1. Replaces `ChatInput` when `pendingQuestion` is set
2. Multi-step wizard: one question at a time
3. Radio options with descriptions + "Other" custom text
4. Step indicators + progress bar + Back/Next navigation
5. Submit sends answers via `POST /api/chat` (or dedicated answer endpoint)
6. Answer summary shown before submit

## Phase 7: Frontend — Cost display

### Files

- **`client/src/components/CostDisplay.tsx`** — new

### Steps

1. Inline bar between input and hint text
2. Last reply cost: token icon + "$0.003"
3. Conversation total: dollar icon + "$0.05"
4. Hover tooltip with full breakdown (input/output tokens, per-model splits)

## Phase 8: Frontend — Workspace panel (right side)

### Files

- **`client/src/components/WorkspacePanel.tsx`** — new
- **`server/src/index.ts`** — add `GET /api/workspace/:conversationId` endpoint

### Steps

1. Backend: endpoint lists workspace files and reads file contents
2. Sidebar "Workspace" icon switches left panel to file tree
3. Click file → opens in right detail panel
4. Right panel: file name header + content viewer (syntax-highlighted for JSON/MD)
5. Panel collapsed by default, 360px when open

## File summary

```
client/src/
  types.ts                    — shared interfaces
  hooks/
    useChat.ts                — SSE client + state management
  components/
    Header.tsx                — top bar
    Sidebar.tsx               — icon sidebar
    ChatMessages.tsx          — scrollable message list
    ChatInput.tsx             — input bar with send/stop
    MessageBubble.tsx         — single message rendering
    ActivityLog.tsx           — tool call timeline
    TaskPlan.tsx              — task progress display
    QuestionInput.tsx         — multi-step question wizard
    CostDisplay.tsx           — token/cost display
    WorkspacePanel.tsx        — right-side file viewer
  App.tsx                     — layout shell
  App.css                     — dark theme + layout
  main.tsx                    — entry (unchanged)

server/src/
  index.ts                    — SSE endpoint + workspace API
  firestore-repository.ts    — unchanged
```

## Implementation order

| #  | Phase | Depends on | Effort |
| -- | ----- | ---------- | ------ |
| 1  | Backend SSE | — | M |
| 2  | Dark theme & layout | — | M |
| 3  | Chat core (markdown, streaming, useChat) | 1, 2 | L |
| 4  | Activity log | 3 | M |
| 5  | Task tracking | 3 | S |
| 6  | Question input | 3 | M |
| 7  | Cost display | 3 | S |
| 8  | Workspace panel | 3 | M |

Phases 1 and 2 can run in parallel. Phases 4–8 can run in any order after 3.
