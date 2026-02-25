"use client"

import { useState } from "react"
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
} from "lucide-react"
import { cn } from "@/lib/utils"

export interface FileNode {
  name: string
  type: "file" | "folder"
  children?: FileNode[]
  path: string
}

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

const defaultFiles: FileNode[] = [
  {
    name: "src",
    type: "folder",
    path: "/src",
    children: [
      {
        name: "app",
        type: "folder",
        path: "/src/app",
        children: [
          { name: "page.tsx", type: "file", path: "/src/app/page.tsx" },
          { name: "layout.tsx", type: "file", path: "/src/app/layout.tsx" },
          { name: "globals.css", type: "file", path: "/src/app/globals.css" },
          {
            name: "api",
            type: "folder",
            path: "/src/app/api",
            children: [
              {
                name: "chat",
                type: "folder",
                path: "/src/app/api/chat",
                children: [
                  { name: "route.ts", type: "file", path: "/src/app/api/chat/route.ts" },
                ],
              },
            ],
          },
        ],
      },
      {
        name: "components",
        type: "folder",
        path: "/src/components",
        children: [
          { name: "header.tsx", type: "file", path: "/src/components/header.tsx" },
          { name: "sidebar.tsx", type: "file", path: "/src/components/sidebar.tsx" },
          { name: "button.tsx", type: "file", path: "/src/components/button.tsx" },
          { name: "card.tsx", type: "file", path: "/src/components/card.tsx" },
        ],
      },
      {
        name: "lib",
        type: "folder",
        path: "/src/lib",
        children: [
          { name: "utils.ts", type: "file", path: "/src/lib/utils.ts" },
          { name: "db.ts", type: "file", path: "/src/lib/db.ts" },
        ],
      },
    ],
  },
  { name: "package.json", type: "file", path: "/package.json" },
  { name: "tsconfig.json", type: "file", path: "/tsconfig.json" },
  { name: "next.config.mjs", type: "file", path: "/next.config.mjs" },
  { name: ".env.local", type: "file", path: "/.env.local" },
]

function FileTreeNode({
  node,
  depth,
  selectedFile,
  onSelectFile,
}: {
  node: FileNode
  depth: number
  selectedFile: string | null
  onSelectFile: (path: string) => void
}) {
  const [isOpen, setIsOpen] = useState(depth < 2)

  if (node.type === "folder") {
    return (
      <div>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="w-full flex items-center gap-1.5 py-1 px-2 text-xs hover:bg-sidebar-accent/60 rounded transition-colors group"
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
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
        {isOpen && node.children?.map((child) => (
          <FileTreeNode
            key={child.path}
            node={child}
            depth={depth + 1}
            selectedFile={selectedFile}
            onSelectFile={onSelectFile}
          />
        ))}
      </div>
    )
  }

  return (
    <button
      onClick={() => onSelectFile(node.path)}
      className={cn(
        "w-full flex items-center gap-1.5 py-1 px-2 text-xs rounded transition-colors",
        selectedFile === node.path
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-sidebar-foreground/70 hover:bg-sidebar-accent/40 hover:text-sidebar-foreground"
      )}
      style={{ paddingLeft: `${depth * 12 + 22}px` }}
    >
      {getFileIcon(node.name)}
      <span className="truncate">{node.name}</span>
    </button>
  )
}

interface FileExplorerProps {
  selectedFile: string | null
  onSelectFile: (path: string) => void
  files?: FileNode[]
}

export function FileExplorer({ selectedFile, onSelectFile, files }: FileExplorerProps) {
  const fileTree = files || defaultFiles

  return (
    <div className="h-full flex flex-col bg-sidebar text-sidebar-foreground">
      <div className="px-3 py-2.5 border-b border-sidebar-border">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Explorer
        </h2>
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {fileTree.map((node) => (
          <FileTreeNode
            key={node.path}
            node={node}
            depth={0}
            selectedFile={selectedFile}
            onSelectFile={onSelectFile}
          />
        ))}
      </div>
    </div>
  )
}
