/**
 * Activity Types and Label Generation
 *
 * Semantic activity classification for progress callbacks.
 * Provides typed activity objects and user-friendly labels.
 */

import type { ParsedCommand } from './shell/types.js'
import { parseCommand } from './shell/parser.js'

// ============================================================================
// Shell Activities
// ============================================================================

export interface ShellHttpRequestActivity {
  type: 'shell:http_request'
  url?: string
  method: string
}

export interface ShellBrowseActivity {
  type: 'shell:browse'
  url?: string
}

export interface ShellFileReadActivity {
  type: 'shell:file_read'
  path?: string
  lines?: number
}

export interface ShellFileWriteActivity {
  type: 'shell:file_write'
  path?: string
  target?: string
  pattern?: string
}

export interface ShellFileSearchActivity {
  type: 'shell:file_search'
  pattern?: string
  path?: string
  namePattern?: string
  fileType?: string
  flags?: string[]
}

export interface ShellFileManageActivity {
  type: 'shell:file_manage'
  action?: 'list' | 'create_dir' | 'remove' | 'copy' | 'move' | 'chmod' | 'touch'
  path?: string
  recursive?: boolean
}

export interface ShellFileInfoActivity {
  type: 'shell:file_info'
  path?: string
  mode?: 'lines' | 'words' | 'chars'
}

export interface ShellDataTransformActivity {
  type: 'shell:data_transform'
  filter?: string
  path?: string
  numeric?: boolean
  reverse?: boolean
}

export interface ShellSystemActivity {
  type: 'shell:system'
  action?: 'env' | 'date' | 'help' | 'which' | 'whoami' | 'pwd' | 'uname'
  command?: string
  format?: string
}

export interface ShellOtherActivity {
  type: 'shell:other'
}

// ============================================================================
// Built-in Tool Activities
// ============================================================================

export interface ToolReadFileActivity {
  type: 'tool:read_file'
  path: string
}

export interface ToolEditFileActivity {
  type: 'tool:edit_file'
  path: string
}

export interface ToolWriteFileActivity {
  type: 'tool:write_file'
  path: string
}

export interface ToolSearchFilesActivity {
  type: 'tool:search_files'
  pattern: string
}

export interface ToolSearchContentActivity {
  type: 'tool:search_content'
  pattern: string
  path?: string
}

export interface ToolWebFetchActivity {
  type: 'tool:web_fetch'
  url: string
  method: string
}

export interface ToolWebSearchActivity {
  type: 'tool:web_search'
  query: string
}

export interface ToolSubAgentActivity {
  type: 'tool:sub_agent'
  agentName: string
}

export interface ToolTaskManageActivity {
  type: 'tool:task_manage'
  action: 'create' | 'update' | 'list' | 'get' | 'delete'
  subject?: string
}

export interface ToolOtherActivity {
  type: 'tool:other'
  toolName: string
}

// ============================================================================
// Agent Lifecycle Activities
// ============================================================================

export interface AgentThinkingActivity {
  type: 'agent:thinking'
}

export interface AgentRespondingActivity {
  type: 'agent:responding'
}

export interface AgentInterruptedActivity {
  type: 'agent:interrupted'
  reason?: string
}

// ============================================================================
// Union Type
// ============================================================================

export type Activity =
  | ShellHttpRequestActivity
  | ShellBrowseActivity
  | ShellFileReadActivity
  | ShellFileWriteActivity
  | ShellFileSearchActivity
  | ShellFileManageActivity
  | ShellFileInfoActivity
  | ShellDataTransformActivity
  | ShellSystemActivity
  | ShellOtherActivity
  | ToolReadFileActivity
  | ToolEditFileActivity
  | ToolWriteFileActivity
  | ToolSearchFilesActivity
  | ToolSearchContentActivity
  | ToolWebFetchActivity
  | ToolWebSearchActivity
  | ToolSubAgentActivity
  | ToolTaskManageActivity
  | ToolOtherActivity
  | AgentThinkingActivity
  | AgentRespondingActivity
  | AgentInterruptedActivity

