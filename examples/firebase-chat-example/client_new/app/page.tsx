"use client"

import { useState, useCallback } from "react"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport } from "ai"
import { AppHeader } from "@/components/app-header"
import { ActivityBar } from "@/components/activity-bar"
import { FileExplorer } from "@/components/file-explorer"
import { CodeViewer } from "@/components/code-viewer"
import { ChatPanel } from "@/components/chat-panel"
import { TerminalPanel } from "@/components/terminal-panel"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"

type ActivityTab = "files" | "search" | "git" | "chat" | "terminal" | "debug"

const chatTransport = new DefaultChatTransport({ api: "/api/chat" })

export default function Home() {
  const [showSidebar, setShowSidebar] = useState(true)
  const [showCodePanel, setShowCodePanel] = useState(true)
  const [showTerminal, setShowTerminal] = useState(false)
  const [activeTab, setActiveTab] = useState<ActivityTab>("chat")
  const [selectedFile, setSelectedFile] = useState<string | null>(null)

  const { messages, sendMessage, status, setMessages } = useChat({
    transport: chatTransport,
  })

  const [input, setInput] = useState("")

  const handleSend = useCallback(
    (text: string) => {
      sendMessage({ text })
    },
    [sendMessage]
  )

  const handleNewChat = useCallback(() => {
    setMessages([])
  }, [setMessages])

  const handleSelectFile = useCallback((path: string) => {
    setSelectedFile(path)
    setShowCodePanel(true)
  }, [])

  const handleTabChange = useCallback(
    (tab: ActivityTab) => {
      if (tab === activeTab && showSidebar) {
        setShowSidebar(false)
      } else {
        setActiveTab(tab)
        setShowSidebar(true)
      }
    },
    [activeTab, showSidebar]
  )

  return (
    <div className="h-screen flex flex-col bg-background text-foreground overflow-hidden">
      {/* Top header */}
      <AppHeader
        showSidebar={showSidebar}
        showCodePanel={showCodePanel}
        onToggleSidebar={() => setShowSidebar(!showSidebar)}
        onToggleCodePanel={() => setShowCodePanel(!showCodePanel)}
        onNewChat={handleNewChat}
      />

      {/* Main content area */}
      <div className="flex-1 flex min-h-0">
        {/* Activity Bar */}
        <ActivityBar
          activeTab={activeTab}
          onTabChange={handleTabChange}
          onToggleTerminal={() => setShowTerminal(!showTerminal)}
          showTerminal={showTerminal}
        />

        {/* Resizable panel layout */}
        <div className="flex-1 min-w-0">
          <ResizablePanelGroup direction="horizontal" className="h-full">
            {/* Sidebar panel - file explorer or search */}
            {showSidebar && activeTab === "files" && (
              <>
                <ResizablePanel defaultSize={18} minSize={12} maxSize={30}>
                  <FileExplorer
                    selectedFile={selectedFile}
                    onSelectFile={handleSelectFile}
                  />
                </ResizablePanel>
                <ResizableHandle className="w-px bg-border hover:bg-primary/50 transition-colors" />
              </>
            )}

            {showSidebar && activeTab === "search" && (
              <>
                <ResizablePanel defaultSize={18} minSize={12} maxSize={30}>
                  <SearchPanel />
                </ResizablePanel>
                <ResizableHandle className="w-px bg-border hover:bg-primary/50 transition-colors" />
              </>
            )}

            {showSidebar && activeTab === "git" && (
              <>
                <ResizablePanel defaultSize={18} minSize={12} maxSize={30}>
                  <GitPanel />
                </ResizablePanel>
                <ResizableHandle className="w-px bg-border hover:bg-primary/50 transition-colors" />
              </>
            )}

            {/* Main chat panel */}
            <ResizablePanel defaultSize={showCodePanel ? 45 : 82} minSize={30}>
              <ResizablePanelGroup direction="vertical">
                <ResizablePanel defaultSize={showTerminal ? 70 : 100} minSize={30}>
                  <ChatPanel
                    messages={messages}
                    status={status}
                    onSend={handleSend}
                  />
                </ResizablePanel>

                {showTerminal && (
                  <>
                    <ResizableHandle className="h-px bg-border hover:bg-primary/50 transition-colors" />
                    <ResizablePanel defaultSize={30} minSize={15} maxSize={50}>
                      <TerminalPanel onClose={() => setShowTerminal(false)} />
                    </ResizablePanel>
                  </>
                )}
              </ResizablePanelGroup>
            </ResizablePanel>

            {/* Code viewer panel */}
            {showCodePanel && (
              <>
                <ResizableHandle className="w-px bg-border hover:bg-primary/50 transition-colors" />
                <ResizablePanel defaultSize={37} minSize={20} maxSize={60}>
                  <CodeViewer
                    filePath={selectedFile}
                    onClose={() => setSelectedFile(null)}
                  />
                </ResizablePanel>
              </>
            )}
          </ResizablePanelGroup>
        </div>
      </div>
    </div>
  )
}

/* Sidebar panels for search, git, debug */
function SearchPanel() {
  const [query, setQuery] = useState("")

  return (
    <div className="h-full flex flex-col bg-sidebar">
      <div className="px-3 py-2.5 border-b border-sidebar-border">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
          Search
        </h2>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search files..."
          className="w-full px-2.5 py-1.5 text-xs rounded-md border border-sidebar-border bg-input text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
        />
      </div>
      <div className="flex-1 flex items-center justify-center px-4">
        <p className="text-xs text-muted-foreground/60 text-center">
          {query ? `Searching for "${query}"...` : "Type to search across your project files"}
        </p>
      </div>
    </div>
  )
}

function GitPanel() {
  return (
    <div className="h-full flex flex-col bg-sidebar">
      <div className="px-3 py-2.5 border-b border-sidebar-border">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Source Control
        </h2>
      </div>
      <div className="px-3 py-3">
        <div className="flex items-center gap-2 mb-3">
          <div className="h-2 w-2 rounded-full bg-success" />
          <span className="text-xs text-foreground">main</span>
        </div>
        <div className="space-y-1">
          <div className="text-xs text-muted-foreground mb-2 uppercase tracking-wider font-semibold">
            Changes (3)
          </div>
          {["src/app/page.tsx", "src/components/header.tsx", "package.json"].map(
            (file) => (
              <div
                key={file}
                className="flex items-center gap-2 px-2 py-1 text-xs rounded hover:bg-sidebar-accent/40 cursor-pointer"
              >
                <span className="text-warning font-mono text-[10px]">M</span>
                <span className="text-sidebar-foreground/70 truncate">{file}</span>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  )
}
