/**
 * File Workspace Provider
 *
 * Persists workspace entries to a directory on disk.
 * All read/write operations go directly to the filesystem.
 */

import { readdir, readFile, writeFile, unlink, mkdir, stat, rm } from 'node:fs/promises'
import { join, relative } from 'node:path'
import type { WorkspaceProvider } from './types.js'

/**
 * Simple glob pattern matcher
 */
function matchGlob(path: string, pattern: string): boolean {
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

export class FileWorkspaceProvider implements WorkspaceProvider {
  private dir: string

  constructor(dir: string) {
    this.dir = dir
  }

  async read(path: string): Promise<string | null> {
    try {
      const filePath = this.toFilePath(path)
      return await readFile(filePath, 'utf-8')
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return null
      }
      throw err
    }
  }

  async write(path: string, content: string): Promise<void> {
    const filePath = this.toFilePath(path)
    const dir = filePath.substring(0, filePath.lastIndexOf('/'))
    await mkdir(dir, { recursive: true })
    await writeFile(filePath, content, 'utf-8')
  }

  async delete(path: string): Promise<boolean> {
    const filePath = this.toFilePath(path)
    try {
      const s = await stat(filePath)
      if (s.isDirectory()) {
        await rm(filePath, { recursive: true, force: true })
      } else {
        await unlink(filePath)
      }
      return true
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return false
      }
      throw err
    }
  }

  async exists(path: string): Promise<boolean> {
    try {
      await stat(this.toFilePath(path))
      return true
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return false
      }
      throw err
    }
  }

  async list(path: string): Promise<string[]> {
    try {
      const dirPath = this.toFilePath(path)
      const entries = await readdir(dirPath, { withFileTypes: true })
      return entries.map(e => e.isDirectory() ? e.name + '/' : e.name).sort()
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return []
      }
      throw err
    }
  }

  async glob(pattern: string): Promise<string[]> {
    const results: string[] = []
    try {
      await this.walkDir(this.dir, results)
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return []
      }
      throw err
    }
    return results.filter(p => matchGlob(p, pattern)).sort()
  }

  async mkdir(path: string): Promise<void> {
    await mkdir(this.toFilePath(path), { recursive: true })
  }

  async isDirectory(path: string): Promise<boolean> {
    try {
      const s = await stat(this.toFilePath(path))
      return s.isDirectory()
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return false
      }
      throw err
    }
  }

  /** Convert a workspace path (e.g. /user.json) to a local file path */
  private toFilePath(fsPath: string): string {
    const stripped = fsPath.replace(/^\//, '')
    return join(this.dir, stripped)
  }

  /** Convert a local file path back to a workspace path */
  private toFSPath(filePath: string): string {
    const rel = relative(this.dir, filePath)
    return `/${rel}`
  }

  private async walkDir(dir: string, results: string[]): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        await this.walkDir(fullPath, results)
      } else if (entry.isFile()) {
        results.push(this.toFSPath(fullPath))
      }
    }
  }
}
