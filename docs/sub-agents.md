# Sub-Agents

Sub-agents let you split work across specialized agents, each with its own system prompt, tools, and optionally a different model. The main agent decides when to delegate — you just define the available sub-agents. Each sub-agent has access to all [built-in tools](./tools.md) automatically.

```typescript
import type { SubAgentConfig } from '@alexnetrebskii/hive-agent'

const researchAgent: SubAgentConfig = {
  name: 'researcher',
  description: 'Research topics in depth using web search',
  systemPrompt: 'You research topics thoroughly and summarize findings.',
  tools: [webSearchTool, readUrlTool]
}

const agent = new Hive({
  systemPrompt: 'You help users with various tasks.',
  agents: [researchAgent],
  llm: provider
})
```

## Structured I/O

Define input/output schemas so the sub-agent works like a typed function — the parent passes structured parameters and receives validated data back:

```typescript
const nutritionAgent: SubAgentConfig = {
  name: 'nutrition_counter',
  description: 'Log food and calculate nutrition values',
  systemPrompt: 'You log food nutrition. Use __output__ to return results.',
  tools: [searchFoodTool, logMealTool],

  inputSchema: {
    type: 'object',
    properties: {
      food: { type: 'string', description: 'Food item to log' },
      portionGrams: { type: 'number', description: 'Portion size in grams' },
      meal: { type: 'string', enum: ['breakfast', 'lunch', 'dinner', 'snack'] }
    },
    required: ['food', 'portionGrams', 'meal']
  },

  outputSchema: {
    type: 'object',
    properties: {
      logged: { type: 'boolean' },
      calories: { type: 'number' },
      protein: { type: 'number' }
    },
    required: ['logged', 'calories']
  }
}
```

## Per-Agent Providers

Each sub-agent can use a different model or provider:

```typescript
const fastAgent: SubAgentConfig = {
  name: 'fast_helper',
  description: 'Quick tasks using GPT-4o',
  systemPrompt: '...',
  tools: [...],
  llm: new OpenAIProvider({ apiKey: '...', model: 'gpt-4o' }),
  maxIterations: 5
}
```

## Configuration

```typescript
interface SubAgentConfig {
  name: string                  // Unique identifier
  description: string           // Shown to parent agent
  systemPrompt: string          // Sub-agent's instructions
  tools: Tool[]                 // Available tools

  llm?: LLMProvider             // Override provider
  maxIterations?: number        // Override iteration limit

  inputSchema?: JSONSchema      // Structured input parameters
  outputSchema?: JSONSchema     // Structured output data
}
```
