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
import type { SkillConfig } from '../types.js'
import {
  roleSection,
  subAgentsTable,
  subAgentParametersSection,
  skillsSection,
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
   * Skip auto-injecting built-in agents (used when Tuplet already merges them)
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
   * Set skills from SkillConfig objects.
   * Only model-invocable skills are included in the prompt listing.
   */
  skills(configs: SkillConfig[]): this {
    const visible = configs.filter(s => !s.disableModelInvocation)
    this.config.skills = visible.map(s => ({
      name: s.name,
      description: s.description,
      whenToUse: s.whenToUse,
    }))
    return this
  }

  /**
   * Add a workspace path definition
   */
  addWorkspacePath(path: string, description: string, schema?: Record<string, unknown>): this {
    this.config.workspacePaths!.push({ path, description, schema })
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
   * Enable strict workspace mode in the prompt.
   * Tells AI that only defined paths are allowed and shows schemas.
   */
  setWorkspaceStrict(strict = true): this {
    this.config.workspaceStrict = strict
    return this
  }

  /**
   * Suppress all prompt guidance that references the __ask_user__ tool.
   * Use when the tool is not registered (disableAskUser on the Tuplet config).
   */
  setDisableAskUser(disabled = true): this {
    this.config.disableAskUser = disabled
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
   * Build orchestration instructions for built-in agents (lazy-loaded on first __sub_agent__ call).
   * Returns null if no built-in agents are present.
   */
  buildOrchestrationPrompt(): string | null {
    const builtInNames = new Set(getBuiltInAgents().map(a => a.name))
    const builtInDefs = (this.config.subAgents || [])
      .filter(a => builtInNames.has(a.name))
    if (builtInDefs.length === 0) return null

    const lines: string[] = []

    lines.push('## Orchestration Workflow')
    lines.push('')
    lines.push('Follow this workflow when delegating to sub-agents:')
    lines.push('')
    lines.push('1. **Explore first** - Use the `explore` sub-agent to check workspace state. Give it a SPECIFIC brief: what paths to check, what data to look for. Do NOT send vague instructions like "explore everything"')
    if (!this.config.disableAskUser) {
      lines.push('2. **Clarify if needed** - If the request is vague or ambiguous, ask the user using __ask_user__ BEFORE doing work')
    }
    lines.push('3. **Formulate requirements** - Synthesize findings into: Context, Goal, Affected areas, Constraints, Success criteria')
    lines.push('4. **Plan** - For multi-step tasks, pass the structured brief to the `plan` sub-agent')
    lines.push('5. **Create tasks** - After receiving the plan, create one task per step using TaskCreate')
    lines.push('6. **Execute** - Work through tasks in order, delegating to the `worker` sub-agent')
    lines.push('7. **Verify** - Use `explore` to verify results')
    lines.push('8. **Present results** - After ALL tasks are completed, output a clear summary')
    lines.push('')
    lines.push('## Agent Details')
    lines.push('')
    lines.push('- **explore**: Read-only. ALWAYS call BEFORE handling any user request. Give it a focused brief.')
    lines.push('- **plan**: Read-only. Pure planner. Call AFTER exploring, BEFORE executing. Feed it exploration findings as a structured brief.')
    lines.push('- **worker**: Read-write. The ONLY way to execute actions. Delegate like a team lead to a developer — describe WHAT and WHY, let the worker figure out HOW.')
    lines.push('')
    lines.push('## Orchestration Rules')
    lines.push('')
    lines.push('- ALWAYS explore workspace state before doing anything else')
    lines.push('- ALWAYS plan before executing multi-step tasks')
    if (!this.config.disableAskUser) {
      lines.push('- NEVER assume credentials exist — check workspace first, then ask user')
    }
    lines.push('- If a tool call fails, read the response and adapt — do not blindly retry')
    lines.push('- After completing work, verify results by reading back saved data')

    return lines.join('\n')
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
      // When called from Tuplet, built-ins are already merged into subAgents.
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

    // Sub-agents: compact listing in system prompt, full orchestration loaded on first use
    if (allSubAgents.length > 0) {
      sections.push('')
      sections.push('## Available Sub-Agents')
      sections.push('')
      sections.push('Use the `__sub_agent__` tool to delegate tasks. Full orchestration instructions are loaded automatically on first use.')
      sections.push('')
      for (const agent of allSubAgents) {
        sections.push(`- **${agent.name}** - ${agent.purpose}`)
      }

      // Add sub-agent parameters documentation (only for user-defined agents with params)
      const userAgents = (this.config.subAgents || []).filter(a => !new Set(getBuiltInAgents().map(b => b.name)).has(a.name))
      const paramsSection = subAgentParametersSection(userAgents)
      if (paramsSection) {
        sections.push('')
        sections.push(paramsSection)
      }

      sections.push('')
      sections.push('Make actual tool calls, never write tool names as text. After receiving tool results, ALWAYS respond with a text message to the user.')
    }

    // Skills listing
    if (this.config.skills && this.config.skills.length > 0) {
      sections.push('')
      sections.push(skillsSection(this.config.skills))
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
      sections.push(workspaceStorageSection({
        paths: this.config.workspacePaths,
        strict: this.config.workspaceStrict
      }))
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
      ...(this.config.disableAskUser
        ? []
        : ['For vague or ambiguous requests, ask the user to clarify BEFORE starting work. Use __ask_user__ to confirm key details']),
      'If a tool call fails, read the response carefully and decide how to proceed. Do not blindly retry the same approach',
      'After completing work, present a summary to the user',
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
