import { useState, useRef, useEffect, useCallback } from "react"
import { Send, Square, Paperclip, AtSign } from "lucide-react"
import { cn } from "@/lib/utils"

interface ChatInputProps {
  onSend: (message: string) => void
  onStop?: () => void
  isLoading: boolean
  disabled?: boolean
}

export function ChatInput({ onSend, onStop, isLoading, disabled }: ChatInputProps) {
  const [input, setInput] = useState("")
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto"
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + "px"
    }
  }, [input])

  useEffect(() => {
    if (!isLoading) {
      textareaRef.current?.focus()
    }
  }, [isLoading])

  const handleSubmit = useCallback(() => {
    if (!input.trim() || (isLoading && !onStop)) return
    if (isLoading && onStop) {
      onStop()
      return
    }
    onSend(input.trim())
    setInput("")
  }, [input, isLoading, onSend, onStop])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault()
        handleSubmit()
      }
    },
    [handleSubmit]
  )

  return (
    <div className="border-t border-border bg-card/50 backdrop-blur-sm px-4 py-3">
      <div className="max-w-3xl mx-auto">
        <div className="relative flex items-end gap-2 rounded-xl border border-border bg-input/50 focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/20 transition-all">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask AI to help with your project..."
            disabled={disabled}
            rows={1}
            className={cn(
              "flex-1 resize-none bg-transparent px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none",
              "min-h-[44px] max-h-[200px]",
              disabled && "opacity-50 cursor-not-allowed"
            )}
          />
          <div className="flex items-center gap-1 px-2 py-2">
            <button
              type="button"
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
              aria-label="Attach file"
              title="Attach file"
            >
              <Paperclip className="h-4 w-4" />
            </button>
            <button
              type="button"
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
              aria-label="Mention"
              title="Mention file"
            >
              <AtSign className="h-4 w-4" />
            </button>
            <button
              onClick={handleSubmit}
              disabled={disabled || (!input.trim() && !isLoading)}
              className={cn(
                "p-1.5 rounded-lg transition-all",
                isLoading
                  ? "bg-destructive/20 text-destructive hover:bg-destructive/30"
                  : input.trim()
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "bg-secondary text-muted-foreground cursor-not-allowed"
              )}
              aria-label={isLoading ? "Stop generation" : "Send message"}
            >
              {isLoading ? (
                <Square className="h-4 w-4" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>
        <div className="flex items-center justify-between mt-2 px-1">
          <p className="text-[10px] text-muted-foreground/50">
            {"Press Enter to send, Shift+Enter for new line"}
          </p>
        </div>
      </div>
    </div>
  )
}
