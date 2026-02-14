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

    // Your Role header if we have sub-agents (orchestrator pattern)
    if (allSubAgents.length > 0) {
      sections.push('')
      sections.push('## Your Role')
      sections.push('')
      if (builtInDefs.length > 0) {
        sections.push('1. **Explore first** - Use the `explore` sub-agent to check what data exists in workspace before handling a task')
        sections.push('2. **Formulate requirements** - Before planning or delegating, synthesize your findings into a structured brief:')
        sections.push('   - Context: current state and exploration findings')
        sections.push('   - Goal: what the user wants to achieve')
        sections.push('   - Affected areas: workspace paths and components involved')
        sections.push('   - Constraints: limitations and dependencies')
        sections.push('   - Success criteria: how to verify completion')
        sections.push('3. **Plan if needed** - For complex or multi-step tasks, pass the structured brief to the `plan` sub-agent')
        sections.push('4. **Delegate** - Call __sub_agent__ tool with a clear brief: what to accomplish, relevant context from exploration, and how to verify success')
        sections.push('5. **Present results** - After sub-agent completes, you MUST output a text message to the user')
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
      sections.push('These read-only agents are always available. You MUST use them:')
      sections.push('')
      sections.push('- **explore**: ALWAYS call this BEFORE handling any user request. It checks workspace data so you know what exists and what\'s missing. This is a mandatory first step — do not skip it.')
      sections.push('- **plan**: Call this before complex or multi-step tasks. Before calling, formulate a structured requirements brief (context, goal, affected areas, constraints, success criteria) from your exploration findings.')
      sections.push('')
      sections.push('Both agents are read-only — they cannot modify workspace data.')
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
      'Never use placeholders (e.g. <API_KEY>, YOUR_TOKEN, etc.) in commands or URLs. If a value is unknown, ask the user first using __ask_user__',
      'Prefer free public APIs and resources that require no authentication. If auth is needed and credentials are not in workspace, ask the user',
      'If a tool call fails, analyze the error and try a different approach instead of giving up',
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
