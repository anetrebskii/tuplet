# Interactive Questions

Agents can pause mid-execution to ask the user clarifying questions. When this happens, `agent.run()` returns with `status: 'needs_input'`. Your app shows the question, collects the answer, and calls `agent.run()` again with the response and previous history.

```typescript
const result = await agent.run('Create a database schema', { workspace })

if (result.status === 'needs_input') {
  // Show question to the user
  const q = result.pendingQuestion!.questions[0]
  console.log(q.question)  // "What type of database?"
  console.log(q.options)   // ["PostgreSQL", "MySQL", "SQLite"]

  // Continue with the user's answer
  const continued = await agent.run('PostgreSQL', {
    history: result.history,
    workspace
  })
}
```

For agents that may ask multiple follow-up questions, use a loop:

```typescript
let message = 'Create a database schema'
let history: Message[] = []

while (true) {
  const result = await agent.run(message, { history, workspace })

  if (result.status === 'needs_input') {
    message = await getUserAnswer(result.pendingQuestion!)
    history = result.history
  } else {
    console.log(result.response)
    break
  }
}
```
