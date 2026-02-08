/**
 * Memory Workspace Provider
 *
 * In-memory filesystem implementation. Absorbs the old VirtualFS functionality.
 * Default provider when no persistence is needed.
 */

import type { WorkspaceProvider } from './types.js'

/**
 * Simple glob pattern matcher
 */
function matchGlob(path: string, pattern: string): boolean {
  // Handle **/ to match zero or more path segments
  const regexPattern = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\/\*\*\//g, '{{GLOBSTARSLASH}}')  // /**/  → match / or /anything/
    .replace(/\*\*/g, '{{GLOBSTAR}}')            // remaining ** (e.g. at end)
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]')
    .replace(/{{GLOBSTARSLASH}}/g, '(?:/|/.*/)')  // /**/  → / or /stuff/
    .replace(/{{GLOBSTAR}}/g, '.*')               // ** alone → match anything

  const regex = new RegExp(`^${regexPattern}$`)
  return regex.test(path)
}

export class MemoryWorkspaceProvider implements WorkspaceProvider {
  private data: Map<string, string> = new Map()
  private directories: Set<string> = new Set(['/'])

  constructor(initial?: Record<string, unknown>) {
    if (initial) {
      for (const [key, value] of Object.entries(initial)) {
        const path = key.startsWith('/') ? key : `/${key}`
        const content = typeof value === 'string' ? value : JSON.stringify(value, null, 2)
        this.writeSync(path, content)
      }
    }
  }

  private normalizePath(path: string): string {
    return path.replace(/\/+/g, '/').replace(/\/$/, '') || '/'
  }

  private getParentDir(path: string): string {
    const parts = path.split('/')
    parts.pop()
    return parts.join('/') || '/'
  }

  private writeSync(path: string, content: string): void {
    const normalized = this.normalizePath(path)
    const parent = this.getParentDir(normalized)
    if (parent !== '/') {
      this.mkdirSync(parent)
    }
    this.data.set(normalized, content)
  }

  private mkdirSync(path: string): void {
    const normalized = this.normalizePath(path)
    const parts = normalized.split('/').filter(Boolean)
    let current = ''
    for (const part of parts) {
      current += '/' + part
      this.directories.add(current)
    }
  }

  async read(path: string): Promise<string | null> {
    const normalized = this.normalizePath(path)
    return this.data.get(normalized) ?? null
  }

  async write(path: string, content: string): Promise<void> {
    this.writeSync(path, content)
  }

  async delete(path: string): Promise<boolean> {
    const normalized = this.normalizePath(path)

    // If directory, delete all children
    if (this.directories.has(normalized)) {
      const prefix = normalized + '/'
      for (const key of [...this.data.keys()]) {
        if (key.startsWith(prefix)) {
          this.data.delete(key)
        }
      }
      // Remove subdirectories
      for (const dir of [...this.directories]) {
        if (dir.startsWith(prefix) || dir === normalized) {
          this.directories.delete(dir)
        }
      }
      return true
    }

    return this.data.delete(normalized)
  }

  async exists(path: string): Promise<boolean> {
    const normalized = this.normalizePath(path)
    return this.data.has(normalized) || this.directories.has(normalized)
  }

  async list(path: string): Promise<string[]> {
    const normalized = this.normalizePath(path)
    const prefix = normalized === '/' ? '/' : normalized + '/'
    const results: Set<string> = new Set()

    for (const key of this.data.keys()) {
      if (key.startsWith(prefix)) {
        const relative = key.slice(prefix.length)
        const firstPart = relative.split('/')[0]
        if (firstPart) {
          results.add(firstPart)
        }
      }
    }

    for (const dir of this.directories) {
      if (dir.startsWith(prefix)) {
        const relative = dir.slice(prefix.length)
        const firstPart = relative.split('/')[0]
        if (firstPart) {
          results.add(firstPart + '/')
        }
      }
    }

    return Array.from(results).sort()
  }

  async glob(pattern: string): Promise<string[]> {
    const results: string[] = []
    for (const key of this.data.keys()) {
      if (matchGlob(key, pattern)) {
        results.push(key)
      }
    }
    return results.sort()
  }

  async mkdir(path: string): Promise<void> {
    this.mkdirSync(path)
  }

  async isDirectory(path: string): Promise<boolean> {
    const normalized = this.normalizePath(path)
    return this.directories.has(normalized)
  }

  async size(path: string): Promise<number | null> {
    const content = this.data.get(this.normalizePath(path))
    return content != null ? Buffer.byteLength(content, 'utf-8') : null
  }
}
