/**
 * cat - Concatenate and print files
 */

import type { CommandHandler, CommandContext, ShellResult } from '../types.js'
import { MAX_FILE_SIZE, DEFAULT_LINE_LIMIT, MAX_LINE_LENGTH } from '../limits.js'

export const catCommand: CommandHandler = {
  name: 'cat',

  help: {
    usage: 'cat [OPTIONS] [FILE...]',
    description: 'Concatenate and print files',
    flags: [
      { flag: '-n', description: 'Show line numbers' },
      { flag: '--offset N', description: 'Start from line N (0-based)' },
      { flag: '--limit N', description: `Max lines to show (default: ${DEFAULT_LINE_LIMIT})` }
    ],
    examples: [
      { command: 'cat /data.json', description: 'Print file contents' },
      { command: 'cat -n /data.json', description: 'Print with line numbers' },
      { command: 'cat --offset 0 --limit 100 /big.txt', description: 'Read first 100 lines' },
      { command: 'cat /a /b', description: 'Concatenate multiple files' },
      { command: 'cat /*.json', description: 'Print all JSON files' }
    ],
    notes: [
      'Supports glob patterns (e.g. /*.json)',
      'Reads from stdin when no files given and input is piped',
      `Files over ${MAX_FILE_SIZE} bytes require --offset/--limit for paginated access`,
      `Lines are truncated to ${MAX_LINE_LENGTH} characters`
    ]
  },

  async execute(args: string[], ctx: CommandContext): Promise<ShellResult> {
    // If no args and stdin, output stdin
    if (args.length === 0 && ctx.stdin !== undefined) {
      return { exitCode: 0, stdout: ctx.stdin, stderr: '' }
    }

    let showLineNumbers = false
    let offset: number | null = null
    let limit: number | null = null
    const paths: string[] = []

    for (let i = 0; i < args.length; i++) {
      const arg = args[i]
      if (arg === '-n') {
        showLineNumbers = true
      } else if (arg === '--offset') {
        offset = parseInt(args[++i], 10)
      } else if (arg === '--limit') {
        limit = parseInt(args[++i], 10)
      } else {
        paths.push(arg)
      }
    }

    if (paths.length === 0) {
      return { exitCode: 1, stdout: '', stderr: 'cat: missing file operand' }
    }

    const hasPagination = offset !== null || limit !== null
    const effectiveLimit = limit ?? DEFAULT_LINE_LIMIT

    const parts: string[] = []

    for (const path of paths) {
      // Handle glob patterns
      const files = path.includes('*') ? await ctx.fs.glob(path) : [path]

      for (const file of files) {
        // Size gate
        if (ctx.fs.size) {
          const fileSize = await ctx.fs.size(file)
          if (fileSize === null) {
            return { exitCode: 1, stdout: '', stderr: `cat: ${file}: No such file` }
          }
          if (fileSize > MAX_FILE_SIZE && !hasPagination && !ctx.piped) {
            return {
              exitCode: 1,
              stdout: '',
              stderr: `cat: ${file} (${fileSize} bytes) exceeds max size (${MAX_FILE_SIZE} bytes). Use \`head -n 2000 ${file}\` to read the first 2000 lines, \`tail -n 2000 ${file}\` for the last, or \`grep "pattern" ${file}\` to search.`
            }
          }
        }

        const content = await ctx.fs.read(file)
        if (content === null) {
          return { exitCode: 1, stdout: '', stderr: `cat: ${file}: No such file` }
        }

        const allLines = content.split('\n')
        const totalLines = allLines.length
        const effectiveOffset = offset ?? 0
        const sliced = allLines.slice(effectiveOffset, effectiveOffset + effectiveLimit)
        const truncated = sliced.map(line =>
          line.length > MAX_LINE_LENGTH ? line.slice(0, MAX_LINE_LENGTH) + '...' : line
        )

        if (offset !== null) {
          const shown = truncated.length
          parts.push(`[Showing lines ${effectiveOffset + 1}-${effectiveOffset + shown} of ${totalLines}]\n`)
        }

        if (showLineNumbers) {
          const startNum = effectiveOffset + 1
          const formatted = truncated.map((line, i) => `${startNum + i}\t${line}`)
          parts.push(formatted.join('\n'))
        } else {
          parts.push(truncated.join('\n'))
        }
      }
    }

    return { exitCode: 0, stdout: parts.join(''), stderr: '' }
  }
}
