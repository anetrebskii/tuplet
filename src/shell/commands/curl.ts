/**
 * curl - Transfer data from URLs
 */

import type { CommandHandler, CommandContext, ShellResult } from '../types.js'

/** Base64 encode a string (works in Node.js and modern runtimes) */
function base64Encode(str: string): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(str).toString('base64')
  }
  return btoa(str)
}

export const curlCommand: CommandHandler = {
  name: 'curl',

  help: {
    usage: 'curl [OPTIONS] URL',
    description: 'Transfer data from or to a server',
    flags: [
      { flag: '-X METHOD', description: 'Request method (GET, POST, PUT, DELETE, PATCH)' },
      { flag: '-d DATA', description: 'Send data in request body (sets POST if no -X)' },
      { flag: '--data-raw DATA', description: 'Send data without processing (alias for -d)' },
      { flag: '-H HEADER', description: 'Add header (e.g. "Content-Type: application/json")' },
      { flag: '-u USER:PASS', description: 'Basic authentication credentials' },
      { flag: '-A AGENT', description: 'Set User-Agent header' },
      { flag: '-b COOKIES', description: 'Send cookies (e.g. "name=value; name2=value2")' },
      { flag: '-L', description: 'Follow redirects (default behavior)' },
      { flag: '-f', description: 'Fail silently on HTTP errors (no body output)' },
      { flag: '-s', description: 'Silent mode (suppress progress)' },
      { flag: '-i', description: 'Include response headers in output' },
      { flag: '-o FILE', description: 'Write output to file (use shell redirection instead)' },
      { flag: '--max-time SECS', description: 'Maximum time in seconds for the request' },
      { flag: '--connect-timeout SECS', description: 'Connection timeout in seconds' }
    ],
    examples: [
      { command: 'curl https://api.example.com/users', description: 'GET request' },
      { command: "curl -X POST https://api.com/data -d '{\"key\":\"value\"}'", description: 'POST with JSON body' },
      { command: 'curl -H "Authorization: Bearer token" https://api.com', description: 'Request with bearer token' },
      { command: 'curl -u user:pass https://api.com', description: 'Request with basic auth' },
      { command: 'curl -s https://api.com | jq .data', description: 'Fetch JSON and extract field' }
    ],
    notes: [
      'Always quote URLs with special characters'
    ]
  },

  async execute(args: string[], ctx: CommandContext): Promise<ShellResult> {
    let method = 'GET'
    let methodExplicit = false
    let url: string | null = null
    let data: string | null = null
    const headers: Record<string, string> = {}
    let silent = false
    let showHeaders = false
    let failSilently = false
    let timeoutMs: number | null = null

    for (let i = 0; i < args.length; i++) {
      const arg = args[i]

      if (arg === '-X' || arg === '--request') {
        method = args[++i]
        methodExplicit = true
      } else if (arg === '-d' || arg === '--data' || arg === '--data-raw' || arg === '--data-binary') {
        data = args[++i]
        if (!methodExplicit) method = 'POST'
      } else if (arg === '-H' || arg === '--header') {
        const header = args[++i]
        const colonIndex = header.indexOf(':')
        if (colonIndex > 0) {
          const key = header.slice(0, colonIndex).trim()
          const value = header.slice(colonIndex + 1).trim()
          headers[key] = value
        }
      } else if (arg === '-u' || arg === '--user') {
        const credentials = args[++i]
        headers['Authorization'] = 'Basic ' + base64Encode(credentials)
      } else if (arg === '-A' || arg === '--user-agent') {
        headers['User-Agent'] = args[++i]
      } else if (arg === '-b' || arg === '--cookie') {
        headers['Cookie'] = args[++i]
      } else if (arg === '-e' || arg === '--referer') {
        headers['Referer'] = args[++i]
      } else if (arg === '-s' || arg === '--silent') {
        silent = true
      } else if (arg === '-i' || arg === '--include') {
        showHeaders = true
      } else if (arg === '-f' || arg === '--fail') {
        failSilently = true
      } else if (arg === '-L' || arg === '--location') {
        // Follow redirects — fetch does this by default, accept the flag
      } else if (arg === '-o' || arg === '--output') {
        // Output file handled by shell redirection
        i++
      } else if (arg === '--max-time') {
        timeoutMs = parseFloat(args[++i]) * 1000
      } else if (arg === '--connect-timeout') {
        // Treat as overall timeout (fetch doesn't distinguish connect vs total)
        timeoutMs = parseFloat(args[++i]) * 1000
      } else if (arg === '-sS' || arg === '-Ss') {
        // Common combo: silent but show errors — treat as silent
        silent = true
      } else if (!arg.startsWith('-')) {
        url = arg
      }
    }

    if (!url) {
      return { exitCode: 1, stdout: '', stderr: 'curl: no URL specified' }
    }

    try {
      const fetchOptions: RequestInit = {
        method,
        headers
      }

      if (data) {
        fetchOptions.body = data
      }

      // Timeout: prefer explicit --max-time / --connect-timeout, fall back to config
      const effectiveTimeout = timeoutMs ?? ctx.config.timeout
      if (effectiveTimeout) {
        const controller = new AbortController()
        setTimeout(() => controller.abort(), effectiveTimeout)
        fetchOptions.signal = controller.signal
      }

      const response = await fetch(url, fetchOptions)
      const body = await response.text()

      if (failSilently && !response.ok) {
        return {
          exitCode: 22,
          stdout: '',
          stderr: `curl: (22) The requested URL returned error: ${response.status}`
        }
      }

      let output = ''

      if (showHeaders) {
        output += `HTTP/1.1 ${response.status} ${response.statusText}\n`
        response.headers.forEach((value, key) => {
          output += `${key}: ${value}\n`
        })
        output += '\n'
      }

      output += body

      // Real curl returns 0 for HTTP errors unless -f is used
      return {
        exitCode: 0,
        stdout: output,
        stderr: ''
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { exitCode: 1, stdout: '', stderr: `curl: ${message}` }
    }
  }
}
