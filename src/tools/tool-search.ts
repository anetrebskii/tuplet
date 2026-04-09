/**
 * Tool Search - Deferred tool loading
 *
 * When deferred tool loading is enabled, only core tools are sent to the API.
 * Other tools are listed by name in the system prompt. The model calls
 * __tool_search__ to load specific tools by name, making them available
 * for subsequent LLM calls.
 */

import type { Tool, ToolResult, ToolContext, JSONSchema } from '../types.js'

export const TOOL_SEARCH_NAME = '__tool_search__'

/** Core tools that are always loaded (never deferred) */
const CORE_TOOL_NAMES = new Set([
  '__ask_user__',
  '__sub_agent__',
  '__skill__',
  TOOL_SEARCH_NAME,
])

export function isCoreToolName(name: string): boolean {
  return CORE_TOOL_NAMES.has(name)
}

export function createToolSearchTool(deferredTools: Tool[]): Tool {
  const toolMap = new Map(deferredTools.map(t => [t.name, t]))
  const available = deferredTools.map(t => t.name).join(', ')

  return {
    name: TOOL_SEARCH_NAME,
    description: `Load deferred tools by name so you can call them. Use "select:tool1,tool2" to load specific tools. Available: ${available}`,
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Use "select:tool1,tool2" to load tools by name'
        }
      },
      required: ['query']
    } as JSONSchema,
    execute: async (params: Record<string, unknown>, _context: ToolContext): Promise<ToolResult> => {
      const query = (params.query as string).trim()

      // Parse "select:tool1,tool2" format
      const selectMatch = query.match(/^select:(.+)$/i)
      if (!selectMatch) {
        return {
          success: false,
          error: `Use "select:tool1,tool2" format. Available tools: ${available}`
        }
      }

      const requested = selectMatch[1].split(',').map(s => s.trim())
      const found: string[] = []
      const notFound: string[] = []

      for (const name of requested) {
        if (toolMap.has(name)) {
          found.push(name)
        } else {
          notFound.push(name)
        }
      }

      if (found.length === 0) {
        return {
          success: false,
          error: `No matching tools. Available: ${available}`
        }
      }

      return {
        success: true,
        data: {
          __toolSearchResult: true,
          loadedTools: found,
          ...(notFound.length > 0 && { notFound }),
        }
      }
    }
  }
}
