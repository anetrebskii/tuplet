/**
 * Shell Command Parser
 *
 * Parses bash-like command strings into structured commands.
 */

import type { ParsedCommand } from './types.js'

export function parseCommand(input: string): ParsedCommand[] {
  const commands: ParsedCommand[] = []

  // Split by pipe, respecting quotes
  const segments = splitByPipe(input)

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i].trim()
    if (!segment) continue

    const parsed = parseSegment(segment)

    // Link pipes
    if (i > 0 && commands.length > 0) {
      commands[commands.length - 1].pipe = parsed
    } else {
      commands.push(parsed)
    }
  }

  return commands
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
