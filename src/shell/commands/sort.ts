/**
 * sort - Sort lines of text
 */

import type { CommandHandler, CommandContext, ShellResult } from '../types.js'

export const sortCommand: CommandHandler = {
  name: 'sort',

  help: {
    usage: 'sort [OPTIONS] [FILE...]',
    description: 'Sort lines of text',
    flags: [
      { flag: '-r', description: 'Reverse the result of comparisons' },
      { flag: '-n', description: 'Compare according to string numerical value' },
      { flag: '-u', description: 'Output only unique lines' },
      { flag: '-t SEP', description: 'Use SEP as field separator' },
      { flag: '-k NUM', description: 'Sort by field NUM (1-based)' }
    ],
    examples: [
      { command: 'sort /names.txt', description: 'Sort lines alphabetically' },
      { command: 'sort -r /names.txt', description: 'Sort in reverse order' },
      { command: 'sort -n /numbers.txt', description: 'Sort numerically' },
      { command: 'find / -type f | sort', description: 'Sort piped input' },
      { command: 'sort -u /data.txt', description: 'Sort and remove duplicates' },
      { command: 'sort -t "," -k 2 /data.csv', description: 'Sort CSV by second column' }
    ]
  },

  async execute(args: string[], ctx: CommandContext): Promise<ShellResult> {
    let reverse = false
    let numeric = false
    let unique = false
    let separator: string | null = null
    let sortField: number | null = null
    const paths: string[] = []

    for (let i = 0; i < args.length; i++) {
      const arg = args[i]

      if (arg === '-r') {
        reverse = true
      } else if (arg === '-n') {
        numeric = true
      } else if (arg === '-u') {
        unique = true
      } else if (arg === '-t') {
        separator = args[++i]
      } else if (arg === '-k') {
        sortField = parseInt(args[++i], 10)
      } else if (!arg.startsWith('-')) {
        paths.push(arg)
      }
    }

    // Collect input from stdin or files
    let input = ''

    if (paths.length === 0 && ctx.stdin !== undefined) {
      input = ctx.stdin
    } else if (paths.length === 0) {
      return { exitCode: 1, stdout: '', stderr: 'sort: missing file operand' }
    } else {
      const parts: string[] = []
      for (const path of paths) {
        const content = await ctx.fs.read(path)
        if (content === null) {
          return { exitCode: 1, stdout: '', stderr: `sort: ${path}: No such file` }
        }
        parts.push(content)
      }
      input = parts.join('\n')
    }

    // Split into lines, remove trailing empty line
    let lines = input.split('\n')
    if (lines.length > 0 && lines[lines.length - 1] === '') {
      lines.pop()
    }

    // Sort
    lines.sort((a, b) => {
      let valA = a
      let valB = b

      // Extract field if -k is specified
      if (sortField !== null) {
        const sep = separator ?? /\s+/
        const partsA = valA.split(sep)
        const partsB = valB.split(sep)
        valA = partsA[sortField - 1] ?? ''
        valB = partsB[sortField - 1] ?? ''
      }

      if (numeric) {
        const numA = parseFloat(valA) || 0
        const numB = parseFloat(valB) || 0
        return numA - numB
      }

      return valA.localeCompare(valB)
    })

    if (reverse) {
      lines.reverse()
    }

    if (unique) {
      lines = [...new Set(lines)]
    }

    return {
      exitCode: 0,
      stdout: lines.length > 0 ? lines.join('\n') + '\n' : '',
      stderr: ''
    }
  }
}
