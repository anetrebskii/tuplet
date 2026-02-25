"use client"

import { MarkdownRenderer } from "./markdown-renderer"
import { ToolCallDisplay } from "./tool-call-display"
import { Bot, User, Sparkles } from "lucide-react"
import type { UIMessage } from "ai"

export function ChatMessage({ message }: { message: UIMessage }) {
  const isUser = message.role === "user"

  return (
    <div className={`flex gap-3 py-4 ${isUser ? "" : ""}`}>
      {/* Avatar */}
      <div
        className={`shrink-0 h-7 w-7 rounded-lg flex items-center justify-center mt-0.5 ${
          isUser
            ? "bg-secondary text-foreground"
            : "bg-primary/15 text-primary"
        }`}
      >
        {isUser ? (
          <User className="h-4 w-4" />
        ) : (
          <Sparkles className="h-4 w-4" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 space-y-1">
        <div className="text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">
          {isUser ? "You" : "CodePilot"}
        </div>

        {message.parts.map((part, index) => {
          if (part.type === "text" && part.text.trim()) {
            return (
              <div key={index} className="text-sm text-foreground/90 leading-relaxed">
                {isUser ? (
                  <p className="whitespace-pre-wrap">{part.text}</p>
                ) : (
                  <MarkdownRenderer content={part.text} />
                )}
              </div>
            )
          }

          if (part.type === "tool-invocation") {
            return (
              <ToolCallDisplay
                key={index}
                toolName={part.toolInvocation.toolName}
                args={part.toolInvocation.args as Record<string, unknown>}
                state={part.toolInvocation.state}
                output={
                  part.toolInvocation.state === "output-available"
                    ? part.toolInvocation.output
                    : part.toolInvocation.state === "output-error"
                    ? part.toolInvocation.error
                    : undefined
                }
              />
            )
          }

          return null
        })}
      </div>
    </div>
  )
}

export function ThinkingIndicator() {
  return (
    <div className="flex gap-3 py-4">
      <div className="shrink-0 h-7 w-7 rounded-lg flex items-center justify-center mt-0.5 bg-primary/15 text-primary">
        <Bot className="h-4 w-4 animate-pulse" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">
          CodePilot
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <div className="flex gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: "0ms" }} />
            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: "150ms" }} />
            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: "300ms" }} />
          </div>
          <span>Thinking...</span>
        </div>
      </div>
    </div>
  )
}
