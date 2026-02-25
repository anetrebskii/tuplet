import { useState, useEffect, useCallback, useRef, type DragEvent } from "react"
import {
  ChevronDown,
  ChevronRight,
  File,
  Folder,
  FolderOpen,
  FileCode,
  FileJson,
  FileType,
  Settings,
  Image,
  Plus,
  Trash2,
  Pencil,
  Download,
  Upload,
  Search,
  X,
  FolderPlus,
} from "lucide-react"
import { cn } from "@/lib/utils"

// --- Types ---

export interface FileNode {
  name: string
  type: "file" | "folder"
  children?: FileNode[]
  path: string
}

interface FileExplorerProps {
  projectId: string
  selectedFile: string | null
  onSelectFile: (path: string, content: string) => void
  onDeleteFile?: (path: string) => void
  onCreateFile?: (path: string) => void
  onRenameFile?: (from: string, to: string) => void
  onUploadFile?: (path: string, content: string) => void
  refreshKey?: number
}

interface WorkspaceItem {
  path: string
  preview?: string
}

// --- Icons ---

const fileIcons: Record<string, React.ReactNode> = {
  tsx: <FileCode className="h-4 w-4 text-[oklch(0.65_0.18_195)]" />,
  ts: <FileCode className="h-4 w-4 text-[oklch(0.65_0.18_195)]" />,
  jsx: <FileCode className="h-4 w-4 text-[oklch(0.70_0.15_80)]" />,
  js: <FileCode className="h-4 w-4 text-[oklch(0.75_0.15_80)]" />,
  json: <FileJson className="h-4 w-4 text-[oklch(0.75_0.12_80)]" />,
  css: <FileType className="h-4 w-4 text-[oklch(0.60_0.15_250)]" />,
  md: <File className="h-4 w-4 text-muted-foreground" />,
  png: <Image className="h-4 w-4 text-[oklch(0.65_0.15_155)]" />,
  jpg: <Image className="h-4 w-4 text-[oklch(0.65_0.15_155)]" />,
  svg: <Image className="h-4 w-4 text-[oklch(0.70_0.15_50)]" />,
  config: <Settings className="h-4 w-4 text-muted-foreground" />,
}

function getFileIcon(name: string): React.ReactNode {
  const ext = name.split(".").pop()?.toLowerCase() || ""
  if (name.includes("config")) return fileIcons.config
  return fileIcons[ext] || <File className="h-4 w-4 text-muted-foreground" />
}

// --- Inline name input ---

function InlineInput({
  initial,
  onSubmit,
  onCancel,
}: {
  initial: string
  onSubmit: (value: string) => void
  onCancel: () => void
}) {
  const [value, setValue] = useState(initial)
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => {
    // Select filename without extension
    if (ref.current) {
      const dotIdx = initial.lastIndexOf(".")
      ref.current.setSelectionRange(0, dotIdx > 0 ? dotIdx : initial.length)
    }
  }, [initial])

  return (
    <input
      ref={ref}
      className="flex-1 bg-input/50 border border-primary/50 rounded px-1.5 py-0.5 text-xs text-foreground font-mono focus:outline-none min-w-0"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && value.trim()) onSubmit(value.trim())
        if (e.key === "Escape") onCancel()
      }}
      onBlur={() => {
        if (value.trim() && value.trim() !== initial) onSubmit(value.trim())
        else onCancel()
      }}
      autoFocus
    />
  )
}

// --- File tree node ---