// ============================================================================
// Label Generation
// ============================================================================

/**
 * Generate a user-friendly label from an Activity object.
 *
 * Called internally by the framework when building ProgressUpdate events.
 * Also exported for consumers who want to regenerate labels.
 */
export function describeActivity(activity: Activity): string {
  switch (activity.type) {
    // ---- Shell ----
    case 'shell:http_request': {
      const host = tryParseHost(activity.url)
      return host
        ? `Requesting ${host}...`
        : `Sending ${activity.method} request...`
    }
    case 'shell:browse': {
      const host = tryParseHost(activity.url)
      return host
        ? `Browsing ${host}...`
        : 'Browsing web page...'
    }
    case 'shell:file_read':
      return activity.path
        ? `Reading ${basename(activity.path)}...`
        : 'Reading file...'
    case 'shell:file_write':
      if (activity.target) return `Writing to ${basename(activity.target)}...`
      if (activity.path) return `Editing ${basename(activity.path)}...`
      return 'Writing file...'
    case 'shell:file_search':
      if (activity.pattern) return `Searching for "${activity.pattern}"...`
      if (activity.namePattern) return `Finding ${activity.namePattern} files...`
      return 'Searching files...'
    case 'shell:file_manage': {
      const name = activity.path ? basename(activity.path) : undefined
      switch (activity.action) {
        case 'list':
          return name ? `Listing ${name}...` : 'Listing files...'
        case 'create_dir':
          return name ? `Creating ${name}/...` : 'Creating directory...'
        case 'remove':
          return name ? `Removing ${name}...` : 'Removing files...'
        case 'copy':
          return name ? `Copying ${name}...` : 'Copying files...'
        case 'move':
          return name ? `Moving ${name}...` : 'Moving files...'
        case 'chmod':
          return name ? `Changing permissions on ${name}...` : 'Changing permissions...'
        case 'touch':
          return name ? `Touching ${name}...` : 'Creating file...'
        default:
          return name ? `Managing ${name}...` : 'Managing files...'
      }
    }
    case 'shell:file_info': {
      const name = activity.path ? basename(activity.path) : undefined
      switch (activity.mode) {
        case 'lines': return name ? `Counting lines in ${name}...` : 'Counting lines...'
        case 'words': return name ? `Counting words in ${name}...` : 'Counting words...'
        case 'chars': return name ? `Counting chars in ${name}...` : 'Counting characters...'
        default: return name ? `Inspecting ${name}...` : 'Inspecting file...'
      }
    }
    case 'shell:data_transform':
      return activity.path
        ? `Processing ${basename(activity.path)}...`
        : 'Processing data...'
    case 'shell:system': {
      switch (activity.action) {
        case 'env': return 'Checking environment...'
        case 'date': return 'Getting date...'
        case 'help': return activity.command ? `Getting help for ${activity.command}...` : 'Getting help...'
        case 'which': return activity.command ? `Finding ${activity.command}...` : 'Finding command...'
        case 'whoami': return 'Checking user...'
        case 'pwd': return 'Getting working directory...'
        case 'uname': return 'Checking system info...'
        default: return 'Running system command...'
      }
    }
    case 'shell:other':
      return 'Running command...'

    // ---- Built-in tools ----
    case 'tool:read_file':
      return `Reading ${basename(activity.path)}...`
    case 'tool:edit_file':
      return `Editing ${basename(activity.path)}...`
    case 'tool:write_file':
      return `Writing ${basename(activity.path)}...`
    case 'tool:search_files':
      return `Finding ${activity.pattern} files...`
    case 'tool:search_content':
      return `Searching for "${activity.pattern}"...`
    case 'tool:web_fetch': {
      const host = tryParseHost(activity.url)
      return host
        ? `Fetching ${host}...`
        : 'Fetching URL...'
    }
    case 'tool:web_search':
      return `Searching: "${activity.query}"...`
    case 'tool:sub_agent':
      return `Delegating to ${activity.agentName}...`
    case 'tool:task_manage': {
      switch (activity.action) {
        case 'create': return activity.subject
          ? `Creating task: ${activity.subject}...`
          : 'Creating task...'
        case 'update': return 'Updating task...'
        case 'delete': return 'Deleting task...'
        case 'list': return 'Checking tasks...'
        case 'get': return 'Getting task details...'
      }
      return 'Managing task...'
    }
    case 'tool:other':
      return `Running ${activity.toolName}...`

    // ---- Agent lifecycle ----
    case 'agent:thinking':
      return 'Thinking...'
    case 'agent:responding':
      return 'Responding...'
    case 'agent:interrupted':
      return activity.reason
        ? `Interrupted: ${activity.reason}`
        : 'Interrupted'
  }
}

