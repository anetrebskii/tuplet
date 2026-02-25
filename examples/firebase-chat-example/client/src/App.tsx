import { useState, useCallback } from "react"
import { AppHeader } from "@/components/app-header"
import { FileExplorer } from "@/components/file-explorer"
import { CodeViewer } from "@/components/code-viewer"
import { ChatPanel } from "@/components/chat-panel"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import { useChat } from "@/hooks/useChat"
import { useProjects } from "@/hooks/useProjects"
import { Sparkles } from "lucide-react"

export default function App() {
  const projects = useProjects()
  const projectId = projects.currentProject?.id || ''
  const chat = useChat(projectId)
  const [showRightPanel, setShowRightPanel] = useState(false)
  const [selectedFile, setSelectedFile] = useState<{ path: string; content: string } | null>(null)

  const handleNewChat = useCallback(() => {
    chat.newConversation()
    setSelectedFile(null)
  }, [chat])

  const handleSelectFile = useCallback((path: string, content: string) => {
    setSelectedFile({ path, content })
  }, [])

  const handleSaveFile = useCallback(async (path: string, content: string) => {
    if (!projectId) return
    try {
      await fetch(`/api/workspace/${projectId}/${path}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      })
      setSelectedFile((prev) => prev?.path === path ? { path, content } : prev)
    } catch {
      // silent
    }
  }, [projectId])

  const handleDeleteFile = useCallback(async (path: string) => {
    if (!projectId) return
    try {
      await fetch(`/api/workspace/${projectId}/${path}`, { method: 'DELETE' })
      if (selectedFile?.path === path) setSelectedFile(null)
    } catch {
      // silent
    }
  }, [projectId, selectedFile])

  const handleCreateFile = useCallback(async (path: string) => {
    if (!projectId) return
    try {
      await fetch(`/api/workspace/${projectId}/${path}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: '' }),
      })
      setSelectedFile({ path, content: '' })
    } catch {
      // silent
    }
  }, [projectId])

  const handleRenameFile = useCallback(async (from: string, to: string) => {
    if (!projectId) return
    try {
      await fetch(`/api/workspace/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to }),
      })
      setSelectedFile((prev) => prev?.path === from ? { path: to, content: prev.content } : prev)
    } catch {
      // silent
    }
  }, [projectId])

  const handleUploadFile = useCallback(async (path: string, content: string) => {
    if (!projectId) return
    try {
      await fetch(`/api/workspace/${projectId}/${path}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      })
    } catch {
      // silent
    }
  }, [projectId])

  // No project selected — show project picker
  if (!projects.currentProject) {
    return <ProjectPicker projects={projects} />
  }

  return (
    <div className="h-screen flex flex-col bg-background text-foreground overflow-hidden">
      <AppHeader
        showRightPanel={showRightPanel}
        onToggleRightPanel={() => setShowRightPanel(!showRightPanel)}
        onNewChat={handleNewChat}
        projects={projects}
      />

      <div className="flex-1 min-h-0">
        <ResizablePanelGroup direction="horizontal" className="h-full">
          <ResizablePanel id="chat" order={1} defaultSize={showRightPanel ? 40 : 100} minSize={25}>
            <div className="flex flex-col h-full">
              <ChatPanel
                messages={chat.messages}
                loading={chat.loading}
                streamingContent={chat.streamingContent}
                liveActivity={chat.liveActivity}
                liveTasks={chat.liveTasks}
                lastTrace={chat.lastTrace}
                cumulativeCost={chat.cumulativeCost}
                conversationId={chat.conversationId}
                pendingQuestion={chat.pendingQuestion}
                onSend={chat.send}
                onStop={chat.stop}
                onSubmitAnswers={chat.submitAnswers}
              />
            </div>
          </ResizablePanel>

          {showRightPanel && (
            <>
              <ResizableHandle className="w-px bg-border hover:bg-primary/50 transition-colors" />
              <ResizablePanel id="right" order={2} defaultSize={60} minSize={30} maxSize={70}>
                <ResizablePanelGroup direction="horizontal" className="h-full">
                  <ResizablePanel defaultSize={30} minSize={15} maxSize={50}>
                    <FileExplorer
                      projectId={projectId}
                      selectedFile={selectedFile?.path || null}
                      onSelectFile={handleSelectFile}
                      onDeleteFile={handleDeleteFile}
                      onCreateFile={handleCreateFile}
                      onRenameFile={handleRenameFile}
                      onUploadFile={handleUploadFile}
                      refreshKey={chat.workspaceVersion}
                    />
                  </ResizablePanel>
                  <ResizableHandle className="w-px bg-border hover:bg-primary/50 transition-colors" />
                  <ResizablePanel defaultSize={70} minSize={30}>
                    <CodeViewer
                      filePath={selectedFile?.path || null}
                      content={selectedFile?.content ?? null}
                      onClose={() => setSelectedFile(null)}
                      onSave={handleSaveFile}
                    />
                  </ResizablePanel>
                </ResizablePanelGroup>
              </ResizablePanel>
            </>
          )}
        </ResizablePanelGroup>
      </div>
    </div>
  )
}

// --- Project picker (shown when no project is selected) ---

function ProjectPicker({ projects }: { projects: ReturnType<typeof useProjects> }) {
  const [name, setName] = useState("")
  const [creating, setCreating] = useState(false)

  const handleCreate = async () => {
    if (!name.trim()) return
    setCreating(true)
    await projects.createProject(name.trim())
    setName("")
    setCreating(false)
  }

  return (
    <div className="h-screen flex items-center justify-center bg-background text-foreground">
      <div className="w-full max-w-md px-6">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-primary/10 border border-primary/20 mb-4">
            <Sparkles className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-xl font-semibold mb-2">AI Chat</h1>
          <p className="text-sm text-muted-foreground">Select a project or create a new one</p>
        </div>

        {/* Create new */}
        <div className="flex gap-2 mb-6">
          <input
            className="flex-1 bg-input/50 border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
            placeholder="New project name..."
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          />
          <button
            onClick={handleCreate}
            disabled={!name.trim() || creating}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-30"
          >
            Create
          </button>
        </div>

        {/* Existing projects */}
        {projects.projects.length > 0 && (
          <div className="space-y-2">
            {projects.projects.map((p) => (
              <button
                key={p.id}
                onClick={() => projects.selectProject(p)}
                className="w-full flex items-center gap-3 p-3 rounded-lg border border-border hover:border-primary/30 hover:bg-card transition-all text-left"
              >
                <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
                  <Sparkles className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-foreground truncate">{p.name}</div>
                  <div className="text-xs text-muted-foreground font-mono">{p.id.slice(0, 8)}</div>
                </div>
              </button>
            ))}
          </div>
        )}

        {projects.loading && (
          <p className="text-center text-sm text-muted-foreground">Loading projects...</p>
        )}
      </div>
    </div>
  )
}
