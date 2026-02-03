/**
 * ls - List directory contents
 */

import type { CommandHandler, CommandContext, ShellResult } from '../types.js'

export const lsCommand: CommandHandler = {
  name: 'ls',

  help: {
    usage: 'ls [OPTIONS] [PATH...]',
    description: 'List directory contents',
    flags: [
      { flag: '-l', description: 'Long format with details' },
      { flag: '-a', description: 'Show hidden entries (starting with .)' }
    ],
    examples: [
      { command: 'ls /', description: 'List context root' },
      { command: 'ls -la /', description: 'List all entries in long format' },
      { command: 'ls /**/*.json', description: 'List all JSON files recursively' }
    ],
    notes: [
      'Defaults to / if no path given',
      'Supports glob patterns'
    ]
  },

  async execute(args: string[], ctx: CommandContext): Promise<ShellResult> {
    let longFormat = false
    let showAll = false
    const paths: string[] = []

    for (const arg of args) {
      if (arg === '-l') {
        longFormat = true
      } else if (arg === '-a') {
        showAll = true
      } else if (arg === '-la' || arg === '-al') {
        longFormat = true
        showAll = true
      } else if (!arg.startsWith('-')) {
        paths.push(arg)
      }
    }

    // Default to current context root
    if (paths.length === 0) {
      paths.push('/')
    }

    const outputs: string[] = []

    for (const path of paths) {
      // Handle glob patterns
      if (path.includes('*')) {
        const matches = ctx.fs.glob(path)
        if (matches.length === 0) {
          return { exitCode: 1, stdout: '', stderr: `ls: ${path}: No matches found` }
        }
        for (const match of matches) {
          outputs.push(formatEntry(match, longFormat))
        }
      } else {
        // Regular directory listing
        if (!ctx.fs.exists(path)) {
          return { exitCode: 1, stdout: '', stderr: `ls: ${path}: No such file or directory` }
        }

        if (ctx.fs.isDirectory(path)) {
          const entries = ctx.fs.list(path)
          for (const entry of entries) {
            if (!showAll && entry.startsWith('.')) continue
            outputs.push(formatEntry(entry, longFormat))
          }
        } else {
          outputs.push(formatEntry(path, longFormat))
        }
      }
    }

    return { exitCode: 0, stdout: outputs.join('\n') + (outputs.length ? '\n' : ''), stderr: '' }
  }
}

function formatEntry(entry: string, longFormat: boolean): string {
  if (longFormat) {
    const isDir = entry.endsWith('/')
    const type = isDir ? 'd' : '-'
    return `${type}rw-r--r--  1 user  user  0  Jan  1 00:00 ${entry}`
  }
  return entry
}
