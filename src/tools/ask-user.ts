/**
 * Ask User Tool
 *
 * Tool for gathering additional information from the user when needed.
 */

import type { Tool } from "../types.js";

/**
 * Create the __ask_user__ tool
 */
export function createAskUserTool(): Tool {
  const toolName = "__ask_user__";
  return {
    name: toolName,
    description: `Ask the user 1-4 questions when you need information not available via other tools or conversation history.

Each question has: question (string), header (short label), options (array of strings or {label, description}).

Example: ${toolName}({ "questions": [{"question": "What is your goal?", "header": "Goal", "options": ["Lose weight", "Gain muscle", "Maintain"]}] })
`,
    parameters: {
      type: "object",
      properties: {
        questions: {
          type: "array",
          description:
            "Array of 1-4 questions. Each item has: question (string, required), header (short label, optional), options (array of {label, description}, optional)",
        },
      },
      required: ["questions"],
    },
    execute: async () => {
      // This tool is handled specially in the executor
      return { success: true, data: "Question sent to user" };
    },
  };
}
