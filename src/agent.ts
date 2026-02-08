/**
 * Hive Agent
 *
 * Main agent class that orchestrates tool execution, sub-agents, and workspace management.
 */

import type {
  HiveConfig,
  Tool,
  ToolContext,
  RunOptions,
  AgentResult,
  Message,
} from "./types.js";
import { ContextManager } from "./context-manager.js";
import { executeLoop } from "./executor.js";
import { TraceBuilder } from "./trace.js";
import { Workspace } from "./workspace.js";
import { createShellTool } from "./tools/shell.js";
import {
  createAskUserTool,
  createTaskTool as createSubAgentTool,
  TaskManager,
  createTaskTools,
  createTaskGetTool,
  createTaskListTool,
} from "./tools/index.js";
import { getBuiltInAgents } from "./built-in-agents/index.js";

/** Path where the plan is stored in workspace */
export const PLAN_PATH = ".hive/plan.md";

/** Full filesystem path for the plan */
export const PLAN_FS_PATH = `/${PLAN_PATH}`;

/** System prompt prepended in plan mode */
const PLAN_MODE_INSTRUCTIONS = `# Plan Mode

You are in **plan mode**. Your job is to understand the current state, then write a plan.

## Workflow

1. **Explore first** — Use the \`explore\` sub-agent to discover what data and state currently exists. This is mandatory before writing a plan.
2. **Analyze** — Based on the exploration results and the user's request, determine what needs to happen.
3. **Write the plan** — Save your plan to \`${PLAN_FS_PATH}\` using the shell.

## Rules

- **Read-only**: The shell is in read-only mode. You cannot create, modify, or delete files except the plan file.
- **Explore before planning**: Always launch the \`explore\` agent first to understand what exists. Do not skip this step.
- **Allowed tools**: shell (read-only), \`explore\` and \`plan\` sub-agents, TaskList, TaskGet, __ask_user__.
- **Write your plan**:
  \`\`\`
  cat << 'EOF' > ${PLAN_FS_PATH}
  # Plan
  ...your plan here...
  EOF
  \`\`\`
- When your plan is complete, tell the user and summarize it.

`;

/** System prompt section appended in execute mode when a plan exists */
function executeModeSection(planContent: string): string {
  return `\n\n# Plan Context

The following plan was created during the planning phase. Use it as guidance for your implementation:

<plan>
${planContent}
</plan>

Follow the plan steps. Mark tasks as completed as you finish them.
`;
}


/**
 * Hive Agent Class
 */
export class Hive {
  readonly config: HiveConfig;
  private contextManager: ContextManager;
  private tools: Tool[];
  /** Current trace builder (set during run, used by __sub_agent__ tool) */
  private currentTraceBuilder?: TraceBuilder;

  constructor(config: HiveConfig) {
    this.config = {
      maxIterations: 50,
      maxContextTokens: 100000,
      contextStrategy: "truncate_old",
      ...config,
    };

    this.contextManager = new ContextManager(
      this.config.maxContextTokens,
      this.config.contextStrategy
    );

    // Build tools list with internal tools (todo tool added per-run)
    this.tools = [...config.tools];

    // Add __ask_user__ tool unless disabled (sub-agents shouldn't use it)
    if (!config.disableAskUser) {
      this.tools.push(createAskUserTool());
    }

    // Auto-merge built-in agents only when agents is not explicitly set.
    // If agents is explicitly provided (even as []), respect that — no auto-injection.
    // This prevents sub-agents from recursively spawning their own sub-agents.
    if (!('agents' in config)) {
      const builtIn = getBuiltInAgents();
      this.config.agents = [...builtIn];
    } else if (config.agents && config.agents.length > 0) {
      const builtIn = getBuiltInAgents();
      const userAgentNames = new Set(config.agents.map((a) => a.name));
      const newAgents = builtIn.filter((a) => !userAgentNames.has(a.name));
      this.config.agents = [...config.agents, ...newAgents];
    }

    // Add __sub_agent__ tool if sub-agents are defined
    if (this.config.agents && this.config.agents.length > 0) {
      this.tools.push(
        createSubAgentTool(
          {
            config: this.config,
            getCurrentTraceBuilder: () => this.getCurrentTraceBuilder(),
          },
          this.config.agents!,
          (subConfig) => new Hive(subConfig)
        )
      );
    }
  }

  /**
   * Get the current trace builder (used by __sub_agent__ tool for sub-agent tracing)
   */
  getCurrentTraceBuilder(): TraceBuilder | undefined {
    return this.currentTraceBuilder;
  }

