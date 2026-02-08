/**
 * mkdir - Make directories
 */

import type { CommandHandler, CommandContext, ShellResult } from '../types.js'

export const mkdirCommand: CommandHandler = {
  name: 'mkdir',

  help: {
    usage: 'mkdir [OPTIONS] DIRECTORY...',
    description: 'Create directories',
    flags: [
      { flag: '-p', description: 'Create parent directories as needed, no error if existing' }
    ],
    examples: [
      { command: 'mkdir /reports', description: 'Create a directory' },
      { command: 'mkdir -p /a/b/c', description: 'Create nested directories' }
    ]
  },

  async execute(args: string[], ctx: CommandContext): Promise<ShellResult> {
    let parents = false
    const paths: string[] = []

    for (const arg of args) {
      if (arg === '-p') {
        parents = true
      } else if (!arg.startsWith('-')) {
        paths.push(arg)
      }
    }

    if (paths.length === 0) {
      return { exitCode: 1, stdout: '', stderr: 'mkdir: missing operand' }
    }

    for (const path of paths) {
      if (await ctx.fs.exists(path)) {
        if (!parents) {
          return { exitCode: 1, stdout: '', stderr: `mkdir: ${path}: File exists` }
        }
        continue
      }

      await ctx.fs.mkdir(path)
    }

    return { exitCode: 0, stdout: '', stderr: '' }
  }
}
