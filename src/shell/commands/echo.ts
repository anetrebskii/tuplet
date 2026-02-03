/**
 * echo - Display text
 */

import type { CommandHandler, CommandContext, ShellResult } from '../types.js'

export const echoCommand: CommandHandler = {
  name: 'echo',

  help: {
    usage: 'echo [OPTIONS] [STRING...]',
    description: 'Display text',
    flags: [
      { flag: '-n', description: 'Do not output trailing newline' },
      { flag: '-e', description: 'Interpret escape sequences (\\n, \\t, \\r, \\\\)' }
    ],
    examples: [
      { command: "echo 'hello world'", description: 'Print text with newline' },
      { command: 'echo -n hello', description: 'Print text without newline' },
      { command: "echo '{}' > /ctx/data.json", description: 'Write to file via redirection' }
    ]
  },

  async execute(args: string[], _ctx: CommandContext): Promise<ShellResult> {
    let newline = true
    let interpretEscapes = false
    const textArgs: string[] = []

    for (const arg of args) {
      if (arg === '-n') {
        newline = false
      } else if (arg === '-e') {
        interpretEscapes = true
      } else {
        textArgs.push(arg)
      }
    }

    let output = textArgs.join(' ')

    if (interpretEscapes) {
      output = output
        .replace(/\\n/g, '\n')
        .replace(/\\t/g, '\t')
        .replace(/\\r/g, '\r')
        .replace(/\\\\/g, '\\')
    }

    if (newline) {
      output += '\n'
    }

    return { exitCode: 0, stdout: output, stderr: '' }
  }
}
