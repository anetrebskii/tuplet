/**
 * Coder - Demo Terminal App
 *
 * An AI-powered software developer that creates projects from scratch.
 * Uses only built-in framework tools: shell (echo, mkdir, cat, ls, find, etc.),
 * explore/plan agents, workspace, and task tracking.
 */

import 'dotenv/config'
import * as readline from 'readline'
import {
  Hive,
  ClaudeProvider,
  OpenRouterProvider,
  ConsoleLogger,
  ConsoleTraceProvider,
  Workspace,
  FileWorkspaceProvider,
  MainAgentBuilder,
  MemoryEnvironmentProvider,
  type LLMProvider,
  type Message,
  type ProgressUpdate,
  type PendingQuestion,
  type EnhancedQuestion,
  type QuestionOption,
  type TaskUpdateNotification
} from '@alexnetrebskii/hive-agent'

// --- UI Helpers ---

function getOptionLabel(opt: string | QuestionOption): string {
  return typeof opt === 'string' ? opt : opt.label
}

function getOptionDescription(opt: string | QuestionOption): string | undefined {
  return typeof opt === 'object' ? opt.description : undefined
}

function displayEnhancedQuestion(q: EnhancedQuestion): void {
  const header = q.header ? `[${q.header}] ` : ''
  console.log(`\n${header}${q.question}`)

  if (q.options && q.options.length > 0) {
    q.options.forEach((opt, i) => {
      const label = getOptionLabel(opt)
      const desc = getOptionDescription(opt)
      const descText = desc ? ` - ${desc}` : ''
      console.log(`  ${i + 1}. ${label}${descText}`)
    })
    console.log(`  Or type your own answer`)
  }
}

async function collectAnswer(
  rl: readline.Interface,
  q: EnhancedQuestion
): Promise<string> {
  return new Promise((resolve) => {
    rl.question('Your choice: ', (input) => {
      const trimmed = input.trim()
      if (q.options && q.options.length > 0) {
        const index = parseInt(trimmed) - 1
        if (!isNaN(index) && index >= 0 && index < q.options.length) {
          resolve(getOptionLabel(q.options[index]))
          return
        }
      }
      resolve(trimmed)
    })
  })
}

async function handleMultiQuestion(
  rl: readline.Interface,
  questions: EnhancedQuestion[]
): Promise<string> {
  const answers: Record<string, string> = {}
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i]
    displayEnhancedQuestion(q)
    const answer = await collectAnswer(rl, q)
    const key = q.header || `q${i}`
    answers[key] = answer
  }
  return JSON.stringify(answers)
}

function displayPendingQuestion(pq: PendingQuestion): void {
  console.log(`\nAssistant has ${pq.questions?.length || 1} question(s) for you:`)
}

// --- Progress Display ---

function showProgress(update: ProgressUpdate): void {
  const symbols: Record<ProgressUpdate['type'], string> = {
    thinking: '🤔',
    tool_start: '🔧',
    tool_end: '✅',
    sub_agent_start: '🤖',
    sub_agent_end: '✅',
    status: 'ℹ️'
  }
  const symbol = symbols[update.type] || '•'

  process.stdout.write(`\r\x1b[K${symbol} ${update.message}`)

  if (update.type === 'tool_end' || update.type === 'sub_agent_end') {
    const duration = update.details?.duration ? ` (${update.details.duration}ms)` : ''
    process.stdout.write(`${duration}\n`)
  }
}

function showTaskUpdate(update: TaskUpdateNotification): void {
  const agentLabel = update.agentName ? `[${update.agentName}]` : '[Main]'
  const actionEmoji = update.action === 'create' ? '📋' : update.action === 'delete' ? '🗑️' : '🔄'

  console.log(`\n${actionEmoji} ${agentLabel} Task ${update.action}:`)

  const { completed, total, inProgress } = update.progress
  console.log(`   Progress: ${completed}/${total} completed${inProgress > 0 ? `, ${inProgress} in progress` : ''}`)

  if (update.current) {
    const label = update.current.activeForm || update.current.subject
    console.log(`   Current: ${label}`)
  }

  if (update.tasks.length > 0) {
    update.tasks.forEach(task => {
      const icon = task.status === 'completed' ? '✅' :
                   task.status === 'in_progress' ? '🔄' : '⬜'
      const owner = task.owner ? ` [@${task.owner}]` : ''
      const blocked = task.blockedBy?.length ? ` (blocked by: ${task.blockedBy.join(', ')})` : ''
      console.log(`   ${task.id}. ${icon} ${task.subject}${owner}${blocked}`)
    })
  }
  console.log('')
}

