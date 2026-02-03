/**
 * Shell Command Parser
 *
 * Parses bash-like command strings into structured commands.
 */

import type { ParsedCommand } from './types.js'

/**
 * Heredoc regex: matches << WORD, <<-WORD, << 'WORD', << "WORD"
 */
const HEREDOC_RE = /<<-?\s*['"]?(\w+)['"]?/

export function parseCommand(input: string): ParsedCommand[] {
  const commands: ParsedCommand[] = []
  const lines = input.split('\n')

  let i = 0
  while (i < lines.length) {
    const line = lines[i].trim()

    // Skip empty lines and comment lines
    if (line === '' || line.startsWith('#')) {
      i++
      continue
    }

    // Check for heredoc (e.g. cat << EOF > /ctx/file.json)
    const heredocMatch = line.match(HEREDOC_RE)
    if (heredocMatch) {
      const delimiter = heredocMatch[1]
      // Remove the << DELIMITER portion, keep the rest (command + redirections)
      const cleanedLine = line.replace(HEREDOC_RE, '').trim()

      // Collect heredoc body until matching delimiter
      const heredocLines: string[] = []
      i++
      while (i < lines.length && lines[i].trim() !== delimiter) {
        heredocLines.push(lines[i])
        i++
      }
      i++ // skip the delimiter line

      if (cleanedLine) {
        const parsed = parsePipeline(cleanedLine)
        if (parsed) {
          parsed.stdinContent = heredocLines.join('\n')
          commands.push(parsed)
        }
      }
      continue
    }

    // Regular command line (may contain pipes)
    const parsed = parsePipeline(line)
    if (parsed) {
      commands.push(parsed)
    }
    i++
  }

  return commands
}

/**
 * Parse a single line that may contain pipes into a linked ParsedCommand chain.
 */
function parsePipeline(line: string): ParsedCommand | null {
  const segments = splitByPipe(line)
  let first: ParsedCommand | null = null
  let prev: ParsedCommand | null = null

  for (const segment of segments) {
    const trimmed = segment.trim()
    if (!trimmed) continue

    const parsed = parseSegment(trimmed)
    if (!first) {
      first = parsed
    }
    if (prev) {
      prev.pipe = parsed
    }
    prev = parsed
  }

  return first
}

function parseSegment(segment: string): ParsedCommand {
  const tokens = tokenize(segment)

  const result: ParsedCommand = {
    command: '',
    args: []
  }

  let i = 0

  // First token is the command
  if (tokens.length > 0) {
    result.command = tokens[i++]
  }

  // Parse remaining tokens
  while (i < tokens.length) {
    const token = tokens[i]

    if (token === '>') {
      // Output redirection
      result.outputFile = tokens[++i]
    } else if (token === '>>') {
      // Append redirection
      result.appendFile = tokens[++i]
    } else if (token === '<') {
      // Input redirection
      result.inputFile = tokens[++i]
    } else {
      result.args.push(token)
    }

    i++
  }

  return result
}

function splitByPipe(input: string): string[] {
  const segments: string[] = []
  let current = ''
  let inSingleQuote = false
  let inDoubleQuote = false
  let escape = false

  for (const char of input) {
    if (escape) {
      current += char
      escape = false
      continue
    }

    if (char === '\\') {
      escape = true
      current += char
      continue
    }

    if (char === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote
      current += char
      continue
    }

    if (char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote
      current += char
      continue
    }

    if (char === '|' && !inSingleQuote && !inDoubleQuote) {
      segments.push(current)
      current = ''
      continue
    }

    current += char
  }

  if (current) {
    segments.push(current)
  }

  return segments
}

function tokenize(input: string): string[] {
  const tokens: string[] = []
  let current = ''
  let inSingleQuote = false
  let inDoubleQuote = false
  let escape = false

  for (const char of input) {
    if (escape) {
      current += char
      escape = false
      continue
    }

    if (char === '\\' && !inSingleQuote) {
      escape = true
      continue
    }

    if (char === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote
      continue
    }

    if (char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote
      continue
    }

    if ((char === ' ' || char === '\t') && !inSingleQuote && !inDoubleQuote) {
      if (current) {
        tokens.push(current)
        current = ''
      }
      continue
    }

    // Handle >> as single token
    if (char === '>' && current === '>') {
      current = '>>'
      tokens.push(current)
      current = ''
      continue
    }

    // Handle > and < as separate tokens
    if ((char === '>' || char === '<') && !inSingleQuote && !inDoubleQuote) {
      if (current) {
        tokens.push(current)
        current = ''
      }
      current = char
      continue
    }

    if (current === '>' || current === '<') {
      tokens.push(current)
      current = ''
    }

    current += char
  }

  if (current) {
    tokens.push(current)
  }

  return tokens
}
