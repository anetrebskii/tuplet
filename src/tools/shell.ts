/**
 * Shell Tool
 *
 * Provides bash-like interface for AI to interact with context.
 * Supports: browse, cat, curl, echo, find, grep, head, help, jq, ls, mkdir, rm, tail
 */

import type { Tool } from '../types.js'
import type { Shell } from '../shell/shell.js'

/**
 * Create the shell tool for context access
 */
export function createShellTool(shell: Shell): Tool {
  return {
    name: '__shell__',
    description: `Execute bash-like commands to interact with context, make HTTP requests, and browse web pages.

## Overview

Commands run against a virtual filesystem rooted at \`/\`. All context data lives there. Pipes (\`|\`), input redirection (\`<\`), and output redirection (\`>\`, \`>>\`) are supported.

Run \`help\` to list all commands, or \`help <command>\` for detailed usage, flags, and examples.

## Available commands

| Command | Description |
|---------|-------------|
| \`browse\` | Fetch a web page and convert HTML to readable text |
| \`cat\` | Concatenate and print files |
| \`curl\` | Transfer data from or to a server |
| \`echo\` | Display text |
| \`find\` | Search for files in a directory hierarchy |
| \`grep\` | Search for patterns in files or stdin |
| \`head\` | Output the first part of files |
| \`help\` | Show available commands or detailed help for a command |
| \`jq\` | Lightweight JSON processor |
| \`ls\` | List directory contents |
| \`mkdir\` | Create directories |
| \`rm\` | Remove files or directories |
| \`tail\` | Output the last part of files |

## Pre-execution steps

1. **Verify paths** — before writing, check the parent directory exists with \`ls\`.
2. **Quote special characters** — always quote URLs: \`curl 'https://api.com/path?a=1&b=2'\`.

## Usage by category

**Workspace (read/write):**
- \`cat /data.json\` — read file
- \`echo '{"name":"John"}' > /user.json\` — write file
- \`head -n 10 /log.txt\` / \`tail -n 5 /log.txt\` — partial reads

**Search & list:**
- \`ls /\`, \`ls /**/*.json\` — list entries
- \`find / -name "*.json"\` — find files
- \`grep "pattern" /**/*.json\` — search content

**HTTP & web:**
- \`curl https://api.example.com/users\` — API requests (GET, POST, PUT, DELETE)
- \`browse https://example.com\` — fetch web page as readable text
  - ⚠️ \`browse\` has no JavaScript engine. Sites that require JS (Google, Bing, SPAs) will fail.
  - Do NOT use \`browse\` for search engines — use a search API via \`curl\` instead.
  - If \`browse\` returns exitCode 1 with a warning, the content is useless — try a different source.

**JSON processing:**
- \`cat /data.json | jq '.items[]'\` — extract, filter, transform JSON

**File management:**
- \`mkdir /reports\` — create directory
- \`rm /temp.json\` / \`rm -r /cache/\` — remove files

<good-example>
curl 'https://api.example.com/users?page=1' | jq '.data' > /users.json
</good-example>

<bad-example>
curl https://api.example.com/users?page=1&limit=10
(unquoted URL with & will break)
</bad-example>

## Important rules

- NEVER use placeholders like \`<API_KEY>\`, \`<TOKEN>\`, \`YOUR_KEY_HERE\`. If a value is unknown, ask the user first using __ask_user__.
- Prefer free public APIs that don't require authentication. If auth is needed and credentials are not available, ask the user.
- On failure, read the error message, fix the command, and retry. Try a different approach if the second attempt fails.`,

    parameters: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'The bash command to execute'
        }
      },
      required: ['command']
    },

    execute: async (params) => {
      const command = params.command as string

      if (!command || typeof command !== 'string') {
        return {
          success: false,
          error: 'Command is required'
        }
      }

      const result = await shell.execute(command)

      if (result.exitCode !== 0) {
        const details = [result.stderr, result.stdout].filter(Boolean).join('\n')
        return {
          success: false,
          error: `\`${command}\` failed (exit ${result.exitCode}): ${details || 'unknown error'}. Fix the command and try again, or try a different approach.`,
          data: {
            command,
            exitCode: result.exitCode,
            stdout: result.stdout,
            stderr: result.stderr
          }
        }
      }

      return {
        success: true,
        data: {
          output: result.stdout,
          exitCode: result.exitCode
        }
      }
    }
  }
}
