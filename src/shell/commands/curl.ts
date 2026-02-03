/**
 * curl - Transfer data from URLs
 */

import type { CommandHandler, CommandContext, ShellResult } from '../types.js'

export const curlCommand: CommandHandler = {
  name: 'curl',

  help: {
    usage: 'curl [OPTIONS] URL',
    description: 'Transfer data from or to a server',
    flags: [
      { flag: '-X METHOD', description: 'Request method (GET, POST, PUT, DELETE, PATCH)' },
      { flag: '-d DATA', description: 'Send data in request body (sets POST if no -X)' },
      { flag: '-H HEADER', description: 'Add header (e.g. "Content-Type: application/json")' },
      { flag: '-s', description: 'Silent mode (suppress progress)' },
      { flag: '-i', description: 'Include response headers in output' },
      { flag: '-o FILE', description: 'Write output to file (use shell redirection instead)' }
    ],
    examples: [
      { command: 'curl https://api.example.com/users', description: 'GET request' },
      { command: "curl -X POST https://api.com/data -d '{\"key\":\"value\"}'", description: 'POST with JSON body' },
      { command: 'curl -H "Authorization: Bearer token" https://api.com', description: 'Request with auth header' },
      { command: 'curl -s https://api.com | jq .data', description: 'Fetch JSON and extract field' }
    ],
    notes: [
      'Relative URLs resolved against configured baseUrl',
      'Default headers from config are included automatically',
      'Always quote URLs with special characters'
    ]
  },

  async execute(args: string[], ctx: CommandContext): Promise<ShellResult> {
    let method = 'GET'
    let url: string | null = null
    let data: string | null = null
    const headers: Record<string, string> = { ...ctx.config.defaultHeaders }
    let silent = false
    let showHeaders = false

    for (let i = 0; i < args.length; i++) {
      const arg = args[i]

      if (arg === '-X' || arg === '--request') {
        method = args[++i]
      } else if (arg === '-d' || arg === '--data') {
        data = args[++i]
        if (method === 'GET') method = 'POST'
      } else if (arg === '-H' || arg === '--header') {
        const header = args[++i]
        const colonIndex = header.indexOf(':')
        if (colonIndex > 0) {
          const key = header.slice(0, colonIndex).trim()
          const value = header.slice(colonIndex + 1).trim()
          headers[key] = value
        }
      } else if (arg === '-s' || arg === '--silent') {
        silent = true
      } else if (arg === '-i' || arg === '--include') {
        showHeaders = true
      } else if (arg === '-o' || arg === '--output') {
        // Output file handled by shell redirection
        i++
      } else if (!arg.startsWith('-')) {
        url = arg
      }
    }

    if (!url) {
      return { exitCode: 1, stdout: '', stderr: 'curl: no URL specified' }
    }

    // Handle relative URLs with baseUrl
    if (ctx.config.baseUrl && !url.startsWith('http')) {
      url = ctx.config.baseUrl.replace(/\/$/, '') + '/' + url.replace(/^\//, '')
    }

    try {
      const fetchOptions: RequestInit = {
        method,
        headers
      }

      if (data) {
        fetchOptions.body = data
      }

      // Add timeout if configured
      if (ctx.config.timeout) {
        const controller = new AbortController()
        setTimeout(() => controller.abort(), ctx.config.timeout)
        fetchOptions.signal = controller.signal
      }

      const response = await fetch(url, fetchOptions)
      const body = await response.text()

      let output = ''

      if (showHeaders) {
        output += `HTTP/1.1 ${response.status} ${response.statusText}\n`
        response.headers.forEach((value, key) => {
          output += `${key}: ${value}\n`
        })
        output += '\n'
      }

      output += body

      return {
        exitCode: response.ok ? 0 : 1,
        stdout: output,
        stderr: response.ok ? '' : `curl: (22) HTTP error ${response.status}`
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { exitCode: 1, stdout: '', stderr: `curl: ${message}` }
    }
  }
}
