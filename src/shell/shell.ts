/**
 * Shell Emulator
 *
 * Main shell class that executes commands.
 */

import type { ShellConfig, ShellResult, CommandHandler, CommandContext, ParsedCommand } from './types.js'
import { VirtualFS } from './fs.js'
import { parseCommand } from './parser.js'
import { commands } from './commands/index.js'

export interface ShellOptions extends ShellConfig {
  /** External VirtualFS instance to use (optional) */
  fs?: VirtualFS
}

export class Shell {
  private fs: VirtualFS
  private env: Record<string, string>
  private config: ShellConfig
  private handlers: Map<string, CommandHandler>

  constructor(options: ShellOptions = {}) {
    const { fs: externalFS, ...config } = options
    this.config = config
    this.fs = externalFS ?? new VirtualFS(config.initialContext)
    this.env = {}
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

  /** Execute a command string */
  async execute(input: string): Promise<ShellResult> {
    try {
      const parsed = parseCommand(input)

      if (parsed.length === 0) {
        return { exitCode: 0, stdout: '', stderr: '' }
      }

      // Execute first command (which may have pipes)
      return await this.executeCommand(parsed[0])
    } catch (error) {
      return {
        exitCode: 1,
        stdout: '',
        stderr: error instanceof Error ? error.message : String(error)
      }
    }
  }

  private async executeCommand(cmd: ParsedCommand, stdin?: string): Promise<ShellResult> {
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
      stdin
    }

    // Handle input redirection
    if (cmd.inputFile) {
      const content = this.fs.read(cmd.inputFile)
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
      this.fs.write(cmd.outputFile, result.stdout)
      result = { ...result, stdout: '' }
    } else if (cmd.appendFile) {
      const existing = this.fs.read(cmd.appendFile) || ''
      this.fs.write(cmd.appendFile, existing + result.stdout)
      result = { ...result, stdout: '' }
    }

    // Handle pipe
    if (cmd.pipe && result.exitCode === 0) {
      return this.executeCommand(cmd.pipe, result.stdout)
    }

    return result
  }

  /** Get the virtual filesystem */
  getFS(): VirtualFS {
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

  /** Export context data */
  exportContext(): Record<string, unknown> {
    return this.fs.export()
  }
}
