import { X, FileCode, Save } from "lucide-react"
import { useState, useCallback, useRef, useEffect } from "react"
import Editor, { type OnMount } from "@monaco-editor/react"
import type { editor as monacoEditor } from "monaco-editor"

interface CodeViewerProps {
  filePath: string | null
  content: string | null
  onClose: () => void
  onSave?: (path: string, content: string) => void
}

function getLanguage(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() || ''
  const map: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    json: 'json',
    css: 'css',
    html: 'html',
    md: 'markdown',
    py: 'python',
    sh: 'shell',
    yml: 'yaml',
    yaml: 'yaml',
    xml: 'xml',
    sql: 'sql',
    graphql: 'graphql',
  }
  return map[ext] || 'plaintext'
}

export function CodeViewer({ filePath, content, onClose, onSave }: CodeViewerProps) {
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const editorRef = useRef<monacoEditor.IStandaloneCodeEditor | null>(null)
  const originalContent = useRef(content)
  const filePathRef = useRef(filePath)
  const onSaveRef = useRef(onSave)

  // Keep refs in sync
  useEffect(() => {
    filePathRef.current = filePath
    onSaveRef.current = onSave
  }, [filePath, onSave])

  // Reset dirty state when file changes
  useEffect(() => {
    originalContent.current = content
    setDirty(false)
  }, [filePath, content])

  const doSave = useCallback(() => {
    const path = filePathRef.current
    const save = onSaveRef.current
    const editor = editorRef.current
    if (!path || !save || !editor) return
    const value = editor.getValue()
    setSaving(true)
    save(path, value)
    originalContent.current = value
    setDirty(false)
    setTimeout(() => setSaving(false), 600)
  }, [])

  const handleEditorMount: OnMount = useCallback((editor, monaco) => {
    editorRef.current = editor
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      doSave()
    })
  }, [doSave])

  const handleChange = useCallback((value: string | undefined) => {
    setDirty(value !== originalContent.current)
  }, [])

  if (!filePath || content === null) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-background text-muted-foreground">
        <FileCode className="h-12 w-12 mb-3 opacity-30" />
        <p className="text-sm">Select a file to view its contents</p>
      </div>
    )
  }

  const fileName = filePath.split("/").pop() || filePath
  const language = getLanguage(filePath)

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Tab bar */}
      <div className="flex items-center border-b border-border bg-card/50">
        <div className="flex items-center gap-2 px-3 py-2 border-r border-border bg-background text-xs text-foreground">
          <FileCode className="h-3.5 w-3.5 text-primary" />
          <span className="font-mono">{fileName}</span>
          {dirty && <span className="h-2 w-2 rounded-full bg-primary" title="Unsaved changes" />}
          <button
            onClick={onClose}
            className="ml-1 p-0.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Close file"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
        <div className="flex-1" />
        {onSave && (
          <button
            onClick={doSave}
            disabled={!dirty || saving}
            className="px-2 py-1 mr-2 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors flex items-center gap-1 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Save className="h-3 w-3" />
            {saving ? 'Saved' : 'Save'}
          </button>
        )}
      </div>

      {/* Breadcrumb */}
      <div className="px-3 py-1.5 border-b border-border bg-card/30">
        <div className="flex items-center gap-1 text-xs text-muted-foreground font-mono">
          {filePath.split("/").filter(Boolean).map((segment, i, arr) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <span className="text-muted-foreground/50">/</span>}
              <span className={i === arr.length - 1 ? "text-foreground" : ""}>{segment}</span>
            </span>
          ))}
        </div>
      </div>

      {/* Monaco Editor */}
      <div className="flex-1 min-h-0">
        <Editor
          language={language}
          value={content}
          theme="vs-dark"
          onMount={handleEditorMount}
          onChange={handleChange}
          options={{
            minimap: { enabled: false },
            fontSize: 13,
            lineNumbers: "on",
            scrollBeyondLastLine: false,
            wordWrap: "on",
            tabSize: 2,
            automaticLayout: true,
            padding: { top: 8 },
            renderLineHighlight: "gutter",
            scrollbar: {
              verticalScrollbarSize: 8,
              horizontalScrollbarSize: 8,
            },
          }}
        />
      </div>

      {/* Status bar */}
      <div className="flex items-center justify-between px-3 py-1 border-t border-border bg-card/30 text-[10px] font-mono text-muted-foreground/60">
        <div className="flex items-center gap-3">
          <span>{language.toUpperCase()}</span>
          {dirty && <span className="text-primary">Modified</span>}
        </div>
        <div className="flex items-center gap-3">
          <span>UTF-8</span>
          <span>LF</span>
        </div>
      </div>
    </div>
  )
}
