import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { MemoryWorkspaceProvider } from './memory.js'
import { FileWorkspaceProvider } from './file.js'
import { Workspace } from '../../workspace.js'
import type { WorkspaceProvider, WorkspaceChange } from './types.js'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

describe('MemoryWorkspaceProvider', () => {
  let provider: MemoryWorkspaceProvider

  beforeEach(() => {
    provider = new MemoryWorkspaceProvider()
  })

  it('read returns null for non-existent path', async () => {
    expect(await provider.read('/missing')).toBeNull()
  })

  it('write and read round-trip', async () => {
    await provider.write('/test.json', '{"a":1}')
    expect(await provider.read('/test.json')).toBe('{"a":1}')
  })

  it('delete returns true for existing file', async () => {
    await provider.write('/file', 'data')
    expect(await provider.delete('/file')).toBe(true)
    expect(await provider.read('/file')).toBeNull()
  })

  it('delete returns false for non-existent file', async () => {
    expect(await provider.delete('/missing')).toBe(false)
  })

  it('exists returns true for files', async () => {
    await provider.write('/file', 'data')
    expect(await provider.exists('/file')).toBe(true)
  })

  it('exists returns false for missing paths', async () => {
    expect(await provider.exists('/missing')).toBe(false)
  })

  it('exists returns true for directories', async () => {
    await provider.mkdir('/dir')
    expect(await provider.exists('/dir')).toBe(true)
  })

  it('list returns children of a directory', async () => {
    await provider.write('/dir/a', '1')
    await provider.write('/dir/b', '2')
    const items = await provider.list('/dir')
    expect(items).toEqual(['a', 'b'])
  })

  it('list includes subdirectories with trailing slash', async () => {
    await provider.write('/dir/sub/file', 'data')
    const items = await provider.list('/dir')
    expect(items).toContain('sub/')
  })

  it('glob matches patterns', async () => {
    await provider.write('/a.json', '{}')
    await provider.write('/b.json', '{}')
    await provider.write('/c.txt', 'text')
    const matches = await provider.glob('/*.json')
    expect(matches).toEqual(['/a.json', '/b.json'])
  })

  it('glob with ** matches nested paths', async () => {
    await provider.write('/dir/a.json', '{}')
    await provider.write('/dir/sub/b.json', '{}')
    const matches = await provider.glob('/dir/**/*.json')
    expect(matches).toContain('/dir/a.json')
    expect(matches).toContain('/dir/sub/b.json')
  })

  it('mkdir creates directories', async () => {
    await provider.mkdir('/new/dir')
    expect(await provider.isDirectory('/new')).toBe(true)
    expect(await provider.isDirectory('/new/dir')).toBe(true)
  })

  it('isDirectory returns false for files', async () => {
    await provider.write('/file', 'data')
    expect(await provider.isDirectory('/file')).toBe(false)
  })

  it('delete directory removes all children', async () => {
    await provider.write('/dir/a', '1')
    await provider.write('/dir/b', '2')
    await provider.delete('/dir')
    expect(await provider.read('/dir/a')).toBeNull()
    expect(await provider.read('/dir/b')).toBeNull()
  })

  it('constructor accepts initial data', async () => {
    const p = new MemoryWorkspaceProvider({ name: 'Alice', config: { port: 3000 } })
    expect(await p.read('/name')).toBe('Alice')
    expect(await p.read('/config')).toBe('{\n  "port": 3000\n}')
  })
})

