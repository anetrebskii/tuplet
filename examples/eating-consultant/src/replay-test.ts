/**
 * Replay Test Example
 *
 * Runs recorded runs against the current agent to verify behavior.
 * Usage: npx tsx src/replay-test.ts
 */

import 'dotenv/config'
import { Tuplet, ClaudeProvider, RunTester, Workspace, type TestResult } from 'tuplet'
import { nutritionCounterTools, mainAgentTools } from './tools.js'

// System prompt (same as main app)
const SYSTEM_PROMPT = `You are a friendly nutrition consultant powered by real food data from OpenFoodFacts.

## Capabilities

1. **Log Meals** - Use nutrition_counter agent when users mention eating something
2. **View Progress** - Show daily nutrition totals with get_daily_totals
3. **Meal Planning** - Create meal plans, use todo list to track progress
4. **Give Advice** - Provide nutrition guidance based on intake

## Workspace Storage

Save important data to workspace:

- plan/current.json - Meal plans { title, goal, dailyCalories, days[] }
- meals/today.json - Today's nutrition { totalCalories, totalProtein, totalCarbs, totalFat, meals[] }
- user/preferences.json - User preferences { goal, restrictions[] }
- notes/advice.md - Nutritional recommendations (markdown)

Always save meal plans and user preferences to workspace.

## Workflow

### Logging meals
When user says "I had chicken for lunch":
1. Ask for portion if unclear (150g small, 250g medium, 350g large)
2. Call nutrition_counter with { food, portionGrams, meal }
3. Summarize: "Recorded chicken - 350 kcal"

### Meal planning
When user asks for a meal plan:
1. Ask clarifying questions: goal, daily calories, restrictions
2. Create todo list to track each day
3. Write out the full plan with meals and calories
4. Save plan to workspace

## Rules

- Ask clarifying questions before complex tasks
- Use todo list for multi-step tasks
- Be encouraging, never judgmental
- Use Russian if user speaks Russian

Start by greeting the user!`

// Nutrition Counter sub-agent config
const nutritionCounterAgent = {
  name: 'nutrition_counter',
  description: 'Specialized agent for logging food the user ate.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      food: { type: 'string', description: 'Food item to log' },
      portionGrams: { type: 'number', description: 'Portion size in grams' },
      meal: { type: 'string', description: 'Meal type' }
    },
    required: ['food', 'portionGrams', 'meal']
  },
  outputSchema: {
    type: 'object' as const,
    properties: {
      logged: { type: 'boolean', description: 'Whether logged' },
      food: { type: 'string', description: 'Food name' },
      calories: { type: 'number', description: 'Calories' },
      protein: { type: 'number', description: 'Protein' },
      carbs: { type: 'number', description: 'Carbs' },
      fat: { type: 'number', description: 'Fat' }
    },
    required: ['logged', 'food', 'calories']
  },
  systemPrompt: `You are a Nutrition Counter assistant. Your task:
1. You receive structured input with: food, portionGrams, meal
2. Search OpenFoodFacts for the food
3. Log the meal with accurate nutrition data
4. Return structured output using __output__ tool`,
  tools: nutritionCounterTools
}

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    console.error('Error: ANTHROPIC_API_KEY required')
    process.exit(1)
  }

  console.log('Running replay tests against recorded runs...\n')

  // Create agent with same config
  const llmProvider = new ClaudeProvider({
    apiKey,
    model: 'claude-3-haiku-20240307',
    maxTokens: 2000
  })

  const agent = new Tuplet({
    role: 'a nutrition consultant',
    _systemPrompt: SYSTEM_PROMPT,
    tools: mainAgentTools,
    agents: [nutritionCounterAgent],
    llm: llmProvider,
    maxIterations: 15,
    agentName: 'eating_consultant'
  })

  // Create tester
  const tester = new RunTester({
    runsDir: './runs',
    // Pass fresh workspace for each test
    beforeEach: () => {
      console.log('  Setting up test workspace...')
    },
    afterEach: (result: TestResult) => {
      console.log(`  Test ${result.runId}: ${result.passed ? 'PASS' : 'FAIL'} (${result.durationMs}ms)`)
    },
    runOptions: {
      workspace: new Workspace({ strict: false })
    }
  })

  // Run all tests
  const summary = await tester.runAll(agent)

  // Print summary
  RunTester.printSummary(summary)

  // Exit with error code if any tests failed
  if (summary.failed > 0) {
    process.exit(1)
  }
}

main().catch(console.error)
