# Run Recording & Testing

Record agent runs to JSON files and test against them for regression testing.

## Overview

The recording system captures everything needed to replay a run:

- **Configuration**: System prompt, tools, sub-agents, settings
- **Initial History**: Conversation state before the run
- **Input Message**: The user's message that triggered the run
- **Result**: Response, status, tool calls, todos, trace data

## Quick Start

### 1. Enable Recording

Add a `RunRecorder` to your Hive configuration:

```typescript
import { Hive, ClaudeProvider, RunRecorder } from '@alexnetrebskii/hive-agent'

const agent = new Hive({
  systemPrompt: 'You are a helpful assistant.',
  tools: myTools,
  llm: new ClaudeProvider({ apiKey: '...' }),
  recorder: new RunRecorder({ outputDir: './runs' })
})

// Every run is automatically recorded
const result = await agent.run('Hello!')
// -> Saves to ./runs/run_1704123456789_abc123.json
```

### 2. Run Tests Against Recordings

Use `RunTester` to verify agent behavior:

```typescript
import { Hive, RunTester } from '@alexnetrebskii/hive-agent'

const agent = new Hive({ /* same config, without recorder */ })

const tester = new RunTester({
  runsDir: './runs'
})

const summary = await tester.runAll(agent)
RunTester.printSummary(summary)

if (summary.failed > 0) {
  process.exit(1)
}
```

## RunTester Configuration

### Basic Configuration

```typescript
const tester = new RunTester({
  // Required: directory containing recorded run JSON files
  runsDir: './runs'
})
```

### Custom Comparison Function

By default, tests pass if `status` and `toolCalls.length` match. Override with `compareFn`:

```typescript
const tester = new RunTester({
  runsDir: './runs',

  // Custom comparison: only check status
  compareFn: (expected, actual, record) => {
    return actual.status === expected.status
  }
})
```

```typescript
// Compare specific tool calls
compareFn: (expected, actual, record) => {
  if (actual.status !== expected.status) return false

  // Check that same tools were called
  const expectedTools = expected.toolCalls.map(t => t.name).sort()
  const actualTools = actual.toolCalls.map(t => t.name).sort()
  return JSON.stringify(expectedTools) === JSON.stringify(actualTools)
}
```

```typescript
// Always pass (just for recording metrics)
compareFn: () => true
```

### Run Options

Pass options to `agent.run()` for each test:

```typescript
const tester = new RunTester({
  runsDir: './runs',

  runOptions: {
    // Fresh context for each test
    context: new Context({ strict: false }),

    // Custom conversation ID
    conversationId: 'test-run',

    // Timeout via AbortController
    signal: AbortSignal.timeout(30000)
  }
})
```

### Lifecycle Hooks

```typescript
const tester = new RunTester({
  runsDir: './runs',

  // Called before each test runs
  beforeEach: async (record) => {
    console.log(`Running: ${record.id}`)
    console.log(`Input: "${record.inputMessage}"`)
    // Setup test fixtures, reset state, etc.
  },

  // Called after each test completes
  afterEach: async (result, record) => {
    const icon = result.passed ? '✓' : '✗'
    console.log(`${icon} ${record.id} (${result.durationMs}ms)`)

    if (!result.passed) {
      console.log(`  Expected: ${result.expectedResponse.slice(0, 50)}...`)
      console.log(`  Actual: ${result.actualResponse.slice(0, 50)}...`)
    }

    // Log to external system, save metrics, etc.
  }
})
```

### Running Single Tests

```typescript
// Run all tests
const summary = await tester.runAll(agent)

// Run a single test file
const result = await tester.runOne(agent, './runs/specific_run.json')
console.log(result.passed ? 'PASS' : 'FAIL')
```

## Test Results

### TestResult

```typescript
interface TestResult {
  runId: string              // Run record ID
  passed: boolean            // Overall pass/fail
  inputMessage: string       // Input that was tested
  expectedResponse: string   // Response from recording
  actualResponse: string     // Response from replay
  statusMatch: boolean       // Did status match?
  toolCallCountMatch: boolean // Did tool call count match?
  responseMatch: boolean     // Did response match exactly?
  error?: string             // Error message if test threw
  durationMs: number         // How long the test took
}
```

### TestSummary

```typescript
interface TestSummary {
  total: number              // Total tests run
  passed: number             // Tests that passed
  failed: number             // Tests that failed
  results: TestResult[]      // Individual results
  durationMs: number         // Total duration
}
```

