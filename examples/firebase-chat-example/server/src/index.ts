/**
 * AI Chat Server — Express + Tuplet agent with Firestore persistence + SSE streaming.
 * Projects → Conversations → Messages. Workspace scoped per project.
 */

import dotenv from 'dotenv'
dotenv.config({ path: '../.env' })
import express from 'express'
import cors from 'cors'
import crypto from 'crypto'
import { initializeApp } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import {
  Tuplet,
  OpenRouterProvider,
  ClaudeProvider,
  ConsoleLogger,
  ConsoleTraceProvider,
  Workspace,
  FileWorkspaceProvider,
  type WorkspaceProvider,
  type LLMProvider,
  type Message,
  type ProgressUpdate,
  type TaskUpdateNotification,
  type ToolResult,
  type LogProvider,
} from 'tuplet'
import { FirestoreRepository } from './firestore-repository.js'
import { GCSWorkspaceProvider } from './gcs-workspace-provider.js'

// --- Firebase Init ---
process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080'
process.env.FIREBASE_STORAGE_EMULATOR_HOST ??= '127.0.0.1:9199'
process.env.GCS_BUCKET ??= 'ai-chat-demo.appspot.com'

initializeApp({ projectId: 'ai-chat-demo', storageBucket: 'ai-chat-demo.appspot.com' })
const db = getFirestore()
const repository = new FirestoreRepository(db)

// --- LLM Provider ---
function createLLMProvider(): LLMProvider {
  if (process.env.OPENROUTER_API_KEY) {
    const model = process.env.OPENROUTER_MODEL || 'anthropic/claude-sonnet-4'
    console.log(`LLM: OpenRouter (${model})`)
    return new OpenRouterProvider({
      apiKey: process.env.OPENROUTER_API_KEY,
      model,
      maxTokens: 2048,
    })
  }

  if (process.env.ANTHROPIC_API_KEY) {
    console.log('LLM: Anthropic direct')
    return new ClaudeProvider({
      apiKey: process.env.ANTHROPIC_API_KEY,
      model: 'claude-sonnet-4-20250514',
      maxTokens: 2048,
    })
  }

  console.error('Error: Set OPENROUTER_API_KEY or ANTHROPIC_API_KEY in .env')
  process.exit(1)
}

const llm = createLLMProvider()
const baseLogger = new ConsoleLogger({ level: 'info', prefix: '[AI-Chat]' })

// --- Helper: workspace for a project ---
function projectWorkspaceProvider(projectId: string): WorkspaceProvider {
  if (process.env.GCS_BUCKET) {
    return new GCSWorkspaceProvider({
      bucket: process.env.GCS_BUCKET,
      prefix: `workspaces/${projectId}`,
    })
  }
  return new FileWorkspaceProvider(`./workspace-data/${projectId}`)
}

function projectWorkspace(projectId: string) {
  return new Workspace({
    provider: projectWorkspaceProvider(projectId),
    strict: false,
  })
}

// --- Helper: SSE write ---
function sseWrite(res: express.Response, event: string, data: unknown) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
}

// --- Helper: create logger that streams to SSE ---
function createSSELogger(res: express.Response): LogProvider {
  let toolCounter = 0

  return {
    debug: baseLogger.debug.bind(baseLogger),
    info: baseLogger.info.bind(baseLogger),
    warn: baseLogger.warn.bind(baseLogger),
    error: baseLogger.error.bind(baseLogger),

    onProgress(update: ProgressUpdate) {
      if (update.type === 'text' && update.details?.text) {
        sseWrite(res, 'content', { text: update.details.text })
      }
      sseWrite(res, 'progress', {
        type: update.type,
        message: update.message,
        id: update.id,
        depth: update.depth,
        details: update.details,
      })
    },

    onToolCall(toolName: string, params: unknown) {
      toolCounter++
      sseWrite(res, 'tool_start', {
        id: `tc_${toolCounter}`,
        toolName,
        input: params,
      })
    },

    onToolResult(toolName: string, result: ToolResult, durationMs: number) {
      sseWrite(res, 'tool_end', {
        id: `tc_${toolCounter}`,
        toolName,
        output: result.data,
        error: result.error,
        durationMs,
        success: result.success,
      })
    },

    onTaskUpdate(update: TaskUpdateNotification) {
      sseWrite(res, 'task_update', {
        agentName: update.agentName,
        action: update.action,
        tasks: update.tasks.map((t) => ({
          id: t.id,
          subject: t.subject,
          status: t.status,
          activeForm: t.activeForm,
          owner: t.owner,
        })),
        current: update.current
          ? {
              id: update.current.id,
              subject: update.current.subject,
              activeForm: update.current.activeForm,
              status: update.current.status,
            }
          : undefined,
        progress: update.progress,
      })
    },
  }
}

