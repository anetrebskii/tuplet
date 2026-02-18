# Secrets

Pass API keys and other credentials to the agent securely. The agent can list variable names and reference them in commands, but it does not have access to the actual values — they are resolved by the built-in tools at execution time and never appear in logs, conversation history, or AI provider requests.

## Setup

```typescript
import { Tuplet, ClaudeProvider, Workspace, MemoryEnvironmentProvider } from 'tuplet'

const workspace = new Workspace()

const result = await agent.run('Fetch users from the API', {
  workspace,
  env: new MemoryEnvironmentProvider({
    API_KEY: process.env.MY_API_KEY!,
    API_URL: 'https://api.example.com'
  })
})
```

## Custom Provider

Implement `EnvironmentProvider` for dynamic secret resolution (e.g. from a vault or database):

```typescript
interface EnvironmentProvider {
  get(name: string): string | undefined
  keys(): string[]
}
```

`keys()` returns the list of available variable names — shown to the agent so it knows what's available. `get()` resolves the actual value at execution time.
