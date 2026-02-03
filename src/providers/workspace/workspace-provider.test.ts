import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { VirtualFS } from '../../shell/fs.js'
import { MemoryWorkspaceProvider } from './memory.js'
import { FileWorkspaceProvider } from './file.js'
import { Workspace } from '../../workspace.js'
import type { WorkspaceProvider, WorkspaceChange } from './types.js'
import { mkdtemp, rm, readFile, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

describe('VirtualFS onChange + hydrate', () => {
  let fs: VirtualFS

  beforeEach(() => {
    fs = new VirtualFS()
  })

  describe('onChange', () => {
    it('fires on write with path and content', () => {
      const handler = vi.fn()
      fs.setOnChange(handler)

      fs.write('/test.json', '{"a":1}')
      expect(handler).toHaveBeenCalledWith('write', '/test.json', '{"a":1}')
    })

    it('fires on delete with path', () => {
      const handler = vi.fn()
      fs.write('/test.json', '{}')
      fs.setOnChange(handler)

      fs.delete('/test.json')
      expect(handler).toHaveBeenCalledWith('delete', '/test.json')
    })

    it('does not fire when handler is null', () => {
      const handler = vi.fn()
      fs.setOnChange(handler)
      fs.setOnChange(null)

      fs.write('/test', 'data')
      expect(handler).not.toHaveBeenCalled()
    })

    it('fires for each child on directory delete', () => {
      fs.write('/dir/a', '1')
      fs.write('/dir/b', '2')
      fs.write('/dir/c', '3')

      const handler = vi.fn()
      fs.setOnChange(handler)

      fs.delete('/dir')
      expect(handler).toHaveBeenCalledTimes(3)
      const paths = handler.mock.calls.map((c: unknown[]) => c[1]).sort()
      expect(paths).toEqual(['/dir/a', '/dir/b', '/dir/c'])
    })

    it('does not fire on delete of non-existent path', () => {
      const handler = vi.fn()
      fs.setOnChange(handler)

      fs.delete('/nonexistent')
      expect(handler).not.toHaveBeenCalled()
    })
  })

  describe('hydrate', () => {
    it('loads data without triggering onChange', () => {
      const handler = vi.fn()
      fs.setOnChange(handler)

      fs.hydrate({
        '/a': 'value-a',
        '/b': 'value-b'
      })

      expect(handler).not.toHaveBeenCalled()
      expect(fs.read('/a')).toBe('value-a')
      expect(fs.read('/b')).toBe('value-b')
    })

    it('creates parent directories', () => {
      fs.hydrate({ '/deep/nested/file': 'content' })
      expect(fs.isDirectory('/deep')).toBe(true)
      expect(fs.isDirectory('/deep/nested')).toBe(true)
      expect(fs.read('/deep/nested/file')).toBe('content')
    })

    it('overwrites existing data', () => {
      fs.write('/key', 'old')
      fs.hydrate({ '/key': 'new' })
      expect(fs.read('/key')).toBe('new')
    })
  })
})

describe('MemoryWorkspaceProvider', () => {
  it('load returns empty object', async () => {
    const provider = new MemoryWorkspaceProvider()
    const data = await provider.load()
    expect(data).toEqual({})
  })

  it('write and delete are no-ops', async () => {
    const provider = new MemoryWorkspaceProvider()
    await expect(provider.write('/test', 'data')).resolves.toBeUndefined()
    await expect(provider.delete('/test')).resolves.toBeUndefined()
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

  it('load returns empty when directory is empty', async () => {
    const data = await provider.load()
    expect(data).toEqual({})
  })

  it('load returns empty when directory does not exist', async () => {
    const p = new FileWorkspaceProvider(join(tmpDir, 'nonexistent'))
    const data = await p.load()
    expect(data).toEqual({})
  })

  it('write persists a file and load reads it back', async () => {
    await provider.write('/config.json', '{"port":3000}')

    const data = await provider.load()
    expect(data['/config.json']).toBe('{"port":3000}')
  })

  it('write creates nested directories', async () => {
    await provider.write('/deep/nested/file.txt', 'hello')

    const content = await readFile(join(tmpDir, 'deep/nested/file.txt'), 'utf-8')
    expect(content).toBe('hello')
  })

  it('delete removes a file', async () => {
    await provider.write('/to-delete.txt', 'bye')
    await provider.delete('/to-delete.txt')

    const data = await provider.load()
    expect(data['/to-delete.txt']).toBeUndefined()
  })

  it('delete of non-existent file does not throw', async () => {
    await expect(provider.delete('/nope')).resolves.toBeUndefined()
  })

  it('round-trip: write, reload, verify', async () => {
    await provider.write('/user.json', '{"name":"Alice"}')
    await provider.write('/notes.md', '# Notes\nHello')

    // Create a new provider pointing at the same dir
    const provider2 = new FileWorkspaceProvider(tmpDir)
    const data = await provider2.load()

    expect(data['/user.json']).toBe('{"name":"Alice"}')
    expect(data['/notes.md']).toBe('# Notes\nHello')
  })
})

describe('Workspace + Provider integration', () => {
  it('init is a no-op when no provider', async () => {
    const ws = new Workspace()
    await ws.init() // should not throw
  })

  it('init hydrates VirtualFS from provider', async () => {
    const provider: WorkspaceProvider = {
      async load() {
        return {
          '/loaded.json': '{"from":"provider"}'
        }
      },
      async write() {},
      async delete() {}
    }

    const ws = new Workspace({ provider })
    await ws.init()

    expect(ws.read('loaded.json')).toEqual({ from: 'provider' })
  })

  it('writes are forwarded to provider via onChange', async () => {
    const writeSpy = vi.fn().mockResolvedValue(undefined)
    const provider: WorkspaceProvider = {
      async load() { return {} },
      write: writeSpy,
      async delete() {}
    }

    const ws = new Workspace({ provider })
    await ws.init()

    ws.write('test.json', { hello: 'world' })
    expect(writeSpy).toHaveBeenCalledWith('/test.json', '{\n  "hello": "world"\n}')
  })

  it('deletes are forwarded to provider via onChange', async () => {
    const deleteSpy = vi.fn().mockResolvedValue(undefined)
    const provider: WorkspaceProvider = {
      async load() { return { '/item': 'data' } },
      async write() {},
      delete: deleteSpy
    }

    const ws = new Workspace({ provider })
    await ws.init()

    ws.delete('item')
    expect(deleteSpy).toHaveBeenCalledWith('/item')
  })

  it('subscribe pushes external changes into VirtualFS', async () => {
    let listener: ((changes: WorkspaceChange[]) => void) | null = null

    const provider: WorkspaceProvider = {
      async load() { return {} },
      async write() {},
      async delete() {},
      subscribe(cb) {
        listener = cb
        return () => { listener = null }
      }
    }

    const ws = new Workspace({ provider })
    await ws.init()

    // Simulate external write
    listener!([{ type: 'write', path: '/external.json', content: '{"source":"remote"}' }])

    expect(ws.read('external.json')).toEqual({ source: 'remote' })
  })

  it('subscribe changes do not echo back to provider', async () => {
    const writeSpy = vi.fn().mockResolvedValue(undefined)
    let listener: ((changes: WorkspaceChange[]) => void) | null = null

    const provider: WorkspaceProvider = {
      async load() { return {} },
      write: writeSpy,
      async delete() {},
      subscribe(cb) {
        listener = cb
        return () => { listener = null }
      }
    }

    const ws = new Workspace({ provider })
    await ws.init()
    writeSpy.mockClear()

    // Simulate external write — should NOT call provider.write
    listener!([{ type: 'write', path: '/external', content: 'data' }])
    expect(writeSpy).not.toHaveBeenCalled()
  })

  it('dispose calls flush and dispose on provider', async () => {
    const flushSpy = vi.fn().mockResolvedValue(undefined)
    const disposeSpy = vi.fn().mockResolvedValue(undefined)

    const provider: WorkspaceProvider = {
      async load() { return {} },
      async write() {},
      async delete() {},
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
    const loadSpy = vi.fn().mockResolvedValue({})
    const provider: WorkspaceProvider = {
      load: loadSpy,
      async write() {},
      async delete() {}
    }

    const ws = new Workspace({ provider })
    await ws.init()
    await ws.init()

    expect(loadSpy).toHaveBeenCalledTimes(1)
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

      expect(ws2.read('user.json')).toEqual({ name: 'Alice', age: 30 })
      expect(ws2.read('notes.md')).toBe('# My Notes')
    } finally {
      await rm(tmpDir, { recursive: true, force: true })
    }
  })
})
