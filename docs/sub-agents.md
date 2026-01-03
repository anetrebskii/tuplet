# Sub-Agents

Spawn specialized agents for complex tasks. Sub-agents have their own system prompts, tools, and can use different models.

## Basic Sub-Agent

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
  tools: [calculatorTool],
  agents: [researchAgent],
  llm: provider
})

// Agent can now use __task__ tool to delegate to researcher
const result = await agent.run('Research the latest AI developments')
```

## How It Works

1. Main agent decides to delegate using the `__task__` tool
2. Sub-agent runs with its own system prompt and tools
3. Sub-agent returns summary (and optionally structured data)
4. Main agent continues with the result

## Per-Agent Providers

Each sub-agent can use different models or providers:

```typescript
import { ClaudeProvider, OpenAIProvider } from '@alexnetrebskii/hive-agent'

const claudeProvider = new ClaudeProvider({ apiKey: '...' })
const openaiProvider = new OpenAIProvider({ apiKey: '...', model: 'gpt-4o' })

const fastAgent: SubAgentConfig = {
  name: 'fast_helper',
  description: 'Quick tasks using GPT-4o',
  systemPrompt: '...',
  tools: [...],
  llm: openaiProvider,  // Uses OpenAI instead of parent's Claude
  maxIterations: 5
}

const agent = new Hive({
  systemPrompt: '...',
  tools: [...],
  agents: [fastAgent],
  llm: claudeProvider  // Main agent uses Claude
})
```

## Structured Sub-Agents

Define input/output schemas for type-safe, cost-efficient sub-agent communication:

```typescript
import type { SubAgentConfig } from '@alexnetrebskii/hive-agent'

const nutritionAgent: SubAgentConfig = {
  name: 'nutrition_counter',
  description: 'Log food and calculate nutrition values',

  // Input schema - parent provides structured parameters
  inputSchema: {
    type: 'object',
    properties: {
      food: { type: 'string', description: 'Food item to log' },
      portionGrams: { type: 'number', description: 'Portion size in grams' },
      meal: { type: 'string', description: 'Meal type: breakfast, lunch, dinner, snack' }
    },
    required: ['food', 'portionGrams', 'meal']
  },

  // Output schema - sub-agent returns structured data via __output__ tool
  outputSchema: {
    type: 'object',
    properties: {
      logged: { type: 'boolean', description: 'Whether food was logged' },
      calories: { type: 'number', description: 'Total calories' },
      protein: { type: 'number', description: 'Protein in grams' }
    },
    required: ['logged', 'calories']
  },

  systemPrompt: `You log food nutrition. Use __output__ to return results.`,
  tools: [searchFoodTool, logMealTool]
}

const agent = new Hive({
  systemPrompt: 'You are a nutrition consultant.',
  tools: [],
  agents: [nutritionAgent],
  llm: provider
})
```

### Calling Structured Sub-Agents

Main agent calls sub-agent with structured input:

```
__task__({
  agent: "nutrition_counter",
  food: "pasta",
  portionGrams: 250,
  meal: "lunch"
})
```

Sub-agent returns structured output:

```json
{
  "summary": "Logged 250g pasta for lunch: 350 kcal",
  "data": {
    "logged": true,
    "calories": 350,
    "protein": 12
  }
}
```

### Benefits

- **Type safety**: Parameters and return values are validated
- **Cost efficiency**: No free-form prompt parsing needed
- **Reliability**: Structured data instead of text extraction
- **Composability**: Sub-agents become reusable functions

## Sub-Agent System Prompt

Write clear system prompts that tell the sub-agent:

1. What it does
2. What tools it has
3. How to return results

```typescript
const writerAgent: SubAgentConfig = {
  name: 'writer',
  description: 'Write articles and blog posts',
  systemPrompt: `You are a professional writer.

## Your Task
Write high-quality content based on the given topic and requirements.

## Available Tools
- search_web: Research the topic
- read_url: Read reference articles

## Output
When finished, use __output__ with:
- summary: Brief description of what you wrote
- data: { title: "...", content: "...", wordCount: N }`,

  inputSchema: {
    type: 'object',
    properties: {
      topic: { type: 'string' },
      style: { type: 'string', enum: ['formal', 'casual', 'technical'] },
      wordCount: { type: 'number' }
    },
    required: ['topic']
  },

  outputSchema: {
    type: 'object',
    properties: {
      title: { type: 'string' },
      content: { type: 'string' },
      wordCount: { type: 'number' }
    },
    required: ['title', 'content']
  },

  tools: [webSearchTool, readUrlTool]
}
```

## Shared Context

Sub-agents automatically receive the parent's context:

```typescript
const context = new Context()
context.write('user/preferences', { language: 'en', style: 'formal' })

const result = await agent.run('Write an article', { context })

// Sub-agent can read: context_read({ path: 'user/preferences' })
// Sub-agent can write: context_write({ path: 'draft/article.md', value: '...' })

// Parent can read sub-agent's output
const draft = context.read('draft/article.md')
```

## Configuration Options

```typescript
interface SubAgentConfig {
  name: string                  // Unique identifier
  description: string           // Shown to parent agent
  systemPrompt: string          // Sub-agent's instructions
  tools: Tool[]                 // Available tools

  model?: string                // Override model
  llm?: LLMProvider             // Override provider
  maxIterations?: number        // Override iteration limit

  inputSchema?: JSONSchema      // Structured input parameters
  outputSchema?: JSONSchema     // Structured output data
}
```

## Multi-Level Nesting

Sub-agents can have their own sub-agents:

```typescript
const editorAgent: SubAgentConfig = {
  name: 'editor',
  description: 'Edit and improve articles',
  systemPrompt: '...',
  tools: [grammarCheckTool]
}

const writerAgent: SubAgentConfig = {
  name: 'writer',
  description: 'Write articles with editing support',
  systemPrompt: '...',
  tools: [webSearchTool],
  // Writer can delegate to editor
}

// Main agent -> writer -> editor
const agent = new Hive({
  systemPrompt: '...',
  tools: [],
  agents: [writerAgent, editorAgent],
  llm: provider
})
```

## Best Practices

1. **Single responsibility**: Each sub-agent should do one thing well
2. **Clear descriptions**: Help the main agent choose the right sub-agent
3. **Use structured I/O**: Prefer schemas over free-form text
4. **Limit iterations**: Set reasonable `maxIterations` to prevent runaway
5. **Share context**: Use Context for data that spans agents
