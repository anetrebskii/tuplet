/**
 * Workspace Provider Interface
 *
 * Async filesystem layer that Shell and Workspace use directly.
 * Providers handle reading, writing, deleting, and subscribing to workspace changes.
 */

export interface WorkspaceProvider {
  // Filesystem operations (all async)
  read(path: string): Promise<string | null>
  write(path: string, content: string): Promise<void>
  delete(path: string): Promise<boolean>
  exists(path: string): Promise<boolean>
  list(path: string): Promise<string[]>
  glob(pattern: string): Promise<string[]>
  mkdir(path: string): Promise<void>
  isDirectory(path: string): Promise<boolean>

  // Lifecycle (optional)
  subscribe?(listener: WorkspaceChangeListener): () => void
  flush?(): Promise<void>
  dispose?(): Promise<void>
}

export interface WorkspaceChange {
  type: 'write' | 'delete'
  path: string
  content?: string
}

export type WorkspaceChangeListener = (changes: WorkspaceChange[]) => void
