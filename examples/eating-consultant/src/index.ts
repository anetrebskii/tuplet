/**
 * Eating Consultant - Demo Terminal App
 *
 * An AI-powered nutrition assistant using OpenFoodFacts API.
 * Demonstrates sub-agent architecture with a Nutrition Counter agent.
 */

import 'dotenv/config'
import * as readline from 'readline'
import { Hive, ClaudeProvider, ConsoleLogger, ConsoleTraceProvider, Context, type Message, type SubAgentConfig, type ProgressUpdate, type PendingQuestion, type EnhancedQuestion, type QuestionOption } from '@alexnetrebskii/hive-agent'
import { nutritionCounterTools, mainAgentTools } from './tools.js'

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
  const multiNote = q.multiSelect ? ' (select multiple, comma-separated)' : ''
  console.log(`\n${header}${q.question}${multiNote}`)

  if (q.options && q.options.length > 0) {
    q.options.forEach((opt, i) => {
      const label = getOptionLabel(opt)
      const desc = getOptionDescription(opt)
      const descText = desc ? ` - ${desc}` : ''
      console.log(`  ${i + 1}. ${label}${descText}`)
    })
    // Always show "Other" option
    console.log(`  0. Other (type your own)`)
  }
}

// Collect answer for a single question using readline
async function collectAnswer(
  rl: readline.Interface,
  q: EnhancedQuestion
): Promise<string | string[]> {
  const promptText = q.multiSelect
    ? 'Your choices (e.g., 1,3 or 0 for other): '
    : 'Your choice (or 0 for other): '

  return new Promise((resolve) => {
    rl.question(promptText, async (input) => {
      const trimmed = input.trim()

      // If options exist, try to parse as numbers
      if (q.options && q.options.length > 0) {
        const parts = trimmed.split(',').map(s => s.trim())

        // Check if user selected "0" (Other)
        if (parts.includes('0') || parts[0] === '0') {
          // Prompt for custom input
          rl.question('Type your answer: ', (customInput) => {
            const custom = customInput.trim()
            if (q.multiSelect) {
              // For multiSelect, allow combining with other selections
              const otherParts = parts.filter(p => p !== '0')
              const indices = otherParts.map(s => parseInt(s) - 1)
              const validIndices = indices.filter(i => i >= 0 && i < q.options!.length)
              const selected = validIndices.map(i => getOptionLabel(q.options![i]))
              resolve([...selected, custom])
            } else {
              resolve(custom)
            }
          })
          return
        }

        const indices = parts.map(s => parseInt(s) - 1)
        const validIndices = indices.filter(i => i >= 0 && i < q.options!.length)

        if (validIndices.length > 0) {
          const selected = validIndices.map(i => getOptionLabel(q.options![i]))
          resolve(q.multiSelect ? selected : selected[0])
          return
        }
      }

      // No options or invalid input - treat as raw text
      resolve(q.multiSelect ? trimmed.split(',').map(s => s.trim()) : trimmed)
    })
  })
}

// Handle multi-question flow and return combined answer
async function handleMultiQuestion(
  rl: readline.Interface,
  questions: EnhancedQuestion[]
): Promise<string> {
  const answers: Record<string, string | string[]> = {}

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i]
    displayEnhancedQuestion(q, i)
    const answer = await collectAnswer(rl, q)
    const key = q.header || `q${i}`
    answers[key] = answer
  }

  return JSON.stringify(answers)
}