function createProgressLogger() {
  const base = new ConsoleLogger({ level: 'warn', prefix: '[Coder]' })
  return {
    debug: base.debug.bind(base),
    info: base.info.bind(base),
    warn: base.warn.bind(base),
    error: base.error.bind(base),
    onProgress: showProgress,
    onTaskUpdate: showTaskUpdate,
    onToolCall: (toolName: string, params: unknown) => {
      if (toolName === '__shell__') {
        console.log(`\n📥 shell:`, JSON.stringify(params, null, 2).slice(0, 500))
      }
    },
    onToolResult: (toolName: string, result: { success: boolean; data?: unknown; error?: string }) => {
      if (toolName === '__shell__') {
        const status = result.success ? '✓' : '✗'
        const preview = JSON.stringify(result.data || result.error, null, 2).slice(0, 300)
        console.log(`📤 shell ${status}: ${preview}`)
      }
    }
  }
}

// --- Main Agent (built-in tools only) ---

const SYSTEM_PROMPT = new MainAgentBuilder()
  .role('a senior software developer')
  .description(
    'You create software projects from scratch using shell commands. ' +
    'You write code files, create directory structures, and verify your work. ' +
    'Use the built-in shell tool for all file operations: ' +
    'mkdir to create directories, echo with > redirection to write files, ' +
    'cat to read files, ls and find to explore project structure, ' +
    'grep to search code. Use the explore agent to understand existing projects ' +
    'and the plan agent to design implementation before coding.'
  )
  .addWorkspacePath('project/config.json', 'Current project config: { name, language, framework, description }')
  .addWorkspacePath('project/plan.md', 'Implementation plan for the current project')
  .addRules([
    'Use the plan agent before starting any non-trivial project to design the structure',
    'Use the explore agent to understand existing code before making changes',
    'Create directories first with mkdir -p, then write files with echo "..." > path',
    'After writing files, verify them with cat to ensure correctness',
    'Use ls to show the final project structure to the user',
    'Ask the user about language, framework, and project name if not specified',
    'Save project configuration to workspace after creating a project',
    'Write clean, idiomatic code with proper error handling',
    'Always include a README.md with setup and run instructions',
    'Include a .gitignore appropriate for the project type'
  ])
  .build()

// --- Main App ---