  /**
   * Set the current trace builder (called at start of run)
   */
  setCurrentTraceBuilder(builder: TraceBuilder | undefined): void {
    this.currentTraceBuilder = builder;
  }

  /**
   * Get tools including internal tools for a specific run.
   * In plan mode, only a restricted set of tools is returned.
   */
  private getRunTools(
    taskManager: TaskManager,
    workspace: Workspace,
    agentName?: string,
    mode?: "plan" | "execute"
  ): Tool[] {
    const taskToolOptions = {
      logger: this.config.logger,
      agentName,
      workspace,
    };

    if (mode === "plan") {
      // Plan mode: restricted tool set
      const planTools: Tool[] = [];

      // __ask_user__ (if not disabled)
      const askUser = this.tools.find((t) => t.name === "__ask_user__");
      if (askUser) {
        planTools.push(askUser);
      }

      // __sub_agent__ restricted to explore + plan agents only
      const subAgentTool = this.tools.find(
        (t) => t.name === "__sub_agent__"
      );
      if (subAgentTool) {
        // Create a wrapper that only allows explore and plan agents
        planTools.push({
          ...subAgentTool,
          execute: async (params, context) => {
            const agentParam = params.agent as string;
            if (agentParam !== "explore" && agentParam !== "plan") {
              return {
                success: false,
                error: `Plan mode: only 'explore' and 'plan' sub-agents are allowed. Got: '${agentParam}'`,
              };
            }
            return subAgentTool.execute(params, context);
          },
        });
      }

      // TaskList and TaskGet only (no TaskCreate, TaskUpdate)
      planTools.push(createTaskListTool(taskManager, taskToolOptions));
      planTools.push(createTaskGetTool(taskManager, taskToolOptions));

      // Shell (already in read-only mode via setReadOnly)
      planTools.push(createShellTool(workspace.getShell()));

      return planTools;
    }

    // Default / execute mode: all tools
    return [
      ...this.tools,
      ...createTaskTools(taskManager, taskToolOptions),
      createShellTool(workspace.getShell()),
    ];
  }

