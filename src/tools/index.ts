/**
 * Tools Module
 *
 * Exports all internal tools used by the Tuplet agent.
 */

// Ask User Tool
export { createAskUserTool } from "./ask-user.js";

// Output Tool
export { OUTPUT_TOOL_NAME, createOutputTool } from "./output.js";

// Sub-Agent Tool (sub-agent delegation)
export {
  createTaskTool,
  type TaskToolContext,
  type CreateSubTuplet,
} from "./sub-agent.js";

// Task Management Tools (Claude Code 4-Tool Approach)
export {
  TaskManager,
  formatTaskList,
  createTaskTools,
  createTaskCreateTool,
  createTaskUpdateTool,
  createTaskGetTool,
  createTaskListTool,
  type TaskToolOptions,
  // Backward compatibility aliases
  TodoManager,
  formatTodoList,
  createTodoTool,
  type TodoToolOptions,
} from "./tasks.js";

// Shell Tool (bash-like context access)
export { createShellTool } from "./shell.js";