// ============================================================================
// Shell Activity Extraction
// ============================================================================

/**
 * Extract a typed Activity from a ParsedCommand.
 */
export function extractShellActivity(parsed: ParsedCommand): Activity {
  switch (parsed.command) {
    case 'curl': {
      const url = parsed.args.find(a => a.startsWith('http'))
      const methodIdx = parsed.args.indexOf('-X')
      const method = methodIdx >= 0 ? (parsed.args[methodIdx + 1] ?? 'GET') :
        (parsed.args.includes('-d') || parsed.args.includes('--data-raw') ? 'POST' : 'GET')
      return { type: 'shell:http_request', url, method }
    }
    case 'wget': {
      const url = parsed.args.find(a => a.startsWith('http'))
      return { type: 'shell:http_request', url, method: 'GET' }
    }
    case 'browse':
      return { type: 'shell:browse', url: parsed.args[0] }
    case 'cat':
      return { type: 'shell:file_read', path: parsed.args.find(a => !a.startsWith('-')) }
    case 'head':
    case 'tail': {
      const nIdx = parsed.args.indexOf('-n')
      const nValue = nIdx >= 0 ? parsed.args[nIdx + 1] : undefined
      // Skip the -n flag, its value, and any flag-like args to find the file path
      const skipIndices = new Set<number>()
      for (let i = 0; i < parsed.args.length; i++) {
        if (parsed.args[i].startsWith('-')) { skipIndices.add(i); skipIndices.add(i + 1) }
      }
      const path = parsed.args.find((_a, i) => !skipIndices.has(i))
      return {
        type: 'shell:file_read',
        path,
        lines: nValue ? Number(nValue) : undefined
      }
    }
    case 'grep': {
      const flags = parsed.args.filter(a => a.startsWith('-'))
      const positional = parsed.args.filter(a => !a.startsWith('-'))
      return { type: 'shell:file_search', pattern: positional[0], path: positional[1], flags }
    }
    case 'find': {
      const nameIdx = parsed.args.indexOf('-name')
      const typeIdx = parsed.args.indexOf('-type')
      return {
        type: 'shell:file_search',
        path: parsed.args[0],
        namePattern: nameIdx >= 0 ? parsed.args[nameIdx + 1] : undefined,
        fileType: typeIdx >= 0 ? parsed.args[typeIdx + 1] : undefined
      }
    }
    case 'ls':
      return { type: 'shell:file_manage', action: 'list', path: parsed.args.find(a => !a.startsWith('-')) ?? '.' }
    case 'mkdir':
      return { type: 'shell:file_manage', action: 'create_dir', path: parsed.args.find(a => !a.startsWith('-')) }
    case 'rm':
      return {
        type: 'shell:file_manage',
        action: 'remove',
        path: parsed.args.find(a => !a.startsWith('-')),
        recursive: parsed.args.includes('-r') || parsed.args.includes('-rf') || parsed.args.includes('-fr')
      }
    case 'cp':
      return { type: 'shell:file_manage', action: 'copy', path: parsed.args.find(a => !a.startsWith('-')) }
    case 'mv':
      return { type: 'shell:file_manage', action: 'move', path: parsed.args.find(a => !a.startsWith('-')) }
    case 'chmod':
      return { type: 'shell:file_manage', action: 'chmod', path: parsed.args.find(a => !a.startsWith('-')) }
    case 'touch':
      return { type: 'shell:file_manage', action: 'touch', path: parsed.args.find(a => !a.startsWith('-')) }
    case 'echo':
      return { type: 'shell:file_write', target: parsed.outputFile ?? parsed.appendFile }
    case 'sed': {
      const pattern = parsed.args.find(a => a.includes('/'))
      return {
        type: 'shell:file_write',
        path: parsed.args.find(a => !a.startsWith('-') && !a.includes('/')),
        pattern
      }
    }
    case 'file':
      return { type: 'shell:file_info', path: parsed.args[0] }
    case 'wc': {
      const mode = parsed.args.includes('-l') ? 'lines' as const
        : parsed.args.includes('-w') ? 'words' as const
        : 'chars' as const
      return { type: 'shell:file_info', path: parsed.args.find(a => !a.startsWith('-')), mode }
    }
    case 'jq':
      return {
        type: 'shell:data_transform',
        filter: parsed.args.find(a => !a.startsWith('-')),
        path: parsed.args.find((a, i) => i > 0 && !a.startsWith('-'))
      }
    case 'sort':
      return {
        type: 'shell:data_transform',
        path: parsed.args.find(a => !a.startsWith('-')),
        numeric: parsed.args.includes('-n'),
        reverse: parsed.args.includes('-r')
      }
    case 'env':
      return { type: 'shell:system', action: 'env' }
    case 'date': {
      const fmt = parsed.args.find(a => a.startsWith('+'))
      return { type: 'shell:system', action: 'date', format: fmt?.slice(1) }
    }
    case 'help':
      return { type: 'shell:system', action: 'help', command: parsed.args[0] }
    case 'which':
      return { type: 'shell:system', action: 'which', command: parsed.args[0] }
    case 'whoami':
      return { type: 'shell:system', action: 'whoami' }
    case 'pwd':
      return { type: 'shell:system', action: 'pwd' }
    case 'uname':
      return { type: 'shell:system', action: 'uname' }
    default:
      return { type: 'shell:other' }
  }
}

