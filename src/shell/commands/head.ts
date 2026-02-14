/**
 * head - Output the first part of files
 */

import type { CommandHandler, CommandContext, ShellResult } from '../types.js'
import { MAX_LINE_LENGTH } from '../limits.js'

export const headCommand: CommandHandler = {
  name: 'head',

  help: {
    usage: 'head [OPTIONS] [FILE...]',
    description: 'Output the first part of files',
    flags: [
      { flag: '-n NUM', description: 'Output first NUM lines (default: 10)' }
    ],
    examples: [
      { command: 'head /log.txt', description: 'Show first 10 lines' },
      { command: 'head -n 5 /data.csv', description: 'Show first 5 lines' },
      { command: 'cat /big.json | head -n 20', description: 'First 20 lines of piped input' }
    ],
    notes: [
      'Also accepts -NUM shorthand (e.g. head -5 file)',
      'Reads from stdin when no file given and input is piped',
      `Lines are truncated to ${MAX_LINE_LENGTH} characters`
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
    if (paths.length === 0 && ctx.stdin !== undefined) {
      const inputLines = ctx.stdin.split('\n')
      const output = inputLines.slice(0, lines)
        .map(line => line.length > MAX_LINE_LENGTH ? line.slice(0, MAX_LINE_LENGTH) + '...' : line)
        .join('\n')
      return { exitCode: 0, stdout: output + '\n', stderr: '' }
    }

    if (paths.length === 0) {
      return { exitCode: 1, stdout: '', stderr: 'head: missing file operand' }
    }

    const outputs: string[] = []

    for (const path of paths) {
      const content = await ctx.fs.read(path)
      if (content === null) {
        return { exitCode: 1, stdout: '', stderr: `head: ${path}: No such file` }
      }

      const fileLines = content.split('\n')
      const output = fileLines.slice(0, lines)
        .map(line => line.length > MAX_LINE_LENGTH ? line.slice(0, MAX_LINE_LENGTH) + '...' : line)
        .join('\n')

      if (paths.length > 1) {
        outputs.push(`==> ${path} <==`)
      }
      outputs.push(output)
    }

    return { exitCode: 0, stdout: outputs.join('\n') + '\n', stderr: '' }
  }
}
