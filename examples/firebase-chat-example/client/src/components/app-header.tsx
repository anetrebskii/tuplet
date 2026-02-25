import { useState, useRef, useEffect } from "react"
import {
  PanelRightClose,
  PanelRightOpen,
  Plus,
  History,
  Sparkles,
  ChevronDown,
  FolderOpen,
} from "lucide-react"
import { cn } from "@/lib/utils"
import type { UseProjectsReturn } from "@/hooks/useProjects"

interface AppHeaderProps {
  showRightPanel: boolean
  onToggleRightPanel: () => void
  onNewChat: () => void
  projects: UseProjectsReturn
}

export function AppHeader({
  showRightPanel,
  onToggleRightPanel,
  onNewChat,
  projects,
}: AppHeaderProps) {
  const [showDropdown, setShowDropdown] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    if (showDropdown) document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [showDropdown])

  return (
    <header className="h-11 border-b border-border bg-card/80 backdrop-blur-sm flex items-center px-3 gap-1 shrink-0">
      {/* Left — project selector */}
      <div className="flex items-center gap-1 relative" ref={dropdownRef}>
        <button
          onClick={() => setShowDropdown(!showDropdown)}
          className="flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs hover:bg-secondary transition-colors"
        >
          <FolderOpen className="h-3.5 w-3.5 text-primary" />
          <span className="font-medium text-foreground max-w-[140px] truncate">
            {projects.currentProject?.name || "Select project"}
          </span>
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        </button>

        {showDropdown && (
          <div className="absolute top-full left-0 mt-1 w-56 bg-card border border-border rounded-lg shadow-lg z-50 py-1">
            {projects.projects.map((p) => (
              <button
                key={p.id}
                onClick={() => { projects.selectProject(p); setShowDropdown(false) }}
                className={cn(
                  "w-full flex items-center gap-2 px-3 py-2 text-xs text-left hover:bg-secondary transition-colors",
                  p.id === projects.currentProject?.id && "bg-secondary/50 text-foreground"
                )}
              >
                <FolderOpen className="h-3.5 w-3.5 text-primary shrink-0" />
                <span className="truncate">{p.name}</span>
              </button>
            ))}
            {projects.projects.length > 0 && <div className="h-px bg-border my-1" />}
            <button
              onClick={() => { setShowDropdown(false) }}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              All projects
            </button>
          </div>
        )}
      </div>

      {/* Center - Logo */}
      <div className="flex-1 flex items-center justify-center gap-2">
        <div className="flex items-center gap-2">
          <div className="h-5 w-5 rounded-md bg-primary/20 flex items-center justify-center">
            <Sparkles className="h-3 w-3 text-primary" />
          </div>
          <span className="text-sm font-semibold text-foreground tracking-tight">AI Chat</span>
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
            Tuplet
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
          onClick={onToggleRightPanel}
          className={cn(
            "p-1.5 rounded-md transition-colors",
            showRightPanel
              ? "text-foreground hover:bg-secondary"
              : "text-muted-foreground hover:bg-secondary hover:text-foreground"
          )}
          aria-label={showRightPanel ? "Hide files panel" : "Show files panel"}
          title={showRightPanel ? "Hide files panel" : "Show files panel"}
        >
          {showRightPanel ? (
            <PanelRightClose className="h-4 w-4" />
          ) : (
            <PanelRightOpen className="h-4 w-4" />
          )}
        </button>
      </div>
    </header>
  )
}
