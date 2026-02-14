/**
 * Shell Command Parser
 *
 * Parses bash-like command strings into structured commands.
 */

import type { ParsedCommand } from './types.js'

/**
 * Heredoc regex: matches << WORD, <<-WORD, << 'WORD', << "WORD"
 * Group 1: optional leading quote, Group 2: delimiter word
 */
const HEREDOC_RE = /<<-?\s*(['"]?)(\w+)\1/

export function parseCommand(input: string): ParsedCommand[] {
  const commands: ParsedCommand[] = []
  // Join lines that are inside open quotes before splitting into commands
  const logicalLines = joinQuotedLines(input.split('\n'))

  let i = 0
  while (i < logicalLines.length) {
    const line = logicalLines[i].trim()

    // Skip empty lines and comment lines
    if (line === '' || line.startsWith('#')) {
      i++
      continue
    }

    // Check for heredoc (e.g. cat << EOF > /file.json)
    const heredocMatch = line.match(HEREDOC_RE)
    if (heredocMatch) {
      const quoteChar = heredocMatch[1] // '' if unquoted, "'" or '"' if quoted
      const delimiter = heredocMatch[2]
      // Remove the << DELIMITER portion, keep the rest (command + redirections)
      const cleanedLine = line.replace(HEREDOC_RE, '').trim()

      // Collect heredoc body until matching delimiter
      const heredocLines: string[] = []
      i++
      while (i < logicalLines.length && logicalLines[i].trim() !== delimiter) {
        heredocLines.push(logicalLines[i])
        i++
      }
      i++ // skip the delimiter line

      if (cleanedLine) {
        const parsed = parsePipeline(cleanedLine)
        if (parsed) {
          parsed.stdinContent = heredocLines.join('\n')
          // Quoted delimiter (e.g. << 'EOF') suppresses variable expansion
          if (quoteChar) {
            parsed.heredocQuoted = true
          }
          commands.push(parsed)
        }
      }
      continue
    }

    // Split by && (respecting quotes) before pipe parsing
    const andParts = splitByAnd(line)
    for (const part of andParts) {
      const trimmedPart = part.trim()
      if (!trimmedPart) continue
      const parsed = parsePipeline(trimmedPart)
      if (parsed) {
        commands.push(parsed)
      }
    }
    i++
  }

  return commands
}

/**
 * Join lines that are continuations of an unclosed quote from a previous line.
 * e.g. echo 'hello\nworld' sent as two lines gets joined back into one.
 */
function joinQuotedLines(lines: string[]): string[] {
  const result: string[] = []
  let pending = ''
  let inSingleQuote = false
  let inDoubleQuote = false

  for (const line of lines) {
    if (inSingleQuote || inDoubleQuote) {
      // We're continuing a quoted string from a previous line
      pending += '\n' + line
    } else {
      // Start a new logical line
      if (pending) result.push(pending)
      pending = line
    }

    // Scan this line to update quote state
    let escape = false
    for (const ch of line) {
      if (escape) {
        escape = false
        continue
      }
      if (ch === '\\' && !inSingleQuote) {
        escape = true
        continue
      }
      if (ch === "'" && !inDoubleQuote) {
        inSingleQuote = !inSingleQuote
      } else if (ch === '"' && !inSingleQuote) {
        inDoubleQuote = !inDoubleQuote
      }
    }
  }

  if (pending) result.push(pending)
  return result
}

/**
 * Split a line by && (AND operator), respecting quotes.
 */
function splitByAnd(input: string): string[] {
  const parts: string[] = []
  let current = ''
  let inSingleQuote = false
  let inDoubleQuote = false
  let escape = false

  for (let i = 0; i < input.length; i++) {
    const char = input[i]

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

    if (char === '&' && input[i + 1] === '&' && !inSingleQuote && !inDoubleQuote) {
      parts.push(current)
      current = ''
      i++ // skip second &
      continue
    }

    current += char
  }

  if (current) {
    parts.push(current)
  }

  return parts
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
  // Strip stderr redirections (2>/dev/null, 2>&1, etc.) — no stderr in virtual shell
  const cleaned = segment.replace(/\s*2>\s*(?:\/dev\/null|&1)\s*/g, ' ')
  const tokens = tokenize(cleaned)

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

    if ((current === '>' || current === '<') && !inSingleQuote && !inDoubleQuote) {
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