/**
 * Extract activity from a pipeline of commands.
 * Classifies by first command, enriched with context from downstream commands.
 */
export function extractPipelineActivity(parsed: ParsedCommand): Activity {
  const first = parsed
  const last = getLastInPipeline(parsed)

  // Network commands always win
  if (first.command === 'curl' || first.command === 'wget' || first.command === 'browse') {
    return extractShellActivity(first)
  }

  // File read piped into transform -> it's a transform with source context
  const fileReaders = ['cat', 'head', 'tail']
  const transformers = ['jq', 'sort', 'sed']
  if (fileReaders.includes(first.command) && transformers.includes(last.command)) {
    const path = first.args.find(a => !a.startsWith('-'))
    const transformActivity = extractShellActivity(last)
    if (transformActivity.type === 'shell:data_transform') {
      return { ...transformActivity, path: path ?? transformActivity.path }
    }
  }

  // Default: classify by first command
  return extractShellActivity(first)
}

function getLastInPipeline(parsed: ParsedCommand): ParsedCommand {
  let current = parsed
  while (current.pipe) current = current.pipe
  return current
}

/**
 * Classify a built-in tool call into an Activity.
 */
export function classifyTool(
  toolName: string,
  params: Record<string, unknown>
): Activity | undefined {
  switch (toolName) {
    case '__shell__':
      return undefined // Handled separately via extractShellActivity/extractPipelineActivity

    case '__sub_agent__': {
      const agent = (params as { agent?: string }).agent
      return { type: 'tool:sub_agent', agentName: agent ?? 'unknown' }
    }

    case 'TaskCreate': {
      const subject = (params as { subject?: string }).subject
      return { type: 'tool:task_manage', action: 'create', subject }
    }
    case 'TaskUpdate': {
      const status = (params as { status?: string }).status
      return { type: 'tool:task_manage', action: status === 'deleted' ? 'delete' : 'update' }
    }
    case 'TaskList':
      return { type: 'tool:task_manage', action: 'list' }
    case 'TaskGet':
      return { type: 'tool:task_manage', action: 'get' }

    default:
      // Try to detect common tool patterns by name
      return classifyByToolName(toolName, params)
  }
}

