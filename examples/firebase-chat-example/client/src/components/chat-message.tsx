import { useState } from "react"
import { MarkdownRenderer } from "./markdown-renderer"
import { ToolCallDisplay } from "./tool-call-display"
import { TaskPlan } from "./task-plan"
import { Bot, User, Sparkles, AlertCircle, HelpCircle } from "lucide-react"
import type { ChatMessage as ChatMessageType, ToolCallEntry, Question, QuestionOption } from "@/types"

function ToolCallList({ tools }: { tools: ToolCallEntry[] }) {
  if (tools.length === 0) return null

  return (
    <div className="space-y-1">
      {tools.map((entry) => (
        <ToolCallDisplay
          key={entry.id}
          toolName={entry.toolName}
          label={entry.label}
          args={entry.input as Record<string, unknown> || {}}
          state={entry.status === 'running' ? 'input-available' : entry.status === 'completed' ? 'output-available' : 'output-error'}
          output={entry.output ?? entry.error}
        />
      ))}
    </div>
  )
}

export function ChatMessage({ message }: { message: ChatMessageType }) {
  const isUser = message.role === "user"
  const isError = message.role === "error"

  return (
    <div className="flex gap-3 py-4">
      {/* Avatar */}
      <div
        className={`shrink-0 h-7 w-7 rounded-lg flex items-center justify-center mt-0.5 ${
          isUser
            ? "bg-secondary text-foreground"
            : isError
            ? "bg-destructive/15 text-destructive"
            : "bg-primary/15 text-primary"
        }`}
      >
        {isUser ? (
          <User className="h-4 w-4" />
        ) : isError ? (
          <AlertCircle className="h-4 w-4" />
        ) : (
          <Sparkles className="h-4 w-4" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 space-y-1">
        <div className="text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">
          {isUser ? "You" : isError ? "Error" : "AI Assistant"}
        </div>

        {/* Tool calls */}
        {message.activity && message.activity.length > 0 && (
          <ToolCallList tools={message.activity} />
        )}

        {/* Task plan */}
        {message.tasks && message.tasks.length > 0 && (
          <TaskPlan tasks={message.tasks} interrupted={message.interrupted} />
        )}

        {/* Text content */}
        {message.content && (
          <div className="text-sm text-foreground/90 leading-relaxed">
            {isUser ? (
              <p className="whitespace-pre-wrap">{message.content}</p>
            ) : isError ? (
              <p className="text-destructive">{message.content}</p>
            ) : (
              <MarkdownRenderer content={message.content} />
            )}
          </div>
        )}

        {message.interrupted && (
          <div className="text-xs text-warning italic mt-1">Generation interrupted</div>
        )}
      </div>
    </div>
  )
}

export function ThinkingIndicator({ status }: { status?: string }) {
  return (
    <div className="flex gap-3 py-4">
      <div className="shrink-0 h-7 w-7 rounded-lg flex items-center justify-center mt-0.5 bg-primary/15 text-primary">
        <Bot className="h-4 w-4 animate-pulse" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">
          AI Assistant
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <div className="flex gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: "0ms" }} />
            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: "150ms" }} />
            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: "300ms" }} />
          </div>
          <span>{status || "Thinking..."}</span>
        </div>
      </div>
    </div>
  )
}

export function StreamingMessage({ content, activity, tasks, status }: { content: string; activity?: ToolCallEntry[]; tasks?: ChatMessageType['tasks']; status?: string }) {
  // Show status when there's no content yet or between tool calls
  const showStatus = status && !content

  return (
    <div className="flex gap-3 py-4">
      <div className="shrink-0 h-7 w-7 rounded-lg flex items-center justify-center mt-0.5 bg-primary/15 text-primary">
        <Sparkles className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0 space-y-1">
        <div className="text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">
          AI Assistant
        </div>

        {activity && activity.length > 0 && (
          <ToolCallList tools={activity} />
        )}

        {tasks && tasks.length > 0 && (
          <TaskPlan tasks={tasks} defaultExpanded />
        )}

        {showStatus && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground animate-pulse">
            <Bot className="h-3.5 w-3.5" />
            <span>{status}</span>
          </div>
        )}

        {content && (
          <div className="text-sm text-foreground/90 leading-relaxed">
            <MarkdownRenderer content={content} />
          </div>
        )}
      </div>
    </div>
  )
}

