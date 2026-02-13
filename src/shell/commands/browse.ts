/**
 * browse - Fetch web pages and convert to readable text
 */

import type { CommandHandler, CommandContext, ShellResult } from '../types.js'

/**
 * Convert HTML to readable plain text.
 * Strips scripts/styles/nav/footer, converts headings/links/lists to markdown-like format.
 */
function htmlToText(html: string): string {
  let text = html

  // Remove script, style, nav, footer blocks
  text = text.replace(/<script[\s\S]*?<\/script>/gi, '')
  text = text.replace(/<style[\s\S]*?<\/style>/gi, '')
  text = text.replace(/<nav[\s\S]*?<\/nav>/gi, '')
  text = text.replace(/<footer[\s\S]*?<\/footer>/gi, '')

  // Convert headings to # format
  text = text.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '\n# $1\n')
  text = text.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '\n## $1\n')
  text = text.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '\n### $1\n')
  text = text.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, '\n#### $1\n')
  text = text.replace(/<h5[^>]*>([\s\S]*?)<\/h5>/gi, '\n##### $1\n')
  text = text.replace(/<h6[^>]*>([\s\S]*?)<\/h6>/gi, '\n###### $1\n')

  // Convert links: <a href="url">text</a> -> [text](url)
  text = text.replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)')

  // Convert list items
  text = text.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '- $1\n')

  // Convert paragraphs and divs to newlines
  text = text.replace(/<\/p>/gi, '\n\n')
  text = text.replace(/<br\s*\/?>/gi, '\n')
  text = text.replace(/<\/div>/gi, '\n')

  // Strip all remaining HTML tags
  text = text.replace(/<[^>]+>/g, '')

  // Decode common HTML entities
  text = text.replace(/&amp;/g, '&')
  text = text.replace(/&lt;/g, '<')
  text = text.replace(/&gt;/g, '>')
  text = text.replace(/&quot;/g, '"')
  text = text.replace(/&#39;/g, "'")
  text = text.replace(/&nbsp;/g, ' ')

  // Collapse whitespace: multiple spaces to single, multiple newlines to double
  text = text.replace(/[ \t]+/g, ' ')
  text = text.replace(/\n /g, '\n')
  text = text.replace(/ \n/g, '\n')
  text = text.replace(/\n{3,}/g, '\n\n')

  return text.trim()
}

const MAX_OUTPUT_LENGTH = 50_000

/** Minimum meaningful content length (characters) after HTML-to-text conversion */
const MIN_CONTENT_LENGTH = 50

/** Patterns that indicate the page blocked us or requires JavaScript */
const BLOCKED_PATTERNS = [
  /please\s+enable\s+javascript/i,
  /you\s+need\s+to\s+enable\s+javascript/i,
  /javascript\s+is\s+required/i,
  /please\s+click\s+here\s+if\s+you\s+are\s+not\s+redirected/i,
  /if\s+you\s+are\s+not\s+redirected/i,
  /checking\s+(your\s+)?browser/i,
  /verify\s+you\s+are\s+(a\s+)?human/i,
  /captcha/i,
  /access\s+denied/i,
  /forbidden/i,
  /bot\s+detected/i,
  /unusual\s+traffic/i,
  /automated\s+requests/i
]

/**
 * Check if the converted text looks like a blocked/useless response.
 * Returns a warning message if problematic, null if content looks fine.
 */
function detectLowQuality(text: string): string | null {
  if (text.length < MIN_CONTENT_LENGTH) {
    return `browse: page returned very little content (${text.length} chars). The site likely requires JavaScript or blocked the request. Try a different source or use \`curl\` with an API endpoint instead.`
  }

  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(text)) {
      return `browse: page appears to require JavaScript or blocked the request (matched: ${pattern.source}). Content returned is not useful. Try a different URL, use a direct API, or try a different source for this information.`
    }
  }

  return null
}

export const browseCommand: CommandHandler = {
  name: 'browse',

  help: {
    usage: 'browse [OPTIONS] URL',
    description: 'Fetch a web page and convert HTML to readable text',
    flags: [
      { flag: '--raw', description: 'Return raw HTML instead of converted text' }
    ],
    examples: [
      { command: 'browse https://example.com', description: 'Fetch and convert page to text' },
      { command: 'browse --raw https://example.com', description: 'Fetch raw HTML' },
      { command: 'browse https://example.com | grep "keyword"', description: 'Fetch and search for keyword' },
      { command: 'browse https://example.com > /page.md', description: 'Save page content to file' }
    ],
    notes: [
      'Strips <script>, <style>, <nav>, <footer> tags',
      'Converts headings to # format, links to [text](url)',
      'Output is trimmed to 50K characters',
      'No JavaScript engine — sites requiring JS (Google, SPA apps) will return errors',
      'Returns exitCode 1 if the page appears blocked or has no useful content',
      'For search, use a search API via curl instead of browsing search engine pages'
    ]
  },

  async execute(args: string[], ctx: CommandContext): Promise<ShellResult> {
    let raw = false
    let url: string | null = null

    for (const arg of args) {
      if (arg === '--raw') {
        raw = true
      } else if (!arg.startsWith('-')) {
        url = arg
      }
    }

    if (!url) {
      return { exitCode: 1, stdout: '', stderr: 'browse: no URL specified' }
    }

    try {
      const fetchOptions: RequestInit = {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; ShellBrowser/1.0)',
          'Accept': 'text/html, application/xhtml+xml, */*'
        }
      }

      if (ctx.config.timeout) {
        const controller = new AbortController()
        setTimeout(() => controller.abort(), ctx.config.timeout)
        fetchOptions.signal = controller.signal
      }

      const response = await fetch(url, fetchOptions)
      const html = await response.text()

      if (!response.ok) {
        return {
          exitCode: 1,
          stdout: '',
          stderr: `browse: HTTP ${response.status} ${response.statusText}`
        }
      }

      let output = raw ? html : htmlToText(html)

      // Check for low-quality / blocked content (only on converted text)
      if (!raw) {
        const warning = detectLowQuality(output)
        if (warning) {
          return { exitCode: 1, stdout: output + '\n', stderr: warning }
        }
      }

      // Trim to max length
      if (output.length > MAX_OUTPUT_LENGTH) {
        output = output.slice(0, MAX_OUTPUT_LENGTH) + '\n\n[... truncated at 50K characters]'
      }

      return { exitCode: 0, stdout: output + '\n', stderr: '' }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { exitCode: 1, stdout: '', stderr: `browse: ${message}` }
    }
  }
}
