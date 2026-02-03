/**
 * Workspace Provider Interface
 *
 * Async persistence layer that sits behind VirtualFS.
 * Providers handle loading, writing, deleting, and subscribing to workspace changes.
 */

export interface WorkspaceProvider {
  /** Load all workspace data. Called once during init to hydrate VirtualFS. */
  load(): Promise<Record<string, string>>
  /** Persist a single write. Called via onChange (fire-and-forget). */
  write(path: string, content: string): Promise<void>
  /** Persist a single delete. Called via onChange (fire-and-forget). */
  delete(path: string): Promise<void>
  /** Subscribe to external changes (e.g. Firestore real-time). Returns unsubscribe fn. */
  subscribe?(listener: WorkspaceChangeListener): () => void
  /** Flush any pending writes. */
  flush?(): Promise<void>
  /** Dispose resources (connections, watchers, etc). */
  dispose?(): Promise<void>
}

export interface WorkspaceChange {
  type: 'write' | 'delete'
  path: string
  content?: string
}

export type WorkspaceChangeListener = (changes: WorkspaceChange[]) => void
