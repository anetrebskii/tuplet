"use client"

import { useState, useRef, useEffect } from "react"
import { Terminal, X, Minus } from "lucide-react"

interface TerminalLine {
  id: number
  type: "input" | "output" | "error" | "info"
  content: string
}

const initialLines: TerminalLine[] = [
  { id: 1, type: "info", content: "CodePilot Terminal v1.0.0" },
  { id: 2, type: "info", content: "Type commands or let the AI assistant execute them for you." },
  { id: 3, type: "input", content: "$ npm run dev" },
  { id: 4, type: "output", content: "  > my-project@0.1.0 dev" },
  { id: 5, type: "output", content: "  > next dev" },
  { id: 6, type: "output", content: "" },
  { id: 7, type: "info", content: "  Ready in 1.2s" },
  { id: 8, type: "output", content: "  - Local:   http://localhost:3000" },
  { id: 9, type: "output", content: "" },
]

interface TerminalPanelProps {
  onClose: () => void
}

export function TerminalPanel({ onClose }: TerminalPanelProps) {
  const [lines, setLines] = useState<TerminalLine[]>(initialLines)
  const [input, setInput] = useState("")
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [lines])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim()) return

    const newLines: TerminalLine[] = [
      { id: Date.now(), type: "input", content: `$ ${input}` },
      { id: Date.now() + 1, type: "output", content: `Command executed: ${input}` },
    ]

    setLines((prev) => [...prev, ...newLines])
    setInput("")
  }

  return (
    <div className="h-full flex flex-col bg-[oklch(0.11_0.005_260)] border-t border-border">
      {/* Terminal header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-card/30">
        <div className="flex items-center gap-2">
          <Terminal className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs font-medium text-foreground">Terminal</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Minimize terminal"
          >
            <Minus className="h-3 w-3" />
          </button>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Close terminal"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Terminal content */}
      <div className="flex-1 overflow-y-auto p-3 font-mono text-xs leading-relaxed">
        {lines.map((line) => (
          <div
            key={line.id}
            className={
              line.type === "input"
                ? "text-primary font-semibold"
                : line.type === "error"
                ? "text-destructive"
                : line.type === "info"
                ? "text-success"
                : "text-foreground/70"
            }
          >
            {line.content || "\u00A0"}
          </div>
        ))}
        <div ref={bottomRef} />

        {/* Input line */}
        <form onSubmit={handleSubmit} className="flex items-center mt-1">
          <span className="text-primary mr-2">$</span>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="flex-1 bg-transparent text-foreground focus:outline-none caret-primary"
            autoFocus
          />
        </form>
      </div>
    </div>
  )
}
