"use client"

import {
  Terminal,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  History,
  Sparkles,
} from "lucide-react"
import { cn } from "@/lib/utils"

interface AppHeaderProps {
  showSidebar: boolean
  showCodePanel: boolean
  onToggleSidebar: () => void
  onToggleCodePanel: () => void
  onNewChat: () => void
}

export function AppHeader({
  showSidebar,
  showCodePanel,
  onToggleSidebar,
  onToggleCodePanel,
  onNewChat,
}: AppHeaderProps) {
  return (
    <header className="h-11 border-b border-border bg-card/80 backdrop-blur-sm flex items-center px-3 gap-1 shrink-0">
      {/* Left section */}
      <div className="flex items-center gap-1">
        <button
          onClick={onToggleSidebar}
          className={cn(
            "p-1.5 rounded-md transition-colors",
            showSidebar
              ? "text-foreground hover:bg-secondary"
              : "text-muted-foreground hover:bg-secondary hover:text-foreground"
          )}
          aria-label={showSidebar ? "Hide sidebar" : "Show sidebar"}
          title={showSidebar ? "Hide sidebar" : "Show sidebar"}
        >
          {showSidebar ? (
            <PanelLeftClose className="h-4 w-4" />
          ) : (
            <PanelLeftOpen className="h-4 w-4" />
          )}
        </button>
      </div>

      {/* Center - Logo */}
      <div className="flex-1 flex items-center justify-center gap-2">
        <div className="flex items-center gap-2">
          <div className="h-5 w-5 rounded-md bg-primary/20 flex items-center justify-center">
            <Sparkles className="h-3 w-3 text-primary" />
          </div>
          <span className="text-sm font-semibold text-foreground tracking-tight">CodePilot</span>
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
            AI
          </span>
        </div>
      </div>

      {/* Right section */}
      <div className="flex items-center gap-1">
        <button
          onClick={onNewChat}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          title="New chat"
        >
          <Plus className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">New</span>
        </button>
        <button
          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          title="Chat history"
        >
          <History className="h-4 w-4" />
        </button>
        <div className="w-px h-5 bg-border mx-1" />
        <button
          onClick={onToggleCodePanel}
          className={cn(
            "p-1.5 rounded-md transition-colors",
            showCodePanel
              ? "text-foreground hover:bg-secondary"
              : "text-muted-foreground hover:bg-secondary hover:text-foreground"
          )}
          aria-label={showCodePanel ? "Hide code panel" : "Show code panel"}
          title={showCodePanel ? "Hide code panel" : "Show code panel"}
        >
          {showCodePanel ? (
            <PanelRightClose className="h-4 w-4" />
          ) : (
            <PanelRightOpen className="h-4 w-4" />
          )}
        </button>
      </div>
    </header>
  )
}
