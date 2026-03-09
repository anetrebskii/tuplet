import { describe, it, expect } from 'vitest'
import {
  describeActivity,
  extractShellActivity,
  extractPipelineActivity,
  classifyTool,
  type Activity
} from './activity.js'
import type { ParsedCommand } from './shell/types.js'

// ============================================================================
// describeActivity
// ============================================================================

describe('describeActivity', () => {
  // ---- Shell activities ----

  describe('shell:http_request', () => {
    it('shows hostname when URL is available', () => {
      expect(describeActivity({
        type: 'shell:http_request', url: 'https://api.stripe.com/v1/charges', method: 'POST'
      })).toBe('Requesting api.stripe.com...')
    })

    it('falls back to method when no URL', () => {
      expect(describeActivity({
        type: 'shell:http_request', method: 'POST'
      })).toBe('Sending POST request...')
    })

    it('falls back to method when URL is invalid', () => {
      expect(describeActivity({
        type: 'shell:http_request', url: 'not-a-url', method: 'GET'
      })).toBe('Sending GET request...')
    })
  })

  describe('shell:browse', () => {
    it('shows hostname', () => {
      expect(describeActivity({
        type: 'shell:browse', url: 'https://docs.python.org/3/library/json.html'
      })).toBe('Browsing docs.python.org...')
    })

    it('falls back without URL', () => {
      expect(describeActivity({ type: 'shell:browse' })).toBe('Browsing web page...')
    })
  })

  describe('shell:file_read', () => {
    it('shows basename', () => {
      expect(describeActivity({
        type: 'shell:file_read', path: 'src/utils/format.ts'
      })).toBe('Reading format.ts...')
    })

    it('falls back without path', () => {
      expect(describeActivity({ type: 'shell:file_read' })).toBe('Reading file...')
    })
  })

  describe('shell:file_write', () => {
    it('shows target for redirect', () => {
      expect(describeActivity({
        type: 'shell:file_write', target: 'output.csv'
      })).toBe('Writing to output.csv...')
    })

    it('shows path for edit', () => {
      expect(describeActivity({
        type: 'shell:file_write', path: '/etc/config.yaml'
      })).toBe('Editing config.yaml...')
    })

    it('falls back without path or target', () => {
      expect(describeActivity({ type: 'shell:file_write' })).toBe('Writing file...')
    })
  })

  describe('shell:file_search', () => {
    it('shows pattern for grep', () => {
      expect(describeActivity({
        type: 'shell:file_search', pattern: 'TODO'
      })).toBe('Searching for "TODO"...')
    })

    it('shows namePattern for find', () => {
      expect(describeActivity({
        type: 'shell:file_search', namePattern: '*.test.ts'
      })).toBe('Finding *.test.ts files...')
    })

    it('falls back without pattern', () => {
      expect(describeActivity({ type: 'shell:file_search' })).toBe('Searching files...')
    })
  })

  describe('shell:file_manage', () => {
    it('shows basename', () => {
      expect(describeActivity({
        type: 'shell:file_manage', path: 'dist'
      })).toBe('Managing dist...')
    })

    it('falls back without path', () => {
      expect(describeActivity({ type: 'shell:file_manage' })).toBe('Managing files...')
    })
  })

  describe('shell:file_info', () => {
    it('shows basename', () => {
      expect(describeActivity({
        type: 'shell:file_info', path: 'package.json'
      })).toBe('Inspecting package.json...')
    })

    it('falls back without path', () => {
      expect(describeActivity({ type: 'shell:file_info' })).toBe('Inspecting file...')
    })
  })

  describe('shell:data_transform', () => {
    it('shows basename when path available', () => {
      expect(describeActivity({
        type: 'shell:data_transform', path: 'data.json', filter: '.items[].name'
      })).toBe('Processing data.json...')
    })

    it('falls back without path', () => {
      expect(describeActivity({ type: 'shell:data_transform' })).toBe('Processing data...')
    })
  })

  it('shell:system', () => {
    expect(describeActivity({ type: 'shell:system' })).toBe('Running system command...')
  })

  it('shell:other', () => {
    expect(describeActivity({ type: 'shell:other' })).toBe('Running command...')
  })

  // ---- Built-in tool activities ----

  it('tool:read_file', () => {
    expect(describeActivity({
      type: 'tool:read_file', path: 'src/index.ts'
    })).toBe('Reading index.ts...')
  })

  it('tool:edit_file', () => {
    expect(describeActivity({
      type: 'tool:edit_file', path: 'src/utils.ts'
    })).toBe('Editing utils.ts...')
  })

  it('tool:write_file', () => {
    expect(describeActivity({
      type: 'tool:write_file', path: 'dist/bundle.js'
    })).toBe('Writing bundle.js...')
  })

  it('tool:search_files', () => {
    expect(describeActivity({
      type: 'tool:search_files', pattern: '**/*.ts'
    })).toBe('Finding **/*.ts files...')
  })

  it('tool:search_content', () => {
    expect(describeActivity({
      type: 'tool:search_content', pattern: 'TODO'
    })).toBe('Searching for "TODO"...')
  })

  describe('tool:web_fetch', () => {
    it('shows hostname', () => {
      expect(describeActivity({
        type: 'tool:web_fetch', url: 'https://api.github.com/repos', method: 'GET'
      })).toBe('Fetching api.github.com...')
    })

    it('falls back without valid URL', () => {
      expect(describeActivity({
        type: 'tool:web_fetch', url: '', method: 'GET'
      })).toBe('Fetching URL...')
    })
  })

  it('tool:web_search', () => {
    expect(describeActivity({
      type: 'tool:web_search', query: 'TypeScript discriminated unions'
    })).toBe('Searching: "TypeScript discriminated unions"...')
  })

  it('tool:sub_agent', () => {
    expect(describeActivity({
      type: 'tool:sub_agent', agentName: 'researcher'
    })).toBe('Delegating to researcher...')
  })

  describe('tool:task_manage', () => {
    it('create with subject', () => {
      expect(describeActivity({
        type: 'tool:task_manage', action: 'create', subject: 'Fix login bug'
      })).toBe('Creating task: Fix login bug...')
    })

    it('create without subject', () => {
      expect(describeActivity({
        type: 'tool:task_manage', action: 'create'
      })).toBe('Creating task...')
    })

    it('update', () => {
      expect(describeActivity({
        type: 'tool:task_manage', action: 'update'
      })).toBe('Updating task...')
    })

    it('delete', () => {
      expect(describeActivity({
        type: 'tool:task_manage', action: 'delete'
      })).toBe('Deleting task...')
    })

    it('list', () => {
      expect(describeActivity({
        type: 'tool:task_manage', action: 'list'
      })).toBe('Checking tasks...')
    })

    it('get', () => {
      expect(describeActivity({
        type: 'tool:task_manage', action: 'get'
      })).toBe('Getting task details...')
    })
  })

  it('tool:other', () => {
    expect(describeActivity({
      type: 'tool:other', toolName: 'custom_tool'
    })).toBe('Running custom_tool...')
  })

  // ---- Agent lifecycle ----

  it('agent:thinking', () => {
    expect(describeActivity({ type: 'agent:thinking' })).toBe('Thinking...')
  })

  it('agent:responding', () => {
    expect(describeActivity({ type: 'agent:responding' })).toBe('Responding...')
  })

  describe('agent:interrupted', () => {
    it('with reason', () => {
      expect(describeActivity({
        type: 'agent:interrupted', reason: 'token limit reached'
      })).toBe('Interrupted: token limit reached')
    })

    it('without reason', () => {
      expect(describeActivity({ type: 'agent:interrupted' })).toBe('Interrupted')
    })
  })
})

