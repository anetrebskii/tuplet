import { useState, useCallback, useRef, useEffect } from 'react'
import type {
  ChatMessage,
  ToolCallEntry,
  TaskItem,
  TraceInfo,
  PendingQuestion,
} from '../types'

export interface UseChatReturn {
  messages: ChatMessage[]
  loading: boolean
  streamingContent: string
  liveActivity: ToolCallEntry[]
  liveTasks: TaskItem[]
  conversationId: string
  lastTrace: TraceInfo | null
  cumulativeCost: number
  pendingQuestion: PendingQuestion | null
  workspaceVersion: number
  send: (text: string) => void
  stop: () => void
  newConversation: () => void
  submitAnswers: (answers: Record<string, string>) => void
}

function generateId(): string {
  return crypto.randomUUID()
}

function getStoredId(key: string): string {
  const stored = sessionStorage.getItem(key)
  if (stored) return stored
  const id = generateId()
  sessionStorage.setItem(key, id)
  return id
}

export function useChat(projectId: string): UseChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
  const [liveActivity, setLiveActivity] = useState<ToolCallEntry[]>([])
  const [liveTasks, setLiveTasks] = useState<TaskItem[]>([])
  const [conversationId, setConversationId] = useState(() => getStoredId(`conv_${projectId}`))
  const [lastTrace, setLastTrace] = useState<TraceInfo | null>(null)
  const [cumulativeCost, setCumulativeCost] = useState(0)
  const [pendingQuestion, setPendingQuestion] = useState<PendingQuestion | null>(null)
  const [workspaceVersion, setWorkspaceVersion] = useState(0)
  const abortRef = useRef<AbortController | null>(null)
  const streamingRef = useRef('')

  // Reset conversation when project changes
  useEffect(() => {
    const id = getStoredId(`conv_${projectId}`)
    setConversationId(id)
    setMessages([])
    setLastTrace(null)
    setCumulativeCost(0)
    setPendingQuestion(null)
  }, [projectId])

  // Load history on mount or when conversationId changes
  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch(`/api/conversations/${conversationId}`)
        if (!res.ok || cancelled) return
        const data = await res.json()
        if (data?.messages?.length && !cancelled) {
          setMessages(
            data.messages.map((m: { role: string; text: string }) => ({
              role: m.role as 'user' | 'assistant',
              content: m.text,
            }))
          )
        }
      } catch {
        // ignore
      }
    }
    load()
    return () => { cancelled = true }
  }, [conversationId])

  const sendToServer = useCallback(
    async (text: string) => {
      setLoading(true)
      setStreamingContent('')
      setLiveActivity([])
      setLiveTasks([])
      setPendingQuestion(null)
      streamingRef.current = ''

      const controller = new AbortController()
      abortRef.current = controller

      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId, conversationId, message: text }),
          signal: controller.signal,
        })

        if (!res.ok || !res.body) {
          throw new Error(`Server error: ${res.status}`)
        }

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        let contentAcc = ''
        const toolCalls: ToolCallEntry[] = []
        let tasksAcc: TaskItem[] = []

        function handleEvent(event: string, data: Record<string, unknown>) {
          switch (event) {
            case 'content':
              contentAcc += (data.text as string) || ''
              streamingRef.current = contentAcc
              setStreamingContent(contentAcc)
              break

            case 'tool_start':
              toolCalls.push({
                id: data.id as string,
                toolName: data.toolName as string,
                input: data.input,
                status: 'running',
              })
              setLiveActivity([...toolCalls])
              break

            case 'tool_end': {
              const idx = toolCalls.findIndex((t) => t.id === data.id)
              if (idx >= 0) {
                toolCalls[idx] = {
                  ...toolCalls[idx],
                  output: data.output,
                  error: data.error as string | undefined,
                  durationMs: data.durationMs as number,
                  success: data.success as boolean,
                  status: data.success ? 'completed' : 'failed',
                }
                setLiveActivity([...toolCalls])
              }
              break
            }

            case 'task_update':
              tasksAcc = (data.tasks as TaskItem[]) || []
              setLiveTasks([...tasksAcc])
              break

            case 'done': {
              const response = (data.response as string) || ''
              const status = data.status as string
              const trace = data.trace as TraceInfo | undefined

              if (trace) {
                setLastTrace(trace)
                setCumulativeCost((prev) => prev + (trace.totalCost || 0))
              }

              if (status === 'needs_input' && data.pendingQuestion) {
                setPendingQuestion(data.pendingQuestion as PendingQuestion)
              }

              setWorkspaceVersion((v) => v + 1)
              const finalContent = response || contentAcc
              const errorText = (data.error as string) || ''
              if (finalContent || errorText || toolCalls.length > 0 || tasksAcc.length > 0) {
                setMessages((prev) => [
                  ...prev,
                  {
                    role: status === 'error' ? 'error' : 'assistant',
                    content: finalContent || (data.error as string) || '',
                    activity: toolCalls.length > 0 ? [...toolCalls] : undefined,
                    tasks: tasksAcc.length > 0 ? [...tasksAcc] : undefined,
                    interrupted: status === 'interrupted',
                  },
                ])
              }
              break
            }
          }
        }

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })

          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          let eventType = ''
          for (const line of lines) {
            if (line.startsWith('event: ')) {
              eventType = line.slice(7).trim()
            } else if (line.startsWith('data: ')) {
              const raw = line.slice(6)
              try {
                const data = JSON.parse(raw)
                handleEvent(eventType, data)
              } catch {
                // ignore parse errors
              }
              eventType = ''
            }
          }
        }
      } catch (err) {
        if ((err as Error).name === 'AbortError') {
          if (streamingRef.current) {
            setMessages((prev) => [
              ...prev,
              { role: 'assistant', content: streamingRef.current, interrupted: true },
            ])
          }
        } else {
          setMessages((prev) => [
            ...prev,
            { role: 'error', content: (err as Error).message || 'Connection failed' },
          ])
        }
      } finally {
        setLoading(false)
        setStreamingContent('')
        setLiveActivity([])
        setLiveTasks([])
        streamingRef.current = ''
        abortRef.current = null
      }
    },
    [projectId, conversationId]
  )

  const send = useCallback(
    (text: string) => {
      if (!text.trim() || loading) return
      setMessages((prev) => [...prev, { role: 'user', content: text }])
      sendToServer(text)
    },
    [loading, sendToServer]
  )

  const stop = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  const newConversation = useCallback(() => {
    const id = generateId()
    sessionStorage.setItem(`conv_${projectId}`, id)
    setConversationId(id)
    setMessages([])
    setStreamingContent('')
    setLiveActivity([])
    setLiveTasks([])
    setLastTrace(null)
    setCumulativeCost(0)
    setPendingQuestion(null)
  }, [projectId])

  const submitAnswers = useCallback(
    (answers: Record<string, string>) => {
      setPendingQuestion(null)
      sendToServer(JSON.stringify(answers))
    },
    [sendToServer]
  )

  return {
    messages,
    loading,
    streamingContent,
    liveActivity,
    liveTasks,
    conversationId,
    lastTrace,
    cumulativeCost,
    pendingQuestion,
    workspaceVersion,
    send,
    stop,
    newConversation,
    submitAnswers,
  }
}
