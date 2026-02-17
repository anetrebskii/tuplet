/**
 * grep - Search for patterns
 */

import type { CommandHandler, CommandContext, ShellResult } from '../types.js'
import { MAX_LINE_LENGTH, MAX_OUTPUT_CHARS } from '../limits.js'

export const grepCommand: CommandHandler = {
  name: 'grep',

  help: {
    usage: 'grep [OPTIONS] PATTERN [FILE...]',
    description: 'Search for patterns in files or stdin',
    flags: [
      { flag: '-i', description: 'Case-insensitive matching' },
      { flag: '-n', description: 'Show line numbers' },
      { flag: '-o', description: 'Only output the matched parts of a line' },
      { flag: '-v', description: 'Invert match (show non-matching lines)' },
      { flag: '-l', description: 'Only list filenames with matches' },
      { flag: '-r', description: 'Recursive search' },
      { flag: '-E', description: 'Extended regex (enabled by default)' },
      { flag: '-P', description: 'Perl-compatible regex (treated as extended regex)' }
    ],
    examples: [
      { command: 'grep "error" log', description: 'Search for pattern in file' },
      { command: 'grep -i "warn" **/*.log', description: 'Case-insensitive search across files' },
      { command: 'grep -n "TODO" notes.txt', description: 'Show matching line numbers' },
      { command: 'cat data | grep "key"', description: 'Search piped input' }
    ],
    notes: [
      'Supports JavaScript regex syntax',
      'Exit code 1 when no matches found',
      `Lines are truncated to ${MAX_LINE_LENGTH} characters`,
      `Total output is capped at ${MAX_OUTPUT_CHARS} characters`
    ]
  },

  async execute(args: string[], ctx: CommandContext): Promise<ShellResult> {
    let caseInsensitive = false
    let showLineNumbers = false
    let recursive = false
    let filesOnly = false
    let invertMatch = false
    let extendedRegex = false
    let onlyMatching = false
    let pattern: string | null = null
    const paths: string[] = []

    for (const arg of args) {
      if (arg === '-i') {
        caseInsensitive = true
      } else if (arg === '-n') {
        showLineNumbers = true
      } else if (arg === '-o') {
        onlyMatching = true
      } else if (arg === '-r' || arg === '-R') {
        recursive = true
      } else if (arg === '-l') {
        filesOnly = true
      } else if (arg === '-v') {
        invertMatch = true
      } else if (arg === '-E' || arg === '-P') {
        extendedRegex = true
      } else if (arg.startsWith('-') && /^-[a-zA-Z]+$/.test(arg)) {
        // Handle combined flags like -oE, -oP, -in, etc.
        for (const ch of arg.slice(1)) {
          if (ch === 'i') caseInsensitive = true
          else if (ch === 'n') showLineNumbers = true
          else if (ch === 'o') onlyMatching = true
          else if (ch === 'r' || ch === 'R') recursive = true
          else if (ch === 'l') filesOnly = true
          else if (ch === 'v') invertMatch = true
          else if (ch === 'E' || ch === 'P') extendedRegex = true
        }
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

    // Convert BRE-style syntax to ERE/JS regex when -E is not specified.
    // BRE uses \|, \(, \), \+, \? for special meaning; ERE/JS uses |, (, ), +, ?
    let effectivePattern = pattern
    if (!extendedRegex) {
      effectivePattern = pattern
        .replace(/\\\|/g, '|')
        .replace(/\\\(/g, '(')
        .replace(/\\\)/g, ')')
    }

    const flags = caseInsensitive ? 'gi' : 'g'
    let regex: RegExp
    try {
      regex = new RegExp(effectivePattern, flags)
    } catch {
      return { exitCode: 1, stdout: '', stderr: `grep: Invalid pattern: ${pattern}` }
    }

    const outputs: string[] = []
    const matchingFiles: Set<string> = new Set()
    let totalChars = 0
    let outputTruncated = false

    function truncateLine(line: string): string {
      return line.length > MAX_LINE_LENGTH ? line.slice(0, MAX_LINE_LENGTH) + '...' : line
    }

    function addOutput(line: string): boolean {
      const truncated = truncateLine(line)
      if (totalChars + truncated.length + 1 > MAX_OUTPUT_CHARS) {
        outputTruncated = true
        return false
      }
      outputs.push(truncated)
      totalChars += truncated.length + 1 // +1 for newline
      return true
    }

    /** Process a single line, adding output as appropriate */
    function processLine(line: string, lineNum: number, filePrefix: string): boolean {
      if (onlyMatching && !invertMatch) {
        // -o mode: output each match separately
        let match: RegExpExecArray | null
        regex.lastIndex = 0
        while ((match = regex.exec(line)) !== null) {
          const prefix = filePrefix ? `${filePrefix}:` : ''
          const num = showLineNumbers ? `${lineNum}:` : ''
          if (!addOutput(`${prefix}${num}${match[0]}`)) return false
          // Prevent infinite loop on zero-length matches
          if (match[0].length === 0) regex.lastIndex++
        }
      } else {
        const matches = regex.test(line)
        regex.lastIndex = 0

        if (matches !== invertMatch) {
          if (filesOnly) {
            // handled by caller
            return true
          }
          const prefix = filePrefix ? `${filePrefix}:` : ''
          const num = showLineNumbers ? `${lineNum}:` : ''
          if (!addOutput(`${prefix}${num}${line}`)) return false
        }
      }
      return true
    }

    // Search in stdin if no paths
    if (paths.length === 0 && ctx.stdin !== undefined) {
      const lines = ctx.stdin.split('\n')
      for (let i = 0; i < lines.length; i++) {
        if (!processLine(lines[i], i + 1, '')) break
      }
    } else {
      // Search in files
      for (const path of paths) {
        if (outputTruncated) break

        const files = path.includes('*') || recursive
          ? await ctx.fs.glob(recursive ? path.replace(/\/?$/, '/**/*') : path)
          : [path]

        for (const file of files) {
          if (outputTruncated) break
          if (await ctx.fs.isDirectory(file)) continue

          const content = await ctx.fs.read(file)
          if (content === null) continue

          const filePrefix = paths.length > 1 || recursive ? file : ''
          const lines = content.split('\n')
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i]

            if (filesOnly) {
              const matches = regex.test(line)
              regex.lastIndex = 0
              if (matches !== invertMatch) {
                matchingFiles.add(file)
                break
              }
            } else {
              if (!processLine(line, i + 1, filePrefix)) break
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

    let stdout = outputs.join('\n') + (outputs.length ? '\n' : '')
    if (outputTruncated) {
      stdout += `[Output truncated at ${MAX_OUTPUT_CHARS} characters. Narrow your search pattern or target specific files.]\n`
    }

    return {
      exitCode: outputs.length > 0 ? 0 : 1,
      stdout,
      stderr: ''
    }
  }
}