// ============================================================================
// extractShellActivity
// ============================================================================

describe('extractShellActivity', () => {
  function cmd(command: string, args: string[] = [], extra: Partial<ParsedCommand> = {}): ParsedCommand {
    return { command, args, ...extra }
  }

  it('curl with URL and method flag', () => {
    const activity = extractShellActivity(cmd('curl', ['-X', 'POST', 'https://api.stripe.com/v1/charges', '-d', 'amount=100']))
    expect(activity).toEqual({
      type: 'shell:http_request',
      url: 'https://api.stripe.com/v1/charges',
      method: 'POST'
    })
  })

  it('curl GET (default)', () => {
    const activity = extractShellActivity(cmd('curl', ['https://api.example.com']))
    expect(activity).toEqual({
      type: 'shell:http_request',
      url: 'https://api.example.com',
      method: 'GET'
    })
  })

  it('curl POST inferred from -d', () => {
    const activity = extractShellActivity(cmd('curl', ['-d', 'data', 'https://api.example.com']))
    expect(activity).toEqual({
      type: 'shell:http_request',
      url: 'https://api.example.com',
      method: 'POST'
    })
  })

  it('wget', () => {
    const activity = extractShellActivity(cmd('wget', ['https://example.com/file.tar.gz']))
    expect(activity).toEqual({
      type: 'shell:http_request',
      url: 'https://example.com/file.tar.gz',
      method: 'GET'
    })
  })

  it('browse', () => {
    const activity = extractShellActivity(cmd('browse', ['https://docs.python.org']))
    expect(activity).toEqual({
      type: 'shell:browse',
      url: 'https://docs.python.org'
    })
  })

  it('cat', () => {
    const activity = extractShellActivity(cmd('cat', ['src/utils/format.ts']))
    expect(activity).toEqual({
      type: 'shell:file_read',
      path: 'src/utils/format.ts'
    })
  })

  it('head with -n', () => {
    const activity = extractShellActivity(cmd('head', ['-n', '10', 'config/app.json']))
    expect(activity).toEqual({
      type: 'shell:file_read',
      path: 'config/app.json',
      lines: 10
    })
  })

  it('tail', () => {
    const activity = extractShellActivity(cmd('tail', ['log.txt']))
    expect(activity).toEqual({
      type: 'shell:file_read',
      path: 'log.txt',
      lines: undefined
    })
  })

  it('grep', () => {
    const activity = extractShellActivity(cmd('grep', ['-ri', 'TODO', 'src/']))
    expect(activity).toEqual({
      type: 'shell:file_search',
      pattern: 'TODO',
      path: 'src/',
      flags: ['-ri']
    })
  })

  it('find with -name', () => {
    const activity = extractShellActivity(cmd('find', ['.', '-name', '*.test.ts']))
    expect(activity).toEqual({
      type: 'shell:file_search',
      path: '.',
      namePattern: '*.test.ts',
      fileType: undefined
    })
  })

  it('find with -type', () => {
    const activity = extractShellActivity(cmd('find', ['.', '-type', 'f', '-name', '*.ts']))
    expect(activity).toEqual({
      type: 'shell:file_search',
      path: '.',
      namePattern: '*.ts',
      fileType: 'f'
    })
  })

  it('ls', () => {
    const activity = extractShellActivity(cmd('ls', ['-la', 'src/']))
    expect(activity).toEqual({
      type: 'shell:file_manage',
      action: 'list',
      path: 'src/'
    })
  })

  it('ls without args', () => {
    const activity = extractShellActivity(cmd('ls', []))
    expect(activity).toEqual({
      type: 'shell:file_manage',
      action: 'list',
      path: '.'
    })
  })

  it('mkdir', () => {
    const activity = extractShellActivity(cmd('mkdir', ['-p', 'dist/']))
    expect(activity).toEqual({
      type: 'shell:file_manage',
      action: 'create_dir',
      path: 'dist/'
    })
  })

  it('rm', () => {
    const activity = extractShellActivity(cmd('rm', ['-r', 'dist/']))
    expect(activity).toEqual({
      type: 'shell:file_manage',
      action: 'remove',
      path: 'dist/',
      recursive: true
    })
  })

  it('rm -rf', () => {
    const activity = extractShellActivity(cmd('rm', ['-rf', 'dist/']))
    expect(activity).toEqual({
      type: 'shell:file_manage',
      action: 'remove',
      path: 'dist/',
      recursive: true
    })
  })

  it('echo with redirect', () => {
    const activity = extractShellActivity(cmd('echo', ['data'], { outputFile: 'output.csv' }))
    expect(activity).toEqual({
      type: 'shell:file_write',
      target: 'output.csv'
    })
  })

  it('echo with append redirect', () => {
    const activity = extractShellActivity(cmd('echo', ['data'], { appendFile: 'log.txt' }))
    expect(activity).toEqual({
      type: 'shell:file_write',
      target: 'log.txt'
    })
  })

  it('sed', () => {
    const activity = extractShellActivity(cmd('sed', ['-i', 's/old/new/g', 'file.txt']))
    expect(activity).toEqual({
      type: 'shell:file_write',
      path: 'file.txt',
      pattern: 's/old/new/g'
    })
  })

  it('file', () => {
    const activity = extractShellActivity(cmd('file', ['image.png']))
    expect(activity).toEqual({
      type: 'shell:file_info',
      path: 'image.png'
    })
  })

  it('wc -l', () => {
    const activity = extractShellActivity(cmd('wc', ['-l', 'data.txt']))
    expect(activity).toEqual({
      type: 'shell:file_info',
      path: 'data.txt',
      mode: 'lines'
    })
  })

  it('wc -w', () => {
    const activity = extractShellActivity(cmd('wc', ['-w', 'data.txt']))
    expect(activity).toEqual({
      type: 'shell:file_info',
      path: 'data.txt',
      mode: 'words'
    })
  })

  it('jq', () => {
    const activity = extractShellActivity(cmd('jq', ['.items[].name', 'data.json']))
    expect(activity).toEqual({
      type: 'shell:data_transform',
      filter: '.items[].name',
      path: 'data.json'
    })
  })

  it('sort', () => {
    const activity = extractShellActivity(cmd('sort', ['-n', '-r', 'scores.txt']))
    expect(activity).toEqual({
      type: 'shell:data_transform',
      path: 'scores.txt',
      numeric: true,
      reverse: true
    })
  })

  it('env', () => {
    expect(extractShellActivity(cmd('env'))).toEqual({ type: 'shell:system', action: 'env' })
  })

  it('date with format', () => {
    const activity = extractShellActivity(cmd('date', ['+%Y-%m-%d']))
    expect(activity).toEqual({
      type: 'shell:system',
      action: 'date',
      format: '%Y-%m-%d'
    })
  })

  it('help', () => {
    const activity = extractShellActivity(cmd('help', ['curl']))
    expect(activity).toEqual({
      type: 'shell:system',
      action: 'help',
      command: 'curl'
    })
  })

  it('unknown command returns shell:other', () => {
    expect(extractShellActivity(cmd('docker', ['build', '.']))).toEqual({
      type: 'shell:other'
    })
  })
})

