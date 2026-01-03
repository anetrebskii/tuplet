# Context - Shared Data for Agents

Context is a virtual filesystem that enables tools and sub-agents to share data without passing content through return values. Similar to how Claude Code uses the actual filesystem for agent coordination.

## Why Context?

Sub-agents often generate data that the parent agent or user needs to access:
- Generated plans, reports, or analysis
- User preferences collected during conversation
- Intermediate results from multi-step workflows

Instead of relying on text responses (which can be lost or truncated), Context provides a structured way to store and retrieve data.

## Quick Start

```typescript
import { Hive, ClaudeProvider, Context } from '@alexnetrebskii/hive-agent'

// Create context with optional validators
const context = new Context({
  validators: {
    'plan/current.json': {
      type: 'object',
      properties: {
        title: { type: 'string' },
        days: { type: 'array' }
      },
      required: ['title', 'days']
    }
  }
})

// Pre-populate data before run
context.write('user/name', 'Alex')

const agent = new Hive({
  systemPrompt: '...',
  tools: [...],
  llm: new ClaudeProvider({ apiKey: '...' })
})

// Pass context to agent
const result = await agent.run('Create a meal plan', { context })

// Read data written by agent
const plan = context.read('plan/current.json')
console.log(plan)
```

## Context API

### Writing Data

```typescript
const context = new Context()

// Simple write
context.write('user/preferences', { theme: 'dark', language: 'en' })

// Write with author tracking
context.write('meals/today', [...meals], 'nutrition_agent')

// Check write result (for validated paths)
const result = context.write('plan/current.json', invalidData)
if (!result.success) {
  console.log('Validation errors:', result.errors)
}
```

### Reading Data

```typescript
// Read with type hint
const prefs = context.read<{ theme: string }>('user/preferences')

// Check if exists
if (context.has('plan/current.json')) {
  const plan = context.read('plan/current.json')
}

// Get full entry with metadata
const entry = context.getEntry('meals/today')
console.log(entry?.writtenBy)  // 'nutrition_agent'
console.log(entry?.updatedAt)  // timestamp
```

### Listing and Searching

```typescript
// List all paths
const all = context.list()
// [{ path: 'user/preferences', preview: '{theme, language}', updatedAt: ... }]

// List with prefix filter
const meals = context.list('meals/')
// [{ path: 'meals/today', ... }, { path: 'meals/yesterday', ... }]

// Get just keys
const keys = context.keys('user/')
// ['user/name', 'user/preferences']
```

### Other Operations

```typescript
// Delete
context.delete('temp/scratch')

// Clear all
context.clear()

// Export to plain object
const data = context.toObject()

// Import from object
context.fromObject({ 'user/name': 'Alex', 'user/age': 30 })

// Get count
console.log(context.size)
```

## Validation

Context supports validation to ensure agents write correctly structured data.

### Format Extensions

Use file-like extensions for basic type validation:

| Extension | Validates |
|-----------|-----------|
| `.json` | Object or array |
| `.md` | String |
| `.txt` | String |
| `.num` | Number |
| `.bool` | Boolean |

```typescript
const context = new Context({
  validators: {
    'data/config.json': null,    // Must be object/array
    'notes/summary.md': null,    // Must be string
    'stats/count.num': null,     // Must be number
    'flags/active.bool': null    // Must be boolean
  }
})

// Valid
context.write('data/config.json', { key: 'value' })
context.write('notes/summary.md', 'This is markdown')

// Invalid - will return { success: false, errors: [...] }
context.write('data/config.json', 'not an object')
context.write('stats/count.num', 'not a number')
```

### JSON Schema Validation

Add JSON Schema for structured validation:

```typescript
const context = new Context({
  validators: {
    'plan/current.json': {
      type: 'object',
      properties: {
        title: { type: 'string' },
        goal: { type: 'string', enum: ['weight_loss', 'muscle_gain', 'maintenance'] },
        dailyCalories: { type: 'number' },
        days: { type: 'array' }
      },
      required: ['title', 'days']
    }
  }
})

// Valid
context.write('plan/current.json', {
  title: 'Weekly Plan',
  goal: 'weight_loss',
  days: ['Monday', 'Tuesday']
})

// Invalid - missing required 'days'
const result = context.write('plan/current.json', { title: 'Plan' })
// result.errors: [{ path: 'plan/current.json.days', message: 'Missing required property: days' }]
```

### Zod Validation

Use Zod schemas for runtime validation:

```typescript
import { z } from 'zod'

const UserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  age: z.number().positive().optional()
})

const context = new Context({
  validators: {
    'user/profile.json': UserSchema
  }
})

// Valid
context.write('user/profile.json', {
  name: 'Alex',
  email: 'alex@example.com'
})

// Invalid
const result = context.write('user/profile.json', {
  name: '',
  email: 'not-an-email'
})
// result.errors contain Zod validation messages
```

### Custom Validators

Use custom functions for complex validation:

