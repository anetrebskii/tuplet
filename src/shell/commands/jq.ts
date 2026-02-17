/**
 * jq - JSON processor
 *
 * Simplified jq implementation supporting common operations.
 */

import type { CommandHandler, CommandContext, ShellResult } from '../types.js'

export const jqCommand: CommandHandler = {
  name: 'jq',

  help: {
    usage: 'jq [OPTIONS] FILTER [FILE]',
    description: 'Lightweight JSON processor',
    flags: [
      { flag: '-r', description: 'Raw output (no quotes on strings)' },
      { flag: '-c', description: 'Compact output (single line)' }
    ],
    examples: [
      { command: "cat data.json | jq '.items'", description: 'Extract field' },
      { command: "cat data.json | jq '.items[]'", description: 'Iterate array' },
      { command: "cat data.json | jq '.name' -r", description: 'Raw string output' },
      { command: "cat data.json | jq '.items | length'", description: 'Count array items' }
    ],
    notes: [
      'Supports: field access (.foo), arrays ([]), index ([0]), keys, values, length',
      'Supports: select(.field == "value"), map(.field)',
      'Reads from stdin or file argument'
    ]
  },

  async execute(args: string[], ctx: CommandContext): Promise<ShellResult> {
    let raw = false
    let compact = false
    let filter = '.'
    const paths: string[] = []

    for (const arg of args) {
      if (arg === '-r' || arg === '--raw-output') {
        raw = true
      } else if (arg === '-c' || arg === '--compact-output') {
        compact = true
      } else if (!arg.startsWith('-')) {
        if (filter === '.') {
          filter = arg
        } else {
          paths.push(arg)
        }
      }
    }

    // Get input
    let input: string | null = null

    if (ctx.stdin !== undefined) {
      input = ctx.stdin
    } else if (paths.length > 0) {
      input = await ctx.fs.read(paths[0])
    }

    if (!input) {
      return { exitCode: 1, stdout: '', stderr: 'jq: no input' }
    }

    try {
      const data = JSON.parse(input)
      const result = applyFilter(data, filter)

      const outputs: string[] = []
      const items = Array.isArray(result) && filter.includes('[]') ? result : [result]

      for (const item of items) {
        if (raw && typeof item === 'string') {
          outputs.push(item)
        } else if (compact) {
          outputs.push(JSON.stringify(item))
        } else {
          outputs.push(JSON.stringify(item, null, 2))
        }
      }

      return { exitCode: 0, stdout: outputs.join('\n') + '\n', stderr: '' }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { exitCode: 1, stdout: '', stderr: `jq: ${message}` }
    }
  }
}

function applyFilter(data: unknown, filter: string): unknown {
  if (filter === '.') {
    return data
  }

  // Handle .field access
  const parts = parseFilter(filter)
  let result: unknown = data

  for (const part of parts) {
    if (result === null || result === undefined) {
      return null
    }

    if (part === '[]') {
      // Array iteration
      if (!Array.isArray(result)) {
        throw new Error('Cannot iterate over non-array')
      }
      return result
    } else if (part.startsWith('[') && part.endsWith(']')) {
      // Array index
      const index = parseInt(part.slice(1, -1), 10)
      if (Array.isArray(result)) {
        result = result[index]
      } else {
        throw new Error('Cannot index non-array')
      }
    } else if (part.startsWith('select(')) {
      // Select filter
      const condition = part.slice(7, -1)
      if (Array.isArray(result)) {
        result = result.filter(item => evaluateCondition(item, condition))
      }
    } else if (part.startsWith('map(')) {
      // Map filter
      const mapFilter = part.slice(4, -1)
      if (Array.isArray(result)) {
        result = result.map(item => applyFilter(item, mapFilter))
      }
    } else if (part === 'keys') {
      if (typeof result === 'object' && result !== null) {
        result = Object.keys(result)
      }
    } else if (part === 'values') {
      if (typeof result === 'object' && result !== null) {
        result = Object.values(result)
      }
    } else if (part === 'length') {
      if (Array.isArray(result)) {
        result = result.length
      } else if (typeof result === 'string') {
        result = result.length
      } else if (typeof result === 'object' && result !== null) {
        result = Object.keys(result).length
      }
    } else {
      // Field access
      if (typeof result === 'object' && result !== null) {
        result = (result as Record<string, unknown>)[part]
      } else {
        return null
      }
    }
  }

  return result
}

function parseFilter(filter: string): string[] {
  const parts: string[] = []
  let current = ''
  let depth = 0

  for (let i = 0; i < filter.length; i++) {
    const char = filter[i]

    if (char === '(' || char === '[') {
      depth++
      current += char
    } else if (char === ')' || char === ']') {
      depth--
      current += char
      if (depth === 0 && char === ']') {
        parts.push(current)
        current = ''
      }
    } else if (char === '.' && depth === 0) {
      if (current) {
        parts.push(current)
        current = ''
      }
    } else if (char === '|' && depth === 0) {
      if (current) {
        parts.push(current)
        current = ''
      }
    } else {
      current += char
    }
  }

  if (current) {
    parts.push(current)
  }

  return parts.filter(p => p)
}

function evaluateCondition(item: unknown, condition: string): boolean {
  // Simple condition parsing: .field == "value" or .field > 0
  const match = condition.match(/\.(\w+)\s*(==|!=|>|<|>=|<=)\s*(.+)/)
  if (!match) return true

  const [, field, operator, rawValue] = match
  const itemValue = (item as Record<string, unknown>)?.[field]

  const trimmedValue = rawValue.trim()
  let compareValue: unknown = trimmedValue
  if (trimmedValue.startsWith('"') && trimmedValue.endsWith('"')) {
    compareValue = trimmedValue.slice(1, -1)
  } else if (trimmedValue === 'true') {
    compareValue = true
  } else if (trimmedValue === 'false') {
    compareValue = false
  } else if (trimmedValue === 'null') {
    compareValue = null
  } else if (!isNaN(Number(trimmedValue))) {
    compareValue = Number(trimmedValue)
  }

  const numItem = Number(itemValue)
  const numCompare = Number(compareValue)

  switch (operator) {
    case '==': return itemValue === compareValue
    case '!=': return itemValue !== compareValue
    case '>': return numItem > numCompare
    case '<': return numItem < numCompare
    case '>=': return numItem >= numCompare
    case '<=': return numItem <= numCompare
    default: return true
  }
}