function FileTreeNode({
  node,
  depth,
  selectedFile,
  onSelectFile,
  onDeleteFile,
  onRenameFile,
  onDragStart,
  onDrop,
  onFolderSelect,
}: {
  node: FileNode
  depth: number
  selectedFile: string | null
  onSelectFile: (path: string) => void
  onDeleteFile?: (path: string) => void
  onRenameFile?: (from: string, newName: string) => void
  onDragStart?: (path: string) => void
  onDrop?: (targetFolder: string) => void
  onFolderSelect?: (path: string | null) => void
}) {
  const [isOpen, setIsOpen] = useState(depth < 2)
  const [renaming, setRenaming] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  const handleDragOver = (e: DragEvent) => {
    if (node.type === "folder") {
      e.preventDefault()
      setDragOver(true)
    }
  }

  const handleDragLeave = () => setDragOver(false)

  const handleDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    if (node.type === "folder" && onDrop) {
      onDrop(node.path)
      setIsOpen(true)
    }
  }

  if (node.type === "folder") {
    return (
      <div>
        <div
          className={cn(
            "flex items-center gap-1.5 py-1 px-2 text-xs hover:bg-sidebar-accent/60 rounded transition-colors group",
            dragOver && "bg-primary/10 border border-primary/30 border-dashed"
          )}
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <button
            onClick={() => {
              const opening = !isOpen
              setIsOpen(opening)
              onFolderSelect?.(opening ? node.path : null)
            }}
            className="flex items-center gap-1.5 flex-1 min-w-0"
          >
            {isOpen ? (
              <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
            ) : (
              <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
            )}
            {isOpen ? (
              <FolderOpen className="h-4 w-4 text-[oklch(0.70_0.12_80)] shrink-0" />
            ) : (
              <Folder className="h-4 w-4 text-[oklch(0.60_0.08_80)] shrink-0" />
            )}
            <span className="text-sidebar-foreground truncate">{node.name}</span>
          </button>
        </div>
        {isOpen &&
          node.children?.map((child) => (
            <FileTreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              selectedFile={selectedFile}
              onSelectFile={onSelectFile}
              onDeleteFile={onDeleteFile}
              onRenameFile={onRenameFile}
              onDragStart={onDragStart}
              onDrop={onDrop}
              onFolderSelect={onFolderSelect}
            />
          ))}
      </div>
    )
  }

  return (
    <div
      className={cn(
        "group flex items-center gap-1.5 py-1 px-2 text-xs rounded transition-colors",
        selectedFile === node.path
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-sidebar-foreground/70 hover:bg-sidebar-accent/40 hover:text-sidebar-foreground"
      )}
      style={{ paddingLeft: `${depth * 12 + 22}px` }}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move"
        onDragStart?.(node.path)
      }}
    >
      {renaming ? (
        <>
          {getFileIcon(node.name)}
          <InlineInput
            initial={node.name}
            onSubmit={(newName) => {
              setRenaming(false)
              if (newName !== node.name) onRenameFile?.(node.path, newName)
            }}
            onCancel={() => setRenaming(false)}
          />
        </>
      ) : (
        <>
          <button
            onClick={() => onSelectFile(node.path)}
            className="flex items-center gap-1.5 flex-1 min-w-0"
          >
            {getFileIcon(node.name)}
            <span className="truncate">{node.name}</span>
          </button>
          <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
            {onRenameFile && (
              <button
                onClick={(e) => { e.stopPropagation(); setRenaming(true) }}
                className="p-0.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                title="Rename"
              >
                <Pencil className="h-3 w-3" />
              </button>
            )}
            {onDeleteFile && (
              <button
                onClick={(e) => { e.stopPropagation(); onDeleteFile(node.path) }}
                className="p-0.5 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors"
                title="Delete"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// --- Main component ---

export function FileExplorer({
  projectId,
  selectedFile,
  onSelectFile,
  onDeleteFile,
  onCreateFile,
  onRenameFile,
  onUploadFile,
  refreshKey,
}: FileExplorerProps) {
  const [files, setFiles] = useState<FileNode[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [showNewInput, setShowNewInput] = useState<"file" | "folder" | null>(null)
  const [newName, setNewName] = useState("")
  const [activeFolder, setActiveFolder] = useState<string | null>(null)
  const [dragSource, setDragSource] = useState<string | null>(null)
  const [uploadDragOver, setUploadDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadFiles = useCallback(() => {
    fetch(`/api/workspace/${projectId}`)
      .then((r) => r.json())
      .then((data) => {
        const items: WorkspaceItem[] = data.files || []
        const tree = buildFileTree(items.map((i) => i.path))
        setFiles(tree)
      })
      .catch(() => setFiles([]))
  }, [projectId])

  useEffect(() => {
    loadFiles()
  }, [loadFiles, refreshKey])

  const handleClick = async (path: string) => {
    // Set active folder to the file's parent directory
    const lastSlash = path.lastIndexOf("/")
    setActiveFolder(lastSlash > 0 ? path.substring(0, lastSlash) : null)
    try {
      const res = await fetch(`/api/workspace/${projectId}/${path}`)
      const data = await res.json()
      onSelectFile(path, typeof data.content === "string" ? data.content : JSON.stringify(data.content, null, 2))
    } catch {
      onSelectFile(path, "Failed to load file.")
    }
  }

  const handleDelete = async (path: string) => {
    if (onDeleteFile) {
      await onDeleteFile(path)
      loadFiles()
    }
  }

  const handleCreate = async () => {
    let name = newName.trim()
    if (!name || !onCreateFile) return
    if (showNewInput === "folder") {
      name = name.endsWith("/") ? name + ".keep" : name + "/.keep"
    }
    const fullPath = activeFolder ? `${activeFolder}/${name}` : name
    await onCreateFile(fullPath)
    setNewName("")
    setShowNewInput(null)
    loadFiles()
  }

  const handleRename = async (from: string, newName: string) => {
    if (!onRenameFile) return
    const dir = from.includes("/") ? from.substring(0, from.lastIndexOf("/") + 1) : ""
    await onRenameFile(from, dir + newName)
    loadFiles()
  }

  const handleMove = async (targetFolder: string) => {
    if (!dragSource || !onRenameFile) return
    const fileName = dragSource.split("/").pop() || dragSource
    const to = targetFolder === "/" ? fileName : `${targetFolder}/${fileName}`
    if (to !== dragSource) {
      await onRenameFile(dragSource, to)
      loadFiles()
    }
    setDragSource(null)
  }

  const handleDownload = (path: string, content: string) => {
    const fileName = path.split("/").pop() || "file"
    const blob = new Blob([content], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = fileName
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleFileUpload = async (fileList: FileList) => {
    if (!onUploadFile) return
    for (const file of Array.from(fileList)) {
      const content = await file.text()
      await onUploadFile(file.name, content)
    }
    loadFiles()
  }

  const handleDropUpload = async (e: DragEvent) => {
    e.preventDefault()
    setUploadDragOver(false)
    if (e.dataTransfer.files.length > 0) {
      await handleFileUpload(e.dataTransfer.files)
    }
  }

  // Filter tree
  const filteredFiles = searchQuery
    ? filterTree(files, searchQuery.toLowerCase())
    : files

  const isEmpty = files.length === 0 && !showNewInput

  return (
    <div
      className={cn(
        "h-full flex flex-col bg-sidebar text-sidebar-foreground",
        uploadDragOver && "ring-2 ring-inset ring-primary/50"
      )}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) {
          e.preventDefault()
          setUploadDragOver(true)
        }
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setUploadDragOver(false)
      }}
      onDrop={handleDropUpload}
    >
      {/* Header */}
      <div className="px-3 py-2.5 border-b border-sidebar-border flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Workspace
        </h2>
        <div className="flex items-center gap-0.5">
          {onUploadFile && (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="p-1 rounded hover:bg-sidebar-accent text-muted-foreground hover:text-foreground transition-colors"
              title="Upload file"
            >
              <Upload className="h-3.5 w-3.5" />
            </button>
          )}
          {onCreateFile && (
            <>
              <button
                onClick={() => { setShowNewInput("file"); setNewName("") }}
                className="p-1 rounded hover:bg-sidebar-accent text-muted-foreground hover:text-foreground transition-colors"
                title="New file"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => { setShowNewInput("folder"); setNewName("") }}
                className="p-1 rounded hover:bg-sidebar-accent text-muted-foreground hover:text-foreground transition-colors"
                title="New folder"
              >
                <FolderPlus className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Search */}
      {files.length > 0 && (
        <div className="px-2 py-1.5 border-b border-sidebar-border">
          <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-sidebar-accent/40 text-xs">
            <Search className="h-3 w-3 text-muted-foreground shrink-0" />
            <input
              className="flex-1 bg-transparent text-sidebar-foreground placeholder:text-muted-foreground/50 focus:outline-none min-w-0"
              placeholder="Filter files..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")} className="text-muted-foreground hover:text-foreground">
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* New file/folder input */}
      {showNewInput && (
        <div className="px-3 py-1.5 border-b border-sidebar-border">
          <div className="flex items-center gap-1.5">
            {showNewInput === "folder" ? (
              <Folder className="h-4 w-4 text-[oklch(0.60_0.08_80)] shrink-0" />
            ) : (
              <File className="h-4 w-4 text-muted-foreground shrink-0" />
            )}
            <input
              className="flex-1 bg-input/50 border border-border rounded px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 font-mono min-w-0"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreate()
                if (e.key === "Escape") { setShowNewInput(null); setNewName("") }
              }}
              placeholder={showNewInput === "folder" ? "folder-name" : (activeFolder ? `${activeFolder}/filename.ts` : "filename.ts")}
              autoFocus
            />
            <button
              onClick={() => { setShowNewInput(null); setNewName("") }}
              className="p-0.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}

      {/* File tree */}
      <div className="flex-1 overflow-y-auto py-1">
        {isEmpty && !uploadDragOver && (
          <div className="flex-1 flex items-center justify-center px-4 py-8">
            <p className="text-xs text-muted-foreground/60 text-center">
              No workspace files yet. Ask the AI to save something.
            </p>
          </div>
        )}
        {uploadDragOver && (
          <div className="flex items-center justify-center px-4 py-8">
            <div className="text-center">
              <Upload className="h-8 w-8 text-primary mx-auto mb-2 opacity-60" />
              <p className="text-xs text-primary">Drop files to upload</p>
            </div>
          </div>
        )}
        {!uploadDragOver &&
          filteredFiles.map((node) => (
            <FileTreeNode
              key={node.path}
              node={node}
              depth={0}
              selectedFile={selectedFile}
              onSelectFile={handleClick}
              onDeleteFile={onDeleteFile ? handleDelete : undefined}
              onRenameFile={onRenameFile ? handleRename : undefined}
              onDragStart={setDragSource}
              onDrop={handleMove}
              onFolderSelect={setActiveFolder}
            />
          ))}
        {searchQuery && filteredFiles.length === 0 && files.length > 0 && (
          <div className="px-4 py-4 text-center">
            <p className="text-xs text-muted-foreground/60">No files matching "{searchQuery}"</p>
          </div>
        )}
      </div>

      {/* Download selected file */}
      {selectedFile && (
        <div className="px-3 py-1.5 border-t border-sidebar-border">
          <button
            onClick={async () => {
              try {
                const res = await fetch(`/api/workspace/${projectId}/${selectedFile}`)
                const data = await res.json()
                const content = typeof data.content === "string" ? data.content : JSON.stringify(data.content, null, 2)
                handleDownload(selectedFile, content)
              } catch {
                // silent
              }
            }}
            className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-colors"
          >
            <Download className="h-3.5 w-3.5" />
            Download
          </button>
        </div>
      )}

      {/* Hidden file input for upload button */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files) handleFileUpload(e.target.files)
          e.target.value = ""
        }}
      />
    </div>
  )
}

// --- Tree building ---

interface TreeMap {
  [name: string]: { node: FileNode; children: TreeMap }
}

function buildFileTree(paths: string[]): FileNode[] {
  if (paths.length === 0) return []

  const rootMap: TreeMap = {}

  for (const path of paths) {
    const parts = path.split("/").filter(Boolean)
    let current = rootMap

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      const isLast = i === parts.length - 1
      const currentPath = parts.slice(0, i + 1).join("/")

      if (!current[part]) {
        current[part] = {
          node: {
            name: part,
            type: isLast ? "file" : "folder",
            path: currentPath,
            children: isLast ? undefined : [],
          },
          children: {},
        }
      } else if (!isLast && current[part].node.type === "file") {
        current[part].node.type = "folder"
        current[part].node.children = current[part].node.children || []
      }

      if (!isLast) {
        current = current[part].children
      }
    }
  }

  function mapToNodes(map: TreeMap): FileNode[] {
    return Object.values(map).map(({ node, children }) => ({
      ...node,
      children: node.type === "folder" ? mapToNodes(children) : undefined,
    }))
  }

  return sortTree(mapToNodes(rootMap))
}

function sortTree(nodes: FileNode[]): FileNode[] {
  return nodes
    .map((n) => ({
      ...n,
      children: n.children ? sortTree(n.children) : undefined,
    }))
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === "folder" ? -1 : 1
      return a.name.localeCompare(b.name)
    })
}

// --- Filtering ---

function filterTree(nodes: FileNode[], query: string): FileNode[] {
  const result: FileNode[] = []
  for (const node of nodes) {
    if (node.type === "file") {
      if (node.name.toLowerCase().includes(query) || node.path.toLowerCase().includes(query)) {
        result.push(node)
      }
    } else if (node.children) {
      const filteredChildren = filterTree(node.children, query)
      if (filteredChildren.length > 0) {
        result.push({ ...node, children: filteredChildren })
      } else if (node.name.toLowerCase().includes(query)) {
        result.push(node)
      }
    }
  }
  return result
}
