import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Shell } from './shell.js'
import { commands } from './commands/index.js'

describe('Shell', () => {
  let shell: Shell

  beforeEach(() => {
    shell = new Shell()
  })

  describe('constructor', () => {
    it('creates shell with default options', () => {
      expect(shell.getFS()).toBeDefined()
      expect(shell.getEnv()).toEqual({})
    })

    it('accepts initial context data', () => {
      shell = new Shell({ initialContext: { name: 'Alice' } })
      const fs = shell.getFS()
      expect(fs.read('/ctx/name')).toBe('Alice')
    })

    it('accepts an external VirtualFS instance', async () => {
      const original = new Shell({ initialContext: { key: 'value' } })
      const shared = new Shell({ fs: original.getFS() })

      const result = await shared.execute('cat /ctx/key')
      expect(result.stdout).toBe('value')
    })
  })

  describe('execute', () => {
    it('returns empty result for empty input', async () => {
      const result = await shell.execute('')
      expect(result).toEqual({ exitCode: 0, stdout: '', stderr: '' })
    })

    it('returns error for unknown commands with list of available ones', async () => {
      const result = await shell.execute('nonexistent arg1')
      expect(result.exitCode).toBe(127)
      expect(result.stderr).toContain('command not found: nonexistent')
      expect(result.stderr).toContain('Available commands:')
      expect(result.stderr).toContain('cat')
      expect(result.stderr).toContain('echo')
      expect(result.stderr).toContain('grep')
    })

    it('catches and returns errors as stderr', async () => {
      // cat with no args and no stdin produces an error
      const result = await shell.execute('cat')
      expect(result.exitCode).toBe(1)
      expect(result.stderr).toBeTruthy()
    })
  })

  describe('built-in commands', () => {
    describe('echo', () => {
      it('echoes text with trailing newline', async () => {
        const result = await shell.execute('echo hello world')
        expect(result.exitCode).toBe(0)
        expect(result.stdout).toBe('hello world\n')
      })

      it('supports -n flag to suppress newline', async () => {
        const result = await shell.execute('echo -n hello')
        expect(result.stdout).toBe('hello')
      })

      it('supports -e flag for escape sequences', async () => {
        // Single quotes preserve literal backslash through the parser
        const result = await shell.execute("echo -e 'hello\\nworld'")
        expect(result.stdout).toBe('hello\nworld\n')
      })
    })

    describe('cat', () => {
      it('reads file content', async () => {
        shell.getFS().write('/ctx/data', 'file content')
        const result = await shell.execute('cat /ctx/data')
        expect(result.exitCode).toBe(0)
        expect(result.stdout).toBe('file content')
      })

      it('returns error for missing file', async () => {
        const result = await shell.execute('cat /ctx/missing')
        expect(result.exitCode).toBe(1)
        expect(result.stderr).toContain('No such file')
      })

      it('concatenates multiple files', async () => {
        shell.getFS().write('/ctx/a', 'AAA')
        shell.getFS().write('/ctx/b', 'BBB')
        const result = await shell.execute('cat /ctx/a /ctx/b')
        expect(result.stdout).toBe('AAABBB')
      })
    })

    describe('grep', () => {
      beforeEach(() => {
        shell.getFS().write('/ctx/log', 'INFO: started\nERROR: failed\nINFO: done\n')
      })

      it('filters lines by pattern', async () => {
        const result = await shell.execute('grep ERROR /ctx/log')
        expect(result.exitCode).toBe(0)
        expect(result.stdout).toContain('ERROR: failed')
      })

      it('returns exit code 1 when no match', async () => {
        const result = await shell.execute('grep WARN /ctx/log')
        expect(result.exitCode).toBe(1)
      })

      it('supports -i for case-insensitive search', async () => {
        const result = await shell.execute('grep -i error /ctx/log')
        expect(result.exitCode).toBe(0)
        expect(result.stdout).toContain('ERROR: failed')
      })

      it('supports -n for line numbers', async () => {
        const result = await shell.execute('grep -n ERROR /ctx/log')
        expect(result.stdout).toContain('2:ERROR: failed')
      })

      it('supports -v for inverted match', async () => {
        const result = await shell.execute('grep -v ERROR /ctx/log')
        expect(result.stdout).toContain('INFO: started')
        expect(result.stdout).toContain('INFO: done')
        expect(result.stdout).not.toContain('ERROR')
      })

      it('searches stdin when no file given', async () => {
        const result = await shell.execute('echo -e "foo\\nbar\\nbaz" | grep bar')
        expect(result.exitCode).toBe(0)
        expect(result.stdout).toContain('bar')
      })
    })
  })

  describe('pipes', () => {
    it('pipes stdout of one command into stdin of the next', async () => {
      shell.getFS().write('/ctx/data', 'line1\nline2\nline3\n')
      const result = await shell.execute('cat /ctx/data | grep line2')
      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain('line2')
      expect(result.stdout).not.toContain('line1')
    })

    it('chains multiple pipes', async () => {
      shell.getFS().write('/ctx/data', 'apple\nbanana\napricot\nblueberry\n')
      const result = await shell.execute('cat /ctx/data | grep a | grep p')
      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain('apple')
      expect(result.stdout).toContain('apricot')
      expect(result.stdout).not.toContain('banana')
    })

    it('stops pipe chain on non-zero exit code', async () => {
      const result = await shell.execute('cat /ctx/missing | grep foo')
      expect(result.exitCode).toBe(1)
      expect(result.stderr).toContain('No such file')
    })
  })

  describe('redirections', () => {
    it('supports output redirection with >', async () => {
      const result = await shell.execute('echo hello > /ctx/out')
      expect(result.exitCode).toBe(0)
      expect(result.stdout).toBe('')
      expect(shell.getFS().read('/ctx/out')).toBe('hello\n')
    })

    it('supports append redirection with >>', async () => {
      shell.getFS().write('/ctx/out', 'first\n')
      await shell.execute('echo second >> /ctx/out')
      expect(shell.getFS().read('/ctx/out')).toBe('first\nsecond\n')
    })

    it('supports input redirection with <', async () => {
      shell.getFS().write('/ctx/input', 'hello from file')
      const result = await shell.execute('cat < /ctx/input')
      expect(result.exitCode).toBe(0)
      expect(result.stdout).toBe('hello from file')
    })

    it('returns error for input redirection from missing file', async () => {
      const result = await shell.execute('cat < /ctx/missing')
      expect(result.exitCode).toBe(1)
      expect(result.stderr).toContain('No such file')
    })
  })

  describe('comments and multiline', () => {
    it('ignores # comment lines', async () => {
      const result = await shell.execute('# this is a comment\necho hello')
      expect(result.exitCode).toBe(0)
      expect(result.stdout).toBe('hello\n')
    })

    it('ignores multiple comment lines', async () => {
      const result = await shell.execute('# comment 1\n# comment 2\necho ok')
      expect(result.exitCode).toBe(0)
      expect(result.stdout).toBe('ok\n')
    })

    it('ignores inline blank lines', async () => {
      const result = await shell.execute('\n\necho hi\n\n')
      expect(result.exitCode).toBe(0)
      expect(result.stdout).toBe('hi\n')
    })

    it('handles comment-only input as empty', async () => {
      const result = await shell.execute('# just a comment')
      expect(result).toEqual({ exitCode: 0, stdout: '', stderr: '' })
    })

    it('does not strip # inside quoted strings', async () => {
      const result = await shell.execute("echo '# not a comment'")
      expect(result.exitCode).toBe(0)
      expect(result.stdout).toBe('# not a comment\n')
    })
  })

  describe('sequential commands', () => {
    it('executes multiple lines sequentially', async () => {
      const result = await shell.execute('mkdir /ctx/data\necho hello > /ctx/data/file.txt')
      expect(result.exitCode).toBe(0)
      expect(shell.getFS().read('/ctx/data/file.txt')).toBe('hello\n')
    })

    it('stops on first error', async () => {
      const result = await shell.execute('cat /ctx/missing\necho should-not-run > /ctx/out')
      expect(result.exitCode).toBe(1)
      expect(result.stderr).toContain('No such file')
      expect(shell.getFS().exists('/ctx/out')).toBe(false)
    })

    it('concatenates stdout from multiple commands', async () => {
      const result = await shell.execute('echo first\necho second')
      expect(result.exitCode).toBe(0)
      expect(result.stdout).toBe('first\nsecond\n')
    })

    it('handles comments between sequential commands', async () => {
      const result = await shell.execute('echo one\n# skip this\necho two')
      expect(result.exitCode).toBe(0)
      expect(result.stdout).toBe('one\ntwo\n')
    })
  })

  describe('heredoc', () => {
    it('supports basic heredoc with cat', async () => {
      const input = `cat << EOF > /ctx/data.json\n{"name": "Alice"}\nEOF`
      const result = await shell.execute(input)
      expect(result.exitCode).toBe(0)
      expect(shell.getFS().read('/ctx/data.json')).toBe('{"name": "Alice"}')
    })

    it('supports multi-line heredoc content', async () => {
      const input = [
        'cat << EOF > /ctx/plan.json',
        '{',
        '  "title": "My Plan",',
        '  "days": [1, 2, 3]',
        '}',
        'EOF'
      ].join('\n')
      const result = await shell.execute(input)
      expect(result.exitCode).toBe(0)
      const content = shell.getFS().read('/ctx/plan.json')
      expect(content).toContain('"title": "My Plan"')
      expect(content).toContain('"days": [1, 2, 3]')
    })

    it('supports heredoc with append redirection', async () => {
      shell.getFS().write('/ctx/log', 'line1\n')
      const input = `cat << EOF >> /ctx/log\nline2\nline3\nEOF`
      const result = await shell.execute(input)
      expect(result.exitCode).toBe(0)
      expect(shell.getFS().read('/ctx/log')).toBe('line1\nline2\nline3')
    })

    it('supports heredoc without quotes around delimiter', async () => {
      const input = `cat <<EOF > /ctx/out\nhello heredoc\nEOF`
      const result = await shell.execute(input)
      expect(result.exitCode).toBe(0)
      expect(shell.getFS().read('/ctx/out')).toBe('hello heredoc')
    })

    it('supports commands before heredoc', async () => {
      const input = [
        'mkdir /ctx/meals',
        'cat << EOF > /ctx/meals/day1.json',
        '{"day": "Monday", "calories": 1800}',
        'EOF'
      ].join('\n')
      const result = await shell.execute(input)
      expect(result.exitCode).toBe(0)
      expect(shell.getFS().read('/ctx/meals/day1.json')).toBe('{"day": "Monday", "calories": 1800}')
    })

    it('supports comments before heredoc', async () => {
      const input = [
        '# Create meal plan',
        'cat << EOF > /ctx/plan.json',
        '{"plan": true}',
        'EOF'
      ].join('\n')
      const result = await shell.execute(input)
      expect(result.exitCode).toBe(0)
      expect(shell.getFS().read('/ctx/plan.json')).toBe('{"plan": true}')
    })

    it('pipes heredoc content through commands', async () => {
      const input = `cat << EOF | grep apple\napple\nbanana\napricot\nEOF`
      const result = await shell.execute(input)
      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain('apple')
      expect(result.stdout).not.toContain('banana')
    })
  })

  describe('register', () => {
    it('registers a custom command handler', async () => {
      shell.register({
        name: 'greet',
        async execute(args) {
          return { exitCode: 0, stdout: `Hello, ${args[0] || 'world'}!\n`, stderr: '' }
        }
      })

      const result = await shell.execute('greet Alice')
      expect(result.exitCode).toBe(0)
      expect(result.stdout).toBe('Hello, Alice!\n')
    })

    it('overrides built-in commands', async () => {
      shell.register({
        name: 'echo',
        async execute(args) {
          return { exitCode: 0, stdout: args.join('-'), stderr: '' }
        }
      })

      const result = await shell.execute('echo a b c')
      expect(result.stdout).toBe('a-b-c')
    })
  })

  describe('environment', () => {
    it('sets and gets environment variables', () => {
      shell.setEnv('FOO', 'bar')
      expect(shell.getEnv()).toEqual({ FOO: 'bar' })
    })
  })

  describe('exportContext', () => {
    it('exports filesystem data', async () => {
      await shell.execute('echo hello > /ctx/greeting')
      const exported = shell.exportContext()
      expect(exported['/ctx/greeting']).toBe('hello\n')
    })

    it('parses JSON values on export', async () => {
      shell.getFS().write('/ctx/config', '{"port": 3000}')
      const exported = shell.exportContext()
      expect(exported['/ctx/config']).toEqual({ port: 3000 })
    })
  })

  describe('help command', () => {
    it('lists all commands with descriptions when no args', async () => {
      const result = await shell.execute('help')
      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain('Available commands:')
      expect(result.stdout).toContain('cat')
      expect(result.stdout).toContain('curl')
      expect(result.stdout).toContain('grep')
      expect(result.stdout).toContain('browse')
      expect(result.stdout).toContain('help')
      expect(result.stdout).toContain('help <command>')
    })

    it('shows detailed help for a specific command', async () => {
      const result = await shell.execute('help curl')
      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain('curl - Transfer data from or to a server')
      expect(result.stdout).toContain('Usage: curl [OPTIONS] URL')
      expect(result.stdout).toContain('Flags:')
      expect(result.stdout).toContain('-X METHOD')
      expect(result.stdout).toContain('Examples:')
      expect(result.stdout).toContain('GET request')
    })

    it('returns error for unknown command', async () => {
      const result = await shell.execute('help nonexistent')
      expect(result.exitCode).toBe(1)
      expect(result.stderr).toContain("unknown command 'nonexistent'")
    })

    it('shows notes when available', async () => {
      const result = await shell.execute('help grep')
      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain('Notes:')
      expect(result.stdout).toContain('JavaScript regex syntax')
    })
  })

  describe('browse command', () => {
    it('fetches a URL and converts HTML to text', async () => {
      const mockHtml = '<html><body><h1>Title</h1><p>Hello world. This is a real web page with enough content to pass quality checks for the browse command.</p></body></html>'
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(mockHtml, { status: 200, headers: { 'Content-Type': 'text/html' } })
      )

      const result = await shell.execute('browse https://example.com')
      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain('# Title')
      expect(result.stdout).toContain('Hello world')
    })

    it('returns raw HTML with --raw flag', async () => {
      const mockHtml = '<html><body><h1>Title</h1></body></html>'
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(mockHtml, { status: 200, headers: { 'Content-Type': 'text/html' } })
      )

      const result = await shell.execute('browse --raw https://example.com')
      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain('<html>')
      expect(result.stdout).toContain('<h1>Title</h1>')
    })

    it('strips script and style tags', async () => {
      const mockHtml = '<html><body><script>alert("x")</script><style>.x{}</style><p>This is a paragraph with enough content to pass the quality check for browse command.</p></body></html>'
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(mockHtml, { status: 200, headers: { 'Content-Type': 'text/html' } })
      )

      const result = await shell.execute('browse https://example.com')
      expect(result.exitCode).toBe(0)
      expect(result.stdout).not.toContain('alert')
      expect(result.stdout).not.toContain('.x{}')
      expect(result.stdout).toContain('enough content')
    })

    it('converts links to markdown format', async () => {
      const mockHtml = '<html><body><p>Here is a page with a link: <a href="https://test.com">Link Text</a> and enough surrounding content to be valid.</p></body></html>'
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(mockHtml, { status: 200, headers: { 'Content-Type': 'text/html' } })
      )

      const result = await shell.execute('browse https://example.com')
      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain('[Link Text](https://test.com)')
    })

    it('returns error when no URL specified', async () => {
      const result = await shell.execute('browse')
      expect(result.exitCode).toBe(1)
      expect(result.stderr).toContain('no URL specified')
    })

    it('returns error on HTTP failure', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response('Not Found', { status: 404, statusText: 'Not Found' })
      )

      const result = await shell.execute('browse https://example.com/missing')
      expect(result.exitCode).toBe(1)
      expect(result.stderr).toContain('HTTP 404')
    })

    it('detects JavaScript-required pages and returns error', async () => {
      const mockHtml = '<html><body><p>Please click <a href="/retry">here</a> if you are not redirected within a few seconds.</p></body></html>'
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(mockHtml, { status: 200, headers: { 'Content-Type': 'text/html' } })
      )

      const result = await shell.execute('browse https://www.google.com/search?q=test')
      expect(result.exitCode).toBe(1)
      expect(result.stderr).toContain('require JavaScript or blocked the request')
      expect(result.stdout).toBeTruthy() // still returns the content
    })

    it('detects CAPTCHA / bot-blocking pages', async () => {
      const mockHtml = '<html><body><h1>Checking your browser</h1><p>Please wait while we verify you are a human. This unusual traffic check is required.</p></body></html>'
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(mockHtml, { status: 200, headers: { 'Content-Type': 'text/html' } })
      )

      const result = await shell.execute('browse https://example.com')
      expect(result.exitCode).toBe(1)
      expect(result.stderr).toContain('require JavaScript or blocked the request')
    })

    it('detects very short / empty content', async () => {
      const mockHtml = '<html><body></body></html>'
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(mockHtml, { status: 200, headers: { 'Content-Type': 'text/html' } })
      )

      const result = await shell.execute('browse https://example.com')
      expect(result.exitCode).toBe(1)
      expect(result.stderr).toContain('very little content')
    })

    it('skips quality check in --raw mode', async () => {
      const mockHtml = '<html><body></body></html>'
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(mockHtml, { status: 200, headers: { 'Content-Type': 'text/html' } })
      )

      const result = await shell.execute('browse --raw https://example.com')
      expect(result.exitCode).toBe(0)
      expect(result.stderr).toBe('')
    })
  })

  describe('command help metadata', () => {
    it('all registered commands have help property', () => {
      for (const cmd of commands) {
        expect(cmd.help, `${cmd.name} should have help metadata`).toBeDefined()
        expect(cmd.help!.usage).toBeTruthy()
        expect(cmd.help!.description).toBeTruthy()
      }
    })
  })
})
