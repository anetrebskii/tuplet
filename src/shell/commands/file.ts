/**
 * file - Determine file type
 */

import type { CommandHandler, CommandContext, ShellResult } from '../types.js'

export const fileCommand: CommandHandler = {
  name: 'file',

  help: {
    usage: 'file [OPTIONS] [FILE...]',
    description: 'Determine file type',
    flags: [
      { flag: '-b', description: 'Brief mode (do not prepend filename)' },
      { flag: '-i', description: 'Output MIME type string' }
    ],
    examples: [
      { command: 'file data.json', description: 'Identify file type' },
      { command: 'file -i script.ts', description: 'Show MIME type' },
      { command: 'file -b readme.md', description: 'Show type without filename' },
      { command: 'file src', description: 'Identify directory' }
    ]
  },

  async execute(args: string[], ctx: CommandContext): Promise<ShellResult> {
    let brief = false
    let mime = false
    const paths: string[] = []

    for (const arg of args) {
      if (arg === '-b') {
        brief = true
      } else if (arg === '-i' || arg === '--mime') {
        mime = true
      } else if (!arg.startsWith('-')) {
        paths.push(arg)
      }
    }

    if (paths.length === 0) {
      return { exitCode: 1, stdout: '', stderr: 'file: missing file operand' }
    }

    const results: string[] = []
    let hasError = false

    for (const path of paths) {
      const exists = await ctx.fs.exists(path)
      if (!exists) {
        results.push(`file: ${path}: No such file or directory`)
        hasError = true
        continue
      }

      const isDir = await ctx.fs.isDirectory(path)
      if (isDir) {
        results.push(format(path, mime ? 'inode/directory; charset=binary' : 'directory', brief))
        continue
      }

      const content = await ctx.fs.read(path)
      if (content === null) {
        results.push(`file: ${path}: No such file or directory`)
        hasError = true
        continue
      }

      const type = mime ? detectMime(path, content) : detectType(path, content)
      results.push(format(path, type, brief))
    }

    return {
      exitCode: hasError ? 1 : 0,
      stdout: results.join('\n') + '\n',
      stderr: ''
    }
  }
}

function format(path: string, type: string, brief: boolean): string {
  return brief ? type : `${path}: ${type}`
}

// --- MIME type detection ---

const MIME_BY_EXT: Record<string, string> = {
  json: 'application/json; charset=utf-8',
  js: 'application/javascript; charset=utf-8',
  mjs: 'application/javascript; charset=utf-8',
  ts: 'application/typescript; charset=utf-8',
  mts: 'application/typescript; charset=utf-8',
  tsx: 'application/typescript; charset=utf-8',
  jsx: 'application/javascript; charset=utf-8',
  html: 'text/html; charset=utf-8',
  htm: 'text/html; charset=utf-8',
  css: 'text/css; charset=utf-8',
  xml: 'application/xml; charset=utf-8',
  svg: 'image/svg+xml; charset=utf-8',
  md: 'text/markdown; charset=utf-8',
  csv: 'text/csv; charset=utf-8',
  yaml: 'text/yaml; charset=utf-8',
  yml: 'text/yaml; charset=utf-8',
  toml: 'application/toml; charset=utf-8',
  txt: 'text/plain; charset=utf-8',
  sh: 'text/x-shellscript; charset=utf-8',
  bash: 'text/x-shellscript; charset=utf-8',
  py: 'text/x-python; charset=utf-8',
  rb: 'text/x-ruby; charset=utf-8',
  java: 'text/x-java; charset=utf-8',
  c: 'text/x-c; charset=utf-8',
  h: 'text/x-c; charset=utf-8',
  cpp: 'text/x-c++; charset=utf-8',
  go: 'text/x-go; charset=utf-8',
  rs: 'text/x-rust; charset=utf-8',
}

