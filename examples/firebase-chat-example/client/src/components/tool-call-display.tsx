import { useState } from "react"
import {
  ChevronDown,
  ChevronRight,
  FileSearch,
  FilePen,
  Terminal,
  FolderSearch,
  Search,
  FileText,
  Loader2,
  CheckCircle2,
  XCircle,
} from "lucide-react"
import { cn } from "@/lib/utils"

interface ToolCallProps {
  toolName: string
  args: Record<string, unknown>
  state: string
  output?: unknown
}

const toolIcons: Record<string, React.ReactNode> = {
  readFile: <FileSearch className="h-4 w-4" />,
  writeFile: <FilePen className="h-4 w-4" />,
  editFile: <FilePen className="h-4 w-4" />,
  runCommand: <Terminal className="h-4 w-4" />,
  listFiles: <FolderSearch className="h-4 w-4" />,
  searchFiles: <Search className="h-4 w-4" />,
  createFile: <FileText className="h-4 w-4" />,
  read: <FileSearch className="h-4 w-4" />,
  write: <FilePen className="h-4 w-4" />,
  list: <FolderSearch className="h-4 w-4" />,
}

const toolLabels: Record<string, string> = {
  readFile: "Read File",
  writeFile: "Write File",
  editFile: "Edit File",
  runCommand: "Run Command",
  listFiles: "List Files",
  searchFiles: "Search Files",
  createFile: "Create File",
  read: "Read",
  write: "Write",
  list: "List",
}

function getToolDescription(toolName: string, args: Record<string, unknown>): string {
  switch (toolName) {
    case "readFile":
    case "read":
      return `Reading ${args.path || args.file || "file"}...`
    case "writeFile":
    case "write":
    case "createFile":
      return `Writing to ${args.path || args.file || "file"}...`
    case "editFile":
      return `Editing ${args.path || args.file || "file"}...`
    case "runCommand":
      return `$ ${args.command || "command"}`
    case "listFiles":
    case "list":
      return `Listing ${args.path || args.directory || "directory"}...`
    case "searchFiles":
      return `Searching for "${args.pattern || args.query || "pattern"}"...`
    default:
      return `Running ${toolName}...`
  }
}

export function ToolCallDisplay({ toolName, args, state, output }: ToolCallProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const isLoading = state === "input-streaming" || state === "input-available" || state === "running"
  const isComplete = state === "output-available" || state === "completed"
  const isError = state === "output-error" || state === "failed"

  const icon = toolIcons[toolName] || <Terminal className="h-4 w-4" />
  const label = toolLabels[toolName] || toolName

  return (
    <div className="my-2 rounded-lg border border-tool-border bg-tool-bg overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-secondary/30 transition-colors"
      >
        <span className="flex items-center gap-2 text-primary">
          {icon}
        </span>
        <span className="font-medium text-foreground">{label}</span>
        <span className="text-xs text-muted-foreground truncate flex-1 text-left font-mono">
          {getToolDescription(toolName, args)}
        </span>
        <span className="flex items-center gap-1.5 ml-auto shrink-0">
          {isLoading && <Loader2 className="h-3.5 w-3.5 text-primary animate-spin" />}
          {isComplete && <CheckCircle2 className="h-3.5 w-3.5 text-success" />}
          {isError && <XCircle className="h-3.5 w-3.5 text-destructive" />}
          {isExpanded ? (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </span>
      </button>

      {isExpanded && (
        <div className="border-t border-tool-border">
          {/* Input args */}
          <div className="px-3 py-2">
            <div className="text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">Input</div>
            <pre className="text-xs font-mono text-foreground/80 bg-background/50 rounded p-2 overflow-x-auto max-h-48 overflow-y-auto">
              {JSON.stringify(args, null, 2)}
            </pre>
          </div>

          {/* Output */}
          {output != null && (
            <div className="px-3 py-2 border-t border-tool-border">
              <div className="text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">Output</div>
              <pre
                className={cn(
                  "text-xs font-mono rounded p-2 overflow-x-auto max-h-64 overflow-y-auto",
                  isError ? "text-destructive bg-destructive/10" : "text-foreground/80 bg-background/50"
                )}
              >
                {String(typeof output === "string" ? output : JSON.stringify(output, null, 2))}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