// --- Express App ---
const app = express()
app.use(express.json())
app.use(cors({ origin: true }))

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// =====================
// Projects
// =====================

// Create project
app.post('/api/projects', async (req, res) => {
  try {
    const { name } = req.body as { name?: string }
    if (!name?.trim()) {
      res.status(400).json({ error: 'name is required' })
      return
    }
    const id = crypto.randomUUID()
    await db.collection('projects').doc(id).set({
      name: name.trim(),
      createdAt: FieldValue.serverTimestamp(),
    })
    res.json({ id, name: name.trim() })
  } catch (err) {
    baseLogger.error('POST /api/projects error', err)
    res.status(500).json({ error: 'Failed to create project' })
  }
})

// List projects
app.get('/api/projects', async (_req, res) => {
  try {
    const snap = await db.collection('projects').orderBy('createdAt', 'desc').get()
    const projects = snap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }))
    res.json({ projects })
  } catch (err) {
    baseLogger.error('GET /api/projects error', err)
    res.json({ projects: [] })
  }
})

// Get project
app.get('/api/projects/:id', async (req, res) => {
  try {
    const doc = await db.collection('projects').doc(req.params.id).get()
    if (!doc.exists) {
      res.status(404).json({ error: 'Project not found' })
      return
    }
    res.json({ id: doc.id, ...doc.data() })
  } catch (err) {
    baseLogger.error('GET /api/projects/:id error', err)
    res.status(500).json({ error: 'Failed to get project' })
  }
})

// Delete project
app.delete('/api/projects/:id', async (req, res) => {
  try {
    await db.collection('projects').doc(req.params.id).delete()
    res.json({ deleted: true })
  } catch (err) {
    baseLogger.error('DELETE /api/projects/:id error', err)
    res.status(500).json({ error: 'Failed to delete project' })
  }
})

// =====================
// Conversations (scoped to project)
// =====================

// List conversations for a project
app.get('/api/projects/:projectId/conversations', async (req, res) => {
  try {
    const snap = await db
      .collection('projects').doc(req.params.projectId)
      .collection('conversations')
      .orderBy('createdAt', 'desc')
      .get()
    const conversations = snap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }))
    res.json({ conversations })
  } catch (err) {
    baseLogger.error('GET conversations error', err)
    res.json({ conversations: [] })
  }
})

// Create conversation in a project
app.post('/api/projects/:projectId/conversations', async (req, res) => {
  try {
    const id = crypto.randomUUID()
    const { title } = req.body as { title?: string }
    await db
      .collection('projects').doc(req.params.projectId)
      .collection('conversations').doc(id)
      .set({
        title: title || 'New chat',
        createdAt: FieldValue.serverTimestamp(),
      })
    res.json({ id, title: title || 'New chat' })
  } catch (err) {
    baseLogger.error('POST conversation error', err)
    res.status(500).json({ error: 'Failed to create conversation' })
  }
})

// =====================
// Chat (now accepts projectId)
// =====================

app.post('/api/chat', async (req, res) => {
  const { projectId, conversationId: incomingId, message } = req.body as {
    projectId?: string
    conversationId?: string
    message?: string
  }

  if (!message || typeof message !== 'string' || !message.trim()) {
    res.status(400).json({ error: 'message is required' })
    return
  }

  if (!projectId) {
    res.status(400).json({ error: 'projectId is required' })
    return
  }

  const conversationId = incomingId || crypto.randomUUID()

  // SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Conversation-Id': conversationId,
  })

  const controller = new AbortController()
  res.on('close', () => {
    if (!res.writableFinished) {
      controller.abort()
    }
  })

  const sseLogger = createSSELogger(res)

  const agent = new Tuplet({
    role:
      'a friendly, helpful AI assistant. You have a workspace where you can store notes ' +
      'and remember things across messages. Keep responses concise but informative. ' +
      'If the user asks you to remember something, save it to workspace.',
    tools: [],
    agents: [],
    llm,
    logger: sseLogger,
    repository,
    maxIterations: 10,
    agentName: 'ai_chat',
    trace: new ConsoleTraceProvider({ showCosts: true }),
  })

  // Workspace scoped to project, not conversation
  const workspace = projectWorkspace(projectId)

  try {
    const result = await agent.run(message.trim(), {
      conversationId,
      workspace,
      signal: controller.signal,
    })

    sseWrite(res, 'done', {
      conversationId,
      response: result.response,
      status: result.status,
      tasks: result.tasks,
      pendingQuestion: result.pendingQuestion,
      interrupted: result.interrupted,
      error: result.error,
      trace: result.trace
        ? {
            totalCost: result.trace.totalCost,
            totalInputTokens: result.trace.totalInputTokens,
            totalOutputTokens: result.trace.totalOutputTokens,
            totalLLMCalls: result.trace.totalLLMCalls,
            totalToolCalls: result.trace.totalToolCalls,
            durationMs: result.trace.durationMs,
          }
        : undefined,
    })
  } catch (err) {
    if (controller.signal.aborted) {
      sseWrite(res, 'done', {
        conversationId,
        response: '',
        status: 'interrupted',
        interrupted: { reason: 'aborted', iterationsCompleted: 0 },
      })
    } else {
      baseLogger.error('POST /api/chat error', err)
      sseWrite(res, 'done', {
        conversationId,
        response: '',
        status: 'error',
        error: 'Internal server error',
      })
    }
  } finally {
    res.end()
  }
})

