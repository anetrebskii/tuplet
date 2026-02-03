/**
 * cat - Concatenate and print files
 */

import type { CommandHandler, CommandContext, ShellResult } from '../types.js'

export const catCommand: CommandHandler = {
  name: 'cat',

  help: {
    usage: 'cat [FILE...]',
    description: 'Concatenate and print files',
    examples: [
      { command: 'cat /ctx/data.json', description: 'Print file contents' },
      { command: 'cat /ctx/a /ctx/b', description: 'Concatenate multiple files' },
      { command: 'cat /ctx/*.json', description: 'Print all JSON files' }
    ],
    notes: [
      'Supports glob patterns (e.g. /ctx/*.json)',
      'Reads from stdin when no files given and input is piped'
    ]
  },

  async execute(args: string[], ctx: CommandContext): Promise<ShellResult> {
    // If no args and stdin, output stdin
    if (args.length === 0 && ctx.stdin) {
      return { exitCode: 0, stdout: ctx.stdin, stderr: '' }
    }

    if (args.length === 0) {
      return { exitCode: 1, stdout: '', stderr: 'cat: missing file operand' }
    }

    const outputs: string[] = []

    for (const path of args) {
      // Handle glob patterns
      const files = path.includes('*') ? ctx.fs.glob(path) : [path]

      for (const file of files) {
        const content = ctx.fs.read(file)
        if (content === null) {
          return { exitCode: 1, stdout: '', stderr: `cat: ${file}: No such file` }
        }
        outputs.push(content)
      }
    }

    return { exitCode: 0, stdout: outputs.join(''), stderr: '' }
  }
}
