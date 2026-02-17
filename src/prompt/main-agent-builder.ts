/**
 * Main Agent Prompt Builder
 *
 * Fluent API for building main agent system prompts.
 */

import type {
  WorkspacePathDef,
  TaskExample,
  MainAgentPromptConfig
} from './types.js'
import type { Tool, SubAgentConfig } from '../types.js'
import { getBuiltInAgents } from '../built-in-agents/index.js'
import {
  roleSection,
  subAgentsTable,
  subAgentParametersSection,
  questionHandlingSection,
  directToolsSection,
  workspaceStorageSection,
  rulesSection,
  taskExamplesSection
} from './templates.js'

export class MainAgentBuilder {
  private config: MainAgentPromptConfig = {
    subAgents: [],
    directTools: [],
    workspacePaths: [],
    rules: [],
    examples: [],
    customSections: []
  }

  private _skipBuiltInAgents = false

  /**
   * Skip auto-injecting built-in agents (used when Hive already merges them)
   */
  skipBuiltInAgents(): this {
    this._skipBuiltInAgents = true
    return this
  }

  /**
   * Set the agent's role identity
   */
  role(role: string): this {
    this.config.role = role
    return this
  }

  /**
   * Set the agent's description
   */
  description(description: string): this {
    this.config.description = description
    return this
  }

  /**
   * Set sub-agents from actual SubAgentConfig objects
   * Extracts name, description, and input parameters automatically
   */
  agents(configs: SubAgentConfig[]): this {
    for (const config of configs) {
      // Extract input parameters from inputSchema
      const inputParams: Array<{ name: string; description: string; required: boolean }> = []
      if (config.inputSchema?.properties) {
        const required = config.inputSchema.required || []
        for (const [name, prop] of Object.entries(config.inputSchema.properties)) {
          inputParams.push({
            name,
            description: (prop as { description?: string }).description || '',
            required: required.includes(name)
          })
        }
      }

      this.config.subAgents!.push({
        name: config.name,
        purpose: config.description,
        whenToUse: config.description,
        inputParams: inputParams.length > 0 ? inputParams : undefined
      })
    }
    return this
  }

  /**
   * Configure question handling behavior
   */
  questionHandling(options: {
    description?: string
    exampleFlow?: string[]
  }): this {
    this.config.questionHandling = options
    return this
  }

  /**
   * Set tools from actual Tool objects
   * Extracts name and description automatically
   */
  tools(toolObjects: Tool[]): this {
    for (const tool of toolObjects) {
      // Extract first line of description for brevity
      const desc = tool.description.split('\n')[0].trim()
      this.config.directTools!.push({
        name: tool.name,
        description: desc
      })
    }
    return this
  }

  /**
   * Add a workspace path definition
   */
  addWorkspacePath(path: string, description: string): this {
    this.config.workspacePaths!.push({ path, description })
    return this
  }

  /**
   * Add multiple workspace paths at once
   */
  addWorkspacePaths(paths: WorkspacePathDef[]): this {
    this.config.workspacePaths!.push(...paths)
    return this
  }

  /**
   * Add a behavioral rule
   */
  addRule(rule: string): this {
    this.config.rules!.push(rule)
    return this
  }

  /**
   * Add multiple rules at once
   */
  addRules(rules: string[]): this {
    this.config.rules!.push(...rules)
    return this
  }

  /**
   * Add a task example showing the flow
   */
  addExample(example: TaskExample): this {
    this.config.examples!.push(example)
    return this
  }

  /**
   * Add multiple examples at once
   */
  addExamples(examples: TaskExample[]): this {
    this.config.examples!.push(...examples)
    return this
  }

  /**
   * Add a custom section with title and content
   */
  addSection(title: string, content: string): this {
    this.config.customSections!.push({ title, content })
    return this
  }

  /**
   * Get the current configuration
   */
  getConfig(): MainAgentPromptConfig {
    return { ...this.config }
  }