// Display pending question (supports both legacy and multi-question format)
function displayPendingQuestion(pq: PendingQuestion): 'legacy' | 'multi' {
  if (pq.questions && pq.questions.length > 0) {
    // Multi-question format - just show preview, actual collection happens separately
    console.log('\nAssistant has some questions for you:')
    return 'multi'
  } else if (pq.question) {
    // Legacy single question format
    console.log('\nAssistant:', pq.question)
    if (pq.options) {
      const rawOptions = pq.options
      let parsedOptions: string[] = []
      if (typeof rawOptions === 'string') {
        try {
          parsedOptions = JSON.parse(rawOptions)
        } catch {
          parsedOptions = [rawOptions]
        }
      } else if (Array.isArray(rawOptions)) {
        parsedOptions = rawOptions
      }
      if (parsedOptions.length > 0) {
        console.log('\nOptions:')
        parsedOptions.forEach((opt, i) => console.log(`  ${i + 1}. ${opt}`))
        console.log(`  0. Other (type your own)`)
      }
    }
    return 'legacy'
  }
  return 'legacy'
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

// Create logger with progress support
function createProgressLogger() {
  const base = new ConsoleLogger({ level: 'warn', prefix: '[Eating]' })
  return {
    debug: base.debug.bind(base),
    info: base.info.bind(base),
    warn: base.warn.bind(base),
    error: base.error.bind(base),
    onProgress: showProgress
  }
}

// Nutrition Counter sub-agent - specialized in food lookup and tracking
// Now using inputSchema and outputSchema for structured communication
const nutritionCounterAgent: SubAgentConfig = {
  name: 'nutrition_counter',
  description: `Specialized agent for logging food the user ate.`,

  // Structured input parameters - parent provides these, not free-form prompt
  inputSchema: {
    type: 'object',
    properties: {
      food: {
        type: 'string',
        description: 'Food item to log (e.g., "pasta", "chicken breast", "apple")'
      },
      portionGrams: {
        type: 'number',
        description: 'Portion size in grams'
      },
      meal: {
        type: 'string',
        description: 'Meal type: breakfast, lunch, dinner, or snack'
      }
    },
    required: ['food', 'portionGrams', 'meal']
  },

  // Structured output - what parent receives back
  outputSchema: {
    type: 'object',
    properties: {
      logged: {
        type: 'boolean',
        description: 'Whether the food was successfully logged'
      },
      food: {
        type: 'string',
        description: 'Name of the food that was logged'
      },
      calories: {
        type: 'number',
        description: 'Total calories for the portion'
      },
      protein: {
        type: 'number',
        description: 'Protein in grams'
      },
      carbs: {
        type: 'number',
        description: 'Carbs in grams'
      },
      fat: {
        type: 'number',
        description: 'Fat in grams'
      }
    },
    required: ['logged', 'food', 'calories']
  },

  systemPrompt: `You are a Nutrition Counter assistant. Your task:

1. You receive structured input with: food, portionGrams, meal
2. Search OpenFoodFacts for the food
3. Log the meal with accurate nutrition data
4. Return structured output using __output__ tool

## Workflow

1. Parse the input parameters (food, portionGrams, meal)
2. search_food(food) to find nutrition data
3. log_meal with the nutrition per 100g scaled to portion
4. Call __output__ with summary and structured data

## CRITICAL: Always use __output__ tool

When done, call __output__ with:
- summary: Brief message like "Logged 250g pasta for breakfast: 350 kcal"
- data: { logged: true, food: "...", calories: N, protein: N, carbs: N, fat: N }

If food not found, return:
- data: { logged: false, food: "...", calories: 0 }`,

  tools: nutritionCounterTools
}

const SYSTEM_PROMPT = `You are a friendly nutrition consultant powered by real food data from OpenFoodFacts.

## Your Capabilities

1. **Log Meals** - When users mention eating something, delegate to the nutrition_counter agent
2. **View Progress** - Show daily nutrition totals and meal breakdown
3. **Meal Planning** - Create weekly/daily meal plans using the todo list
4. **Give Advice** - Provide nutrition guidance based on their intake

## How to Help Users

### Logging meals
When a user says they ate something like "I had a chicken sandwich for lunch":

1. Extract the information:
   - food: "chicken sandwich"
   - portionGrams: estimate ~300g (or ask if unclear)
   - meal: "lunch"

2. Call nutrition_counter agent with structured parameters:
   { "agent": "nutrition_counter", "food": "chicken sandwich", "portionGrams": 300, "meal": "lunch" }

3. You'll receive structured output:
   { "summary": "Logged 300g chicken sandwich...", "data": { "logged": true, "calories": 450, ... } }

4. Summarize to user: "Recorded your chicken sandwich - 450 kcal"

### When information is missing
If the user says "I ate pasta" without portion/meal:
- Use __ask_user__ to ask: "How much pasta? (150g small, 250g medium, 350g large)"
- Then call nutrition_counter with complete parameters

### Meal Planning (use __todo__ and __ask_user__)
When a user asks for a meal plan like "Составь план питания на неделю":

1. FIRST ask clarifying questions using __ask_user__ with options:
   - "Какая у вас цель?" options: ["Похудение", "Набор массы", "Поддержание веса", "Здоровое питание"]
   - "Сколько калорий в день?" options: ["1500 ккал", "1800 ккал", "2000 ккал", "2500 ккал"]
   - "Есть ли ограничения?" options: ["Нет ограничений", "Без мяса", "Без молочных", "Без глютена"]

2. Create a todo list to track days:
   { "action": "set", "items": ["План на понедельник", "План на вторник", ...] }

3. CREATE THE FULL PLAN IN YOUR RESPONSE. For each day:
   - Think about balanced meals matching user's calorie goal
   - Include breakfast, lunch, dinner, and snacks
   - Calculate approximate calories for each meal
   - Mark each day complete as you write it

4. YOUR FINAL RESPONSE MUST CONTAIN THE ACTUAL MEAL PLAN:

   📅 **Понедельник** (~1800 ккал)
   🍳 Завтрак: Овсянка с ягодами и орехами (350 ккал)
   🍽️ Обед: Куриная грудка с рисом и овощами (500 ккал)
   🥗 Перекус: Яблоко и йогурт (150 ккал)
   🍲 Ужин: Рыба на пару с брокколи (400 ккал)

   📅 **Вторник** (~1800 ккал)
   ... и так далее для каждого дня

CRITICAL: You MUST write out the actual meals with calories. Do NOT just say "план готов" without the content!

5. SAVE THE PLAN TO CONTEXT using context_write:
   - Use path "plan/current.json" with the full plan data
   - The path has validation - must include title and days array
   - Example: context_write({ path: "plan/current.json", value: { title: "План питания на неделю", goal: "weight_loss", dailyCalories: 1800, days: [...] } })

### Viewing progress
When a user asks about their progress:
1. Use get_daily_totals to show their intake
2. Save summary to context: context_write({ path: "meals/today.json", value: { totalCalories, totalProtein, totalCarbs, totalFat, meals: [...] } })
3. Provide helpful commentary on their nutrition

### Saving user preferences
When user mentions dietary goals or restrictions:
- Save to context: context_write({ path: "user/preferences.json", value: { goal: "weight_loss", restrictions: ["vegetarian"] } })
- Valid goals: weight_loss, muscle_gain, maintenance, healthy

### Saving advice
When giving nutritional advice:
- Save important advice to: context_write({ path: "notes/advice.md", value: "## Recommendations\n- Eat more protein..." })

## Important Rules
- For complex tasks (meal planning, weekly plans), ALWAYS use __todo__ to track progress
- Ask clarifying questions BEFORE starting complex tasks
- Be encouraging and supportive

## Personality
- Warm and encouraging (use Russian if user speaks Russian)
- Data-driven but approachable
- Never judgmental about food choices

Start by greeting the user and asking what they've eaten today!`

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
    maxTokens: 2000,
    cache: true
  })

  // Create context for agent communication with validation
  const context = new Context({
    validators: {
      // Meal plan must be valid JSON with required structure
      'plan/current.json': {
        type: 'object',
        properties: {
          title: { type: 'string' },
          goal: { type: 'string' },
          dailyCalories: { type: 'number' },
          days: { type: 'array' }
        },
        required: ['title', 'days']
      },

      // Daily totals as JSON
      'meals/today.json': {
        type: 'object',
        properties: {
          totalCalories: { type: 'number' },
          totalProtein: { type: 'number' },
          totalCarbs: { type: 'number' },
          totalFat: { type: 'number' },
          meals: { type: 'array' }
        }
      },

      // User preferences as JSON
      'user/preferences.json': {
        type: 'object',
        properties: {
          goal: { type: 'string', enum: ['weight_loss', 'muscle_gain', 'maintenance', 'healthy'] },
          restrictions: { type: 'array' }
        }
      },

      // Notes as markdown
      'notes/advice.md': null,  // Just validates it's a string

      // Analysis result as text
      'analysis/summary.txt': null
    }
  })

  // Create the main agent with sub-agent
  const agent = new Hive({
    systemPrompt: SYSTEM_PROMPT,
    tools: mainAgentTools,
    agents: [nutritionCounterAgent],
    llm: llmProvider,
    logger: createProgressLogger(),
    maxIterations: 15,
    trace: new ConsoleTraceProvider({ showCosts: true }),
    agentName: 'eating_consultant'
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
      context
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
          context
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

        if (result.status === 'needs_input' && result.pendingQuestion) {
          const questionType = displayPendingQuestion(result.pendingQuestion)

          // For multi-question format, collect all answers and auto-continue
          if (questionType === 'multi' && result.pendingQuestion.questions) {
            const combinedAnswer = await handleMultiQuestion(rl, result.pendingQuestion.questions)
            console.log('\n✅ Answers collected, continuing...\n')

            // Auto-continue with the collected answers
            isProcessing = true
            currentController = new AbortController()
            setupEscHandler()

            const continuedResult = await agent.run(combinedAnswer, {
              history: result.history,
              signal: currentController.signal,
              context
            })

            stopEscHandler()
            isProcessing = false
            currentController = null

            // Use continued result for display
            finalResult = continuedResult
            history = continuedResult.history

            if (continuedResult.status === 'complete') {
              console.log('\nAssistant:', continuedResult.response)
            } else if (continuedResult.status === 'needs_input' && continuedResult.pendingQuestion) {
              // Show follow-up questions (legacy format will be handled by next prompt)
              displayPendingQuestion(continuedResult.pendingQuestion)
            } else if (continuedResult.status === 'interrupted') {
              console.log(`\n⚠️  Task interrupted after ${continuedResult.interrupted?.iterationsCompleted} iterations`)
            }
          }
          // Legacy format - user will answer via normal prompt (no response to show)
        } else {
          console.log('\nAssistant:', result.response)
        }

        // Show todos if any (from final result)
        if (finalResult.todos && finalResult.todos.length > 0) {
          console.log('\n📋 Tasks:')
          finalResult.todos.forEach(todo => {
            const icon = todo.status === 'completed' ? '✅' :
                         todo.status === 'in_progress' ? '🔄' : '⬜'
            console.log(`  ${icon} ${todo.content}`)
          })
        }

        // Show usage by model (from final result)
        if (finalResult.usageByModel && Object.keys(finalResult.usageByModel).length > 0) {
          console.log('\n📊 Usage by model:')
          for (const [modelId, modelUsage] of Object.entries(finalResult.usageByModel)) {
            let line = `  ${modelId}: ${modelUsage.inputTokens} in / ${modelUsage.outputTokens} out (${modelUsage.calls} calls)`
            if (modelUsage.cacheCreationInputTokens || modelUsage.cacheReadInputTokens) {
              const cacheWrite = modelUsage.cacheCreationInputTokens || 0
              const cacheRead = modelUsage.cacheReadInputTokens || 0
              line += ` [cache: +${cacheWrite}, ${cacheRead}]`
            }
            console.log(line)
          }
        } else if (finalResult.usage) {
          // Fallback to total usage if usageByModel not available
          let usage = `[${finalResult.usage.totalInputTokens} in / ${finalResult.usage.totalOutputTokens} out`
          if (finalResult.usage.cacheCreationInputTokens || finalResult.usage.cacheReadInputTokens) {
            const cacheWrite = finalResult.usage.cacheCreationInputTokens || 0
            const cacheRead = finalResult.usage.cacheReadInputTokens || 0
            usage += ` | cache: +${cacheWrite} write, ${cacheRead} read`
          }
          usage += ']'
          console.log(`\n${usage}`)
        }

        // Check if a plan was saved to context
        const plan = context.read<{ title?: string; goal?: string; dailyCalories?: number; days?: unknown[] }>('plan/current.json')
        if (plan) {
          console.log('\n📝 Plan saved to context:')
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

        // Show all context entries if any exist
        const contextItems = context.list()
        if (contextItems.length > 0) {
          console.log('\n📦 Context:')
          for (const item of contextItems) {
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
