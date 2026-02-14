/**
 * find - Search for files
 */

import type { CommandHandler, CommandContext, ShellResult } from '../types.js'

function matchPattern(name: string, pattern: string): boolean {
  const regexPattern = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.')
  return new RegExp(`^${regexPattern}$`).test(name)
}

export const findCommand: CommandHandler = {
  name: 'find',

  help: {
    usage: 'find [PATH] [OPTIONS]',
    description: 'Search for files in a directory hierarchy',
    flags: [
      { flag: '-name PATTERN', description: 'Match filename against pattern (supports * and ? wildcards)' },
      { flag: '-type f', description: 'Only match regular files' },
      { flag: '-type d', description: 'Only match directories' },
      { flag: '-maxdepth NUM', description: 'Descend at most NUM levels below the start path' }
    ],
    examples: [
      { command: 'find / -name "*.json"', description: 'Find all JSON files' },
      { command: 'find / -type d', description: 'Find all directories' },
      { command: 'find /reports -name "*.csv" -type f', description: 'Find CSV files in reports' }
    ],
    notes: [
      'Defaults to / if no path given',
      'Searches recursively'
    ]
  },

  async execute(args: string[], ctx: CommandContext): Promise<ShellResult> {
    let basePath = '/'
    let namePattern: string | null = null
    let typeFilter: 'f' | 'd' | null = null
    let maxDepth: number | null = null

    for (let i = 0; i < args.length; i++) {
      const arg = args[i]

      if (arg === '-name') {
        namePattern = args[++i]
      } else if (arg === '-type') {
        const t = args[++i]
        if (t === 'f' || t === 'd') {
          typeFilter = t
        }
      } else if (arg === '-maxdepth') {
        maxDepth = parseInt(args[++i], 10)
      } else if (!arg.startsWith('-')) {
        basePath = arg
      }
    }

    // Get all files recursively
    const allFiles = await ctx.fs.glob(basePath + '/**/*')
    const outputs: string[] = []

    // Calculate base depth for maxdepth filtering
    const baseDepth = basePath === '/' ? 0 : basePath.replace(/\/$/, '').split('/').length - 1

    for (const file of allFiles) {
      // Apply maxdepth filter
      if (maxDepth !== null) {
        const fileDepth = file.split('/').length - 1
        if (fileDepth - baseDepth > maxDepth) continue
      }

      // Apply type filter
      if (typeFilter === 'f' && await ctx.fs.isDirectory(file)) continue
      if (typeFilter === 'd' && !await ctx.fs.isDirectory(file)) continue

      // Apply name filter
      if (namePattern) {
        const fileName = file.split('/').pop() || ''
        if (!matchPattern(fileName, namePattern)) continue
      }

      outputs.push(file)
    }

    // Also include base path if it matches
    if (await ctx.fs.exists(basePath)) {
      if (!typeFilter || (typeFilter === 'd' && await ctx.fs.isDirectory(basePath))) {
        if (!namePattern || matchPattern(basePath.split('/').pop() || '', namePattern)) {
          outputs.unshift(basePath)
        }
      }
    }

    return {
      exitCode: 0,
      stdout: outputs.join('\n') + (outputs.length ? '\n' : ''),
      stderr: ''
    }
  }
}
