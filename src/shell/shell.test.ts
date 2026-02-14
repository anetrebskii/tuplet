import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Shell } from './shell.js'
import { commands } from './commands/index.js'
import { MAX_FILE_SIZE, MAX_LINE_LENGTH } from './limits.js'
import { createShellTool } from '../tools/shell.js'
import type { ToolContext } from '../types.js'

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

    it('accepts initial context data', async () => {
      shell = new Shell({ initialContext: { name: 'Alice' } })
      const fs = shell.getFS()
      expect(await fs.read('/name')).toBe('Alice')
    })

    it('accepts an external WorkspaceProvider', async () => {
      const original = new Shell({ initialContext: { key: 'value' } })
      const shared = new Shell({ fs: original.getFS() })

      const result = await shared.execute('cat /key')
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
        await shell.getFS().write('/data', 'file content')
        const result = await shell.execute('cat /data')
        expect(result.exitCode).toBe(0)
        expect(result.stdout).toBe('file content')
      })

      it('returns error for missing file', async () => {
        const result = await shell.execute('cat /missing')
        expect(result.exitCode).toBe(1)
        expect(result.stderr).toContain('No such file')
      })

      it('concatenates multiple files', async () => {
        await shell.getFS().write('/a', 'AAA')
        await shell.getFS().write('/b', 'BBB')
        const result = await shell.execute('cat /a /b')
        expect(result.stdout).toBe('AAABBB')
      })
    })

    describe('grep', () => {
      beforeEach(async () => {
        await shell.getFS().write('/log', 'INFO: started\nERROR: failed\nINFO: done\n')
      })

      it('filters lines by pattern', async () => {
        const result = await shell.execute('grep ERROR /log')
        expect(result.exitCode).toBe(0)
        expect(result.stdout).toContain('ERROR: failed')
      })

      it('returns exit code 1 when no match', async () => {
        const result = await shell.execute('grep WARN /log')
        expect(result.exitCode).toBe(1)
      })

      it('supports -i for case-insensitive search', async () => {
        const result = await shell.execute('grep -i error /log')
        expect(result.exitCode).toBe(0)
        expect(result.stdout).toContain('ERROR: failed')
      })

      it('supports -n for line numbers', async () => {
        const result = await shell.execute('grep -n ERROR /log')
        expect(result.stdout).toContain('2:ERROR: failed')
      })

      it('supports -v for inverted match', async () => {
        const result = await shell.execute('grep -v ERROR /log')
        expect(result.stdout).toContain('INFO: started')
        expect(result.stdout).toContain('INFO: done')
        expect(result.stdout).not.toContain('ERROR')
      })

      it('searches stdin when no file given', async () => {
        const result = await shell.execute('echo -e "foo\\nbar\\nbaz" | grep bar')
        expect(result.exitCode).toBe(0)
        expect(result.stdout).toContain('bar')
      })

      it('supports -o for only-matching output', async () => {
        await shell.getFS().write('/prices', 'Revenue was $50M last quarter\nRaised $10B in funding\nNo amount here\n')
        const result = await shell.execute("grep -o '\\$[0-9]*\\(M\\|B\\)' /prices")
        expect(result.exitCode).toBe(0)
        expect(result.stdout).toContain('$50M')
        expect(result.stdout).toContain('$10B')
        expect(result.stdout).not.toContain('Revenue')
        expect(result.stdout).not.toContain('No amount')
      })

      it('supports -o with piped input and head', async () => {
        await shell.getFS().write('/article', '<p>Company raised $20M in Series A</p>\n<p>Another got $5M seed</p>\n<p>Big corp raised $3B</p>\n')
        const result = await shell.execute("cat /article | grep -o '\\$[0-9]*\\(M\\|B\\)' | head -2")
        expect(result.exitCode).toBe(0)
        expect(result.stdout).toContain('$20M')
        expect(result.stdout).toContain('$5M')
        expect(result.stdout).not.toContain('$3B')
      })

      it('extracts dollar amounts from curl output piped to grep -o and head', async () => {
        const result = await shell.execute("curl -s 'https://techcrunch.com/2026/02/11/former-founders-fund-vc-sam-blond-launches-ai-sales-startup-to-upend-salesforce/' -A 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' 2>/dev/null | grep -o '\\$[0-9]*\\(M\\|B\\)' | head -5")
        // curl may succeed or page may not have amounts — either way the pipeline should not error on parsing
        expect(result.stderr).not.toContain('missing file operand')
        expect(result.stderr).not.toContain('No such file')
        if (result.exitCode === 0) {
          const lines = result.stdout.trim().split('\n')
          expect(lines.length).toBeLessThanOrEqual(5)
          for (const line of lines) {
            expect(line).toMatch(/^\$[0-9]+(M|B)$/)
          }
        }
      }, 15000)

      it('supports combined flags like -oE and -oP', async () => {
        await shell.getFS().write('/data', 'foo123bar\nbaz456qux\n')
        const result = await shell.execute("grep -oE '[0-9]+' /data")
        expect(result.exitCode).toBe(0)
        expect(result.stdout).toContain('123')
        expect(result.stdout).toContain('456')
        expect(result.stdout).not.toContain('foo')
      })
    })
  })

  describe('pipes', () => {
    it('pipes stdout of one command into stdin of the next', async () => {
      await shell.getFS().write('/data', 'line1\nline2\nline3\n')
      const result = await shell.execute('cat /data | grep line2')
      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain('line2')
      expect(result.stdout).not.toContain('line1')
    })

    it('chains multiple pipes', async () => {
      await shell.getFS().write('/data', 'apple\nbanana\napricot\nblueberry\n')
      const result = await shell.execute('cat /data | grep a | grep p')
      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain('apple')
      expect(result.stdout).toContain('apricot')
      expect(result.stdout).not.toContain('banana')
    })

    it('stops pipe chain on non-zero exit code', async () => {
      const result = await shell.execute('cat /missing | grep foo')
      expect(result.exitCode).toBe(1)
      expect(result.stderr).toContain('No such file')
    })
  })

  describe('redirections', () => {
    it('supports output redirection with >', async () => {
      const result = await shell.execute('echo hello > /out')
      expect(result.exitCode).toBe(0)
      expect(result.stdout).toBe('')
      expect(await shell.getFS().read('/out')).toBe('hello\n')
    })

    it('supports append redirection with >>', async () => {
      await shell.getFS().write('/out', 'first\n')
      await shell.execute('echo second >> /out')
      expect(await shell.getFS().read('/out')).toBe('first\nsecond\n')
    })

    it('supports input redirection with <', async () => {
      await shell.getFS().write('/input', 'hello from file')
      const result = await shell.execute('cat < /input')
      expect(result.exitCode).toBe(0)
      expect(result.stdout).toBe('hello from file')
    })

    it('returns error for input redirection from missing file', async () => {
      const result = await shell.execute('cat < /missing')
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
      const result = await shell.execute('mkdir /data\necho hello > /data/file.txt')
      expect(result.exitCode).toBe(0)
      expect(await shell.getFS().read('/data/file.txt')).toBe('hello\n')
    })

    it('stops on first error', async () => {
      const result = await shell.execute('cat /missing\necho should-not-run > /out')
      expect(result.exitCode).toBe(1)
      expect(result.stderr).toContain('No such file')
      expect(await shell.getFS().exists('/out')).toBe(false)
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
      const input = `cat << EOF > /data.json\n{"name": "Alice"}\nEOF`
      const result = await shell.execute(input)
      expect(result.exitCode).toBe(0)
      expect(await shell.getFS().read('/data.json')).toBe('{"name": "Alice"}')
    })

    it('supports multi-line heredoc content', async () => {
      const input = [
        'cat << EOF > /plan.json',
        '{',
        '  "title": "My Plan",',
        '  "days": [1, 2, 3]',
        '}',
        'EOF'
      ].join('\n')
      const result = await shell.execute(input)
      expect(result.exitCode).toBe(0)
      const content = await shell.getFS().read('/plan.json')
      expect(content).toContain('"title": "My Plan"')
      expect(content).toContain('"days": [1, 2, 3]')
    })

    it('supports heredoc with append redirection', async () => {
      await shell.getFS().write('/log', 'line1\n')
      const input = `cat << EOF >> /log\nline2\nline3\nEOF`
      const result = await shell.execute(input)
      expect(result.exitCode).toBe(0)
      expect(await shell.getFS().read('/log')).toBe('line1\nline2\nline3')
    })

    it('supports heredoc without quotes around delimiter', async () => {
      const input = `cat <<EOF > /out\nhello heredoc\nEOF`
      const result = await shell.execute(input)
      expect(result.exitCode).toBe(0)
      expect(await shell.getFS().read('/out')).toBe('hello heredoc')
    })

    it('supports commands before heredoc', async () => {
      const input = [
        'mkdir /meals',
        'cat << EOF > /meals/day1.json',
        '{"day": "Monday", "calories": 1800}',
        'EOF'
      ].join('\n')
      const result = await shell.execute(input)
      expect(result.exitCode).toBe(0)
      expect(await shell.getFS().read('/meals/day1.json')).toBe('{"day": "Monday", "calories": 1800}')
    })

    it('supports comments before heredoc', async () => {
      const input = [
        '# Create meal plan',
        'cat << EOF > /plan.json',
        '{"plan": true}',
        'EOF'
      ].join('\n')
      const result = await shell.execute(input)
      expect(result.exitCode).toBe(0)
      expect(await shell.getFS().read('/plan.json')).toBe('{"plan": true}')
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

    it('expands $VAR in echo arguments', async () => {
      shell.setEnv('NAME', 'Alice')
      const result = await shell.execute('echo hello $NAME')
      expect(result.exitCode).toBe(0)
      expect(result.stdout).toBe('hello Alice\n')
    })

    it('expands ${VAR} syntax', async () => {
      shell.setEnv('GREETING', 'hi')
      const result = await shell.execute('echo ${GREETING} there')
      expect(result.exitCode).toBe(0)
      expect(result.stdout).toBe('hi there\n')
    })

    it('expands unknown variables to empty string', async () => {
      const result = await shell.execute('echo hello $MISSING world')
      expect(result.exitCode).toBe(0)
      expect(result.stdout).toBe('hello  world\n')
    })

    it('expands variables in redirections', async () => {
      shell.setEnv('FILE', '/output.txt')
      await shell.execute('echo data > $FILE')
      const read = await shell.execute('cat /output.txt')
      expect(read.stdout).toBe('data\n')
    })

    it('expands variables piped to jq', async () => {
      shell.setEnv('JSON_DATA', '{"name":"Alice","age":30}')
      const result = await shell.execute('echo $JSON_DATA | jq .name')
      expect(result.exitCode).toBe(0)
      expect(result.stdout).toBe('"Alice"\n')
    })

    it('supports VAR=value assignment syntax', async () => {
      await shell.execute('MY_VAR=hello')
      expect(shell.getEnv()['MY_VAR']).toBe('hello')
      const result = await shell.execute('echo $MY_VAR')
      expect(result.stdout).toBe('hello\n')
    })

    it('expands variables in heredoc content', async () => {
      shell.setEnv('TITLE', 'My Plan')
      const result = await shell.execute('cat << EOF\nTitle: $TITLE\nEOF')
      expect(result.exitCode).toBe(0)
      expect(result.stdout).toBe('Title: My Plan')
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

  describe('read-only mode', () => {
    beforeEach(() => {
      shell.setReadOnly(true)
    })

    it('blocks rm command in read-only mode', async () => {
      await shell.getFS().write('/file.txt', 'data')
      const result = await shell.execute('rm /file.txt')
      expect(result.exitCode).toBe(1)
      expect(result.stderr).toContain("read-only mode")
      expect(result.stderr).toContain("'rm' is not allowed")
      // File should still exist
      expect(await shell.getFS().read('/file.txt')).toBe('data')
    })

    it('blocks mkdir command in read-only mode', async () => {
      const result = await shell.execute('mkdir /newdir')
      expect(result.exitCode).toBe(1)
      expect(result.stderr).toContain("read-only mode")
      expect(result.stderr).toContain("'mkdir' is not allowed")
    })

    it('blocks output redirection in read-only mode', async () => {
      const result = await shell.execute('echo hello > /file.txt')
      expect(result.exitCode).toBe(1)
      expect(result.stderr).toContain("read-only mode")
      expect(result.stderr).toContain("cannot write to")
      expect(await shell.getFS().exists('/file.txt')).toBe(false)
    })

    it('blocks append redirection in read-only mode', async () => {
      await shell.getFS().write('/file.txt', 'existing')
      const result = await shell.execute('echo more >> /file.txt')
      expect(result.exitCode).toBe(1)
      expect(result.stderr).toContain("read-only mode")
      expect(result.stderr).toContain("cannot write to")
      expect(await shell.getFS().read('/file.txt')).toBe('existing')
    })

    it('allows writing to writable paths', async () => {
      shell.setReadOnly(true, ['/.hive/plan.md'])
      await shell.getFS().mkdir('/.hive')
      const result = await shell.execute('echo "# Plan" > /.hive/plan.md')
      expect(result.exitCode).toBe(0)
      expect(await shell.getFS().read('/.hive/plan.md')).toBe('# Plan\n')
    })

    it('allows read commands (ls) in read-only mode', async () => {
      await shell.getFS().write('/data.txt', 'hello')
      const result = await shell.execute('ls /')
      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain('data.txt')
    })

    it('allows read commands (cat) in read-only mode', async () => {
      await shell.getFS().write('/data.txt', 'hello')
      const result = await shell.execute('cat /data.txt')
      expect(result.exitCode).toBe(0)
      expect(result.stdout).toBe('hello')
    })

    it('allows read commands (grep) in read-only mode', async () => {
      await shell.getFS().write('/data.txt', 'hello world\nfoo bar\n')
      const result = await shell.execute('grep hello /data.txt')
      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain('hello world')
    })

    it('allows echo without redirect in read-only mode', async () => {
      const result = await shell.execute('echo hello world')
      expect(result.exitCode).toBe(0)
      expect(result.stdout).toBe('hello world\n')
    })

    it('can be disabled after enabling', async () => {
      shell.setReadOnly(false)
      const result = await shell.execute('echo hello > /file.txt')
      expect(result.exitCode).toBe(0)
      expect(await shell.getFS().read('/file.txt')).toBe('hello\n')
    })

    it('reports read-only status via isReadOnly()', () => {
      expect(shell.isReadOnly()).toBe(true)
      shell.setReadOnly(false)
      expect(shell.isReadOnly()).toBe(false)
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

  describe('large file handling', () => {
    describe('cat size gate', () => {
      it('rejects files over 256KB without offset/limit', async () => {
        await shell.getFS().write('/big.txt', 'x'.repeat(MAX_FILE_SIZE + 1))
        const result = await shell.execute('cat /big.txt')
        expect(result.exitCode).toBe(1)
        expect(result.stderr).toContain('exceeds max size')
        expect(result.stderr).toContain('head -n 2000')
      })

      it('allows paginated access to large files with --offset/--limit', async () => {
        const lines = Array.from({ length: 100 }, (_, i) => `line ${i + 1}`)
        const bigContent = lines.join('\n')
        // Make it exceed MAX_FILE_SIZE by padding lines
        const padding = 'x'.repeat(Math.ceil(MAX_FILE_SIZE / 100))
        const paddedLines = Array.from({ length: 100 }, (_, i) => `line ${i + 1} ${padding}`)
        await shell.getFS().write('/big.txt', paddedLines.join('\n'))

        const result = await shell.execute('cat --offset 0 --limit 10 /big.txt')
        expect(result.exitCode).toBe(0)
        expect(result.stdout).toContain('[Showing lines 1-10 of')
        expect(result.stdout).toContain('line 1')
      })
    })

    describe('cat pagination', () => {
      it('paginates with --offset and --limit', async () => {
        const lines = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`)
        await shell.getFS().write('/data.txt', lines.join('\n'))

        const result = await shell.execute('cat --offset 5 --limit 5 /data.txt')
        expect(result.exitCode).toBe(0)
        expect(result.stdout).toContain('[Showing lines 6-10 of 20]')
        expect(result.stdout).toContain('line 6')
        expect(result.stdout).toContain('line 10')
        expect(result.stdout).not.toContain('line 5\n')
        expect(result.stdout).not.toContain('line 11')
      })

      it('defaults to 2000-line limit', async () => {
        const lines = Array.from({ length: 2500 }, (_, i) => `L${i + 1}`)
        await shell.getFS().write('/data.txt', lines.join('\n'))

        const result = await shell.execute('cat /data.txt')
        expect(result.exitCode).toBe(0)
        // Should contain line 2000 but not line 2001
        expect(result.stdout).toContain('L2000')
        expect(result.stdout).not.toContain('L2001')
      })
    })

    describe('cat line numbers', () => {
      it('shows line numbers with -n flag', async () => {
        await shell.getFS().write('/data.txt', 'alpha\nbeta\ngamma\n')
        const result = await shell.execute('cat -n /data.txt')
        expect(result.exitCode).toBe(0)
        expect(result.stdout).toContain('1\talpha')
        expect(result.stdout).toContain('2\tbeta')
        expect(result.stdout).toContain('3\tgamma')
      })

      it('shows correct line numbers with offset', async () => {
        const lines = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`)
        await shell.getFS().write('/data.txt', lines.join('\n'))
        const result = await shell.execute('cat -n --offset 10 --limit 3 /data.txt')
        expect(result.exitCode).toBe(0)
        expect(result.stdout).toContain('11\tline 11')
        expect(result.stdout).toContain('12\tline 12')
        expect(result.stdout).toContain('13\tline 13')
      })
    })

    describe('line truncation', () => {
      it('cat truncates long lines', async () => {
        const longLine = 'a'.repeat(MAX_LINE_LENGTH + 500)
        await shell.getFS().write('/data.txt', longLine)
        const result = await shell.execute('cat /data.txt')
        expect(result.exitCode).toBe(0)
        expect(result.stdout.length).toBeLessThan(longLine.length)
        expect(result.stdout).toContain('...')
      })

      it('head truncates long lines', async () => {
        const longLine = 'b'.repeat(MAX_LINE_LENGTH + 500)
        await shell.getFS().write('/data.txt', `short\n${longLine}\nshort2`)
        const result = await shell.execute('head -n 3 /data.txt')
        expect(result.exitCode).toBe(0)
        expect(result.stdout).toContain('short')
        expect(result.stdout).toContain('...')
        expect(result.stdout).not.toContain('b'.repeat(MAX_LINE_LENGTH + 1))
      })

      it('tail truncates long lines', async () => {
        const longLine = 'c'.repeat(MAX_LINE_LENGTH + 500)
        await shell.getFS().write('/data.txt', `short\n${longLine}\nshort2`)
        const result = await shell.execute('tail -n 3 /data.txt')
        expect(result.exitCode).toBe(0)
        expect(result.stdout).toContain('...')
        expect(result.stdout).not.toContain('c'.repeat(MAX_LINE_LENGTH + 1))
      })

      it('grep truncates long matching lines', async () => {
        const longLine = 'MATCH' + 'd'.repeat(MAX_LINE_LENGTH + 500)
        await shell.getFS().write('/data.txt', `short\n${longLine}\nshort2`)
        const result = await shell.execute('grep MATCH /data.txt')
        expect(result.exitCode).toBe(0)
        expect(result.stdout).toContain('MATCH')
        expect(result.stdout).toContain('...')
        expect(result.stdout.length).toBeLessThan(longLine.length)
      })
    })

    describe('grep output cap', () => {
      it('caps output and appends truncation note', async () => {
        // Create a file with many matching lines
        const lines = Array.from({ length: 5000 }, (_, i) => `match line ${i + 1} with some extra content to fill space`)
        await shell.getFS().write('/data.txt', lines.join('\n'))
        const result = await shell.execute('grep match /data.txt')
        expect(result.exitCode).toBe(0)
        expect(result.stdout).toContain('[Output truncated at')
        expect(result.stdout).toContain('Narrow your search')
      })
    })

    describe('shell tool output truncation', () => {
      it('spills large output to workspace file', async () => {
        const tool = createShellTool(shell)
        const ctx = { remainingTokens: 10000 } as ToolContext

        // Build a big output via cat with --limit high enough
        const bigLines = Array.from({ length: 500 }, (_, i) => `output line ${i + 1} ${'x'.repeat(100)}`)
        await shell.getFS().write('/big-output.txt', bigLines.join('\n'))

        const result = await tool.execute({ command: 'cat --limit 500 /big-output.txt' }, ctx)
        expect(result.error).toContain('exceeds maximum')
        expect(result.error).toContain('Saved to')
        const data = result.data as Record<string, unknown>
        expect(data.spillPath).toBeTruthy()
        // Verify the file was written
        const spillContent = await shell.getFS().read(data.spillPath as string)
        expect(spillContent).toBeTruthy()
      })
    })
  })

  describe('log3 regression tests', () => {
    describe('grep -o with angle brackets in pattern', () => {
      it('handles < in single-quoted grep -o pattern without treating as redirection', async () => {
        const html = '<html><head><title>My Page Title</title></head><body>hello</body></html>'
        await shell.getFS().write('/page.html', html)
        const result = await shell.execute("cat /page.html | grep -o '<title>[^<]*'")
        expect(result.exitCode).toBe(0)
        expect(result.stdout).toContain('<title>My Page Title')
      })

      it('handles curl | grep -o with angle bracket pattern | head pipeline', async () => {
        const html = '<html><title>Test Title</title><title>Second</title></html>'
        await shell.getFS().write('/page.html', html)
        const result = await shell.execute("cat /page.html | grep -o '<title>[^<]*' | head -5")
        expect(result.exitCode).toBe(0)
        expect(result.stdout).toContain('<title>Test Title')
      })
    })

    describe('&& operator support', () => {
      it('executes second command when first succeeds', async () => {
        await shell.getFS().write('/data.txt', 'hello world')
        const result = await shell.execute('echo "done" > /flag.txt && cat /flag.txt')
        expect(result.exitCode).toBe(0)
        expect(result.stdout).toContain('done')
      })

      it('does not execute second command when first fails', async () => {
        const result = await shell.execute('cat /nonexistent.txt && echo "should not run" > /flag.txt')
        expect(result.exitCode).not.toBe(0)
        expect(await shell.getFS().exists('/flag.txt')).toBe(false)
      })

      it('supports curl -o FILE && grep pattern FILE', async () => {
        // Simulate what curl -o should do: write output to a file, then grep it
        await shell.getFS().write('/page.html', '<html><h1>Funding: $10M raised</h1></html>')
        const result = await shell.execute("grep -i funding /page.html && echo 'found'")
        expect(result.exitCode).toBe(0)
      })
    })

    describe('wc command', () => {
      it('counts lines with wc -l', async () => {
        await shell.getFS().write('/data.txt', 'line1\nline2\nline3\n')
        const result = await shell.execute('cat /data.txt | wc -l')
        expect(result.exitCode).toBe(0)
        expect(result.stdout.trim()).toContain('3')
      })

      it('counts words with wc -w', async () => {
        await shell.getFS().write('/data.txt', 'hello world\nfoo bar baz\n')
        const result = await shell.execute('cat /data.txt | wc -w')
        expect(result.exitCode).toBe(0)
        expect(result.stdout.trim()).toContain('5')
      })

      it('counts characters with wc -c', async () => {
        await shell.getFS().write('/data.txt', 'abc')
        const result = await shell.execute('cat /data.txt | wc -c')
        expect(result.exitCode).toBe(0)
        expect(result.stdout.trim()).toContain('3')
      })

      it('shows all counts by default (no flags)', async () => {
        await shell.getFS().write('/data.txt', 'hello world\nfoo\n')
        const result = await shell.execute('cat /data.txt | wc')
        expect(result.exitCode).toBe(0)
        // Should contain line count, word count, char count
        expect(result.stdout).toContain('2')
        expect(result.stdout).toContain('3')
      })

      it('counts lines from file argument', async () => {
        await shell.getFS().write('/data.txt', 'a\nb\nc\nd\ne\n')
        const result = await shell.execute('wc -l /data.txt')
        expect(result.exitCode).toBe(0)
        expect(result.stdout).toContain('5')
        expect(result.stdout).toContain('/data.txt')
      })
    })

    describe('find with -o (OR) for multiple name patterns', () => {
      it('matches files with multiple -name patterns joined by -o', async () => {
        await shell.getFS().write('/data/file1.json', '{}')
        await shell.getFS().write('/data/file2.csv', 'a,b')
        await shell.getFS().write('/data/file3.yaml', 'key: val')
        await shell.getFS().write('/data/file4.txt', 'text')

        const result = await shell.execute('find /data -name "*.json" -o -name "*.csv"')
        expect(result.exitCode).toBe(0)
        expect(result.stdout).toContain('file1.json')
        expect(result.stdout).toContain('file2.csv')
        expect(result.stdout).not.toContain('file4.txt')
      })
    })

    describe('heredoc with quoted delimiter suppresses variable expansion', () => {
      it('does not expand $VAR in heredoc with quoted delimiter', async () => {
        shell.setEnv('PRICE', 'should-not-appear')
        const cmd = `cat > /data.json << 'EOF'\n{"amount": "$17 million"}\nEOF`
        const result = await shell.execute(cmd)
        expect(result.exitCode).toBe(0)
        const content = await shell.getFS().read('/data.json')
        expect(content).toContain('$17 million')
      })

      it('still expands $VAR in heredoc with unquoted delimiter', async () => {
        shell.setEnv('NAME', 'Alice')
        const cmd = `cat > /data.txt << EOF\nHello $NAME\nEOF`
        const result = await shell.execute(cmd)
        expect(result.exitCode).toBe(0)
        const content = await shell.getFS().read('/data.txt')
        expect(content).toContain('Hello Alice')
      })
    })

    describe('head output cap', () => {
      it('caps total output like grep does to prevent cascading spills', async () => {
        // Create file with many long lines
        const longLines = Array.from({ length: 100 }, (_, i) =>
          `line ${i + 1}: ${'x'.repeat(500)}`
        )
        await shell.getFS().write('/huge.txt', longLines.join('\n'))
        const result = await shell.execute('head -n 100 /huge.txt')
        expect(result.exitCode).toBe(0)
        // Output should not exceed MAX_OUTPUT_CHARS
        expect(result.stdout.length).toBeLessThanOrEqual(35000) // some margin for truncation note
      })
    })

    describe('curl -H flag (alternate to -A for User-Agent)', () => {
      it('accepts -H User-Agent header', async () => {
        // This pattern is used in logs: curl -s URL -H 'User-Agent: Mozilla/5.0'
        // Ensure -H flag works correctly (not treating header value as URL)
        const result = await shell.execute("curl -s 'https://httpbin.org/user-agent' -H 'User-Agent: TestBot/1.0'")
        expect(result.exitCode).toBe(0)
        // Should get a response (not an error about URL parsing)
        expect(result.stderr).toBe('')
      }, 15000)
    })

    describe('multi-pipe grep chains', () => {
      it('handles curl | grep -oE pattern | sort -u | head pipeline', async () => {
        const html = `
          <a href="https://example.com/2026/01/article-one">one</a>
          <a href="https://example.com/2026/01/article-two">two</a>
          <a href="https://example.com/2026/01/article-one">one duplicate</a>
          <a href="https://example.com/2025/12/old-article">old</a>
        `
        await shell.getFS().write('/page.html', html)
        const result = await shell.execute(
          "cat /page.html | grep -oE 'https://example.com/2026/01/[^\"]+' | sort -u | head -5"
        )
        expect(result.exitCode).toBe(0)
        expect(result.stdout).toContain('article-one')
        expect(result.stdout).toContain('article-two')
        // sort -u should deduplicate
        const lines = result.stdout.trim().split('\n')
        expect(lines.length).toBe(2)
      })

      it('returns exit code 1 when grep finds no matches in a pipe chain', async () => {
        await shell.getFS().write('/page.html', '<html>no matches here</html>')
        const result = await shell.execute(
          "cat /page.html | grep -iE 'funding|million' | head -30"
        )
        expect(result.exitCode).toBe(1)
        expect(result.stdout).toBe('')
      })
    })
  })
})
