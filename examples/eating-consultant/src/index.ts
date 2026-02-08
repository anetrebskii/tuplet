/**
 * Eating Consultant - Demo Terminal App
 *
 * An AI-powered nutrition assistant using OpenFoodFacts API.
 * Main agent handles meals directly; delegates meal planning to a sub-agent.
 */

import 'dotenv/config'
import * as readline from 'readline'
import { Hive, ClaudeProvider, ConsoleLogger, ConsoleTraceProvider, Workspace, FileWorkspaceProvider, RunRecorder, MainAgentBuilder, SubAgentBuilder, type Message, type SubAgentConfig, type ProgressUpdate, type PendingQuestion, type EnhancedQuestion, type QuestionOption, type TaskUpdateNotification } from '@alexnetrebskii/hive-agent'
import { nutritionCounterTools } from './tools.js'

// Helper to get option label (works with both string and QuestionOption)
function getOptionLabel(opt: string | QuestionOption): string {
  return typeof opt === 'string' ? opt : opt.label
}

// Helper to get option description (only for QuestionOption)
function getOptionDescription(opt: string | QuestionOption): string | undefined {
  return typeof opt === 'object' ? opt.description : undefined
}

// Display a single enhanced question
function displayEnhancedQuestion(q: EnhancedQuestion, index: number): void {
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

// Collect answer for a single question using readline
async function collectAnswer(
  rl: readline.Interface,
  q: EnhancedQuestion
): Promise<string> {
  return new Promise((resolve) => {
    rl.question('Your choice: ', (input) => {
      const trimmed = input.trim()

      // If options exist, try to parse as number
      if (q.options && q.options.length > 0) {
        const index = parseInt(trimmed) - 1
        if (!isNaN(index) && index >= 0 && index < q.options.length) {
          // User entered a valid option number
          resolve(getOptionLabel(q.options[index]))
          return
        }
      }

      // Not a number or no options - use as custom text
      resolve(trimmed)
    })
  })
}

// Handle multi-question flow and return combined answer
async function handleMultiQuestion(
  rl: readline.Interface,
  questions: EnhancedQuestion[]
): Promise<string> {
  const answers: Record<string, string> = {}

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i]
    displayEnhancedQuestion(q, i)
    const answer = await collectAnswer(rl, q)
    const key = q.header || `q${i}`
    answers[key] = answer
  }

  return JSON.stringify(answers)
}

// Display pending question preview (actual collection happens in handleMultiQuestion)
function displayPendingQuestion(pq: PendingQuestion): void {
  console.log(`\nAssistant has ${pq.questions?.length || 1} question(s) for you:`)
}

// Progress display helper
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

  // Clear line and show progress
  process.stdout.write(`\r\x1b[K${symbol} ${update.message}`)

  // If it's an end event, add newline
  if (update.type === 'tool_end' || update.type === 'sub_agent_end') {
    const duration = update.details?.duration ? ` (${update.details.duration}ms)` : ''
    process.stdout.write(`${duration}\n`)
  }
}

