/**
 * Memory Workspace Provider
 *
 * No-op provider — everything lives only in VirtualFS.
 * Default behavior when no persistence is needed.
 */

import type { WorkspaceProvider } from './types.js'

export class MemoryWorkspaceProvider implements WorkspaceProvider {
  async load(): Promise<Record<string, string>> {
    return {}
  }

  async write(_path: string, _content: string): Promise<void> {
    // no-op
  }

  async delete(_path: string): Promise<void> {
    // no-op
  }
}
