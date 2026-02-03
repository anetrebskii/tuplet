/**
 * tail - Output the last part of files
 */

import type { CommandHandler, CommandContext, ShellResult } from '../types.js'

export const tailCommand: CommandHandler = {
  name: 'tail',

  help: {
    usage: 'tail [OPTIONS] [FILE...]',
    description: 'Output the last part of files',
    flags: [
      { flag: '-n NUM', description: 'Output last NUM lines (default: 10)' }
    ],
    examples: [
      { command: 'tail /log.txt', description: 'Show last 10 lines' },
      { command: 'tail -n 3 /history.json', description: 'Show last 3 lines' },
      { command: 'cat /data | tail -n 5', description: 'Last 5 lines of piped input' }
    ],
    notes: [
      'Also accepts -NUM shorthand (e.g. tail -5 file)',
      'Reads from stdin when no file given and input is piped'
    ]
  },

  async execute(args: string[], ctx: CommandContext): Promise<ShellResult> {
    let lines = 10
    const paths: string[] = []

    for (let i = 0; i < args.length; i++) {
      const arg = args[i]

      if (arg === '-n') {
        lines = parseInt(args[++i], 10)
      } else if (arg.startsWith('-') && !isNaN(parseInt(arg.slice(1), 10))) {
        lines = parseInt(arg.slice(1), 10)
      } else if (!arg.startsWith('-')) {
        paths.push(arg)
      }
    }

    // Handle stdin
    if (paths.length === 0 && ctx.stdin) {
      const inputLines = ctx.stdin.split('\n')
      const output = inputLines.slice(-lines).join('\n')
      return { exitCode: 0, stdout: output + '\n', stderr: '' }
    }

    if (paths.length === 0) {
      return { exitCode: 1, stdout: '', stderr: 'tail: missing file operand' }
    }

    const outputs: string[] = []

    for (const path of paths) {
      const content = ctx.fs.read(path)
      if (content === null) {
        return { exitCode: 1, stdout: '', stderr: `tail: ${path}: No such file` }
      }

      const fileLines = content.split('\n')
      const output = fileLines.slice(-lines).join('\n')

      if (paths.length > 1) {
        outputs.push(`==> ${path} <==`)
      }
      outputs.push(output)
    }

    return { exitCode: 0, stdout: outputs.join('\n') + '\n', stderr: '' }
  }
}