// Task update display helper
function showTaskUpdate(update: TaskUpdateNotification): void {
  const agentLabel = update.agentName ? `[${update.agentName}]` : '[Main]'
  const actionEmoji = update.action === 'create' ? '📋' : update.action === 'delete' ? '🗑️' : '🔄'

  console.log(`\n${actionEmoji} ${agentLabel} Task ${update.action}:`)

  // Show progress
  const { completed, total, inProgress } = update.progress
  console.log(`   Progress: ${completed}/${total} completed${inProgress > 0 ? `, ${inProgress} in progress` : ''}`)

  // Show current task if any
  if (update.current) {
    const label = update.current.activeForm || update.current.subject
    console.log(`   Current: ${label}`)
  }

  // Show task list
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

// Create logger with progress support and tool debugging
function createProgressLogger() {
  const base = new ConsoleLogger({ level: 'warn', prefix: '[Eating]' })
  return {
    debug: base.debug.bind(base),
    info: base.info.bind(base),
    warn: base.warn.bind(base),
    error: base.error.bind(base),
    onProgress: showProgress,
    // Show task list updates in real-time
    onTaskUpdate: showTaskUpdate,
    // Show tool inputs and outputs for debugging
    onToolCall: (toolName: string, params: unknown) => {
      if (toolName.startsWith('workspace_')) {
        console.log(`\n📥 ${toolName} input:`, JSON.stringify(params, null, 2))
      }
    },
    onToolResult: (toolName: string, result: { success: boolean; data?: unknown; error?: string }) => {
      if (toolName.startsWith('workspace_')) {
        const status = result.success ? '✓' : '✗'
        console.log(`📤 ${toolName} ${status}:`, JSON.stringify(result, null, 2))
      }
    }
  }
}

// Define output schema for meal planner
const mealPlannerOutputSchema = {
  type: 'object' as const,
  properties: {
    plan: { type: 'object', description: 'The meal plan object with title, goal, dailyCalories, and days array' },
    summary: { type: 'string', description: 'Brief summary of the plan' }
  },
  required: ['plan', 'summary'] as string[]
}

// Build meal planner prompt using SubAgentBuilder
const mealPlannerPrompt = new SubAgentBuilder()
  .role('a meal planning specialist')
  .task('Gather requirements and create a detailed meal plan.')
  .addWorkspacePath('user/preferences.json', 'User preferences with goal and restrictions')
  .addWorkspacePath('meals/today.json', 'Today\'s nutrition totals')
  // Enable todo tracking - AI creates own plan
  .useTodoTracking({
    exampleSteps: [
      'Reading user preferences from workspace',
      'Asking user about calorie target',
      'Creating 5-day meal plan for weight loss',
      'Saving plan to workspace'
    ]
  })
  // Questions to ask if info is missing
  .addQuestionStep('Gather Goal', {
    condition: 'If goal is not in workspace and not provided',
    question: "What's your goal?",
    options: ['Weight loss', 'Muscle gain', 'Maintain weight', 'Eat healthier']
  })
  .addQuestionStep('Gather Daily Calories', {
    condition: 'If daily calories is not provided',
    question: "What's your daily calorie target?",
    options: ['1500 kcal', '1800 kcal', '2000 kcal', '2500 kcal']
  })
  .addQuestionStep('Gather Days', {
    condition: 'If days is not provided',
    question: 'How many days should I plan?',
    options: ['3 days', '5 days', '7 days']
  })
  // Guidelines for plan creation
  .addGuidelines([
    'Stay within ±100 calories of the daily target',
    'Include variety across days',
    'Balance macros appropriately for the goal'
  ])
  // Things to avoid
  .constraints([
    'Never suggest foods that conflict with dietary restrictions',
    'Do not repeat the same meal on consecutive days',
    'Avoid unrealistic portion sizes'
  ])
  // Example of expected output
  .addExample(
    'User wants 1800 kcal/day for weight loss, 3 days',
    '{ plan: { title: "3-Day Weight Loss Plan", dailyCalories: 1800, days: [...] }, summary: "Created 3-day plan..." }',
    'Each day totals ~1800 kcal with balanced macros'
  )
  .addSection('Plan Format', `Create a plan object:
{
  "title": "Plan name",
  "goal": "User's goal",
  "dailyCalories": number,
  "days": [{ "day": "Monday", "meals": { breakfast, lunch, dinner, snacks }, "totalCalories": N }]
}`)
  .outputSchema(mealPlannerOutputSchema)
  .build()

// Planner sub-agent - creates meal plans
const plannerAgent: SubAgentConfig = {
  name: 'meal_planner',
  description: 'Create detailed meal plans based on user goals and preferences',
  systemPrompt: mealPlannerPrompt,

  inputSchema: {
    type: 'object',
    properties: {
      goal: { type: 'string', description: 'User goal: weight_loss, muscle_gain, maintenance, healthy (agent will ask if not provided)' },
      dailyCalories: { type: 'number', description: 'Target daily calories (agent will ask if not provided)' },
      restrictions: { type: 'array', description: 'Dietary restrictions: vegetarian, vegan, gluten-free, dairy-free, etc.' },
      days: { type: 'number', description: 'Number of days to plan, 1-7 (agent will ask if not provided)' },
      language: { type: 'string', description: 'Language for the plan: "ru" for Russian, "en" for English' }
    },
    required: []
  },

  outputSchema: mealPlannerOutputSchema,

  tools: []
}

// Sub-agents for specialized tasks only
const subAgents = [plannerAgent]

// Build main agent prompt using MainAgentBuilder
const SYSTEM_PROMPT = new MainAgentBuilder()
  .role('a nutrition consultant')
  .description('You help users track meals, view nutrition progress, and plan their diet. You can search for food products in the OpenFoodFacts database, log meals with nutrition data, view daily nutrition totals, and clear the meal log. You delegate meal planning to a specialized sub-agent.')
  .agents(subAgents)
  .addWorkspacePath('plan/current.json', 'Meal plans from meal_planner')
  .addWorkspacePath('user/preferences.json', 'User preferences { goal, restrictions[] }')
  .addWorkspacePath('meals/today.json', 'Today\'s nutrition totals and logged meals')
  .addRules([
    'Search for foods and log meals directly to track what the user ate',
    'Delegate meal planning to the meal_planner sub-agent',
    'Present results in a friendly, encouraging way',
    'Use Russian if user speaks Russian'
  ])
  .build()

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    console.error('Error: ANTHROPIC_API_KEY environment variable is required')
    console.error('Create a .env file with: ANTHROPIC_API_KEY=your-key')
    process.exit(1)
  }

  const llmProvider = new ClaudeProvider({
    apiKey,
    model: 'claude-3-haiku-20240307',
    maxTokens: 2000
  })

  // Create workspace for agent communication with validation
  // FileWorkspaceProvider persists workspace data to disk across sessions
  const workspace = new Workspace({
    provider: new FileWorkspaceProvider('./workspace-data'),
    strict: false,  // Allow any path (set to true to restrict to defined paths only)
    paths: {
      // Meal plan with schema validation
      'plan/current.json': {
        validator: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            goal: { type: 'string' },
            dailyCalories: { type: 'number' },
            days: { type: 'array' }
          },
          required: ['title', 'days']
        }
      },

      // Daily totals with initial value
      'meals/today.json': {
        validator: {
          type: 'object',
          properties: {
            totalCalories: { type: 'number' },
            totalProtein: { type: 'number' },
            totalCarbs: { type: 'number' },
            totalFat: { type: 'number' },
            meals: { type: 'array' }
          }
        },
        value: { totalCalories: 0, totalProtein: 0, totalCarbs: 0, totalFat: 0, meals: [] }
      },

      // User preferences with schema
      'user/preferences.json': {
        validator: {
          type: 'object',
          properties: {
            goal: { type: 'string', enum: ['weight_loss', 'muscle_gain', 'maintenance', 'healthy'] },
            restrictions: { type: 'array' }
          }
        }
      },

      // Notes as markdown (format validation from extension)
      'notes/advice.md': null,

      // Analysis result as text (format validation from extension)
      'analysis/summary.txt': null
    }
  })

  // Load persisted workspace data from disk
  await workspace.init()

  // Create the main agent with sub-agent and run recorder
  const agent = new Hive({
    systemPrompt: SYSTEM_PROMPT,
    tools: nutritionCounterTools,
    agents: subAgents,
    llm: llmProvider,
    logger: createProgressLogger(),
    maxIterations: 15,
    trace: new ConsoleTraceProvider({ showCosts: true }),
    agentName: 'eating_consultant',
    recorder: new RunRecorder({ outputDir: './runs' })
  })

  let history: Message[] = []
  let currentController: AbortController | null = null
  let isProcessing = false

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  })

  // Setup ESC key handler for interruption during processing
  function setupEscHandler() {
    if (!process.stdin.isTTY) return

    process.stdin.setRawMode(true)
    process.stdin.resume()
    process.stdin.once('data', (key) => {
      // ESC key (27) or Ctrl+C (3)
      if (key[0] === 27) {
        if (currentController && isProcessing) {
          // Stop immediately to prevent re-registration
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
      // Continue listening if still processing
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
  console.log('  Eating Consultant - Powered by OpenFoodFacts')
  console.log('='.repeat(60))
  console.log('\nCommands: "quit" to exit, "clear" to reset')
  console.log('Press ESC to interrupt a running task')
  console.log('')

  // Get initial greeting
  try {
    isProcessing = true
    currentController = new AbortController()
    setupEscHandler()

    const greeting = await agent.run('Start the conversation with a greeting.', {
      history,
      signal: currentController.signal,
      workspace
    })

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
        console.log('\nGoodbye! Eat well!\n')
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
          workspace
        })

        stopEscHandler()
        isProcessing = false
        currentController = null

        // Handle interrupted status
        if (result.status === 'interrupted') {
          console.log(`\n⚠️  Task interrupted after ${result.interrupted?.iterationsCompleted} iterations`)
          // Keep partial history so user can continue or start fresh
          history = result.history
          console.log('(Partial work saved. Send a new message to continue or "clear" to reset)\n')
          prompt()
          return
        }

        history = result.history

        // Variable to track the final result to display
        let finalResult = result
        let currentResult = result

        // Handle question/answer loop until complete or interrupted
        while (currentResult.status === 'needs_input' && currentResult.pendingQuestion) {
          displayPendingQuestion(currentResult.pendingQuestion)

          // Collect all answers and auto-continue
          const combinedAnswer = await handleMultiQuestion(rl, currentResult.pendingQuestion!.questions)
          console.log('\n✅ Answers collected, continuing...\n')

          // Auto-continue with the collected answers
          isProcessing = true
          currentController = new AbortController()
          setupEscHandler()

          const continuedResult = await agent.run(combinedAnswer, {
            history: currentResult.history,
            signal: currentController.signal,
            workspace
          })

          stopEscHandler()
          isProcessing = false
          currentController = null

          // Update for next iteration or final display
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

        // Show tasks if any (from final result)
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

        // Check if a plan was saved to workspace
        const plan = await workspace.read<{ title?: string; goal?: string; dailyCalories?: number; days?: unknown[] }>('plan/current.json')
        if (plan) {
          console.log('\n📝 Plan saved to workspace:')
          console.log(`  Title: ${plan.title || 'Meal Plan'}`)
          if (plan.goal) {
            console.log(`  Goal: ${plan.goal}`)
          }
          if (plan.dailyCalories) {
            console.log(`  Daily calories: ${plan.dailyCalories} kcal`)
          }
          if (plan.days && Array.isArray(plan.days)) {
            console.log(`  Days planned: ${plan.days.length}`)
          }
        }

        // Show all workspace entries if any exist
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
