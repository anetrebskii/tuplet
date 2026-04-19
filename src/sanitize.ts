/**
 * Output sanitizer — strips reasoning-channel artifacts that some OpenRouter
 * models (e.g. Gemma-4 harmony-style) emit as plain text in message content.
 *
 * Only touches assistant text blocks. Tool calls, tool results, and user
 * messages are never modified.
 */

import type { ContentBlock } from './types.js'

const CHANNEL_HEADER_RE = /<\|?channel\|?>\s*\w+\s*<\|?(channel|message)\|?>/gi
const STRAY_MARKER_RE = /<\|?(message|end|start|return)\|?>/gi
const LEADING_THOUGHT_RE = /^[\t ]*thought[\t ]*\r?\n/

export function defaultSanitize(text: string): string {
  let out = text.replace(CHANNEL_HEADER_RE, '')
  out = out.replace(STRAY_MARKER_RE, '')
  // Repeatedly strip a leading "thought\n" prefix (handles duplicates).
  while (LEADING_THOUGHT_RE.test(out)) {
    out = out.replace(LEADING_THOUGHT_RE, '')
  }
  return out.replace(/^\s+/, '')
}

/**
 * Apply `sanitize` to every text block. Drops text blocks whose text becomes
 * empty after sanitization. Leaves tool_use, thinking, tool_result untouched.
 */
export function sanitizeAssistantContent(
  content: ContentBlock[],
  sanitize: (text: string) => string
): ContentBlock[] {
  const out: ContentBlock[] = []
  for (const block of content) {
    if (block.type === 'text') {
      const cleaned = sanitize(block.text)
      if (cleaned.length > 0) {
        out.push({ type: 'text', text: cleaned })
      }
    } else {
      out.push(block)
    }
  }
  return out
}
