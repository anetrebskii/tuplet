# Run Recording & Testing

[Tracing](./tracing.md) shows what happened during a run. Run recording captures the full context — input, conversation history, and agent config — so you can **replay the exact same scenario** later as a regression test. Change your prompts, tools, or model, then re-run recordings to verify the agent still behaves correctly.

## Record

Add a `RunRecorder` to capture every run:

```typescript
import { Tuplet, ClaudeProvider, RunRecorder } from 'tuplet'

const agent = new Tuplet({
  role: 'a helpful assistant',
  llm: new ClaudeProvider({ apiKey: '...' }),
  recorder: new RunRecorder({ outputDir: './runs' })
})

const result = await agent.run('Hello!')
// -> Saves to ./runs/run_1704123456789_abc123.json
```

Each recording captures the input message, conversation history, agent config, and the full result (response, status, tool calls, trace).

## Test

Replay recordings against your agent with `RunTester`. By default, a test passes if `status` and `toolCalls.length` match:

```typescript
import { Tuplet, RunTester } from 'tuplet'

const agent = new Tuplet({ /* same config, without recorder */ })

const tester = new RunTester({
  runsDir: './runs',

  // Optional: custom pass/fail logic
  compareFn: (expected, actual) => {
    if (actual.status !== expected.status) return false
    const expectedTools = expected.toolCalls.map(t => t.name).sort()
    const actualTools = actual.toolCalls.map(t => t.name).sort()
    return JSON.stringify(expectedTools) === JSON.stringify(actualTools)
  }
})

const summary = await tester.runAll(agent)
RunTester.printSummary(summary)

if (summary.failed > 0) {
  process.exit(1)
}
```

```text
============================================================
TEST SUMMARY
============================================================
Total: 5  |  Passed: 4  |  Failed: 1  |  Duration: 8234ms

✓ [PASS] greeting
✓ [PASS] log_meal_chicken
✓ [PASS] create_plan
✓ [PASS] ask_preferences
✗ [FAIL] search_recipes
    Expected: "I found 3 items matching..."
    Actual: "I found 2 items matching..."

Pass rate: 80.0%
============================================================
```

## RunTester Options

```typescript
new RunTester({
  runsDir: './runs',

  // Custom pass/fail logic (default: match status + tool call count)
  compareFn: (expected, actual, record) => boolean,

  // Options passed to agent.run() for each test
  runOptions: {
    workspace: new Workspace({ strict: false }),
    signal: AbortSignal.timeout(30000)
  },

  // Lifecycle hooks
  beforeEach: async (record) => { /* setup */ },
  afterEach: async (result, record) => { /* teardown */ }
})

// Run a single test
const result = await tester.runOne(agent, './runs/specific_run.json')
```
