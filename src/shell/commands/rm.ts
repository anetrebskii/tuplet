/**
 * rm - Remove files
 */

import type { CommandHandler, CommandContext, ShellResult } from '../types.js'

export const rmCommand: CommandHandler = {
  name: 'rm',

  help: {
    usage: 'rm [OPTIONS] FILE...',
    description: 'Remove files or directories',
    flags: [
      { flag: '-r', description: 'Remove directories and their contents recursively' },
      { flag: '-f', description: 'Force removal, ignore nonexistent files' }
    ],
    examples: [
      { command: 'rm /temp.json', description: 'Remove a file' },
      { command: 'rm -r /cache/', description: 'Remove directory recursively' },
      { command: 'rm -rf /old/*', description: 'Force remove with glob pattern' }
    ],
    notes: [
      'Supports glob patterns',
      'Use -r for directories'
    ]
  },

  async execute(args: string[], ctx: CommandContext): Promise<ShellResult> {
    let recursive = false
    let force = false
    const paths: string[] = []

    for (const arg of args) {
      if (arg === '-r' || arg === '-R') {
        recursive = true
      } else if (arg === '-f') {
        force = true
      } else if (arg === '-rf' || arg === '-fr') {
        recursive = true
        force = true
      } else if (!arg.startsWith('-')) {
        paths.push(arg)
      }
    }

    if (paths.length === 0) {
      return { exitCode: 1, stdout: '', stderr: 'rm: missing operand' }
    }

    for (const path of paths) {
      // Handle glob patterns
      const files = path.includes('*') ? await ctx.fs.glob(path) : [path]

      for (const file of files) {
        if (!await ctx.fs.exists(file)) {
          if (!force) {
            return { exitCode: 1, stdout: '', stderr: `rm: ${file}: No such file or directory` }
          }
          continue
        }

        if (await ctx.fs.isDirectory(file) && !recursive) {
          return { exitCode: 1, stdout: '', stderr: `rm: ${file}: is a directory` }
        }

        await ctx.fs.delete(file)
      }
    }

    return { exitCode: 0, stdout: '', stderr: '' }
  }
}