function detectMime(path: string, content: string): string {
  const ext = extOf(path)
  if (ext && MIME_BY_EXT[ext]) return MIME_BY_EXT[ext]

  // Content-based fallback
  if (looksLikeJSON(content)) return 'application/json; charset=utf-8'
  if (looksLikeHTML(content)) return 'text/html; charset=utf-8'
  if (looksLikeXML(content)) return 'application/xml; charset=utf-8'

  return 'text/plain; charset=utf-8'
}

// --- Human-readable type detection ---

const TYPE_BY_EXT: Record<string, string> = {
  js: 'JavaScript source, UTF-8 Unicode text',
  mjs: 'JavaScript source, UTF-8 Unicode text',
  jsx: 'JavaScript source, UTF-8 Unicode text',
  ts: 'TypeScript source, UTF-8 Unicode text',
  mts: 'TypeScript source, UTF-8 Unicode text',
  tsx: 'TypeScript source, UTF-8 Unicode text',
  py: 'Python source, UTF-8 Unicode text',
  rb: 'Ruby source, UTF-8 Unicode text',
  java: 'Java source, UTF-8 Unicode text',
  c: 'C source, UTF-8 Unicode text',
  h: 'C source header, UTF-8 Unicode text',
  cpp: 'C++ source, UTF-8 Unicode text',
  go: 'Go source, UTF-8 Unicode text',
  rs: 'Rust source, UTF-8 Unicode text',
  css: 'CSS stylesheet, UTF-8 Unicode text',
  md: 'Markdown document, UTF-8 Unicode text',
  yaml: 'YAML document, UTF-8 Unicode text',
  yml: 'YAML document, UTF-8 Unicode text',
  toml: 'TOML document, UTF-8 Unicode text',
  csv: 'CSV text',
  sh: 'Bourne-Again shell script text executable',
  bash: 'Bourne-Again shell script text executable',
}

function detectType(path: string, content: string): string {
  const ext = extOf(path)

  if (content.length === 0) return 'empty'

  // JSON
  if (ext === 'json' || (!ext && looksLikeJSON(content))) {
    return 'JSON text data'
  }

  // HTML
  if (ext === 'html' || ext === 'htm' || (!ext && looksLikeHTML(content))) {
    return 'HTML document, UTF-8 Unicode text'
  }

  // XML / SVG
  if (ext === 'svg') return 'SVG Scalable Vector Graphics image'
  if (ext === 'xml' || (!ext && looksLikeXML(content))) {
    return 'XML document text'
  }

  // Shebang detection
  if (content.startsWith('#!')) {
    const firstLine = content.split('\n', 1)[0]
    if (firstLine.includes('python')) return 'Python script text executable'
    if (firstLine.includes('node')) return 'Node.js script text executable'
    if (firstLine.includes('bash') || firstLine.includes('/sh')) return 'Bourne-Again shell script text executable'
    if (firstLine.includes('ruby')) return 'Ruby script text executable'
    if (firstLine.includes('perl')) return 'Perl script text executable'
    return 'script text executable'
  }

  // Known language by extension
  if (ext && TYPE_BY_EXT[ext]) return TYPE_BY_EXT[ext]

  // Generic text
  const lines = content.split('\n')
  const hasVeryLongLines = lines.some(l => l.length > 500)

  if (hasVeryLongLines) return 'UTF-8 Unicode text, with very long lines'
  return 'UTF-8 Unicode text'
}

// --- Helpers ---

function extOf(path: string): string {
  const name = path.split('/').pop() ?? ''
  const dot = name.lastIndexOf('.')
  if (dot <= 0) return ''
  return name.slice(dot + 1).toLowerCase()
}

function looksLikeJSON(content: string): boolean {
  const t = content.trimStart()
  if (!t.startsWith('{') && !t.startsWith('[')) return false
  // Only attempt parse on reasonably sized content
  if (content.length > 65_536) return false
  try { JSON.parse(content); return true } catch { return false }
}

function looksLikeHTML(content: string): boolean {
  const t = content.trimStart().slice(0, 50).toLowerCase()
  return t.startsWith('<!doctype html') || t.startsWith('<html')
}

function looksLikeXML(content: string): boolean {
  return content.trimStart().startsWith('<?xml')
}
