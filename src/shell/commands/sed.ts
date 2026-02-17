/**
 * sed - Stream editor for filtering and transforming text
 */

import type { CommandHandler, CommandContext, ShellResult } from '../types.js'

interface SedCommand {
  type: 's' | 'd' | 'p' | 'a' | 'i' | 'c'
  address?: SedAddress
  // Substitution fields
  pattern?: RegExp
  replacement?: string
  globalFlag?: boolean
  // Append/insert/change text
  text?: string
}

interface SedAddress {
  type: 'line' | 'regex' | 'range' | 'last'
  line?: number
  regex?: RegExp
  start?: SedAddress
  end?: SedAddress
}

/**
 * Parse a sed substitution command: s/pattern/replacement/flags
 * The delimiter is the character immediately after 's'.
 */
function parseSubstitution(expr: string): { pattern: RegExp; replacement: string; global: boolean; rest: string } | null {
  if (!expr.startsWith('s') || expr.length < 4) return null

  const delim = expr[1]
  // Find pattern end (next unescaped delimiter)
  let i = 2
  let pattern = ''
  while (i < expr.length) {
    if (expr[i] === '\\' && i + 1 < expr.length) {
      // Keep escaped chars, but unescape the delimiter itself
      if (expr[i + 1] === delim) {
        pattern += delim
      } else {
        pattern += expr[i] + expr[i + 1]
      }
      i += 2
    } else if (expr[i] === delim) {
      break
    } else {
      pattern += expr[i]
      i++
    }
  }

  if (i >= expr.length) return null
  i++ // skip delimiter

  // Find replacement end
  let replacement = ''
  while (i < expr.length) {
    if (expr[i] === '\\' && i + 1 < expr.length) {
      if (expr[i + 1] === delim) {
        replacement += delim
      } else {
        // Preserve backreferences and other escapes
        replacement += expr[i] + expr[i + 1]
      }
      i += 2
    } else if (expr[i] === delim) {
      break
    } else {
      replacement += expr[i]
      i++
    }
  }

  // Parse flags after closing delimiter
  let globalFlag = false
  let rest = ''
  if (i < expr.length && expr[i] === delim) {
    i++ // skip closing delimiter
    while (i < expr.length) {
      if (expr[i] === 'g') {
        globalFlag = true
      } else {
        // Remaining chars are not flags — likely the rest after flags section
        break
      }
      i++
    }
    rest = expr.slice(i)
  }

  let regex: RegExp
  try {
    regex = new RegExp(pattern, globalFlag ? 'g' : '')
  } catch {
    return null
  }

  return { pattern: regex, replacement, global: globalFlag, rest }
}

/**
 * Parse an address (line number or /regex/)
 */
function parseAddress(expr: string): { address: SedAddress; rest: string } | null {
  if (expr[0] === '$') {
    return { address: { type: 'last' }, rest: expr.slice(1) }
  }

  if (/^\d/.test(expr)) {
    const match = expr.match(/^(\d+)/)
    if (match) {
      return {
        address: { type: 'line', line: parseInt(match[1], 10) },
        rest: expr.slice(match[1].length)
      }
    }
  }

  if (expr[0] === '/') {
    let i = 1
    let pattern = ''
    while (i < expr.length) {
      if (expr[i] === '\\' && i + 1 < expr.length) {
        if (expr[i + 1] === '/') {
          pattern += '/'
        } else {
          pattern += expr[i] + expr[i + 1]
        }
        i += 2
      } else if (expr[i] === '/') {
        break
      } else {
        pattern += expr[i]
        i++
      }
    }
    if (i < expr.length) {
      i++ // skip closing /
      try {
        return {
          address: { type: 'regex', regex: new RegExp(pattern) },
          rest: expr.slice(i)
        }
      } catch {
        return null
      }
    }
  }

  return null
}

/**
 * Parse a single sed command expression (may include address).
 */
