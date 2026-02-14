/**
 * Shell Emulator
 *
 * Main shell class that executes commands.
 */

import type { ShellConfig, ShellResult, CommandHandler, CommandContext, ParsedCommand } from './types.js'
import type { WorkspaceProvider } from '../providers/workspace/types.js'
import type { EnvironmentProvider } from '../types.js'
import { MemoryWorkspaceProvider } from '../providers/workspace/memory.js'
import { parseCommand } from './parser.js'
import { commands } from './commands/index.js'

export interface ShellOptions extends ShellConfig {
  /** External WorkspaceProvider to use (optional) */
  fs?: WorkspaceProvider
  /** Environment provider for secure variable resolution */
  envProvider?: EnvironmentProvider
}

export class Shell {
  private fs: WorkspaceProvider
  private env: Record<string, string>
  private config: ShellConfig
  private handlers: Map<string, CommandHandler>
  private readOnly: boolean = false
  private writablePaths: string[] = []
  private envProvider?: EnvironmentProvider

  constructor(options: ShellOptions = {}) {
    const { fs: externalFS, envProvider, ...config } = options
    this.config = config
    this.fs = externalFS ?? new MemoryWorkspaceProvider(config.initialContext)
    this.env = {}
    this.envProvider = envProvider
    this.handlers = new Map()

    // Register built-in commands
    for (const handler of commands) {
      this.handlers.set(handler.name, handler)
    }

    // Register help command (uses closure to access handlers)
    this.handlers.set('help', {
      name: 'help',
      help: {
        usage: 'help [COMMAND]',
        description: 'Show available commands or detailed help for a specific command',
        examples: [
          { command: 'help', description: 'List all available commands' },
          { command: 'help curl', description: 'Show detailed help for curl' }
        ]
      },
      execute: async (args: string[]) => {
        if (args.length === 0) {
          // List all commands with descriptions
          const lines: string[] = ['Available commands:\n']
          const sorted = Array.from(this.handlers.values()).sort((a, b) => a.name.localeCompare(b.name))
          for (const handler of sorted) {
            const desc = handler.help?.description ?? ''
            lines.push(`  ${handler.name.padEnd(12)} ${desc}`)
          }
          lines.push('\nRun `help <command>` for detailed usage.')
          return { exitCode: 0, stdout: lines.join('\n') + '\n', stderr: '' }
        }

        const cmdName = args[0]
        const handler = this.handlers.get(cmdName)

        if (!handler) {
          return { exitCode: 1, stdout: '', stderr: `help: unknown command '${cmdName}'` }
        }

        if (!handler.help) {
          return { exitCode: 0, stdout: `${cmdName}: no detailed help available\n`, stderr: '' }
        }

        const h = handler.help
        const lines: string[] = []

        lines.push(`${cmdName} - ${h.description}`)
        lines.push(`\nUsage: ${h.usage}`)

        if (h.flags && h.flags.length > 0) {
          lines.push('\nFlags:')
          for (const f of h.flags) {
            lines.push(`  ${f.flag.padEnd(20)} ${f.description}`)
          }
        }

        if (h.examples && h.examples.length > 0) {
          lines.push('\nExamples:')
          for (const e of h.examples) {
            lines.push(`  ${e.command}`)
            lines.push(`      ${e.description}`)
          }
        }

        if (h.notes && h.notes.length > 0) {
          lines.push('\nNotes:')
          for (const n of h.notes) {
            lines.push(`  - ${n}`)
          }
        }

        return { exitCode: 0, stdout: lines.join('\n') + '\n', stderr: '' }
      }
    })
  }

  /** Register a custom command handler */
  register(handler: CommandHandler): void {
    this.handlers.set(handler.name, handler)
  }

  /**
   * Enable or disable read-only mode.
   * In read-only mode, write commands (rm, mkdir) and output redirections are blocked
   * unless the target path is in the writable paths list.
   */
  setReadOnly(enabled: boolean, writablePaths?: string[]): void {
    this.readOnly = enabled
    this.writablePaths = writablePaths ?? []
  }

  /** Check if read-only mode is enabled */
  isReadOnly(): boolean {
    return this.readOnly
  }

  /** Execute a command string (supports sequential commands, pipes, heredocs, comments) */
  async execute(input: string): Promise<ShellResult> {
    try {
      const parsed = parseCommand(input)

      if (parsed.length === 0) {
        return { exitCode: 0, stdout: '', stderr: '' }
      }

      // Execute commands sequentially, stop on first error
      let combinedStdout = ''
      let lastResult: ShellResult = { exitCode: 0, stdout: '', stderr: '' }

      for (const cmd of parsed) {
        lastResult = await this.executeCommand(cmd)
        combinedStdout += lastResult.stdout
        if (lastResult.exitCode !== 0) {
          return { ...lastResult, stdout: combinedStdout }
        }
      }

      return { ...lastResult, stdout: combinedStdout }
    } catch (error) {
      return {
        exitCode: 1,
        stdout: '',
        stderr: error instanceof Error ? error.message : String(error)
      }
    }
  }