describe('FileWorkspaceProvider', () => {
  let tmpDir: string
  let provider: FileWorkspaceProvider

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'ws-test-'))
    provider = new FileWorkspaceProvider(tmpDir)
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  it('read returns null when file does not exist', async () => {
    expect(await provider.read('/missing')).toBeNull()
  })

  it('write and read round-trip', async () => {
    await provider.write('/config.json', '{"port":3000}')
    expect(await provider.read('/config.json')).toBe('{"port":3000}')
  })

  it('write creates nested directories', async () => {
    await provider.write('/deep/nested/file.txt', 'hello')
    const content = await readFile(join(tmpDir, 'deep/nested/file.txt'), 'utf-8')
    expect(content).toBe('hello')
  })

  it('delete removes a file and returns true', async () => {
    await provider.write('/to-delete.txt', 'bye')
    expect(await provider.delete('/to-delete.txt')).toBe(true)
    expect(await provider.read('/to-delete.txt')).toBeNull()
  })

  it('delete returns false for non-existent file', async () => {
    expect(await provider.delete('/nope')).toBe(false)
  })

  it('exists returns true for existing file', async () => {
    await provider.write('/file.txt', 'data')
    expect(await provider.exists('/file.txt')).toBe(true)
  })

  it('exists returns false for missing file', async () => {
    expect(await provider.exists('/missing')).toBe(false)
  })

  it('list returns directory entries', async () => {
    await provider.write('/dir/a.txt', 'a')
    await provider.write('/dir/b.txt', 'b')
    const items = await provider.list('/dir')
    expect(items).toEqual(['a.txt', 'b.txt'])
  })

  it('list returns empty for non-existent directory', async () => {
    expect(await provider.list('/missing')).toEqual([])
  })

  it('glob matches file patterns', async () => {
    await provider.write('/a.json', '{}')
    await provider.write('/b.json', '{}')
    await provider.write('/c.txt', 'text')
    const matches = await provider.glob('/*.json')
    expect(matches).toEqual(['/a.json', '/b.json'])
  })

  it('mkdir creates directories', async () => {
    await provider.mkdir('/new/dir')
    expect(await provider.isDirectory('/new/dir')).toBe(true)
  })

  it('isDirectory returns true for directories', async () => {
    await provider.mkdir('/mydir')
    expect(await provider.isDirectory('/mydir')).toBe(true)
  })

  it('isDirectory returns false for files', async () => {
    await provider.write('/file.txt', 'data')
    expect(await provider.isDirectory('/file.txt')).toBe(false)
  })

  it('isDirectory returns false for non-existent path', async () => {
    expect(await provider.isDirectory('/missing')).toBe(false)
  })

  it('round-trip: write, fresh provider, verify', async () => {
    await provider.write('/user.json', '{"name":"Alice"}')
    await provider.write('/notes.md', '# Notes\nHello')

    const provider2 = new FileWorkspaceProvider(tmpDir)
    expect(await provider2.read('/user.json')).toBe('{"name":"Alice"}')
    expect(await provider2.read('/notes.md')).toBe('# Notes\nHello')
  })
})

describe('Workspace + Provider integration', () => {
  it('init is a no-op when no provider subscription', async () => {
    const ws = new Workspace()
    await ws.init() // should not throw
  })

  it('reads data written via shell', async () => {
    const ws = new Workspace()
    await ws.init()

    const shell = ws.getShell()
    await shell.execute('echo hello > /greeting.txt')

    expect(await ws.read('greeting.txt')).toBe('hello\n')
  })

  it('writes are readable via provider', async () => {
    const ws = new Workspace()
    ws.write('test.json', { hello: 'world' })

    // Allow fire-and-forget write to complete
    await new Promise(resolve => setTimeout(resolve, 10))

    expect(await ws.read('test.json')).toEqual({ hello: 'world' })
  })

  it('deletes work correctly', async () => {
    const ws = new Workspace()
    ws.write('item', 'data')
    await new Promise(resolve => setTimeout(resolve, 10))

    await ws.delete('item')
    expect(await ws.read('item')).toBeUndefined()
  })

  it('dispose calls flush and dispose on provider', async () => {
    const flushSpy = vi.fn().mockResolvedValue(undefined)
    const disposeSpy = vi.fn().mockResolvedValue(undefined)

    const provider: WorkspaceProvider = {
      async read() { return null },
      async write() {},
      async delete() { return false },
      async exists() { return false },
      async list() { return [] },
      async glob() { return [] },
      async mkdir() {},
      async isDirectory() { return false },
      flush: flushSpy,
      dispose: disposeSpy
    }

    const ws = new Workspace({ provider })
    await ws.init()
    await ws.dispose()

    expect(flushSpy).toHaveBeenCalled()
    expect(disposeSpy).toHaveBeenCalled()
  })

  it('init is idempotent', async () => {
    const subscribeSpy = vi.fn().mockReturnValue(() => {})
    const provider: WorkspaceProvider = {
      async read() { return null },
      async write() {},
      async delete() { return false },
      async exists() { return false },
      async list() { return [] },
      async glob() { return [] },
      async mkdir() {},
      async isDirectory() { return false },
      subscribe: subscribeSpy
    }

    const ws = new Workspace({ provider })
    await ws.init()
    await ws.init()

    expect(subscribeSpy).toHaveBeenCalledTimes(1)
  })

  it('FileWorkspaceProvider round-trip with Workspace', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'ws-integration-'))

    try {
      // Write phase
      const provider1 = new FileWorkspaceProvider(tmpDir)
      const ws1 = new Workspace({ provider: provider1 })
      await ws1.init()
      ws1.write('user.json', { name: 'Alice', age: 30 })
      ws1.write('notes.md', '# My Notes')

      // Small delay for fire-and-forget writes to settle
      await new Promise(resolve => setTimeout(resolve, 50))

      // Read phase with fresh workspace
      const provider2 = new FileWorkspaceProvider(tmpDir)
      const ws2 = new Workspace({ provider: provider2 })
      await ws2.init()

      expect(await ws2.read('user.json')).toEqual({ name: 'Alice', age: 30 })
      expect(await ws2.read('notes.md')).toBe('# My Notes')
    } finally {
      await rm(tmpDir, { recursive: true, force: true })
    }
  })
})