export function QuestionMessage({ questions, onSubmit }: { questions: Question[]; onSubmit: (answers: Record<string, string>) => void }) {
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [customInputs, setCustomInputs] = useState<Record<string, string>>({})

  const total = questions.length
  const current = questions[step]
  const progress = ((step + 1) / total) * 100

  const getLabel = (opt: string | QuestionOption) =>
    typeof opt === 'string' ? opt : opt.label
  const getDesc = (opt: string | QuestionOption) =>
    typeof opt === 'object' ? opt.description : undefined

  const key = `q${step}`
  const currentAnswer = answers[key]
  const isStepDone = currentAnswer
    ? currentAnswer === '__custom__' ? !!customInputs[key]?.trim() : true
    : false

  const allDone = questions.every((_, i) => {
    const a = answers[`q${i}`]
    if (!a) return false
    return a === '__custom__' ? !!customInputs[`q${i}`]?.trim() : true
  })

  const handleSelect = (value: string) => {
    setAnswers((prev) => ({ ...prev, [key]: value }))
    if (value !== '__custom__') {
      setCustomInputs((prev) => ({ ...prev, [key]: '' }))
    }
  }

  const handleCustom = (value: string) => {
    setCustomInputs((prev) => ({ ...prev, [key]: value }))
    setAnswers((prev) => ({ ...prev, [key]: '__custom__' }))
  }

  const handleSubmit = () => {
    const result: Record<string, string> = {}
    questions.forEach((q, i) => {
      const a = answers[`q${i}`]
      result[q.header || q.question] =
        a === '__custom__' ? customInputs[`q${i}`] || '' : a || ''
    })
    onSubmit(result)
  }

  return (
    <div className="flex gap-3 py-4">
      <div className="shrink-0 h-7 w-7 rounded-lg flex items-center justify-center mt-0.5 bg-primary/15 text-primary">
        <HelpCircle className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">
          AI Assistant needs your input
        </div>

        <div className="rounded-xl border border-primary/30 bg-card p-4 mt-1">
          {total > 1 && (
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-muted-foreground">Question {step + 1} of {total}</span>
              <div className="flex-1 mx-3 h-1 bg-secondary rounded-full overflow-hidden">
                <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}

          {current.header && (
            <span className="inline-block text-[10px] font-mono px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 mb-2">
              {current.header}
            </span>
          )}

          <p className="text-sm text-foreground mb-3">{current.question}</p>

          {current.options && current.options.length > 0 ? (
            <div className="space-y-2 mb-4">
              {current.options.map((opt, i) => {
                const label = getLabel(opt)
                const desc = getDesc(opt)
                const selected = currentAnswer === label
                return (
                  <button
                    key={i}
                    className={`w-full flex items-start gap-3 p-3 rounded-lg border text-left transition-all ${
                      selected
                        ? 'border-primary/50 bg-primary/10'
                        : 'border-border hover:border-primary/30 hover:bg-card'
                    }`}
                    onClick={() => handleSelect(label)}
                  >
                    <div className={`mt-0.5 h-4 w-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                      selected ? 'border-primary' : 'border-muted-foreground/40'
                    }`}>
                      {selected && <div className="h-2 w-2 rounded-full bg-primary" />}
                    </div>
                    <div>
                      <div className="text-sm text-foreground">{label}</div>
                      {desc && <div className="text-xs text-muted-foreground mt-0.5">{desc}</div>}
                    </div>
                  </button>
                )
              })}

              <button
                className={`w-full flex items-start gap-3 p-3 rounded-lg border text-left transition-all ${
                  currentAnswer === '__custom__'
                    ? 'border-primary/50 bg-primary/10'
                    : 'border-border hover:border-primary/30 hover:bg-card'
                }`}
                onClick={() => handleSelect('__custom__')}
              >
                <div className={`mt-0.5 h-4 w-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                  currentAnswer === '__custom__' ? 'border-primary' : 'border-muted-foreground/40'
                }`}>
                  {currentAnswer === '__custom__' && <div className="h-2 w-2 rounded-full bg-primary" />}
                </div>
                <div className="flex-1">
                  <div className="text-sm text-foreground">Other</div>
                  {currentAnswer === '__custom__' && (
                    <textarea
                      className="mt-2 w-full resize-none bg-input/50 border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
                      value={customInputs[key] || ''}
                      onChange={(e) => handleCustom(e.target.value)}
                      placeholder="Type your answer..."
                      autoFocus
                      rows={2}
                      onClick={(e) => e.stopPropagation()}
                    />
                  )}
                </div>
              </button>
            </div>
          ) : (
            <textarea
              className="w-full resize-none bg-input/50 border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 mb-4"
              value={customInputs[key] || ''}
              onChange={(e) => {
                setCustomInputs((prev) => ({ ...prev, [key]: e.target.value }))
                setAnswers((prev) => ({ ...prev, [key]: e.target.value }))
              }}
              placeholder="Type your answer..."
              autoFocus
              rows={3}
            />
          )}

          <div className="flex items-center justify-between">
            <button
              onClick={() => setStep((s) => s - 1)}
              disabled={step === 0}
              className="px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Back
            </button>
            {step < total - 1 ? (
              <button
                className="px-4 py-1.5 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                onClick={() => setStep((s) => s + 1)}
                disabled={!isStepDone}
              >
                Next
              </button>
            ) : (
              <button
                className="px-4 py-1.5 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                onClick={handleSubmit}
                disabled={!allDone}
              >
                Submit
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
