/**
 * env - List environment variables
 *
 * Shows runtime vars with their values and provider vars with masked values.
 */

import type { CommandHandler, CommandContext, ShellResult } from '../types.js'

export const envCommand: CommandHandler = {
  name: 'env',

  help: {
    usage: 'env',
    description: 'List available environment variables',
    examples: [
      { command: 'env', description: 'Show all environment variables' }
    ],
    notes: [
      'Provider variables (e.g., API keys) show masked values (***)',
      'Runtime variables (set via VAR=value) show their actual values'
    ]
  },

  async execute(_args: string[], ctx: CommandContext): Promise<ShellResult> {
    const lines: string[] = []
    const seen = new Set<string>()

    // Runtime vars (set via VAR=value in shell) — show actual values
    for (const [key, value] of Object.entries(ctx.env)) {
      lines.push(`${key}=${value}`)
      seen.add(key)
    }

    // Provider vars — show masked values (secrets should not leak)
    if (ctx.envProvider) {
      for (const key of ctx.envProvider.keys()) {
        if (!seen.has(key)) {
          lines.push(`${key}=***`)
        }
      }
    }

    if (lines.length === 0) {
      return { exitCode: 0, stdout: '', stderr: '' }
    }

    return { exitCode: 0, stdout: lines.join('\n') + '\n', stderr: '' }
  }
}
