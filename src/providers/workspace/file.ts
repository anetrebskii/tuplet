/**
 * File Workspace Provider
 *
 * Persists workspace entries to a directory on disk.
 * load() reads all files recursively; write/delete sync individual files.
 */

import { readdir, readFile, writeFile, unlink, mkdir } from 'node:fs/promises'
import { join, relative } from 'node:path'
import type { WorkspaceProvider } from './types.js'

export class FileWorkspaceProvider implements WorkspaceProvider {
  private dir: string

  constructor(dir: string) {
    this.dir = dir
  }

  async load(): Promise<Record<string, string>> {
    const result: Record<string, string> = {}

    try {
      await this.readDirRecursive(this.dir, result)
    } catch (err: unknown) {
      // Directory doesn't exist yet — return empty
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return result
      }
      throw err
    }

    return result
  }

  async write(path: string, content: string): Promise<void> {
    const filePath = this.toFilePath(path)
    const dir = filePath.substring(0, filePath.lastIndexOf('/'))
    await mkdir(dir, { recursive: true })
    await writeFile(filePath, content, 'utf-8')
  }

  async delete(path: string): Promise<void> {
    const filePath = this.toFilePath(path)
    try {
      await unlink(filePath)
    } catch (err: unknown) {
      // Ignore if file doesn't exist
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw err
      }
    }
  }

  /** Convert a VirtualFS path (e.g. /ctx/user.json) to a local file path */
  private toFilePath(fsPath: string): string {
    // Strip leading /ctx/ prefix for storage
    const stripped = fsPath.replace(/^\/ctx\//, '')
    return join(this.dir, stripped)
  }

  /** Convert a local file path back to a VirtualFS path */
  private toFSPath(filePath: string): string {
    const rel = relative(this.dir, filePath)
    return `/ctx/${rel}`
  }

  private async readDirRecursive(dir: string, result: Record<string, string>): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        await this.readDirRecursive(fullPath, result)
      } else if (entry.isFile()) {
        const content = await readFile(fullPath, 'utf-8')
        const fsPath = this.toFSPath(fullPath)
        result[fsPath] = content
      }
    }
  }
}
