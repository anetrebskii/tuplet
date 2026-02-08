/**
 * Shell Types
 */

export interface ShellConfig {
  /** Base URL for relative curl requests */
  baseUrl?: string
  /** Default headers for curl requests */
  defaultHeaders?: Record<string, string>
  /** Request timeout in ms */
  timeout?: number
  /** Initial context data */
  initialContext?: Record<string, unknown>
}

export interface ShellResult {
  /** Exit code (0 = success) */
  exitCode: number
  /** Standard output */
  stdout: string
  /** Standard error */
  stderr: string
}

export interface CommandFlag {
  /** Flag name (e.g. '-n', '--raw') */
  flag: string
  /** What the flag does */
  description: string
}

export interface CommandExample {
  /** The command to run */
  command: string
  /** What it does */
  description: string
}

export interface CommandHelp {
  /** Usage pattern (e.g. "grep [OPTIONS] PATTERN [FILE...]") */
  usage: string
  /** One-line description */
  description: string
  /** Supported flags */
  flags?: CommandFlag[]
  /** Example usages */
  examples?: CommandExample[]
  /** Additional notes */
  notes?: string[]
}

export interface CommandHandler {
  /** Command name (e.g., 'curl', 'cat', 'grep') */
  name: string
  /** Help metadata for this command */
  help?: CommandHelp
  /** Execute the command */
  execute(args: string[], ctx: CommandContext): Promise<ShellResult>
}

export interface CommandContext {
  /** Workspace filesystem provider */
  fs: import('../providers/workspace/types.js').WorkspaceProvider
  /** Environment variables */
  env: Record<string, string>
  /** Shell config */
  config: ShellConfig
  /** Stdin input (from pipe) */
  stdin?: string
}

export interface ParsedCommand {
  /** Command name */
  command: string
  /** Command arguments */
  args: string[]
  /** Input redirection (< file) */
  inputFile?: string
  /** Output redirection (> file) */
  outputFile?: string
  /** Append redirection (>> file) */
  appendFile?: string
  /** Pipe to next command */
  pipe?: ParsedCommand
  /** Heredoc content (<< DELIMITER ... DELIMITER) */
  stdinContent?: string
}
