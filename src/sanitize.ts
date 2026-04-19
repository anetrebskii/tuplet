/**
 * Output sanitizer — strips reasoning-channel artifacts that some OpenRouter
 * models (e.g. Gemma-4 harmony-style) emit as plain text in message content.
 * Applied inside OpenRouterProvider so sanitized text flows out as part of
 * LLMResponse; downstream code never sees raw artifacts.
 */

const CHANNEL_HEADER_RE =
  /(?:(?:^|\s)(?:thought|analysis|final|commentary|reasoning)\s*)?<\|?channel\|?>\s*\w+\s*<\|?(channel|message)\|?>/gi
const STRAY_MARKER_RE =
  /<\|?(channel|message|end|start|return|system|user|assistant|developer|constrain)\|?>/gi
const LEADING_THOUGHT_RE = /^[\t ]*thought[\t ]*\r?\n/

export function defaultSanitize(text: string): string {
  let out = text.replace(CHANNEL_HEADER_RE, '')
  out = out.replace(STRAY_MARKER_RE, '')
  while (LEADING_THOUGHT_RE.test(out)) {
    out = out.replace(LEADING_THOUGHT_RE, '')
  }
  return out.replace(/^\s+/, '')
}