function parseSedExpr(expr: string): SedCommand | null {
  expr = expr.trim()
  if (!expr) return null

  // Parse optional address
  let address: SedAddress | undefined
  const addrResult = parseAddress(expr)
  if (addrResult) {
    address = addrResult.address
    expr = addrResult.rest.trim()

    // Check for range: addr1,addr2
    if (expr[0] === ',') {
      const endResult = parseAddress(expr.slice(1))
      if (endResult) {
        address = { type: 'range', start: address, end: endResult.address }
        expr = endResult.rest.trim()
      }
    }
  }

  // Parse the command
  if (expr[0] === 's') {
    const sub = parseSubstitution(expr)
    if (sub) {
      return { type: 's', address, pattern: sub.pattern, replacement: sub.replacement, globalFlag: sub.global }
    }
  } else if (expr[0] === 'd') {
    return { type: 'd', address }
  } else if (expr[0] === 'p') {
    return { type: 'p', address }
  }

  return null
}

/**
 * Split a sed script by semicolons, respecting delimiters inside s commands.
 */
function splitSedScript(script: string): string[] {
  const parts: string[] = []
  let current = ''
  let i = 0

  while (i < script.length) {
    if (script[i] === ';') {
      parts.push(current)
      current = ''
      i++
      continue
    }

    // If we hit an 's' command, we need to skip through the full s/pat/rep/flags
    if (script[i] === 's' && (current.length === 0 || /^[\s\d,$\/]*$/.test(current))) {
      current += script[i]
      i++
      if (i >= script.length) break
      const delim = script[i]
      current += delim
      i++

      // Skip through pattern
      let delimCount = 0
      while (i < script.length && delimCount < 2) {
        if (script[i] === '\\' && i + 1 < script.length) {
          current += script[i] + script[i + 1]
          i += 2
          continue
        }
        if (script[i] === delim) {
          delimCount++
        }
        current += script[i]
        i++
      }

      // Skip flags after the closing delimiter
      while (i < script.length && /[gimp]/.test(script[i])) {
        current += script[i]
        i++
      }
      continue
    }

    current += script[i]
    i++
  }

  if (current) parts.push(current)
  return parts
}

/**
 * Check if a line matches an address
 */
function matchesAddress(addr: SedAddress, lineNum: number, totalLines: number, line: string): boolean {
  switch (addr.type) {
    case 'line':
      return lineNum === addr.line!
    case 'last':
      return lineNum === totalLines
    case 'regex':
      return addr.regex!.test(line)
    case 'range': {
      const startMatch = matchesAddress(addr.start!, lineNum, totalLines, line)
      const endMatch = matchesAddress(addr.end!, lineNum, totalLines, line)
      // Simplified range: check if lineNum is between start and end for line addresses
      if (addr.start!.type === 'line' && addr.end!.type === 'line') {
        return lineNum >= addr.start!.line! && lineNum <= addr.end!.line!
      }
      if (addr.start!.type === 'line' && addr.end!.type === 'last') {
        return lineNum >= addr.start!.line!
      }
      // For regex ranges, do a simplified match (either start or end matches)
      return startMatch || endMatch
    }
    default:
      return false
  }
}

/**
 * Convert sed replacement string to JS replacement string.
 * Handles \n for newline and & for the matched text.
 */
function convertReplacement(replacement: string): string {
  return replacement
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/&/g, '$&')
}