// ============================================================================
// extractPipelineActivity
// ============================================================================

describe('extractPipelineActivity', () => {
  function pipe(commands: Array<{ command: string, args: string[] }>): ParsedCommand {
    const parsed: ParsedCommand[] = commands.map(c => ({ command: c.command, args: c.args }))
    for (let i = 0; i < parsed.length - 1; i++) {
      parsed[i].pipe = parsed[i + 1]
    }
    return parsed[0]
  }

  it('cat | jq -> data_transform with file path', () => {
    const activity = extractPipelineActivity(pipe([
      { command: 'cat', args: ['data.json'] },
      { command: 'jq', args: ['.items'] }
    ]))
    expect(activity.type).toBe('shell:data_transform')
    expect((activity as any).path).toBe('data.json')
  })

  it('cat | sort -> data_transform with file path', () => {
    const activity = extractPipelineActivity(pipe([
      { command: 'cat', args: ['data.csv'] },
      { command: 'sort', args: ['-n'] }
    ]))
    expect(activity.type).toBe('shell:data_transform')
    expect((activity as any).path).toBe('data.csv')
  })

  it('curl | jq -> http_request (network wins)', () => {
    const activity = extractPipelineActivity(pipe([
      { command: 'curl', args: ['https://api.com'] },
      { command: 'jq', args: ['.results'] }
    ]))
    expect(activity.type).toBe('shell:http_request')
    expect((activity as any).url).toBe('https://api.com')
  })

  it('grep | wc -> file_search (first command)', () => {
    const activity = extractPipelineActivity(pipe([
      { command: 'grep', args: ['TODO', 'src/'] },
      { command: 'wc', args: ['-l'] }
    ]))
    expect(activity.type).toBe('shell:file_search')
    expect((activity as any).pattern).toBe('TODO')
  })

  it('cat | grep -> file_read (first command, not transform)', () => {
    const activity = extractPipelineActivity(pipe([
      { command: 'cat', args: ['log.txt'] },
      { command: 'grep', args: ['ERROR'] }
    ]))
    expect(activity.type).toBe('shell:file_read')
    expect((activity as any).path).toBe('log.txt')
  })

  it('find | grep -> file_search (first command)', () => {
    const activity = extractPipelineActivity(pipe([
      { command: 'find', args: ['.', '-name', '*.ts'] },
      { command: 'grep', args: ['test'] }
    ]))
    expect(activity.type).toBe('shell:file_search')
  })
})