// Get conversation history
app.get('/api/conversations/:id', async (req, res) => {
  try {
    const history = await repository.getHistory(req.params.id)
    const messages = history.map((msg: Message) => {
      let text: string
      if (typeof msg.content === 'string') {
        text = msg.content
      } else {
        text = msg.content
          .filter((b) => b.type === 'text')
          .map((b) => (b as { text: string }).text)
          .join('\n')
      }
      return { role: msg.role, text }
    })
    res.json({ conversationId: req.params.id, messages })
  } catch (err) {
    baseLogger.error('GET /api/conversations error', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// =====================
// Workspace (scoped to project)
// =====================

// List workspace files
app.get('/api/workspace/:projectId', async (req, res) => {
  try {
    const provider = projectWorkspaceProvider(req.params.projectId)
    const paths = await provider.list('/')
    res.json({ files: paths.map((p) => ({ path: p.replace(/^\//, '') })) })
  } catch (err) {
    baseLogger.error('GET /api/workspace error', err)
    res.json({ files: [] })
  }
})

// Read a workspace file
app.get('/api/workspace/:projectId/{*filePath}', async (req, res) => {
  try {
    const raw = req.params.filePath
    const filePath = Array.isArray(raw) ? raw.join('/') : raw
    if (!filePath) {
      res.status(400).json({ error: 'file path required' })
      return
    }
    const ws = projectWorkspace(req.params.projectId)
    await ws.init()
    const content = await ws.read(filePath)
    res.json({ path: filePath, content })
  } catch (err) {
    baseLogger.error('GET /api/workspace file error', err)
    res.status(404).json({ error: 'File not found' })
  }
})

// Write (create/update) a workspace file
app.put('/api/workspace/:projectId/{*filePath}', async (req, res) => {
  try {
    const raw = req.params.filePath
    const filePath = Array.isArray(raw) ? raw.join('/') : raw
    if (!filePath) {
      res.status(400).json({ error: 'file path required' })
      return
    }
    const { content } = req.body as { content?: string }
    if (content === undefined) {
      res.status(400).json({ error: 'content is required' })
      return
    }
    const provider = projectWorkspaceProvider(req.params.projectId)
    const fsPath = filePath.startsWith('/') ? filePath : `/${filePath}`
    await provider.write(fsPath, content)
    res.json({ path: filePath, success: true })
  } catch (err) {
    baseLogger.error('PUT /api/workspace file error', err)
    res.status(500).json({ error: 'Failed to write file' })
  }
})

// Delete a workspace file
app.delete('/api/workspace/:projectId/{*filePath}', async (req, res) => {
  try {
    const raw = req.params.filePath
    const filePath = Array.isArray(raw) ? raw.join('/') : raw
    if (!filePath) {
      res.status(400).json({ error: 'file path required' })
      return
    }
    const ws = projectWorkspace(req.params.projectId)
    await ws.init()
    const deleted = await ws.delete(filePath)
    res.json({ path: filePath, deleted })
  } catch (err) {
    baseLogger.error('DELETE /api/workspace file error', err)
    res.status(500).json({ error: 'Failed to delete file' })
  }
})

// Rename/move a workspace file
app.patch('/api/workspace/:projectId', async (req, res) => {
  try {
    const { from, to } = req.body as { from?: string; to?: string }
    if (!from || !to) {
      res.status(400).json({ error: 'from and to are required' })
      return
    }
    const provider = projectWorkspaceProvider(req.params.projectId)
    const fromPath = from.startsWith('/') ? from : `/${from}`
    const toPath = to.startsWith('/') ? to : `/${to}`
    const content = await provider.read(fromPath)
    await provider.write(toPath, typeof content === 'string' ? content : JSON.stringify(content, null, 2))
    await provider.delete(fromPath)
    res.json({ from, to, success: true })
  } catch (err) {
    baseLogger.error('PATCH /api/workspace rename error', err)
    res.status(500).json({ error: 'Failed to rename/move file' })
  }
})

// --- Start ---
const PORT = parseInt(process.env.PORT || '3000', 10)
app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`)
  console.log(`Firestore emulator: ${process.env.FIRESTORE_EMULATOR_HOST}`)
})