```typescript
const context = new Context({
  validators: {
    'data/items.json': (value: unknown) => {
      if (!Array.isArray(value)) {
        return [{ path: 'data/items.json', message: 'Must be an array' }]
      }
      if (value.length > 100) {
        return [{ path: 'data/items.json', message: 'Maximum 100 items allowed' }]
      }
      return null  // Valid
    }
  }
})
```

### Layered Validation

Format validation happens first, then schema validation:

```typescript
const context = new Context({
  validators: {
    // Step 1: .json extension validates it's an object/array
    // Step 2: JSON Schema validates the structure
    'plan/current.json': {
      type: 'object',
      properties: {
        title: { type: 'string' }
      },
      required: ['title']
    }
  }
})

// Fails format validation (not an object)
context.write('plan/current.json', 'string')
// Error: Expected JSON object or array

// Passes format, fails schema (missing title)
context.write('plan/current.json', { days: [] })
// Error: Missing required property: title
```

## Context Tools

When you pass context to `agent.run()`, three tools are automatically available to the agent:

### context_ls

List paths in the context:

```
Agent: I'll check what data is available.
Tool: context_ls({ prefix: "user/" })
Result: { items: [{ path: "user/preferences", preview: "{theme, language}" }] }
```

### context_read

Read a value:

```
Agent: Let me read the user preferences.
Tool: context_read({ path: "user/preferences" })
Result: { found: true, value: { theme: "dark", language: "en" } }
```

### context_write

Write a value:

```
Agent: I'll save the generated plan.
Tool: context_write({ path: "plan/current.json", value: { title: "Weekly Plan", days: [...] } })
Result: { success: true, path: "plan/current.json", written: true }
```

If validation fails:

```
Tool: context_write({ path: "plan/current.json", value: { days: [] } })
Result: {
  success: false,
  error: "Validation failed",
  errors: [{ path: "plan/current.json.title", message: "Missing required property: title" }]
}
```

## Sub-Agent Context

Context is automatically passed to sub-agents, enabling data sharing:

```typescript
const context = new Context()

// Main agent can pre-populate
context.write('user/goals', ['lose weight', 'eat healthy'])

const result = await agent.run('Analyze my eating habits', { context })

// Sub-agent (nutrition_counter) can read parent's data
// and write its own results
const analysis = context.read('analysis/nutrition.json')
```

### Example: Multi-Agent Workflow

```typescript
const context = new Context({
  validators: {
    'research/findings.json': { type: 'object', required: ['topic', 'sources'] },
    'draft/article.md': null,
    'review/feedback.json': { type: 'object', required: ['approved', 'comments'] }
  }
})

// Agent orchestrates multiple sub-agents
const result = await agent.run('Write an article about TypeScript', { context })

// Each sub-agent writes to context:
// - researcher: context_write('research/findings.json', { topic: '...', sources: [...] })
// - writer: context_write('draft/article.md', '# TypeScript Guide...')
// - reviewer: context_write('review/feedback.json', { approved: true, comments: [...] })

// Access all artifacts after run
const research = context.read('research/findings.json')
const draft = context.read('draft/article.md')
const review = context.read('review/feedback.json')
```

## System Prompt Integration

Tell the agent about available context paths in your system prompt:

```typescript
const SYSTEM_PROMPT = `You are a nutrition consultant.

## Context Storage

Use context tools to save and retrieve data:

- 'user/preferences.json' - User dietary preferences (goal, restrictions)
- 'meals/today.json' - Today's logged meals with nutrition data
- 'plan/current.json' - Generated meal plan (validated: must have title, days)
- 'notes/advice.md' - Nutritional advice and recommendations

Always save important data to context so it persists across conversations.`

const context = new Context({
  validators: {
    'user/preferences.json': { /* schema */ },
    'meals/today.json': { /* schema */ },
    'plan/current.json': { /* schema */ },
    'notes/advice.md': null
  }
})
```

## Persisting Context

Context is in-memory by default. To persist across sessions:

```typescript
// Save to database after run
const result = await agent.run(message, { context })
await db.collection('contexts').doc(userId).set(context.toObject())

// Restore on next session
const savedData = await db.collection('contexts').doc(userId).get()
if (savedData.exists) {
  context.fromObject(savedData.data())
}
```

## Type Reference

```typescript
interface ContextConfig {
  validators?: Record<string, JSONSchema | ValidatorFn | ZodLike | ContextSchema | null>
}

interface ContextEntry {
  value: unknown
  createdAt: number
  updatedAt: number
  writtenBy?: string
}

interface ContextListItem {
  path: string
  updatedAt: number
  writtenBy?: string
  preview: string
}

interface WriteResult {
  success: boolean
  errors?: ValidationError[]
}

interface ValidationError {
  path: string
  message: string
  expected?: string
  received?: string
}

type ValidatorFn = (value: unknown) => ValidationError[] | null

interface ZodLike {
  safeParse(value: unknown): { success: true; data: unknown } | { success: false; error: { errors: Array<{ path: (string | number)[]; message: string }> } }
}

interface ContextSchema {
  schema?: JSONSchema
  validate?: ValidatorFn
  zod?: ZodLike
  description?: string
}
```
