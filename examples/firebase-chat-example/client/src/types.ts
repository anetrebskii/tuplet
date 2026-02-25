export interface ChatMessage {
  role: 'user' | 'assistant' | 'error'
  content: string
  activity?: ToolCallEntry[]
  tasks?: TaskItem[]
  interrupted?: boolean
}

export interface ToolCallEntry {
  id: string
  toolName: string
  input?: unknown
  output?: unknown
  durationMs?: number
  success?: boolean
  error?: string
  status: 'running' | 'completed' | 'failed' | 'interrupted'
}

export interface TaskItem {
  id: string
  subject: string
  status: 'pending' | 'in_progress' | 'completed'
  activeForm?: string
  owner?: string
}

export interface TaskProgress {
  total: number
  completed: number
  pending: number
  inProgress: number
}

export interface CostInfo {
  totalCost: number
  inputTokens: number
  outputTokens: number
}

export interface TraceInfo {
  totalCost: number
  totalInputTokens: number
  totalOutputTokens: number
  totalLLMCalls: number
  totalToolCalls: number
  durationMs?: number
}

export interface QuestionOption {
  label: string
  description?: string
}

export interface Question {
  question: string
  header?: string
  options?: (string | QuestionOption)[]
  multiSelect?: boolean
}

export interface PendingQuestion {
  questions: Question[]
}

export interface Project {
  id: string
  name: string
  createdAt?: string
}
