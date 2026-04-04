/**
 * Spill-to-disk utility
 *
 * Saves large content to .tuplet/tmp/ and returns a reference path.
 * Used by shell tool (large output) and workspace (large schemas).
 */

import type { WorkspaceProvider } from './providers/workspace/types.js'

export interface SpillResult {
  /** Relative path where content was saved (e.g. .tuplet/tmp/output-123.txt) */
  path: string
  /** Human-readable message telling AI how to read the spilled file */
  message: string
}

/**
 * Save content to .tuplet/tmp/ and return a reference.
 *
 * @param provider - WorkspaceProvider to write to (should be the internal provider)
 * @param name - File name within .tuplet/tmp/ (e.g. "output-123.txt", "schema-plan.json")
 * @param content - Content to save
 * @returns SpillResult with path and a message for the AI
 */
export async function spill(provider: WorkspaceProvider, name: string, content: string): Promise<SpillResult> {
  const path = `.tuplet/tmp/${name}`
  await provider.write(`/${path}`, content)
  return {
    path,
    message: `Saved to ${path}. Use \`cat ${path}\` to read it.`
  }
}
