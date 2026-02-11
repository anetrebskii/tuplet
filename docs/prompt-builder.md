# Prompt Builder

Fluent API for building system prompts. You can use plain strings — the framework automatically appends everything needed for sub-agents and built-in tools to work. However, prompt builders are recommended as they produce well-structured prompts following best practices (workspace discovery, question handling, tool documentation, etc.).

## MainAgentBuilder

For the main agent that orchestrates [sub-agents](./sub-agents.md):

```typescript
import { MainAgentBuilder } from '@alexnetrebskii/hive-agent'

const systemPrompt = new MainAgentBuilder()
  .role('the orchestrator of a nutrition consultant app')
  .agents([greeterAgent, nutritionAgent, plannerAgent])  // auto-extracts names and descriptions
  .tools([getDailyTotals, clearMealLog])                 // auto-extracts names and descriptions
  .addWorkspacePath('plan/current.json', 'Meal plans from planner')
  .addWorkspacePath('user/preferences.json', 'User preferences')
  .addRules([
    'Delegate first, never answer domain questions yourself',
    'Pass relevant context to sub-agents',
    'Use Russian if user speaks Russian'
  ])
  .addExample({
    userInput: 'I had chicken for lunch',
    action: 'Call nutrition_counter with { food: "chicken", meal: "lunch" }',
    result: 'Present logged calories to user'
  })
  .build()
```

### Available Methods

| Method | Purpose |
| ------ | ------- |
| `.role(string)` | Agent identity |
| `.description(string)` | Additional context about the role |
| `.agents(SubAgentConfig[])` | Available sub-agents (auto-extracted) |
| `.tools(Tool[])` | Direct tools (auto-extracted) |
| `.addWorkspacePath(path, description)` | Workspace paths the agent can use |
| `.addRule(string)` / `.addRules(string[])` | Behavioral rules |
| `.addExample(TaskExample)` / `.addExamples(...)` | Task flow examples |
| `.questionHandling(options)` | How to handle sub-agent questions |
| `.addSection(title, content)` | Custom prompt section |

## SubAgentBuilder

For specialized [sub-agents](./sub-agents.md) that perform specific tasks:

```typescript
import { SubAgentBuilder } from '@alexnetrebskii/hive-agent'

const systemPrompt = new SubAgentBuilder()
  .role('a Nutrition Counter assistant')
  .task('Log food the user ate.')
  .tools([searchFood, logMeal, getDailyTotals])
  .addWorkspacePath('meals/today.json', 'Today\'s logged meals')
  .addQuestionStep('Check Portion', {
    condition: 'If portionGrams is missing',
    question: 'What was the portion size?',
    options: ['Small (150g)', 'Medium (250g)', 'Large (350g)']
  })
  .addToolsStep('Search and Log', [
    { tool: searchFood, purpose: 'find nutrition data' },
    { tool: logMeal, purpose: 'log with scaled nutrition' }
  ])
  .outputSchema({
    type: 'object',
    properties: {
      logged: { type: 'boolean' },
      food: { type: 'string' },
      calories: { type: 'number' }
    },
    required: ['logged', 'food', 'calories']
  })
  .build()
```

### Methods

| Method | Purpose |
| ------ | ------- |
| `.role(string)` | Agent identity |
| `.task(string)` | What the agent should accomplish |
| `.tools(Tool[])` | Available tools (auto-extracted) |
| `.addWorkspacePath(path, description)` | Workspace paths to check |
| `.useWorkspace()` | Enable workspace discovery without specific paths |
| `.addQuestionStep(description, askQuestion)` | Step that conditionally asks the user |
| `.addToolsStep(description, toolRefs)` | Step using specific tools |
| `.addGuidelines(string[])` | Things to do |
| `.constraints(string[])` | Things to avoid |
| `.instructions(string[])` | Step-by-step instructions |
| `.outputSchema(JSONSchema)` | Structured output format |
| `.addExample(input, output, explanation?)` | Input/output examples |
| `.addSection(title, content)` | Custom prompt section |