/**
 * Classify tools by naming conventions (Read, Write, Edit, Glob, Grep, WebFetch, WebSearch, etc.)
 */
function classifyByToolName(
  toolName: string,
  params: Record<string, unknown>
): Activity | undefined {
  const nameLower = toolName.toLowerCase()

  // File read tools
  if (nameLower === 'read' || nameLower.endsWith('_read') || nameLower === 'readfile') {
    const path = (params as { file_path?: string; path?: string }).file_path
      ?? (params as { path?: string }).path ?? ''
    return { type: 'tool:read_file', path }
  }

  // File edit tools
  if (nameLower === 'edit' || nameLower.endsWith('_edit') || nameLower === 'editfile') {
    const path = (params as { file_path?: string; path?: string }).file_path
      ?? (params as { path?: string }).path ?? ''
    return { type: 'tool:edit_file', path }
  }

  // File write tools
  if (nameLower === 'write' || nameLower.endsWith('_write') || nameLower === 'writefile') {
    const path = (params as { file_path?: string; path?: string }).file_path
      ?? (params as { path?: string }).path ?? ''
    return { type: 'tool:write_file', path }
  }

  // File search (glob) tools
  if (nameLower === 'glob' || nameLower === 'searchfiles' || nameLower === 'search_files') {
    const pattern = (params as { pattern?: string }).pattern ?? '*'
    return { type: 'tool:search_files', pattern }
  }

  // Content search (grep) tools
  if (nameLower === 'grep' || nameLower === 'searchcontent' || nameLower === 'search_content') {
    const pattern = (params as { pattern?: string }).pattern ?? ''
    const path = (params as { path?: string }).path
    return { type: 'tool:search_content', pattern, path }
  }

  // Web fetch tools
  if (nameLower === 'webfetch' || nameLower === 'web_fetch' || nameLower === 'fetch') {
    const url = (params as { url?: string }).url ?? ''
    const method = (params as { method?: string }).method ?? 'GET'
    return { type: 'tool:web_fetch', url, method }
  }

  // Web search tools
  if (nameLower === 'websearch' || nameLower === 'web_search') {
    const query = (params as { query?: string }).query ?? ''
    return { type: 'tool:web_search', query }
  }

  // Workspace tools
  if (nameLower.startsWith('workspace_read') || nameLower === 'workspace_get') {
    const path = (params as { path?: string }).path ?? ''
    return { type: 'tool:read_file', path }
  }
  if (nameLower.startsWith('workspace_write') || nameLower === 'workspace_set') {
    const path = (params as { path?: string }).path ?? ''
    return { type: 'tool:write_file', path }
  }
  if (nameLower.startsWith('workspace_list')) {
    return { type: 'tool:search_files', pattern: '*' }
  }

  // Unknown tool
  return { type: 'tool:other', toolName }
}

// ============================================================================
// Shell Command Classification (public API)
// ============================================================================

/**
 * Classify a shell command string into a typed Activity.
 * Parses the command and extracts semantic activity information.
 * Returns undefined if parsing fails.
 */
export function classifyShellCommand(command: string): Activity | undefined {
  try {
    const parsed = parseCommand(command)
    if (!parsed || parsed.length === 0) return undefined
    const first = parsed[0]
    return first.pipe ? extractPipelineActivity(first) : extractShellActivity(first)
  } catch {
    return undefined
  }
}

// ============================================================================
// Helpers
// ============================================================================

function tryParseHost(url?: string): string | undefined {
  if (!url) return undefined
  try { return new URL(url).hostname } catch { return undefined }
}

function basename(path: string): string {
  return path.split('/').pop() ?? path
}
