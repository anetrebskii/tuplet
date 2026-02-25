/**
 * Google Cloud Storage workspace provider.
 * Drop-in replacement for FileWorkspaceProvider.
 *
 * Files stored at: gs://{bucket}/{prefix}/{path}
 */

import { getStorage } from 'firebase-admin/storage'
import type { WorkspaceProvider } from 'tuplet'

export class GCSWorkspaceProvider implements WorkspaceProvider {
  private bucket;
  private prefix: string

  constructor(opts: { bucket: string; prefix: string }) {
    this.bucket = getStorage().bucket(opts.bucket)
    this.prefix = opts.prefix.replace(/\/+$/, '')
  }

  private key(path: string): string {
    const clean = path.replace(/^\/+/, '')
    return `${this.prefix}/${clean}`
  }

  async read(path: string): Promise<string | null> {
    try {
      const [buf] = await this.bucket.file(this.key(path)).download()
      return buf.toString('utf-8')
    } catch (err: unknown) {
      if (isNotFound(err)) return null
      throw err
    }
  }

  async write(path: string, content: string): Promise<void> {
    await this.bucket.file(this.key(path)).save(content, {
      contentType: 'text/plain; charset=utf-8',
      resumable: false,
    })
  }

  async delete(path: string): Promise<boolean> {
    try {
      await this.bucket.file(this.key(path)).delete()
      return true
    } catch (err: unknown) {
      if (isNotFound(err)) return false
      throw err
    }
  }

  async exists(path: string): Promise<boolean> {
    const clean = path.replace(/^\/+/, '')
    if (!clean || clean === '.') return true // root always exists
    const [exists] = await this.bucket.file(this.key(path)).exists()
    if (exists) return true
    // Could be a directory — check if any files exist with this prefix
    return this.isDirectory(path)
  }

  async list(path: string): Promise<string[]> {
    const clean = path.replace(/^\/+/, '')
    const prefix = (!clean || clean === '.')
      ? `${this.prefix}/`
      : `${this.prefix}/${clean.replace(/\/*$/, '/')}`

    const [files] = await this.bucket.getFiles({ prefix })
    return files
      .map((f) => f.name.slice(this.prefix.length + 1)) // strip prefix
      .filter((p) => p && !p.endsWith('/')) // skip "directory" markers
      .map((p) => `/${p}`)
  }

  async glob(pattern: string): Promise<string[]> {
    // GCS doesn't support glob natively — list all and filter
    const all = await this.list('/')
    const re = globToRegex(pattern)
    return all.filter((p) => re.test(p))
  }

  async mkdir(_path: string): Promise<void> {
    // GCS is flat — directories are implicit from object keys
  }

  async isDirectory(path: string): Promise<boolean> {
    const clean = path.replace(/^\/+/, '')
    if (!clean || clean === '.') return true // root is always a directory
    const prefix = `${this.prefix}/${clean.replace(/\/*$/, '')}/`
    const [files] = await this.bucket.getFiles({ prefix, maxResults: 1 })
    return files.length > 0
  }

  async size(path: string): Promise<number | null> {
    try {
      const [metadata] = await this.bucket.file(this.key(path)).getMetadata()
      return typeof metadata.size === 'string' ? parseInt(metadata.size, 10) : (metadata.size ?? null)
    } catch (err: unknown) {
      if (isNotFound(err)) return null
      throw err
    }
  }
}

function isNotFound(err: unknown): boolean {
  return (err as { code?: number })?.code === 404
}

function globToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '{{GLOBSTAR}}')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]')
    .replace(/\{\{GLOBSTAR\}\}/g, '.*')
  return new RegExp(`^${escaped}$`)
}