export const sedCommand: CommandHandler = {
  name: 'sed',

  help: {
    usage: 'sed [OPTIONS] SCRIPT [FILE...]',
    description: 'Stream editor for filtering and transforming text',
    flags: [
      { flag: '-e SCRIPT', description: 'Add script commands (can be repeated)' },
      { flag: '-n', description: 'Suppress automatic printing of lines' },
      { flag: '-i', description: 'Edit files in-place' },
    ],
    examples: [
      { command: "sed 's/old/new/' file.txt", description: 'Replace first occurrence per line' },
      { command: "sed 's/old/new/g' file.txt", description: 'Replace all occurrences' },
      { command: "sed 's/<tag>//g;s/<\\/tag>//g'", description: 'Chain multiple substitutions with ;' },
      { command: "sed -e 's/a/b/' -e 's/c/d/' file.txt", description: 'Multiple -e expressions' },
      { command: "sed '/pattern/d' file.txt", description: 'Delete lines matching pattern' },
      { command: "sed -n '/pattern/p' file.txt", description: 'Print only matching lines' },
      { command: "sed '1d' file.txt", description: 'Delete first line' },
      { command: "sed '2,5d' file.txt", description: 'Delete lines 2-5' },
      { command: "cat data | sed 's/foo/bar/g'", description: 'Transform piped input' },
    ]
  },

  async execute(args: string[], ctx: CommandContext): Promise<ShellResult> {
    let suppressPrint = false
    let inPlace = false
    const scripts: string[] = []
    const paths: string[] = []

    // Parse arguments
    for (let i = 0; i < args.length; i++) {
      const arg = args[i]

      if (arg === '-n') {
        suppressPrint = true
      } else if (arg === '-i' || arg === '--in-place') {
        inPlace = true
      } else if (arg === '-e') {
        if (i + 1 < args.length) {
          scripts.push(args[++i])
        } else {
          return { exitCode: 1, stdout: '', stderr: 'sed: option requires an argument -- e\n' }
        }
      } else if (arg.startsWith('-') && arg !== '-') {
        // Ignore unknown flags
      } else if (scripts.length === 0) {
        // First non-option arg is the script
        scripts.push(arg)
      } else {
        paths.push(arg)
      }
    }

    if (scripts.length === 0) {
      return { exitCode: 1, stdout: '', stderr: 'sed: no script specified\n' }
    }

    // Parse all commands from all scripts
    const commands: SedCommand[] = []
    for (const script of scripts) {
      const parts = splitSedScript(script)
      for (const part of parts) {
        const cmd = parseSedExpr(part)
        if (cmd) {
          commands.push(cmd)
        } else if (part.trim()) {
          return { exitCode: 1, stdout: '', stderr: `sed: invalid command: '${part.trim()}'\n` }
        }
      }
    }

    if (commands.length === 0) {
      return { exitCode: 1, stdout: '', stderr: 'sed: no valid commands\n' }
    }

    // Collect input
    const processFile = async (content: string): Promise<string> => {
      const lines = content.split('\n')
      // Remove trailing empty line from split (if content ends with \n)
      const hadTrailingNewline = content.endsWith('\n')
      if (hadTrailingNewline && lines[lines.length - 1] === '') {
        lines.pop()
      }

      const output: string[] = []
      const totalLines = lines.length

      for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
        let line = lines[lineIdx]
        const lineNum = lineIdx + 1
        let deleted = false
        let printed = false

        for (const cmd of commands) {
          // Check address
          if (cmd.address && !matchesAddress(cmd.address, lineNum, totalLines, line)) {
            continue
          }

          switch (cmd.type) {
            case 's': {
              const jsReplacement = convertReplacement(cmd.replacement!)
              if (cmd.globalFlag) {
                line = line.replace(cmd.pattern!, jsReplacement)
              } else {
                line = line.replace(cmd.pattern!, jsReplacement)
              }
              break
            }
            case 'd':
              deleted = true
              break
            case 'p':
              output.push(line)
              printed = true
              break
          }

          if (deleted) break
        }

        if (!deleted && !suppressPrint) {
          output.push(line)
        }
      }

      // Preserve trailing newline
      if (output.length > 0) {
        return output.join('\n') + '\n'
      }
      return ''
    }

    // Process from stdin or files
    if (paths.length === 0 && ctx.stdin !== undefined) {
      const result = await processFile(ctx.stdin)
      return { exitCode: 0, stdout: result, stderr: '' }
    } else if (paths.length === 0) {
      return { exitCode: 1, stdout: '', stderr: 'sed: no input files\n' }
    }

    let allOutput = ''
    for (const path of paths) {
      const content = await ctx.fs.read(path)
      if (content === null) {
        return { exitCode: 1, stdout: '', stderr: `sed: ${path}: No such file\n` }
      }

      const result = await processFile(content)

      if (inPlace) {
        await ctx.fs.write(path, result)
      } else {
        allOutput += result
      }
    }

    return { exitCode: 0, stdout: inPlace ? '' : allOutput, stderr: '' }
  }
}
