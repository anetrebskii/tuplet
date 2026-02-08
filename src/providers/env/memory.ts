/**
 * MemoryEnvironmentProvider
 *
 * In-memory implementation of EnvironmentProvider.
 * Stores variables in a Map, suitable for passing secrets at run time.
 */

import type { EnvironmentProvider } from '../../types.js'

export class MemoryEnvironmentProvider implements EnvironmentProvider {
  private vars: Map<string, string>

  constructor(vars?: Record<string, string>) {
    this.vars = new Map(Object.entries(vars ?? {}))
  }

  get(name: string): string | undefined {
    return this.vars.get(name)
  }

  keys(): string[] {
    return Array.from(this.vars.keys())
  }
}