  /**
   * Check if a path is writable in read-only mode.
   * A path is writable if it matches any of the writable paths
   * (either exact match or starts with a writable directory path).
   */
  private isPathWritable(path: string): boolean {
    if (!this.readOnly) return true
    const normalized = path.startsWith('/') ? path : `/${path}`
    return this.writablePaths.some(wp => {
      const normalizedWp = wp.startsWith('/') ? wp : `/${wp}`
      return normalized === normalizedWp || normalized.startsWith(normalizedWp + '/')
    })
  }

  private async executeCommand(cmd: ParsedCommand, stdin?: string): Promise<ShellResult> {
    // Handle variable assignment: VAR=value (no command after it)
    const assignMatch = cmd.command.match(/^(\w+)=(.*)$/)
    if (assignMatch && cmd.args.length === 0 && !cmd.pipe) {
      this.env[assignMatch[1]] = assignMatch[2]
      return { exitCode: 0, stdout: '', stderr: '' }
    }

    // Expand $VAR references before execution
    this.expandCommand(cmd)

    // Read-only mode enforcement
    if (this.readOnly) {
      // Block write commands (rm, mkdir)
      if (cmd.command === 'rm' || cmd.command === 'mkdir') {
        return {
          exitCode: 1,
          stdout: '',
          stderr: `read-only mode: '${cmd.command}' is not allowed`
        }
      }

      // Block output redirection to non-writable paths
      if (cmd.outputFile && !this.isPathWritable(cmd.outputFile)) {
        return {
          exitCode: 1,
          stdout: '',
          stderr: `read-only mode: cannot write to '${cmd.outputFile}'`
        }
      }

      // Block append redirection to non-writable paths
      if (cmd.appendFile && !this.isPathWritable(cmd.appendFile)) {
        return {
          exitCode: 1,
          stdout: '',
          stderr: `read-only mode: cannot write to '${cmd.appendFile}'`
        }
      }
    }

    const handler = this.handlers.get(cmd.command)

    if (!handler) {
      const supported = Array.from(this.handlers.keys()).sort().join(', ')
      return {
        exitCode: 127,
        stdout: '',
        stderr: `command not found: ${cmd.command}\nAvailable commands: ${supported}`
      }
    }

    const ctx: CommandContext = {
      fs: this.fs,
      env: this.env,
      config: this.config,
      stdin: stdin !== undefined ? stdin : cmd.stdinContent,
      envProvider: this.envProvider
    }

    // Handle input redirection
    if (cmd.inputFile) {
      const content = await this.fs.read(cmd.inputFile)
      if (content === null) {
        return {
          exitCode: 1,
          stdout: '',
          stderr: `${cmd.inputFile}: No such file`
        }
      }
      ctx.stdin = content
    }

    // Execute command
    let result = await handler.execute(cmd.args, ctx)

    // Handle output redirection
    if (cmd.outputFile) {
      if (cmd.outputFile !== '/dev/null') {
        await this.fs.write(cmd.outputFile, result.stdout)
      }
      result = { ...result, stdout: '' }
    } else if (cmd.appendFile) {
      if (cmd.appendFile !== '/dev/null') {
        const existing = await this.fs.read(cmd.appendFile) || ''
        await this.fs.write(cmd.appendFile, existing + result.stdout)
      }
      result = { ...result, stdout: '' }
    }

    // Handle pipe
    if (cmd.pipe && result.exitCode === 0) {
      return this.executeCommand(cmd.pipe, result.stdout)
    }

    return result
  }

  /** Get the workspace provider */
  getFS(): WorkspaceProvider {
    return this.fs
  }

  /** Get environment variables */
  getEnv(): Record<string, string> {
    return this.env
  }

  /** Set environment variable */
  setEnv(key: string, value: string): void {
    this.env[key] = value
  }

  /** Set environment provider for secure variable resolution */
  setEnvProvider(provider: EnvironmentProvider): void {
    this.envProvider = provider
  }

  /** Get the current environment provider */
  getEnvProvider(): EnvironmentProvider | undefined {
    return this.envProvider
  }

  /**
   * Expand $VAR and ${VAR} references in a string using shell env.
   * Returns the string with variables replaced (unknown vars become empty string).
   */
  private expandVars(text: string): string {
    return text.replace(/\$\{(\w+)\}|\$(\w+)/g, (_, braced, plain) => {
      const name = braced || plain
      return this.env[name] ?? this.envProvider?.get(name) ?? ''
    })
  }

  /**
   * Expand variables in a parsed command's args, redirections, and stdin.
   */
  private expandCommand(cmd: ParsedCommand): void {
    cmd.command = this.expandVars(cmd.command)
    cmd.args = cmd.args.map(arg => this.expandVars(arg))
    if (cmd.outputFile) cmd.outputFile = this.expandVars(cmd.outputFile)
    if (cmd.appendFile) cmd.appendFile = this.expandVars(cmd.appendFile)
    if (cmd.inputFile) cmd.inputFile = this.expandVars(cmd.inputFile)
    if (cmd.stdinContent) cmd.stdinContent = this.expandVars(cmd.stdinContent)
  }
}