  /**
   * Run the agent with a user message
   */
  async run(message: string, options: RunOptions = {}): Promise<AgentResult> {
    const {
      conversationId,
      userId,
      history: providedHistory,
      signal,
      shouldContinue,
      workspace,
      mode,
    } = options;

    // Load history from repository or use provided
    let history: Message[] = [];

    if (providedHistory) {
      history = providedHistory;
    } else if (conversationId && this.config.repository) {
      history = await this.config.repository.getHistory(conversationId);
    }

    // Handle history with pending tool_use blocks (from interrupted executions)
    const messages: Message[] = [...history];
    const lastMessage = messages[messages.length - 1];

    // Detect if we're resuming from an interrupted execution (__ask_user__ pause etc.)
    // This is true when the last message is assistant with pending tool_use blocks.
    let isResuming = false;

    // Check if last message is assistant with tool_use blocks that need results
    if (
      lastMessage?.role === "assistant" &&
      Array.isArray(lastMessage.content)
    ) {
      const toolUseBlocks = lastMessage.content.filter(
        (block): block is import("./types.js").ToolUseBlock =>
          block.type === "tool_use"
      );

      if (toolUseBlocks.length > 0) {
        isResuming = true;

        // Find __ask_user__ tool if present
        const askUserToolUse = toolUseBlocks.find(
          (block) => block.name === "__ask_user__"
        );

        // Build tool_results for all tool_use blocks
        const toolResults: import("./types.js").ToolResultBlock[] =
          toolUseBlocks.map((toolUse) => {
            if (toolUse.name === "__ask_user__") {
              // User's message is the answer to __ask_user__
              return {
                type: "tool_result" as const,
                tool_use_id: toolUse.id,
                content: JSON.stringify({
                  success: true,
                  data: { answer: message },
                }),
              };
            } else {
              // Other tools were interrupted - mark as cancelled
              return {
                type: "tool_result" as const,
                tool_use_id: toolUse.id,
                content: JSON.stringify({
                  success: false,
                  error: "Operation cancelled - execution was interrupted",
                }),
                is_error: true,
              };
            }
          });

        // If there was an __ask_user__, the user's message is already the answer
        // Otherwise, we need to include both the tool_results and the user message
        if (askUserToolUse) {
          messages.push({ role: "user", content: toolResults });
        } else {
          // Combine tool_results and user message in a single user message
          // (API doesn't allow consecutive user messages)
          messages.push({
            role: "user",
            content: [...toolResults, { type: "text" as const, text: message }],
          });
        }
      } else {
        // No tool_use blocks, normal user message
        messages.push({ role: "user", content: message });
      }
    } else {
      // Normal user message
      messages.push({ role: "user", content: message });
    }

    // Ensure workspace always exists (create default if not provided)
    const ws = workspace ?? new Workspace();
    await ws.init();

    // Capture existing plan content before cleanup (for prompt injection)
    const existingPlan = await ws.read<string>(PLAN_PATH);
    const hasExistingPlan = !!existingPlan && typeof existingPlan === "string";

    // Always delete old plan file — each run starts clean.
    // The content is already captured above for prompt injection.
    if (hasExistingPlan) {
      await ws.delete(PLAN_PATH);
    }

    // Configure shell read-only mode based on mode option
    const shell = ws.getShell();
    if (mode === "plan") {
      // Plan mode: read-only shell, only allow writing to the plan file
      shell.setReadOnly(true, [PLAN_FS_PATH]);
    } else {
      shell.setReadOnly(false);
    }

    // Create task manager for this run.
    // Only restore from workspace when resuming from a pause (e.g., __ask_user__) —
    // detected by pending tool_use blocks in the last history message.
    // On a normal run (even with conversation history), start with a clean task list.
    const taskManager = new TaskManager();
    if (isResuming) {
      await taskManager.restoreFromWorkspace(ws);
    } else {
      await ws.delete(".hive/tasks.json");
    }

    // Create tool context
    const toolContext: ToolContext = {
      remainingTokens: this.contextManager.getRemainingTokens(),
      conversationId,
      userId,
      workspace: ws,
    };

    // Create or use existing trace builder
    // If _traceBuilder is passed (from parent agent), use it
    // Otherwise create a new one if trace provider is configured
    const traceBuilder =
      options._traceBuilder ||
      (this.config.trace
        ? new TraceBuilder(
            this.config.agentName || "agent",
            this.config.trace,
            message // Pass input message to trace
          )
        : undefined);

    // Store trace builder for __sub_agent__ tool to access
    this.setCurrentTraceBuilder(traceBuilder);

    // Build system prompt based on mode
    let systemPrompt = this.config.systemPrompt;
    if (mode === "plan") {
      systemPrompt = PLAN_MODE_INSTRUCTIONS + systemPrompt;
    } else if (mode === "execute") {
      if (hasExistingPlan) {
        systemPrompt = systemPrompt + executeModeSection(existingPlan as string);
      }
    }

    // Inject workspace state snapshot so the AI knows what data exists
    // without needing to call explore first
    const workspaceItems = (await ws.list()).filter(
      (item) => !item.path.startsWith("/.hive/")
    );
    if (workspaceItems.length > 0) {
      const stateLines = workspaceItems.map(
        (item) => `- ${item.path}: ${item.preview}`
      );
      systemPrompt += `\n\n## Current Workspace State\n\nThe following data currently exists in workspace:\n\n${stateLines.join("\n")}\n\nUse the shell to read full contents (e.g. \`cat ${workspaceItems[0].path}\`). Do NOT recreate data that already exists — read and present it instead.`;
    }

    // Execute the agent loop
    const result = await executeLoop(
      {
        systemPrompt,
        tools: this.getRunTools(taskManager, ws, this.config.agentName, mode),
        llm: this.config.llm,
        logger: this.config.logger,
        maxIterations: this.config.maxIterations!,
        contextManager: this.contextManager,
        taskManager,
        llmOptions: {},
        signal,
        shouldContinue,
        traceBuilder,
      },
      messages,
      toolContext
    );

    // Save history to repository
    if (conversationId && this.config.repository) {
      await this.config.repository.saveHistory(conversationId, result.history);
    }

    // End trace and attach to result (only for root agent, not sub-agents)
    if (traceBuilder && !options._traceBuilder) {
      const status =
        result.status === "complete"
          ? "complete"
          : result.status === "interrupted"
          ? "interrupted"
          : "complete";
      result.trace = traceBuilder.endTrace(status, result.response);
    }

    // Record the run (only for root agent, not sub-agents)
    if (this.config.recorder && !options._traceBuilder) {
      try {
        await this.config.recorder.record(
          message,
          history,
          this.config,
          result
        );
      } catch (error) {
        this.config.logger?.warn("Failed to record run", error);
      }
    }

    return result;
  }
}
