# URL Allowlisting

Restrict which URLs the agent can access via `curl` and `browse` shell commands. When enabled, any HTTP request to a non-matching URL fails with a clear error message.

The allowlist is set on the agent and **automatically inherited by all sub-agents** (explore, plan, worker, and custom sub-agents).

## Setup

```typescript
const agent = new Tuplet({
  role: 'a nutrition consultant',
  tools: [...],
  llm: new ClaudeProvider({ apiKey: '...' }),

  allowedUrls: [
    'https://*.openfoodfacts.org/api/**',  // API endpoints on any subdomain
    'https://api.example.com/v2/**',        // only v2 endpoints
    'https://cdn.example.com/images/*',     // one level under /images/
    '*.github.com',                         // shorthand: any scheme, any path
  ]
})
```

If `allowedUrls` is not set or empty, all URLs are allowed (no restrictions).

## Pattern Syntax

| Pattern | Matches |
|---------|---------|
| `*` in host | Any single subdomain level |
| `*.example.com` | `api.example.com`, `sub.api.example.com`, and `example.com` itself |
| `*` in path | Any single path segment (no slashes) |
| `**` in path | Any number of path segments (including zero) |
| No scheme | Shorthand — matches both `http` and `https`, any path |

Query strings and URL fragments are ignored during matching.

## Examples

### Allow only a specific API

```typescript
allowedUrls: ['https://api.openai.com/v1/**']

// Allowed:
//   https://api.openai.com/v1/chat/completions
//   https://api.openai.com/v1/models
// Blocked:
//   https://api.openai.com/v2/anything
//   https://evil.com/steal
```

### Allow an entire domain with all subdomains

```typescript
allowedUrls: ['*.example.com']

// Allowed:
//   https://example.com/anything
//   https://api.example.com/v1/users
//   http://cdn.example.com/images/photo.jpg
// Blocked:
//   https://notexample.com
//   https://evil.com
```

### Multiple APIs

```typescript
allowedUrls: [
  'https://*.openfoodfacts.org/**',
  'https://api.spoonacular.com/**',
  'https://cdn.jsdelivr.net/npm/**',
]
```

## Behavior

When a `curl` or `browse` command targets a blocked URL, the shell returns an error:

```
curl: URL not allowed: https://evil.com/steal. Allowed patterns: https://*.openfoodfacts.org/api/**
```

The AI sees this error in stderr and can adjust its approach — for example, by using an allowed API endpoint instead.

## Sub-Agent Inheritance

The `allowedUrls` setting is automatically passed to all sub-agents. You don't need to configure it separately for each agent:

```typescript
const agent = new Tuplet({
  allowedUrls: ['https://api.example.com/**'],
  agents: [myCustomAgent],
  // ...
})

// myCustomAgent and built-in agents (explore, worker, etc.)
// all inherit the same URL restrictions
```
