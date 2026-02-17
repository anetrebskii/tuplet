/**
 * Path Validation
 *
 * Validates and normalizes workspace paths.
 * All workspace paths must be relative — absolute paths and '..' traversal are forbidden.
 */

import type { WorkspaceProvider } from '../providers/workspace/types.js'

export interface PathValidationResult {
  /** Error message if path is invalid */
  error?: string
  /** Normalized internal path (with '/' prefix for provider) */
  fsPath: string
}

/**
 * Validate and normalize a workspace path.
 *
 * Rules:
 * - '.' and '' map to root ('/')
 * - Paths starting with './' have the prefix stripped
 * - Absolute paths (starting with '/') are rejected
 * - Path traversal ('..') is rejected
 * - Valid relative paths get '/' prepended for internal provider use
 */
export function validatePath(path: string): PathValidationResult {
  // Root references
  if (path === '.' || path === '') {
    return { fsPath: '/' }
  }

  // Strip './' prefix
  let cleaned = path
  if (cleaned.startsWith('./')) {
    cleaned = cleaned.slice(2)
  }

  // Reject absolute paths
  if (cleaned.startsWith('/')) {
    const suggestion = cleaned.slice(1) || '.'
    return {
      error: `Absolute paths are not allowed. Use relative path instead: '${suggestion}'`,
      fsPath: ''
    }
  }

  // Reject path traversal
  if (cleaned.split('/').some(s => s === '..')) {
    return {
      error: `Path traversal ('..') is not allowed`,
      fsPath: ''
    }
  }

  return { fsPath: '/' + cleaned }
}

/**
 * Create a validated filesystem wrapper.
 *
 * Wraps a WorkspaceProvider so that all path arguments are validated
 * (must be relative, no '..') and converted to internal format (prepended with '/').
 * Results from glob() have the leading '/' stripped to return relative paths.
 *
 * Throws on invalid paths — the shell's top-level catch converts these to stderr.
 */
export function createValidatedFS(inner: WorkspaceProvider): WorkspaceProvider {
  function resolve(path: string): string {
    const result = validatePath(path)
    if (result.error) {
      throw new Error(result.error)
    }
    return result.fsPath
  }

  function toRelative(path: string): string {
    return path.startsWith('/') ? path.slice(1) : path
  }

  return {
    read: (path: string) => inner.read(resolve(path)),

    write: (path: string, content: string) => inner.write(resolve(path), content),

    delete: (path: string) => inner.delete(resolve(path)),

    exists: (path: string) => inner.exists(resolve(path)),

    list: (path: string) => inner.list(resolve(path)),

    glob: async (pattern: string) => {
      const results = await inner.glob(resolve(pattern))
      return results.map(toRelative)
    },

    mkdir: (path: string) => inner.mkdir(resolve(path)),

    isDirectory: (path: string) => inner.isDirectory(resolve(path)),

    size: inner.size
      ? (path: string) => inner.size!(resolve(path))
      : undefined,
  }
}