// ============================================================================
// classifyTool
// ============================================================================

describe('classifyTool', () => {
  it('__sub_agent__ -> tool:sub_agent', () => {
    const activity = classifyTool('__sub_agent__', { agent: 'researcher' })
    expect(activity).toEqual({ type: 'tool:sub_agent', agentName: 'researcher' })
  })

  it('__shell__ returns undefined (handled separately)', () => {
    expect(classifyTool('__shell__', { command: 'ls' })).toBeUndefined()
  })

  it('TaskCreate with subject', () => {
    const activity = classifyTool('TaskCreate', { subject: 'Fix bug' })
    expect(activity).toEqual({ type: 'tool:task_manage', action: 'create', subject: 'Fix bug' })
  })

  it('TaskUpdate with deleted status', () => {
    const activity = classifyTool('TaskUpdate', { status: 'deleted' })
    expect(activity).toEqual({ type: 'tool:task_manage', action: 'delete' })
  })

  it('TaskUpdate with other status', () => {
    const activity = classifyTool('TaskUpdate', { status: 'completed' })
    expect(activity).toEqual({ type: 'tool:task_manage', action: 'update' })
  })

  it('TaskList', () => {
    expect(classifyTool('TaskList', {})).toEqual({ type: 'tool:task_manage', action: 'list' })
  })

  it('TaskGet', () => {
    expect(classifyTool('TaskGet', {})).toEqual({ type: 'tool:task_manage', action: 'get' })
  })

  // Tool name classification
  it('Read tool', () => {
    const activity = classifyTool('Read', { file_path: '/src/index.ts' })
    expect(activity).toEqual({ type: 'tool:read_file', path: '/src/index.ts' })
  })

  it('Edit tool', () => {
    const activity = classifyTool('Edit', { file_path: '/src/utils.ts' })
    expect(activity).toEqual({ type: 'tool:edit_file', path: '/src/utils.ts' })
  })

  it('Write tool', () => {
    const activity = classifyTool('Write', { file_path: '/src/new.ts' })
    expect(activity).toEqual({ type: 'tool:write_file', path: '/src/new.ts' })
  })

  it('Glob tool', () => {
    const activity = classifyTool('Glob', { pattern: '**/*.ts' })
    expect(activity).toEqual({ type: 'tool:search_files', pattern: '**/*.ts' })
  })

  it('Grep tool', () => {
    const activity = classifyTool('Grep', { pattern: 'TODO', path: 'src/' })
    expect(activity).toEqual({ type: 'tool:search_content', pattern: 'TODO', path: 'src/' })
  })

  it('WebFetch tool', () => {
    const activity = classifyTool('WebFetch', { url: 'https://api.github.com', method: 'GET' })
    expect(activity).toEqual({ type: 'tool:web_fetch', url: 'https://api.github.com', method: 'GET' })
  })

  it('WebSearch tool', () => {
    const activity = classifyTool('WebSearch', { query: 'TypeScript' })
    expect(activity).toEqual({ type: 'tool:web_search', query: 'TypeScript' })
  })

  it('unknown tool -> tool:other', () => {
    const activity = classifyTool('MyCustomTool', {})
    expect(activity).toEqual({ type: 'tool:other', toolName: 'MyCustomTool' })
  })
})