### Printing Results

```typescript
const summary = await tester.runAll(agent)

// Built-in pretty printer
RunTester.printSummary(summary)
```

Output:
```
============================================================
TEST SUMMARY
============================================================
Total: 5
Passed: 4
Failed: 1
Duration: 8234ms

✓ [PASS] run_1704123456789_abc123
✓ [PASS] run_1704123456790_def456
✓ [PASS] run_1704123456791_ghi789
✓ [PASS] run_1704123456792_jkl012
✗ [FAIL] run_1704123456793_mno345
    Status match: true
    Tool call count match: false
    Response match: false
    Expected: "I found 3 items matching..."
    Actual: "I found 2 items matching..."

============================================================
Pass rate: 80.0%
============================================================
```

## RunReplayer (Optional)

`RunReplayer` is for manual inspection of recordings. `RunTester` uses it internally, so you typically don't need it for testing.

Use cases for `RunReplayer`:
- Debugging a specific run
- Building custom tooling
- Extracting data from recordings

```typescript
import { RunReplayer } from '@alexnetrebskii/hive-agent'

const replayer = new RunReplayer()
const record = await replayer.load('./runs/run_xxx.json')

// Pretty print to console
replayer.display(record)

// Access data
console.log(record.inputMessage)
console.log(record.initialHistory)
console.log(record.result.response)
console.log(record.result.toolCalls)
```

## RunRecord Structure

```typescript
interface RunRecord {
  id: string                    // e.g., "run_1704123456789_abc123"
  timestamp: number             // Unix timestamp
  inputMessage: string          // User's input message
  initialHistory: Message[]     // Conversation history BEFORE run

  config: {
    systemPrompt: string
    maxIterations?: number
    maxContextTokens?: number
    contextStrategy?: 'truncate_old' | 'summarize' | 'error'
    agentName?: string
    tools: Array<{
      name: string
      description: string
      parameters: JSONSchema
    }>
    agents?: Array<{
      name: string
      description: string
      systemPrompt: string
      tools: Array<{ name, description, parameters }>
      model?: string
      maxIterations?: number
      inputSchema?: JSONSchema
      outputSchema?: JSONSchema
    }>
  }

  result: {
    response: string
    status: 'complete' | 'needs_input' | 'interrupted'
    history: Message[]          // Full history AFTER run
    toolCalls: Array<{
      name: string
      input: Record<string, unknown>
      output: { success: boolean; data?: unknown; error?: string }
      durationMs: number
    }>
    thinking?: string[]
    todos?: TodoItem[]
    interrupted?: {
      reason: 'aborted' | 'stopped' | 'max_iterations'
      iterationsCompleted: number
    }
    trace?: Trace               // Full execution trace with costs
  }
}
```

## Example: CI Integration

```typescript
// test/regression.ts
import { Hive, ClaudeProvider, RunTester, Context } from '@alexnetrebskii/hive-agent'

async function main() {
  const agent = new Hive({
    systemPrompt: process.env.SYSTEM_PROMPT!,
    tools: myTools,
    llm: new ClaudeProvider({
      apiKey: process.env.ANTHROPIC_API_KEY!,
      model: 'claude-3-haiku-20240307'
    })
  })

  const tester = new RunTester({
    runsDir: './fixtures/runs',
    runOptions: {
      context: new Context({ strict: false })
    },
    afterEach: (result) => {
      // Log for CI visibility
      console.log(`${result.passed ? '✓' : '✗'} ${result.runId}`)
    }
  })

  const summary = await tester.runAll(agent)
  RunTester.printSummary(summary)

  // Exit with error code for CI
  process.exit(summary.failed > 0 ? 1 : 0)
}

main()
```

Run in CI:
```bash
npx tsx test/regression.ts
```

## Best Practices

1. **Separate fixtures from dev runs** - Use `./fixtures/runs/` for committed test cases, `./runs/` for development (gitignored)

2. **Don't compare exact responses** - LLM outputs vary. Compare status and tool calls instead

3. **Use descriptive recording names** - Rename recordings to describe the scenario: `greeting.json`, `log_meal_chicken.json`

4. **Reset state in beforeEach** - If using Context or external state, reset it before each test

5. **Keep recordings small** - Record specific scenarios, not entire conversations

6. **Review recordings periodically** - Remove outdated ones, update for intentional behavior changes
