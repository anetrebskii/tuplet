/**
 * Shell Emulator
 *
 * Bash-like interface for context management and HTTP requests.
 * AI tool acts as a proxy to this emulator.
 */

export { Shell } from './shell.js'
export type { ShellConfig, ShellResult, CommandHandler, CommandHelp, CommandFlag, CommandExample } from './types.js'

// Command handlers
export * from './commands/index.js'