// ============================================================================
// End-to-end label examples from the issue
// ============================================================================

describe('label examples from issue', () => {
  const cases: Array<{ activity: Activity, expected: string }> = [
    { activity: { type: 'shell:http_request', url: 'https://api.stripe.com/v1/charges', method: 'POST' }, expected: 'Requesting api.stripe.com...' },
    { activity: { type: 'shell:browse', url: 'https://docs.python.org/3/library/json.html' }, expected: 'Browsing docs.python.org...' },
    { activity: { type: 'shell:file_read', path: 'src/utils/format.ts' }, expected: 'Reading format.ts...' },
    { activity: { type: 'shell:file_read', path: 'config/app.json', lines: 10 }, expected: 'Reading app.json...' },
    { activity: { type: 'shell:file_search', pattern: 'TODO', path: 'src/', flags: ['-ri'] }, expected: 'Searching for "TODO"...' },
    { activity: { type: 'shell:file_search', path: '.', namePattern: '*.test.ts' }, expected: 'Finding *.test.ts files...' },
    { activity: { type: 'shell:file_write', target: 'output.csv' }, expected: 'Writing to output.csv...' },
    { activity: { type: 'shell:file_manage', path: 'dist', recursive: true }, expected: 'Managing dist...' },
    { activity: { type: 'shell:data_transform', filter: '.items[].name', path: 'data.json' }, expected: 'Processing data.json...' },
    { activity: { type: 'tool:read_file', path: 'src/index.ts' }, expected: 'Reading index.ts...' },
    { activity: { type: 'tool:search_files', pattern: '**/*.ts' }, expected: 'Finding **/*.ts files...' },
    { activity: { type: 'tool:web_fetch', url: 'https://api.github.com/repos', method: 'GET' }, expected: 'Fetching api.github.com...' },
    { activity: { type: 'tool:sub_agent', agentName: 'researcher' }, expected: 'Delegating to researcher...' },
    { activity: { type: 'tool:task_manage', action: 'create', subject: 'Fix login bug' }, expected: 'Creating task: Fix login bug...' },
    { activity: { type: 'agent:thinking' }, expected: 'Thinking...' },
    { activity: { type: 'agent:interrupted', reason: 'token limit reached' }, expected: 'Interrupted: token limit reached' },
  ]

  cases.forEach(({ activity, expected }) => {
    it(`${activity.type} -> "${expected}"`, () => {
      expect(describeActivity(activity)).toBe(expected)
    })
  })
})