async function main() {
  let llmProvider: LLMProvider

  if (process.env.OPENROUTER_API_KEY) {
    const model = process.env.OPENROUTER_MODEL || 'anthropic/claude-sonnet-4'
    llmProvider = new OpenRouterProvider({
      apiKey: process.env.OPENROUTER_API_KEY,
      model,
      maxTokens: 4096
    })
    console.log(`Using OpenRouter (${model})`)
  } else if (process.env.ANTHROPIC_API_KEY) {
    llmProvider = new ClaudeProvider({
      apiKey: process.env.ANTHROPIC_API_KEY,
      model: 'claude-3-haiku-20240307',
      maxTokens: 4096
    })
  } else {
    console.error('Error: OPENROUTER_API_KEY or ANTHROPIC_API_KEY environment variable is required')
    console.error('Create a .env file with: OPENROUTER_API_KEY=your-key  or  ANTHROPIC_API_KEY=your-key')
    process.exit(1)
  }

  // Workspace for agent state persistence
  const workspace = new Workspace({
    provider: new FileWorkspaceProvider('./workspace-data'),
    strict: false,
    paths: {
      'project/config.json': {
        validator: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            language: { type: 'string' },
            framework: { type: 'string' },
            description: { type: 'string' }
          }
        }
      },
      'project/plan.md': null
    }
  })

  await workspace.init()

  // Secure environment variables — secrets from process.env are passed to the shell
  // via EnvironmentProvider. The AI uses $JIRA_API_KEY etc. in commands, but values
  // never appear in conversation history.
  const envVars: Record<string, string> = {}
  if (process.env.JIRA_API_KEY) envVars.JIRA_API_KEY = process.env.JIRA_API_KEY
  if (process.env.JIRA_BASE_URL) envVars.JIRA_BASE_URL = process.env.JIRA_BASE_URL
  if (process.env.JIRA_EMAIL) envVars.JIRA_EMAIL = process.env.JIRA_EMAIL
  const envProvider = Object.keys(envVars).length > 0
    ? new MemoryEnvironmentProvider(envVars)
    : undefined

  if (envProvider) {
    console.log(`Environment: ${envProvider.keys().map((k: string) => '$' + k).join(', ')} available`)
  }

  // No custom tools or sub-agents — relies entirely on built-in:
  // shell (__shell__), explore, plan, ask_user, workspace, task tracking
  const agent = new Hive({
    systemPrompt: SYSTEM_PROMPT,
    tools: [],
    llm: llmProvider,
    logger: createProgressLogger(),
    maxIterations: 30,
    trace: new ConsoleTraceProvider({ showCosts: true }),
    agentName: 'coder'
  })

  let history: Message[] = []
  let currentController: AbortController | null = null
  let isProcessing = false

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  })

  // ESC key handler for interruption
  function setupEscHandler() {
    if (!process.stdin.isTTY) return

    process.stdin.setRawMode(true)
    process.stdin.resume()
    process.stdin.once('data', (key) => {
      if (key[0] === 27) {
        if (currentController && isProcessing) {
          isProcessing = false
          console.log('\n\n⛔ Interrupted by ESC')
          currentController.abort()
          currentController = null
          stopEscHandler()
          return
        }
      } else if (key[0] === 3) {
        console.log('\nGoodbye!\n')
        process.exit(0)
      }
      if (isProcessing) {
        setupEscHandler()
      }
    })
  }

  function stopEscHandler() {
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false)
    }
  }

  console.log('\n' + '='.repeat(60))
  console.log('  Coder - AI Software Developer')
  console.log('='.repeat(60))
  console.log('\nCommands: "quit" to exit, "clear" to reset conversation')
  console.log('Press ESC to interrupt a running task')
  console.log('')

  // Initial greeting
  try {
    isProcessing = true
    currentController = new AbortController()
    setupEscHandler()

    const greeting = await agent.run(
      'Greet the user briefly. You are a coding assistant that creates software projects. Mention you can create projects in any language/framework.',
      { history, signal: currentController.signal, workspace, env: envProvider }
    )

    stopEscHandler()
    isProcessing = false
    currentController = null
    history = greeting.history
    console.log('\nAssistant:', greeting.response, '\n')
  } catch (error) {
    stopEscHandler()
    isProcessing = false
    currentController = null
    console.error('Error:', error)
  }

  const prompt = () => {
    rl.question('You: ', async (input) => {
      const trimmed = input.trim()

      if (!trimmed) {
        prompt()
        return
      }

      if (trimmed.toLowerCase() === 'quit') {
        console.log('\nGoodbye! Happy coding!\n')
        rl.close()
        process.exit(0)
      }

      if (trimmed.toLowerCase() === 'clear') {
        history = []
        console.log('\n--- Conversation cleared ---\n')
        prompt()
        return
      }

      try {
        isProcessing = true
        currentController = new AbortController()
        setupEscHandler()

        const result = await agent.run(trimmed, {
          history,
          signal: currentController.signal,
          workspace,
          env: envProvider
        })

        stopEscHandler()
        isProcessing = false
        currentController = null

        if (result.status === 'interrupted') {
          console.log(`\n⚠️  Task interrupted after ${result.interrupted?.iterationsCompleted} iterations`)
          history = result.history
          console.log('(Partial work saved. Send a new message to continue or "clear" to reset)\n')
          prompt()
          return
        }

        history = result.history

        let finalResult = result
        let currentResult = result

        // Handle question/answer loop
        while (currentResult.status === 'needs_input' && currentResult.pendingQuestion) {
          displayPendingQuestion(currentResult.pendingQuestion)

          const combinedAnswer = await handleMultiQuestion(rl, currentResult.pendingQuestion!.questions)
          console.log('\n✅ Answers collected, continuing...\n')

          isProcessing = true
          currentController = new AbortController()
          setupEscHandler()

          const continuedResult = await agent.run(combinedAnswer, {
            history: currentResult.history,
            signal: currentController.signal,
            workspace,
            env: envProvider
          })

          stopEscHandler()
          isProcessing = false
          currentController = null

          currentResult = continuedResult
          finalResult = continuedResult
          history = continuedResult.history
        }

        // Show final result
        if (currentResult.status === 'complete') {
          console.log('\nAssistant:', currentResult.response)
        } else if (currentResult.status === 'interrupted') {
          console.log(`\n⚠️  Task interrupted after ${currentResult.interrupted?.iterationsCompleted} iterations`)
        }

        // Show tasks if any
        if (finalResult.tasks && finalResult.tasks.length > 0) {
          console.log('\n📋 Tasks:')
          finalResult.tasks.forEach(task => {
            const icon = task.status === 'completed' ? '✅' :
                         task.status === 'in_progress' ? '🔄' : '⬜'
            const blocked = task.blockedBy?.length ? ` (blocked by: ${task.blockedBy.join(', ')})` : ''
            console.log(`  ${task.id}. ${icon} ${task.subject}${blocked}`)
          })
        }

        // Show usage from trace
        if (finalResult.trace) {
          const trace = finalResult.trace
          console.log('\n📊 Usage:')
          console.log(`  Total: ${trace.totalInputTokens} in / ${trace.totalOutputTokens} out`)
          if (trace.totalCost > 0) {
            console.log(`  Cost: $${trace.totalCost.toFixed(4)}`)
          }
          if (trace.costByModel && Object.keys(trace.costByModel).length > 0) {
            for (const modelId of Object.keys(trace.costByModel)) {
              const usage = trace.costByModel[modelId]
              console.log(`  ${modelId}: ${usage.inputTokens} in / ${usage.outputTokens} out (${usage.calls} calls)`)
            }
          }
        }

        // Show workspace entries
        const workspaceItems = await workspace.list()
        if (workspaceItems.length > 0) {
          console.log('\n📦 Workspace:')
          for (const item of workspaceItems) {
            console.log(`  ${item.path}: ${item.preview}`)
          }
        }

        console.log('')
      } catch (error) {
        stopEscHandler()
        isProcessing = false
        currentController = null
        console.error('Error:', error instanceof Error ? error.message : error)
        console.log('')
      }

      prompt()
    })
  }

  prompt()
}

main().catch(console.error)
