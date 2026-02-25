# Firebase Chat Example

AI chat app using Tuplet agent as an Express API backend, Firestore for persistent conversation history, and a React (Vite) frontend.

## Architecture

```
client/  — React + Vite chat UI
server/  — Express + Tuplet agent + Firebase Admin SDK
```

- **Firestore** stores conversation history (one document per conversation)
- **Workspace** (file-based) lets the agent persist notes per conversation
- **LLM** is configurable — OpenRouter or Anthropic direct

## Prerequisites

- Node.js >= 20
- pnpm
- Firebase CLI (`npm install -g firebase-tools`)
- An API key (OpenRouter or Anthropic)

## Setup

```bash
cd examples/firebase-chat-example

# Install all dependencies (root + server + client)
pnpm run setup

# Configure API key
cp .env.example .env
# Edit .env with your API key
```

## Run

Single command starts everything (emulator + server + client):

```bash
pnpm dev
```

Open <http://localhost:5173> to chat.

## Verify persistence

1. Send a few messages
2. Refresh the page — conversation history loads from Firestore
3. Check <http://localhost:4000> — data visible in Firestore emulator UI

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/chat` | Send a message. Body: `{ conversationId?, message }` |
| `GET` | `/api/conversations/:id` | Get text-only message history |
| `GET` | `/api/health` | Health check |
