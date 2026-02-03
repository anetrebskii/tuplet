/**
 * Virtual Filesystem
 *
 * In-memory filesystem for context storage.
 * Paths like /ctx/... map to context data.
 */

import type { VirtualFSInterface } from './types.js'

/**
 * Simple glob pattern matcher
 */
function matchGlob(path: string, pattern: string): boolean {
  // Convert glob pattern to regex
  const regexPattern = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&') // Escape special regex chars
    .replace(/\*\*/g, '{{GLOBSTAR}}')      // Temp placeholder for **
    .replace(/\*/g, '[^/]*')               // * matches anything except /
    .replace(/\?/g, '[^/]')                // ? matches single char except /
    .replace(/{{GLOBSTAR}}/g, '.*')        // ** matches anything including /

  const regex = new RegExp(`^${regexPattern}$`)
  return regex.test(path)
}

export class VirtualFS implements VirtualFSInterface {
  private data: Map<string, string> = new Map()
  private directories: Set<string> = new Set(['/ctx', '/tmp', '/env'])

  constructor(initial?: Record<string, unknown>) {
    if (initial) {
      for (const [key, value] of Object.entries(initial)) {
        const path = key.startsWith('/') ? key : `/ctx/${key}`
        this.write(path, typeof value === 'string' ? value : JSON.stringify(value, null, 2))
      }
    }
  }

  private normalizePath(path: string): string {
    // Remove trailing slash, normalize double slashes
    return path.replace(/\/+/g, '/').replace(/\/$/, '') || '/'
  }

  private getParentDir(path: string): string {
    const parts = path.split('/')
    parts.pop()
    return parts.join('/') || '/'
  }

  read(path: string): string | null {
    const normalized = this.normalizePath(path)
    return this.data.get(normalized) ?? null
  }

  write(path: string, content: string): void {
    const normalized = this.normalizePath(path)

    // Ensure parent directories exist
    const parent = this.getParentDir(normalized)
    if (parent !== '/') {
      this.mkdir(parent)
    }

    this.data.set(normalized, content)
  }

  delete(path: string): boolean {
    const normalized = this.normalizePath(path)

    // If directory, delete all children
    if (this.directories.has(normalized)) {
      const prefix = normalized + '/'
      for (const key of this.data.keys()) {
        if (key.startsWith(prefix)) {
          this.data.delete(key)
        }
      }
      this.directories.delete(normalized)
      return true
    }

    return this.data.delete(normalized)
  }

  exists(path: string): boolean {
    const normalized = this.normalizePath(path)
    return this.data.has(normalized) || this.directories.has(normalized)
  }

  list(path: string): string[] {
    const normalized = this.normalizePath(path)
    const prefix = normalized === '/' ? '/' : normalized + '/'
    const results: Set<string> = new Set()

    // List files
    for (const key of this.data.keys()) {
      if (key.startsWith(prefix)) {
        const relative = key.slice(prefix.length)
        const firstPart = relative.split('/')[0]
        if (firstPart) {
          results.add(firstPart)
        }
      }
    }

    // List subdirectories
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

  glob(pattern: string): string[] {
    const results: string[] = []

    for (const key of this.data.keys()) {
      if (matchGlob(key, pattern)) {
        results.push(key)
      }
    }

    return results.sort()
  }

  mkdir(path: string): void {
    const normalized = this.normalizePath(path)

    // Create all parent directories
    const parts = normalized.split('/').filter(Boolean)
    let current = ''
    for (const part of parts) {
      current += '/' + part
      this.directories.add(current)
    }
  }

  isDirectory(path: string): boolean {
    const normalized = this.normalizePath(path)
    return this.directories.has(normalized)
  }

  /** Export all context data */
  export(): Record<string, unknown> {
    const result: Record<string, unknown> = {}
    for (const [key, value] of this.data.entries()) {
      try {
        result[key] = JSON.parse(value)
      } catch {
        result[key] = value
      }
    }
    return result
  }
}
