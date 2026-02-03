/**
 * grep - Search for patterns
 */

import type { CommandHandler, CommandContext, ShellResult } from '../types.js'

export const grepCommand: CommandHandler = {
  name: 'grep',

  help: {
    usage: 'grep [OPTIONS] PATTERN [FILE...]',
    description: 'Search for patterns in files or stdin',
    flags: [
      { flag: '-i', description: 'Case-insensitive matching' },
      { flag: '-n', description: 'Show line numbers' },
      { flag: '-v', description: 'Invert match (show non-matching lines)' },
      { flag: '-l', description: 'Only list filenames with matches' },
      { flag: '-r', description: 'Recursive search' },
      { flag: '-E', description: 'Extended regex (enabled by default)' }
    ],
    examples: [
      { command: 'grep "error" /ctx/log', description: 'Search for pattern in file' },
      { command: 'grep -i "warn" /ctx/**/*.log', description: 'Case-insensitive search across files' },
      { command: 'grep -n "TODO" /ctx/notes.txt', description: 'Show matching line numbers' },
      { command: 'cat /ctx/data | grep "key"', description: 'Search piped input' }
    ],
    notes: [
      'Supports JavaScript regex syntax',
      'Exit code 1 when no matches found'
    ]
  },

  async execute(args: string[], ctx: CommandContext): Promise<ShellResult> {
    let caseInsensitive = false
    let showLineNumbers = false
    let recursive = false
    let filesOnly = false
    let invertMatch = false
    let extendedRegex = false
    let pattern: string | null = null
    const paths: string[] = []

    for (const arg of args) {
      if (arg === '-i') {
        caseInsensitive = true
      } else if (arg === '-n') {
        showLineNumbers = true
      } else if (arg === '-r' || arg === '-R') {
        recursive = true
      } else if (arg === '-l') {
        filesOnly = true
      } else if (arg === '-v') {
        invertMatch = true
      } else if (arg === '-E') {
        extendedRegex = true
      } else if (arg.startsWith('-')) {
        // Ignore unknown flags
      } else if (pattern === null) {
        pattern = arg
      } else {
        paths.push(arg)
      }
    }

    if (pattern === null) {
      // Check stdin
      if (ctx.stdin) {
        return { exitCode: 1, stdout: '', stderr: 'grep: missing pattern' }
      }
      return { exitCode: 1, stdout: '', stderr: 'grep: missing pattern' }
    }

    const flags = caseInsensitive ? 'gi' : 'g'
    let regex: RegExp
    try {
      regex = new RegExp(pattern, flags)
    } catch {
      return { exitCode: 1, stdout: '', stderr: `grep: Invalid pattern: ${pattern}` }
    }

    const outputs: string[] = []
    const matchingFiles: Set<string> = new Set()

    // Search in stdin if no paths
    if (paths.length === 0 && ctx.stdin) {
      const lines = ctx.stdin.split('\n')
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        const matches = regex.test(line)
        regex.lastIndex = 0 // Reset regex state

        if (matches !== invertMatch) {
          if (showLineNumbers) {
            outputs.push(`${i + 1}:${line}`)
          } else {
            outputs.push(line)
          }
        }
      }
    } else {
      // Search in files
      for (const path of paths) {
        const files = path.includes('*') || recursive
          ? ctx.fs.glob(recursive ? path.replace(/\/?$/, '/**/*') : path)
          : [path]

        for (const file of files) {
          if (ctx.fs.isDirectory(file)) continue

          const content = ctx.fs.read(file)
          if (content === null) continue

          const lines = content.split('\n')
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i]
            const matches = regex.test(line)
            regex.lastIndex = 0

            if (matches !== invertMatch) {
              if (filesOnly) {
                matchingFiles.add(file)
              } else {
                const prefix = paths.length > 1 || recursive ? `${file}:` : ''
                const lineNum = showLineNumbers ? `${i + 1}:` : ''
                outputs.push(`${prefix}${lineNum}${line}`)
              }
            }
          }
        }
      }
    }

    if (filesOnly) {
      return {
        exitCode: matchingFiles.size > 0 ? 0 : 1,
        stdout: Array.from(matchingFiles).join('\n') + (matchingFiles.size ? '\n' : ''),
        stderr: ''
      }
    }

    return {
      exitCode: outputs.length > 0 ? 0 : 1,
      stdout: outputs.join('\n') + (outputs.length ? '\n' : ''),
      stderr: ''
    }
  }
}
