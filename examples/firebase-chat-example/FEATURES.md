# Firebase Chat Example — Feature Plan

Features to implement based on the reference `ai-chat/` components.

## UI Design

Three-column dark-themed layout inspired by CodePilot:

```
┌──────────────────────────────────────────────────────────────────────┐
│  [icon]          Tuplet Chat  [AI]                      + New   [H] │
├────────┬─────────────────────────────────┬───────────────────────────┤
│        │                                 │                           │
│  [💬]  │  YOU                            │                           │
│  [📁]  │  Hi                             │   Select a file to view   │
│  [🔍]  │                                 │       its contents        │
│  [⚙️]  │  AI                             │                           │
│        │  Hello! How can I help you?     │                           │
│        │  ┌─────────────────────┐        │                           │
│        │  │ ✅ Searched docs    │        │                           │
│        │  │ 🔄 Running query...│        │                           │
│        │  └─────────────────────┘        │                           │
│        │                                 │                           │
│        │                                 │                           │
│        │                                 │                           │
├────────┴─────────────────────────────────┴───────────────────────────┤
│  [Ask Tuplet to help...]                           [📎] [@] [➤]     │
│  Press Enter to send, Shift+Enter for new line              GPT-5   │
└──────────────────────────────────────────────────────────────────────┘
```

### Visual spec

- **Theme**: dark (near-black background `#1a1a2e`, dark panels `#16213e`)
- **Layout**: icon sidebar (48px) | chat panel (flex) | detail panel (collapsible)
- **Header**: centered logo/title with AI badge, "+ New" conversation button, history toggle
- **Sidebar icons**: Chat, Files/Workspace, Search, Settings
- **Chat area**: avatar circles (user icon / bot icon) with role label, message text below
- **Message bubbles**: no colored backgrounds for messages — just avatar + text on dark bg
- **Activity log**: inline inside assistant messages, collapsible tool call timeline
- **Input bar**: rounded border with teal/cyan accent, attachment + mention + send icons
- **Footer hint**: "Press Enter to send, Shift+Enter for new line" + model name

### Sidebar panels

- **Chat** (default): conversation list / new chat
- **Workspace**: file tree of agent workspace data (notes, saved files)
- **Search**: search through conversation history
- **Settings**: model selection, API key config

### Right panel

- Workspace file viewer — when a workspace file is selected, show its contents
- Collapsed by default, opens when user clicks a file in workspace sidebar

## Frontend Features

### 1. Markdown rendering

- Render AI responses as Markdown with `react-markdown` + `remark-gfm`
- Support tables, lists, code blocks, inline code
- Source: `chat-messages.tsx` — `ReactMarkdown` with `remarkGfm`

### 2. Error message type

- Dedicated `error` role with red styling and retry hint
- Currently errors are shown as plain assistant messages
- Source: `chat-messages.tsx` — `MessageBubble` with `isError` branch

### 3. Activity log / tool progress

- Inline timeline of tool calls inside each assistant message
- Shell commands shown with the actual command text
- Sub-agent calls shown with agent name and prompt preview
- Expandable tool input/output details
- Running tool spinner, completed/failed icons, duration badges
- Collapsible "+N more steps" for long timelines
- Source: `activity-log.tsx`

### 4. Task tracking

- Collapsible task plan with progress bar (completed/total)
- Per-task status icons (pending, in_progress, completed)
- Active task highlight with `activeForm` label
- Multi-agent task grouping with separate progress per agent
- Inline compact version embedded in chat messages
- Source: `tasks-panel.tsx`

### 5. Question input UI

- Multi-step question wizard when agent calls `__ask_user__`
- Radio options with descriptions, "Other" custom text input
- Step indicators, progress bar, back/next navigation
- Answer summary before submit
- Source: `question-input.tsx`

### 6. Cost display

- Per-reply cost (input tokens, output tokens, dollar amount)
- Cumulative conversation cost with message count
- Tooltips with detailed token/cost breakdown
- Source: `cost-display.tsx`

### 7. Stop generation

- Stop button replaces Send button while loading
- Escape key cancels generation
- Auto-resize textarea up to max height
- Source: `chat-input.tsx`

### 8. Streaming content

- `streamingContent` displayed with blinking cursor while AI responds
- Bouncing dots animation when no content yet
- Live activity and tasks shown during streaming
- Source: `chat-messages.tsx` — `isStreaming` prop

### 9. Interrupted state

- Amber "Interrupted" indicator on messages
- Tasks show interrupted state (amber icon) vs completed
- Running tools marked as interrupted in timeline
- Source: `chat-messages.tsx`, `activity-log.tsx`

## Backend Changes Required

### API response enrichment

Current response: `{ conversationId, response, status }`

Needed additions:

- `activity` — array of tool call log entries (name, input, output, duration, status)
- `tasks` — task list snapshot (id, subject, status, activeForm, owner)
- `pendingQuestion` — question data when `status === 'needs_input'`
- `trace` — token counts and cost info (inputTokens, outputTokens, totalCost)

### SSE / streaming endpoint

For live activity, streaming content, and real-time task updates, replace or supplement
`POST /api/chat` with a streaming endpoint (SSE or chunked response) that emits:

- `progress` events (tool start/end, AI text fragments)
- `task_update` events
- `content` chunks (streaming AI response text)
- `done` event with final result + cost

### Question flow endpoint

- `POST /api/chat/answer` — submit answers to pending questions
- Or reuse `POST /api/chat` with `pendingQuestion` context to continue the conversation
