/**
 * wc - Word, line, and byte count
 */

import type { CommandHandler, CommandContext, ShellResult } from '../types.js'

export const wcCommand: CommandHandler = {
  name: 'wc',

  help: {
    usage: 'wc [OPTIONS] [FILE...]',
    description: 'Print newline, word, and byte counts',
    flags: [
      { flag: '-l', description: 'Print line count only' },
      { flag: '-w', description: 'Print word count only' },
      { flag: '-c', description: 'Print character/byte count only' }
    ],
    examples: [
      { command: 'wc /file.txt', description: 'Show all counts for file' },
      { command: 'wc -l /file.txt', description: 'Count lines only' },
      { command: 'cat /file.txt | wc -l', description: 'Count lines from stdin' }
    ]
  },

  async execute(args: string[], ctx: CommandContext): Promise<ShellResult> {
    let countLines = false
    let countWords = false
    let countChars = false
    const paths: string[] = []

    for (const arg of args) {
      if (arg === '-l') {
        countLines = true
      } else if (arg === '-w') {
        countWords = true
      } else if (arg === '-c' || arg === '-m') {
        countChars = true
      } else if (arg.startsWith('-') && /^-[lwcm]+$/.test(arg)) {
        for (const ch of arg.slice(1)) {
          if (ch === 'l') countLines = true
          else if (ch === 'w') countWords = true
          else if (ch === 'c' || ch === 'm') countChars = true
        }
      } else if (!arg.startsWith('-')) {
        paths.push(arg)
      }
    }

    // Default: show all counts
    const showAll = !countLines && !countWords && !countChars

    function formatCounts(content: string, label?: string): string {
      const lines = content.split('\n')
      // Line count: number of newlines (trailing newline = +1 line)
      const lineCount = content.endsWith('\n') ? lines.length - 1 : lines.length
      const wordCount = content.split(/\s+/).filter(w => w.length > 0).length
      const charCount = content.length

      const parts: string[] = []
      if (showAll || countLines) parts.push(String(lineCount).padStart(8))
      if (showAll || countWords) parts.push(String(wordCount).padStart(8))
      if (showAll || countChars) parts.push(String(charCount).padStart(8))
      if (label) parts.push(` ${label}`)

      return parts.join('')
    }

    // Handle stdin
    if (paths.length === 0 && ctx.stdin !== undefined) {
      return { exitCode: 0, stdout: formatCounts(ctx.stdin) + '\n', stderr: '' }
    }

    if (paths.length === 0) {
      return { exitCode: 1, stdout: '', stderr: 'wc: missing file operand' }
    }

    const outputs: string[] = []

    for (const path of paths) {
      const content = await ctx.fs.read(path)
      if (content === null) {
        return { exitCode: 1, stdout: '', stderr: `wc: ${path}: No such file` }
      }
      outputs.push(formatCounts(content, path))
    }

    return { exitCode: 0, stdout: outputs.join('\n') + '\n', stderr: '' }
  }
}
