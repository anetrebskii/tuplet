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
    description: `This tool allows you to gather additional information from the user when needed.

**Usage Guidelines:**
- Use ${toolName} when the outcome may vary and you need clarification from the user to provide an accurate result
- Before using this tool, try to use other tools in order to get required information.
- Come up with a comprehensive list of questions and options
- If you attempte to get information by other tools did not help, then use ${toolName}
- When using ${toolName}, specify a list of questions with relevant options for the user to select from
- Suggest options that the user is likely to choose based on the conversation history
- Limit your clarification request to 1-4 questions

**Do not user this tool**
- Try to gather information using list_context and get_context tools before asking user for details
- Try to use other existing tool to get more information about ther user

**Example Usage:**

<example>
User: Prepare a plan for tomorrow
<commentary>
As a nutrition specialist, you can infer the user wants a daily nutrition plan. No need to ask about the type of plan.
However, you need to clarify their activity level and nutrition goals.
</commentary>
Assistant: ${toolName} [{"question": "What is your daily activity level?", "options": ["Light", "Moderate", "Heavy"], "header": "Activity Level"}, {"question": "What is your nutrition target?", "options": ["Lose weight", "Gain weight", "Maintain weight"], "header": "Nutrition Target"}]
</example>

<example>
User: I'm going to train for a marathon
<commentary>
As a fitness trainer, you understand the user wants marathon training guidance. No need to ask about the activity type.
However, you need to know their preferred training timeline.
</commentary>
Assistant: ${toolName} [{"question": "What is your training duration?", "options": ["1 week", "2 weeks", "1 month"], "header": "Training Duration"}]
</example>

**When NOT to Use:**
<example>
User: Hello
Assistant: tool_use get_context(user/preferences.json)
User: tool_result get_context = <User Preferences>
Assistant: Hello, Alex. How can I help you today?
User: Please provide steps on how to bake chicken for New Year's Eve
<commentary>
As a chef, you have clear context and user preferences. You can provide complete instructions without needing additional clarification.
</commentary>
Assistant: Here are the instructions...
</example>

**Question Format:**
{
  "questions": [
    {
      "question": "What is your daily activity level?",
      "header": "Activity Level",
      "options": ["Light", "Moderate", "Heavy"]
    }
  ]
}
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