  /**
   * Build the final system prompt string
   */
  build(): string {
    const sections: string[] = []

    // Auto-inject built-in agent defs (unless skipBuiltInAgents or user already added same name)
    let builtInDefs: Array<{ name: string; purpose: string; whenToUse: string }> = []
    if (!this._skipBuiltInAgents) {
      const userAgentNames = new Set((this.config.subAgents || []).map(a => a.name))
      const builtInAgents = getBuiltInAgents()
      const newBuiltIns = builtInAgents.filter(a => !userAgentNames.has(a.name))
      builtInDefs = newBuiltIns.map(a => ({
        name: a.name,
        purpose: a.description,
        whenToUse: a.description,
      }))
    } else {
      // When called from Hive, built-ins are already merged into subAgents.
      // Detect which ones are built-in by checking against getBuiltInAgents().
      const builtInNames = new Set(getBuiltInAgents().map(a => a.name))
      builtInDefs = (this.config.subAgents || [])
        .filter(a => builtInNames.has(a.name))
        .map(a => ({ name: a.name, purpose: a.purpose, whenToUse: a.whenToUse }))
    }
    const allSubAgents = [...(this.config.subAgents || []), ...(this._skipBuiltInAgents ? [] : builtInDefs)]

    // Role section (required, with default)
    const role = this.config.role || 'an AI assistant'
    sections.push(roleSection(role, this.config.description))

    // Current date
    const today = new Date().toISOString().split('T')[0]
    sections.push('')
    sections.push(`Today's date is ${today}.`)

    // Your Role header if we have sub-agents (orchestrator pattern)
    if (allSubAgents.length > 0) {
      sections.push('')
      sections.push('## Your Role')
      sections.push('')
      if (builtInDefs.length > 0) {
        sections.push('1. **Explore first** - Use the `explore` sub-agent to check workspace state. You are a lead — give it a SPECIFIC brief: what paths to check, what data to look for, what keywords to search. Example: "List top-level paths with `ls`, then check if `data/` has any funding-related JSON files." Do NOT send vague instructions like "explore everything"')
        sections.push('2. **Clarify if needed** - If the request is vague or ambiguous, ask the user using __ask_user__ BEFORE doing work. Examples of things to clarify: what "small" means, where to save results, what format, what criteria to use, what sources to prefer')
        sections.push('3. **Formulate requirements** - Before planning or delegating, synthesize your findings into a structured brief:')
        sections.push('   - Context: current state and exploration findings')
        sections.push('   - Goal: what the user wants to achieve')
        sections.push('   - Affected areas: workspace paths and components involved')
        sections.push('   - Constraints: limitations and dependencies')
        sections.push('   - Success criteria: how to verify completion')
        sections.push('4. **Plan** - For any task that involves multiple steps (searching, processing, saving), pass the structured brief to the `plan` sub-agent. Do NOT skip planning and jump straight into execution')
        sections.push('5. **Create tasks from the plan** - After receiving the plan, create one task per plan step using TaskCreate. Each task should match a plan step: clear goal, relevant context, and expected outcome. This is MANDATORY for multi-step plans — do not skip task creation and jump straight to execution')
        sections.push('6. **Execute** — Work through tasks in order. For each task: mark it in_progress, delegate to the `worker` sub-agent, then mark it completed. Delegate like a team lead assigns work to a developer — give the goal, relevant context, requirements, and constraints. Do NOT micromanage — the worker decides HOW to accomplish the goal')
        sections.push('7. **Verify** — Use the `explore` sub-agent to verify results (read saved files, check data quality)')
        sections.push('8. **Present results** - After ALL tasks are completed, output a clear summary to the user')
      } else {
        sections.push('1. **Delegate** - Call __sub_agent__ tool to spawn sub-agents')
        sections.push('2. **Present results** - After sub-agent completes, you MUST output a text message to the user')
      }
      sections.push('')
      sections.push('⚠️ CRITICAL:')
      sections.push('- Make actual tool calls, never write tool names as text')
      sections.push('- After receiving tool results, ALWAYS respond with a text message to the user')
      sections.push('- Never return an empty response')
    }

    // Sub-agents table
    if (allSubAgents.length > 0) {
      sections.push('')
      sections.push(subAgentsTable(allSubAgents))

      // Add sub-agent parameters documentation
      const paramsSection = subAgentParametersSection(allSubAgents)
      if (paramsSection) {
        sections.push('')
        sections.push(paramsSection)
      }
    }

    // Built-in agents usage instructions (always present)
    if (builtInDefs.length > 0) {
      sections.push('')
      sections.push('## Built-in Agents — Mandatory Usage')
      sections.push('')
      sections.push('These agents are always available. You MUST use them:')
      sections.push('')
      sections.push('- **explore**: ALWAYS call this BEFORE handling any user request. Give it a focused brief — tell it exactly what to look for and where. It should only read files that are relevant to the task, not explore the entire workspace.')
      sections.push('- **plan**: Pure planner — does NOT explore or execute. Call this AFTER exploring, BEFORE executing. Feed it your exploration findings as a structured brief (context, goal, constraints, success criteria) and it returns a step-by-step execution plan where each step is a worker mission.')
      sections.push('- **worker**: The ONLY way to execute actions. Delegate like a team lead to a developer — describe WHAT needs to be done and WHY, provide relevant context (paths, URLs, data formats), state requirements and constraints, but let the worker figure out the implementation details. Include hints only when you have specific domain knowledge that would save time. Examples: "We need to extract company data from this page (URL). Save each company with name, url, and description to the workspace at data/companies.json" or "Push these companies to the CRM API (endpoint: X, auth token is in env). Map our name field to their company_name field."')
      sections.push('')
      sections.push('The `explore` and `plan` agents are read-only. The `worker` agent has full read-write access.')
    }

    // Question handling (only when explicitly configured)
    if (this.config.questionHandling) {
      sections.push('')
      sections.push(questionHandlingSection(
        this.config.questionHandling?.description,
        this.config.questionHandling?.exampleFlow
      ))
    }

    // Direct tools
    if (this.config.directTools && this.config.directTools.length > 0) {
      sections.push('')
      sections.push(directToolsSection(this.config.directTools))
    }

    // Workspace storage
    if (this.config.workspacePaths && this.config.workspacePaths.length > 0) {
      sections.push('')
      sections.push(workspaceStorageSection(this.config.workspacePaths))
    }

    // Task examples
    if (this.config.examples && this.config.examples.length > 0) {
      sections.push('')
      sections.push(taskExamplesSection(this.config.examples))
    }

    // Custom sections
    for (const section of this.config.customSections || []) {
      sections.push('')
      sections.push(`## ${section.title}`)
      sections.push('')
      sections.push(section.content)
    }

    // Rules (always at the end): combine default rules with user rules
    const defaultRules = [
      'ALWAYS call the `explore` sub-agent at the start of each user request to check workspace state before doing anything else',
      'ALWAYS use the `plan` sub-agent before executing any multi-step task. After receiving the plan, create one task per plan step using TaskCreate BEFORE starting execution. Never jump straight from planning to execution without creating tasks first',
      'For vague or ambiguous requests, ask the user to clarify BEFORE starting work. Use __ask_user__ to confirm key details: criteria, format, where to save, what sources to use. Do not guess — ask',
      'NEVER assume credentials, API keys, or secrets exist. Before any authenticated API call, first check what variables and credentials are actually available in the workspace. If they are not there, ask the user using __ask_user__ — do not guess or fabricate values',
      'Prefer free public APIs and resources that require no authentication. If auth is needed and credentials are not in workspace, ask the user',
      'If a tool call fails, read the response carefully and decide how to proceed. Do not blindly retry the same approach',
      'After completing work, verify results by reading back saved data. Present a summary to the user',
    ]
    const allRules = [...defaultRules, ...(this.config.rules || [])]
    sections.push('')
    sections.push(rulesSection(allRules))

    return sections.join('\n')
  }

  /**
   * Reset the builder to initial state
   */
  reset(): this {
    this.config = {
      subAgents: [],
      directTools: [],
      workspacePaths: [],
      rules: [],
      examples: [],
      customSections: []
    }
    return this
  }
}
