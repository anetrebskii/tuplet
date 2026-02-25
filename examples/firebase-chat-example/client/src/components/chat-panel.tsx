import { useRef, useEffect } from "react"
import { ChatMessage, ThinkingIndicator, StreamingMessage, QuestionMessage } from "./chat-message"
import { ChatInput } from "./chat-input"
import { CostDisplay } from "./cost-display"
import { Sparkles, Code2, FolderTree, Terminal, FileSearch } from "lucide-react"
import type { ChatMessage as ChatMessageType, ToolCallEntry, TaskItem, TraceInfo, PendingQuestion } from "@/types"

interface ChatPanelProps {
  messages: ChatMessageType[]
  loading: boolean
  streamingContent: string
  liveActivity: ToolCallEntry[]
  liveTasks: TaskItem[]
  lastTrace: TraceInfo | null
  cumulativeCost: number
  conversationId: string
  pendingQuestion: PendingQuestion | null
  onSend: (message: string) => void
  onStop: () => void
  onSubmitAnswers: (answers: Record<string, string>) => void
}

function WelcomeScreen({ onSuggestionClick }: { onSuggestionClick: (text: string) => void }) {
  const suggestions = [
    {
      icon: <Code2 className="h-4 w-4" />,
      title: "Review my code",
      description: "Analyze and suggest improvements",
      prompt: "Review the current project structure and suggest improvements.",
    },
    {
      icon: <FolderTree className="h-4 w-4" />,
      title: "Explore project",
      description: "Navigate the file structure",
      prompt: "What files are in the workspace? Give me an overview.",
    },
    {
      icon: <Terminal className="h-4 w-4" />,
      title: "Help me build",
      description: "Generate code or features",
      prompt: "Help me create a simple to-do list with add and remove functionality.",
    },
    {
      icon: <FileSearch className="h-4 w-4" />,
      title: "Remember something",
      description: "Save notes to workspace",
      prompt: "Remember that my favorite programming language is TypeScript. Save this to your workspace.",
    },
  ]

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
      <div className="mb-8 text-center">
        <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-primary/10 border border-primary/20 mb-4">
          <Sparkles className="h-7 w-7 text-primary" />
        </div>
        <h1 className="text-xl font-semibold text-foreground mb-2 text-balance">
          What can I help you build?
        </h1>
        <p className="text-sm text-muted-foreground max-w-md text-pretty">
          I can help you with coding tasks, answer questions, and save notes to my workspace for future reference.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-lg w-full">
        {suggestions.map((suggestion) => (
          <button
            key={suggestion.title}
            onClick={() => onSuggestionClick(suggestion.prompt)}
            className="flex items-start gap-3 p-3 rounded-xl border border-border bg-card/50 hover:bg-card hover:border-primary/30 transition-all text-left group"
          >
            <div className="shrink-0 h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary group-hover:bg-primary/20 transition-colors">
              {suggestion.icon}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-medium text-foreground">{suggestion.title}</div>
              <div className="text-xs text-muted-foreground">{suggestion.description}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

export function ChatPanel({
  messages,
  loading,
  streamingContent,
  liveActivity,
  liveTasks,
  lastTrace,
  cumulativeCost,
  conversationId,
  pendingQuestion,
  onSend,
  onStop,
  onSubmitAnswers,
}: ChatPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, streamingContent, liveActivity, pendingQuestion])

  return (
    <div className="flex-1 flex flex-col h-full min-w-0">
      {messages.length === 0 && !loading ? (
        <>
          <WelcomeScreen onSuggestionClick={onSend} />
          <ChatInput onSend={onSend} onStop={onStop} isLoading={loading} />
        </>
      ) : (
        <>
          <div ref={scrollRef} className="flex-1 overflow-y-auto">
            <div className="max-w-3xl mx-auto px-4 py-4">
              {messages.map((message, idx) => (
                <ChatMessage key={idx} message={message} />
              ))}
              {loading && !streamingContent && liveActivity.length === 0 && (
                <ThinkingIndicator />
              )}
              {loading && (streamingContent || liveActivity.length > 0 || liveTasks.length > 0) && (
                <StreamingMessage
                  content={streamingContent}
                  activity={liveActivity}
                  tasks={liveTasks}
                />
              )}
              {pendingQuestion && (
                <QuestionMessage
                  questions={pendingQuestion.questions}
                  onSubmit={onSubmitAnswers}
                />
              )}
            </div>
          </div>
          <ChatInput onSend={onSend} onStop={onStop} isLoading={loading} />
          <div className="px-4 py-1.5 flex items-center justify-between">
            <CostDisplay lastTrace={lastTrace} cumulativeCost={cumulativeCost} />
            <span className="text-[10px] text-muted-foreground/50 font-mono">
              {conversationId.slice(0, 8)}
            </span>
          </div>
        </>
      )}
    </div>
  )
}
