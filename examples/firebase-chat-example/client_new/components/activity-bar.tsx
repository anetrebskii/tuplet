"use client"

import {
  Files,
  Search,
  GitBranch,
  MessageSquare,
  Terminal,
  Settings,
  Bug,
} from "lucide-react"
import { cn } from "@/lib/utils"

type ActivityTab = "files" | "search" | "git" | "chat" | "terminal" | "debug"

interface ActivityBarProps {
  activeTab: ActivityTab
  onTabChange: (tab: ActivityTab) => void
  onToggleTerminal: () => void
  showTerminal: boolean
}

const tabs: { id: ActivityTab; icon: React.ElementType; label: string }[] = [
  { id: "chat", icon: MessageSquare, label: "AI Chat" },
  { id: "files", icon: Files, label: "Explorer" },
  { id: "search", icon: Search, label: "Search" },
  { id: "git", icon: GitBranch, label: "Source Control" },
  { id: "debug", icon: Bug, label: "Debug" },
]

export function ActivityBar({
  activeTab,
  onTabChange,
  onToggleTerminal,
  showTerminal,
}: ActivityBarProps) {
  return (
    <div className="w-12 bg-[oklch(0.11_0.005_260)] border-r border-border flex flex-col items-center py-2 shrink-0">
      {/* Top tabs */}
      <div className="flex flex-col items-center gap-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={cn(
              "relative w-10 h-10 flex items-center justify-center rounded-lg transition-colors",
              activeTab === tab.id
                ? "text-foreground bg-secondary"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
            )}
            title={tab.label}
            aria-label={tab.label}
          >
            {activeTab === tab.id && (
              <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r bg-primary" />
            )}
            <tab.icon className="h-5 w-5" />
          </button>
        ))}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Bottom actions */}
      <div className="flex flex-col items-center gap-1">
        <button
          onClick={onToggleTerminal}
          className={cn(
            "w-10 h-10 flex items-center justify-center rounded-lg transition-colors",
            showTerminal
              ? "text-primary bg-primary/10"
              : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
          )}
          title="Toggle Terminal"
          aria-label="Toggle Terminal"
        >
          <Terminal className="h-5 w-5" />
        </button>
        <button
          className="w-10 h-10 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
          title="Settings"
          aria-label="Settings"
        >
          <Settings className="h-5 w-5" />
        </button>
      </div>
    </div>
  )
}
