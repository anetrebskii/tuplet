"use client"

import { useRef, useEffect } from "react"
import { ChatMessage, ThinkingIndicator } from "./chat-message"
import { ChatInput } from "./chat-input"
import { Sparkles, Code2, FolderTree, Terminal, FileSearch } from "lucide-react"
import type { UIMessage } from "ai"

interface ChatPanelProps {
  messages: UIMessage[]
  status: string
  onSend: (message: string) => void
  onStop?: () => void
}

function WelcomeScreen({ onSuggestionClick }: { onSuggestionClick: (text: string) => void }) {
  const suggestions = [
    {
      icon: <Code2 className="h-4 w-4" />,
      title: "Review my code",
      description: "Analyze and suggest improvements",
      prompt: "Review the code in /src/app/page.tsx and suggest improvements for performance and best practices.",
    },
    {
      icon: <FolderTree className="h-4 w-4" />,
      title: "Explore project",
      description: "Navigate the file structure",
      prompt: "List all the files in my project and give me an overview of the project structure.",
    },
    {
      icon: <Terminal className="h-4 w-4" />,
      title: "Run commands",
      description: "Execute build, test, or install",
      prompt: "Run the build command and check if there are any errors in my project.",
    },
    {
      icon: <FileSearch className="h-4 w-4" />,
      title: "Find & replace",
      description: "Search across your codebase",
      prompt: "Search for all usages of 'className' in the components directory and show me the results.",
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
          I can read, write, and edit your code files, run terminal commands, search your codebase, and help you build features.
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

export function ChatPanel({ messages, status, onSend, onStop }: ChatPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const isLoading = status === "streaming" || status === "submitted"

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  return (
    <div className="flex-1 flex flex-col h-full min-w-0">
      {messages.length === 0 ? (
        <>
          <WelcomeScreen onSuggestionClick={onSend} />
          <ChatInput onSend={onSend} onStop={onStop} isLoading={isLoading} />
        </>
      ) : (
        <>
          <div ref={scrollRef} className="flex-1 overflow-y-auto">
            <div className="max-w-3xl mx-auto px-4 py-4">
              {messages.map((message) => (
                <ChatMessage key={message.id} message={message} />
              ))}
              {status === "submitted" && <ThinkingIndicator />}
            </div>
          </div>
          <ChatInput onSend={onSend} onStop={onStop} isLoading={isLoading} />
        </>
      )}
    </div>
  )
}
