/**
 * Output Tool
 *
 * Tool for sub-agents to return structured data to the parent agent.
 */

import type { Tool, JSONSchema } from "../types.js";

/**
 * Output tool name constant
 */
export const OUTPUT_TOOL_NAME = "__output__";

/**
 * Create the __output__ tool for sub-agents to return structured data
 */
export function createOutputTool(outputSchema: JSONSchema): Tool {
  return {
    name: OUTPUT_TOOL_NAME,
    description: `Return structured output data to the parent agent.

Use this tool when you have completed your task and want to return results.
Include a brief summary and the structured data.

IMPORTANT: Call this tool ONCE when your task is complete.`,
    parameters: {
      type: "object",
      properties: {
        summary: {
          type: "string",
          description: "Brief summary of what was done (1-2 sentences)",
        },
        data: outputSchema,
      },
      required: ["summary", "data"],
    } as JSONSchema,
    execute: async (params) => {
      // This tool doesn't actually execute - it's intercepted by the parent
      // The executor will capture this and return it as the result
      return { success: true, data: params };
    },
  };
}
