/**
 * Workspace - A virtual filesystem for agent communication
 *
 * Wraps a WorkspaceProvider. AI agents interact with workspace
 * using bash-like commands (cat, echo, ls, grep, etc.) through the shell.
 *
 * All paths are relative — absolute paths (starting with /) are not allowed.
 *
 * Usage:
 * ```typescript
 * const workspace = new Workspace({
 *   paths: {
 *     'user/preferences.json': { value: { theme: 'dark' } }
 *   }
 * })
 *
 * // Get the shell for AI to use
 * const shell = workspace.getShell()
 *
 * // AI uses bash commands:
 * // cat user/preferences.json
 * // echo '{"theme": "light"}' > user/preferences.json
 * // ls
 * // grep "theme" user/preferences.json
 *
 * // Read results after run
 * const prefs = await workspace.read('user/preferences.json')
 * ```
 */

import type { JSONSchema, EnvironmentProvider } from './types.js'
import { Shell } from './shell/shell.js'
import type { ShellConfig } from './shell/types.js'
import type { WorkspaceProvider, WorkspaceChange } from './providers/workspace/types.js'
import { MemoryWorkspaceProvider } from './providers/workspace/memory.js'

export interface WorkspaceEntry {
  value: unknown
  createdAt: number
  updatedAt: number
  /** Optional metadata about who wrote this entry */
  writtenBy?: string
}

export interface WorkspaceListItem {
  path: string
  updatedAt: number
  writtenBy?: string
  /** Preview of value (for objects: type, for primitives: value) */
  preview: string
}

/** Custom validator function */
export type ValidatorFn = (value: unknown) => ValidationError[] | null

/** Zod-like schema interface (duck typing to avoid hard dependency) */
export interface ZodLike {
  safeParse(value: unknown): { success: true; data: unknown } | { success: false; error: { errors: Array<{ path: (string | number)[]; message: string }> } }
}


/**
 * Path configuration with optional validator and initial value
 */
export interface PathConfig {
  /** Validator for this path (null = format validation only from extension) */
  validator?: JSONSchema | ValidatorFn | ZodLike | null
  /** Initial value to populate */
  value?: unknown
  /** Description shown to AI */
  description?: string
  /** Treat the key as a regex pattern (anchored with ^...$) for dynamic path matching in strict mode */
  pattern?: boolean
}

export interface WorkspaceConfig {
  /**
   * Strict mode: only allow writing to defined paths.
   * - true: writes to undefined paths will fail
   * - false (default): any path can be written to
   */
  strict?: boolean

  /**
   * Path definitions with validators and optional initial values.
   *
   * Format extensions (basic validation from extension):
   * - 'path/name.json' → validates valid JSON object/array
   * - 'path/name.md' → validates string (markdown)
   * - 'path/name.txt' → validates string
   * - 'path/name.num' → validates number
   * - 'path/name.bool' → validates boolean
   *
   * Values can be:
   * - null → just format validation from extension
   * - JSONSchema → schema validation
   * - ValidatorFn → custom function
   * - ZodLike → zod schema
   * - PathConfig → { validator, value, description }
   *
   * @example
   * ```typescript
   * const workspace = new Workspace({
   *   strict: true,
   *   paths: {
   *     // Format validation only
   *     "notes.md": null,
   *
   *     // With initial value
   *     "user.json": {
   *       validator: { type: 'object', properties: { name: { type: 'string' } } },
   *       value: { name: "Guest" }
   *     },
   *
   *     // Just initial value, format validation from extension
   *     "today/meals.json": { value: [] },
   *
   *     // Regex pattern: allow any date-named JSON file under meals/
   *     "meals/\\d{4}-\\d{2}-\\d{2}\\.json": { pattern: true },
   *
   *     // Pattern with validator
   *     "notes/.+\\.md": { pattern: true, validator: { type: 'string' } }
   *   }
   * })
   * ```
   */
  paths?: Record<string, JSONSchema | ValidatorFn | ZodLike | PathConfig | null>
}

export interface ValidationError {
  path: string
  message: string
  expected?: string
  received?: string
}

export interface WriteResult {
  success: boolean
  errors?: ValidationError[]
}

/** Internal path prefix — always writable, bypasses strict mode */
const INTERNAL_PREFIX = '.tuplet/'

/** Supported format extensions */
type FormatExt = 'json' | 'md' | 'txt' | 'num' | 'bool'
type SchemaExt = 'schema' | 'zod' | 'validate'
type ValidatorType = FormatExt | SchemaExt

interface ValidatorEntry {
  type: ValidatorType
  schema?: JSONSchema
  validate?: ValidatorFn
  zod?: ZodLike
  description?: string
}

export interface WorkspaceConfigExt extends WorkspaceConfig {
  /** Shell configuration for HTTP requests */
  shell?: ShellConfig
  /** Async persistence provider */
  provider?: WorkspaceProvider
  /**
   * Persist .tuplet/ internal files through the workspace provider.
   * - false (default): .tuplet/ files are kept in memory only (not sent to custom providers)
   * - true: .tuplet/ files are written to the workspace provider (e.g., Firebase, S3)
   */
  persistInternal?: boolean
}

/**
 * Workspace provides a virtual filesystem for agent communication.
 * Uses WorkspaceProvider directly and provides Shell access for AI to use bash commands.
 */
export class Workspace {
  private provider: WorkspaceProvider
  /** Provider for .tuplet/ internal files (memory by default, or main provider if persistInternal) */
  private internalProvider: WorkspaceProvider
  private shell: Shell
  private validators: Map<string, ValidatorEntry> = new Map()
  private definedPaths: Set<string> = new Set()
  private pathPatterns: Map<string, RegExp> = new Map()
  private strict: boolean = false
  private initialized: boolean = false
  private unsubscribe: (() => void) | undefined

  /** Extension to type mapping */
  private static readonly EXT_MAP: Record<string, ValidatorType> = {
    '.json': 'json',
    '.md': 'md',
    '.txt': 'txt',
    '.num': 'num',
    '.bool': 'bool',
    '.schema': 'schema',
    '.zod': 'zod',
    '.validate': 'validate'
  }

  constructor(config?: WorkspaceConfigExt) {
    this.strict = config?.strict ?? false
    this.provider = config?.provider ?? new MemoryWorkspaceProvider()
    this.internalProvider = config?.persistInternal
      ? this.provider
      : new MemoryWorkspaceProvider()
    this.shell = new Shell({
      ...config?.shell,
      fs: this.createProxyProvider()
    })

    if (config?.paths) {
      for (const [key, value] of Object.entries(config.paths)) {
        this.registerPath(key, value)
      }
    }
  }

  /** Resolve provider by path: .tuplet/ → internalProvider, everything else → provider */
  private resolveProvider(path: string): WorkspaceProvider {
    const wsPath = path.startsWith('/') ? path.slice(1) : path
    return wsPath.startsWith(INTERNAL_PREFIX) ? this.internalProvider : this.provider
  }

  /**
   * Create a proxy WorkspaceProvider that routes writes through Workspace.write()
   * (template method: validate → delegate to provider).
   * .tuplet/ paths are routed to internalProvider (memory by default).
   */
  private createProxyProvider(): WorkspaceProvider {
    return {
      read: (path: string) => this.resolveProvider(path).read(path),
      write: async (path: string, content: string) => {
        // Strip leading / for Workspace.write() (it adds it back internally)
        const wsPath = path.startsWith('/') ? path.slice(1) : path

        // .tuplet/ is internal — write directly, skip validation
        if (wsPath.startsWith(INTERNAL_PREFIX)) {
          return this.internalProvider.write(path, content)
        }

        // Parse content into typed value based on extension
        let value: unknown = content
        if (wsPath.endsWith('.json')) {
          try {
            value = JSON.parse(content)
          } catch {
            // Keep as string — format validation will report the error
          }
        } else if (wsPath.endsWith('.num')) {
          const n = Number(content.trim())
          if (!isNaN(n)) value = n
        } else if (wsPath.endsWith('.bool')) {
          const t = content.trim().toLowerCase()
          if (t === 'true') value = true
          else if (t === 'false') value = false
        }

        const result = this.write(wsPath, value)
        if (!result.success) {
          const errors = result.errors?.map(e => {
            let msg = `${e.path}: ${e.message}`
            if (e.expected) msg += ` (expected: ${e.expected})`
            if (e.received) msg += ` (got: ${e.received})`
            return msg
          }).join('\n')

          // Include schema hint so AI can fix the issue
          const validator = this.validators.get(wsPath)
            ?? (this.matchPattern(wsPath) ? this.validators.get(this.matchPattern(wsPath)!) : undefined)
          let schemaHint = ''
          if (validator?.schema) {
            schemaHint = `\nExpected schema: ${JSON.stringify(validator.schema, null, 2)}`
          }

          throw new Error(`Validation failed for '${wsPath}':\n${errors}${schemaHint}`)
        }
      },
      delete: async (path: string) => {
        const wsPath = path.startsWith('/') ? path.slice(1) : path
        if (this.strict && !wsPath.startsWith(INTERNAL_PREFIX) && this.isDefined(wsPath)) {
          throw new Error(`Strict mode: cannot delete defined path '${wsPath}'`)
        }
        return this.resolveProvider(path).delete(path)
      },
      exists: (path: string) => this.resolveProvider(path).exists(path),
      list: (path: string) => this.resolveProvider(path).list(path),
      glob: (pattern: string) => this.resolveProvider(pattern).glob(pattern),
      mkdir: async (path: string) => {
        const wsPath = path.startsWith('/') ? path.slice(1) : path
        if (this.strict && !wsPath.startsWith(INTERNAL_PREFIX)) {
          throw new Error(`Strict mode: cannot create directory '${wsPath}'. Defined paths: ${this.getDefinedPaths().join(', ') || 'none'}`)
        }
        return this.resolveProvider(path).mkdir(path)
      },
      isDirectory: (path: string) => this.resolveProvider(path).isDirectory(path),
      size: (path: string) => {
        const p = this.resolveProvider(path)
        return p.size ? p.size(path) : Promise.resolve(null)
      },
    }
  }

  /**
   * Get the shell instance for AI to execute bash commands.
   * AI uses: cat, echo, ls, grep, find, curl, jq, etc.
   */
  getShell(): Shell {
    return this.shell
  }

  /**
   * Set environment provider for secure variable resolution in the shell.
   * Variables are resolved at execution time — values never appear in conversation history.
   */
  setEnvProvider(provider: EnvironmentProvider): void {
    this.shell.setEnvProvider(provider)
  }

  /**
   * Get the underlying WorkspaceProvider
   */
  getProvider(): WorkspaceProvider {
    return this.provider
  }

  /**
   * Initialize the workspace.
   * Sets up real-time subscriptions if the provider supports them.
   * No-op when no provider subscription is available.
   */
  async init(): Promise<void> {
    if (this.initialized) return
    this.initialized = true

    // Subscribe to external changes if provider supports it
    if (this.provider.subscribe) {
      this.unsubscribe = this.provider.subscribe((_changes: WorkspaceChange[]) => {
        // External changes go directly to the provider — no action needed
        // since Shell reads from provider on demand.
      })
    }
  }

  /**
   * Dispose the workspace provider.
   * Unsubscribes, flushes pending writes, and disposes the provider.
   */
  async dispose(): Promise<void> {
    this.unsubscribe?.()
    this.unsubscribe = undefined

    await this.provider.flush?.()
    await this.provider.dispose?.()
  }

  /**
   * Check if strict mode is enabled
   */
  isStrict(): boolean {
    return this.strict
  }

  /**
   * Generate a prompt section describing workspace paths and constraints.
   * In strict mode, includes warnings and schemas. Returns empty string if no paths are defined.
   */
  getPromptSection(): string {
    const definedPaths = Array.from(this.definedPaths)
    const patternKeys = Array.from(this.pathPatterns.keys())
    if (definedPaths.length === 0 && patternKeys.length === 0) return ''

    const lines = ['## Workspace Storage', '']

    if (this.strict) {
      lines.push('**Strict mode is enabled.** You can ONLY read and write to the paths listed below.')
      lines.push('Writing to unlisted paths, creating new directories, or deleting defined files will fail.')
      lines.push('Before writing, check the expected schema for each path below.')
      lines.push('')
    }

    for (const path of definedPaths) {
      const v = this.validators.get(path)
      const desc = v?.description ?? ''
      lines.push(`- \`${path}\`${desc ? ` - ${desc}` : ''}`)
      if (this.strict && v?.schema) {
        lines.push(`  Schema: \`${JSON.stringify(v.schema)}\``)
      }
    }

    for (const pattern of patternKeys) {
      const v = this.validators.get(pattern)
      const desc = v?.description ?? ''
      lines.push(`- \`/${pattern}/\` (pattern)${desc ? ` - ${desc}` : ''}`)
      if (this.strict && v?.schema) {
        lines.push(`  Schema: \`${JSON.stringify(v.schema)}\``)
      }
    }

    return lines.join('\n')
  }

  /**
   * Check if a path is defined (registered via paths or matching a pattern)
   */
  isDefined(path: string): boolean {
    if (this.definedPaths.has(path)) return true
    return this.matchPattern(path) !== null
  }

  /**
   * Get all defined paths and patterns
   */
  getDefinedPaths(): string[] {
    const paths = Array.from(this.definedPaths)
    const patterns = Array.from(this.pathPatterns.keys()).map(p => `/${p}/`)
    return [...paths, ...patterns].sort()
  }

  /**
   * Register a path with optional validator and initial value
   */
  registerPath(
    path: string,
    config: JSONSchema | ValidatorFn | ZodLike | PathConfig | null
  ): void {
    // Handle PathConfig (with value and/or validator)
    if (config && typeof config === 'object' && ('value' in config || 'validator' in config || 'description' in config || 'pattern' in config)) {
      const pc = config as PathConfig

      // Route to pattern registration if flagged
      if (pc.pattern) {
        this.registerPattern(path, config)
        return
      }

      // Always track this as a defined path
      this.definedPaths.add(path)

      // Register validator if present
      if (pc.validator !== undefined) {
        this.setValidator(path, pc.validator, pc.description)
      }
      // Set initial value if present
      if (pc.value !== undefined) {
        this.write(path, pc.value, '_init')
      }
      return
    }

    // Always track this as a defined path
    this.definedPaths.add(path)

    // Handle direct validator (JSONSchema, ValidatorFn, ZodLike, null)
    this.setValidator(path, config as JSONSchema | ValidatorFn | ZodLike | null)
  }

  /**
   * Register a pattern (regex) for dynamic path matching in strict mode.
   * The pattern string is anchored automatically (^pattern$).
   */
  registerPattern(
    pattern: string,
    config: JSONSchema | ValidatorFn | ZodLike | PathConfig | null
  ): void {
    this.pathPatterns.set(pattern, new RegExp(`^${pattern}$`))

    // Register validator under the pattern key
    if (config && typeof config === 'object' && ('value' in config || 'validator' in config || 'description' in config)) {
      const pc = config as PathConfig
      if (pc.validator !== undefined) {
        this.setValidator(pattern, pc.validator, pc.description)
      }
      return
    }

    this.setValidator(pattern, config as JSONSchema | ValidatorFn | ZodLike | null)
  }

  /**
   * Find the first pattern that matches the given path.
   * Returns the pattern key or null.
   */
  private matchPattern(path: string): string | null {
    for (const [key, regex] of this.pathPatterns) {
      if (regex.test(path)) return key
    }
    return null
  }

  /**
   * Set validator for a path
   */
  private setValidator(
    path: string,
    validator: JSONSchema | ValidatorFn | ZodLike | null,
    description?: string
  ): void {
    if (!validator) {
      return
    }

    if (typeof validator === 'function') {
      this.validators.set(path, { type: 'validate', validate: validator, description })
    } else if (this.isZodLike(validator)) {
      this.validators.set(path, { type: 'zod', zod: validator, description })
    } else if ('type' in validator) {
      this.validators.set(path, { type: 'schema', schema: validator as JSONSchema, description })
    }
  }

  /** Parse path and extension */
  private parsePathExt(key: string): { path: string; ext: ValidatorType | null } {
    for (const [suffix, type] of Object.entries(Workspace.EXT_MAP)) {
      if (key.endsWith(suffix)) {
        return { path: key.slice(0, -suffix.length), ext: type }
      }
    }
    return { path: key, ext: null }
  }

  /** Check if extension is a format type */
  private isFormatExt(ext: ValidatorType): ext is FormatExt {
    return ['json', 'md', 'txt', 'num', 'bool'].includes(ext)
  }

  /** Check if value looks like a Zod schema */
  private isZodLike(value: unknown): value is ZodLike {
    return (
      typeof value === 'object' &&
      value !== null &&
      'safeParse' in value &&
      typeof (value as ZodLike).safeParse === 'function'
    )
  }

  /**
   * Write a value to the workspace at the given path
   *
   * @param path - Path (e.g., 'meals.today', 'user/preferences')
   * @param value - Any JSON-serializable value
   * @param _writtenBy - Optional identifier of who wrote this (unused, kept for API compatibility)
   * @returns WriteResult with success status and any validation errors
   */
  write(path: string, value: unknown, _writtenBy?: string): WriteResult {
    // .tuplet/ is internal — always allowed, skip validation
    if (path.startsWith(INTERNAL_PREFIX)) {
      const fsPath = path.startsWith('/') ? path : `/${path}`
      const content = typeof value === 'string' ? value : JSON.stringify(value, null, 2)
      this.internalProvider.write(fsPath, content).catch(() => {})
      return { success: true }
    }

    // Strict mode: only allow writing to defined paths or pattern-matched paths
    let matchedPattern: string | null = null
    if (this.strict && !this.definedPaths.has(path)) {
      matchedPattern = this.matchPattern(path)
      if (!matchedPattern) {
        return {
          success: false,
          errors: [{
            path,
            message: `Path "${path}" is not defined. Available paths: ${this.getDefinedPaths().join(', ') || 'none'}`
          }]
        }
      }
    }

    const { ext } = this.parsePathExt(path)
    // Use the pattern's validator if the path matched a pattern
    const validator = this.validators.get(path) ?? (matchedPattern ? this.validators.get(matchedPattern) : undefined)
    let errors: ValidationError[] = []

    // Step 1: Format validation (from extension)
    if (ext && this.isFormatExt(ext)) {
      errors = this.validateFormat(value, ext, path)
      if (errors.length > 0) {
        return { success: false, errors }
      }
    }

    // Step 2: Additional validation (from registered validator)
    if (validator) {
      if (validator.validate) {
        const result = validator.validate(value)
        if (result && result.length > 0) {
          errors = result
        }
      } else if (validator.schema) {
        errors = this.validateSchema(value, validator.schema, path)
      } else if (validator.zod) {
        errors = this.validateZod(value, validator.zod, path)
      }
    }

    if (errors.length > 0) {
      return { success: false, errors }
    }

    // Normalize path to internal format (always stored with / prefix)
    const fsPath = path.startsWith('/') ? path : `/${path}`

    // Serialize value for storage
    const content = typeof value === 'string' ? value : JSON.stringify(value, null, 2)
    // Fire-and-forget write to provider
    this.provider.write(fsPath, content).catch(() => {})

    return { success: true }
  }

  /**
   * Get validator info for a path
   */
  getValidator(path: string): { type: ValidatorType; schema?: JSONSchema; description?: string } | undefined {
    const v = this.validators.get(path)
    if (!v) return undefined
    return { type: v.type, schema: v.schema, description: v.description }
  }

  /**
   * Get schema for a path (if JSON schema validator)
   */
  getSchema(path: string): JSONSchema | undefined {
    const v = this.validators.get(path)
    return v?.schema
  }

  /**
   * Get validator description for a path
   */
  getValidatorDescription(path: string): string | undefined {
    return this.validators.get(path)?.description
  }

  /**
   * Get all paths with validators
   */
  getValidatorPaths(): string[] {
    return Array.from(this.validators.keys())
  }

  /**
   * Validate a value against a JSON schema
   */
  private validateSchema(value: unknown, schema: JSONSchema, basePath: string): ValidationError[] {
    const errors: ValidationError[] = []

    // Type check
    if (schema.type === 'object') {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        errors.push({
          path: basePath,
          message: 'Expected object',
          expected: 'object',
          received: value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value
        })
        return errors
      }

      const obj = value as Record<string, unknown>

      // Check required properties
      if (schema.required) {
        for (const prop of schema.required) {
          if (!(prop in obj)) {
            errors.push({
              path: `${basePath}.${prop}`,
              message: `Missing required property: ${prop}`,
              expected: 'present'
            })
          }
        }
      }

      // Validate properties
      if (schema.properties) {
        for (const [prop, propSchema] of Object.entries(schema.properties)) {
          if (prop in obj) {
            const propErrors = this.validateProperty(obj[prop], propSchema, `${basePath}.${prop}`)
            errors.push(...propErrors)
          }
        }
      }
    }

    return errors
  }

  /**
   * Validate a single property
   */
  private validateProperty(
    value: unknown,
    schema: { type: string; enum?: string[]; items?: JSONSchema },
    path: string
  ): ValidationError[] {
    const errors: ValidationError[] = []

    // Type validation
    if (schema.type === 'string') {
      if (typeof value !== 'string') {
        errors.push({
          path,
          message: 'Expected string',
          expected: 'string',
          received: typeof value
        })
      } else if (schema.enum && !schema.enum.includes(value)) {
        errors.push({
          path,
          message: `Value must be one of: ${schema.enum.join(', ')}`,
          expected: schema.enum.join(' | '),
          received: value
        })
      }
    } else if (schema.type === 'number') {
      if (typeof value !== 'number') {
        errors.push({
          path,
          message: 'Expected number',
          expected: 'number',
          received: typeof value
        })
      }
    } else if (schema.type === 'boolean') {
      if (typeof value !== 'boolean') {
        errors.push({
          path,
          message: 'Expected boolean',
          expected: 'boolean',
          received: typeof value
        })
      }
    } else if (schema.type === 'array') {
      if (!Array.isArray(value)) {
        errors.push({
          path,
          message: 'Expected array',
          expected: 'array',
          received: typeof value
        })
      }
    } else if (schema.type === 'object') {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        errors.push({
          path,
          message: 'Expected object',
          expected: 'object',
          received: value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value
        })
      }
    }

    return errors
  }

  /**
   * Validate a value using Zod schema
   */
  private validateZod(value: unknown, zod: ZodLike, basePath: string): ValidationError[] {
    const result = zod.safeParse(value)

    if (result.success) {
      return []
    }

    return result.error.errors.map(err => ({
      path: err.path.length > 0 ? `${basePath}.${err.path.join('.')}` : basePath,
      message: err.message
    }))
  }

  /**
   * Validate a value against a format extension
   */
  private validateFormat(value: unknown, format: FormatExt, path: string): ValidationError[] {
    switch (format) {
      case 'json':
        if (typeof value !== 'object' || value === null) {
          return [{
            path,
            message: 'Expected JSON object or array',
            expected: 'object | array',
            received: value === null ? 'null' : typeof value
          }]
        }
        return []

      case 'md':
      case 'txt':
        if (typeof value !== 'string') {
          return [{
            path,
            message: `Expected string for .${format}`,
            expected: 'string',
            received: typeof value
          }]
        }
        return []

      case 'num':
        if (typeof value !== 'number' || Number.isNaN(value)) {
          return [{
            path,
            message: 'Expected number',
            expected: 'number',
            received: Number.isNaN(value) ? 'NaN' : typeof value
          }]
        }
        return []

      case 'bool':
        if (typeof value !== 'boolean') {
          return [{
            path,
            message: 'Expected boolean',
            expected: 'boolean',
            received: typeof value
          }]
        }
        return []

      default:
        return []
    }
  }

  /**
   * Read a value from the workspace
   *
   * @param path - Path to read from (with or without / prefix)
   * @returns The value, or undefined if not found
   */
  async read<T = unknown>(path: string): Promise<T | undefined> {
    const fsPath = path.startsWith('/') ? path : `/${path}`
    const content = await this.resolveProvider(path).read(fsPath)
    if (content === null) return undefined

    try {
      return JSON.parse(content) as T
    } catch {
      return content as T
    }
  }

  /**
   * Check if a path exists in the workspace
   */
  async has(path: string): Promise<boolean> {
    const fsPath = path.startsWith('/') ? path : `/${path}`
    return this.resolveProvider(path).exists(fsPath)
  }

  /**
   * Delete a path from the workspace.
   * In strict mode, defined paths cannot be deleted (.tuplet/ is always allowed).
   */
  async delete(path: string): Promise<boolean> {
    if (this.strict && !path.startsWith(INTERNAL_PREFIX) && this.isDefined(path)) {
      return false
    }
    const fsPath = path.startsWith('/') ? path : `/${path}`
    return this.resolveProvider(path).delete(fsPath)
  }

  /**
   * List all paths, optionally filtered by prefix
   */
  async list(prefix?: string): Promise<WorkspaceListItem[]> {
    const fsPrefix = prefix
      ? (prefix.startsWith('/') ? prefix : `/${prefix}`)
      : '/'

    const files = await this.provider.glob(fsPrefix + '**/*')
    const items: WorkspaceListItem[] = []

    for (const path of files) {
      if (await this.provider.isDirectory(path)) continue

      const content = await this.provider.read(path)
      let value: unknown = content
      try {
        value = content ? JSON.parse(content) : null
      } catch {
        // Keep as string
      }

      items.push({
        path,
        updatedAt: Date.now(),
        preview: this.getPreview(value)
      })
    }

    return items.sort((a, b) => a.path.localeCompare(b.path))
  }

  /**
   * Get all paths (just the keys, no metadata)
   */
  async keys(prefix?: string): Promise<string[]> {
    const fsPrefix = prefix
      ? (prefix.startsWith('/') ? prefix : `/${prefix}`)
      : '/'

    const files = await this.provider.glob(fsPrefix + '**/*')
    const result: string[] = []
    for (const p of files) {
      if (!await this.provider.isDirectory(p)) {
        result.push(p)
      }
    }
    return result.sort()
  }

  /**
   * Clear all data from the workspace
   */
  async clear(): Promise<void> {
    await this.provider.delete('/')
    await this.provider.mkdir('/')
  }

  /**
   * Get number of entries
   */
  async getSize(): Promise<number> {
    return (await this.keys()).length
  }

  private getPreview(value: unknown): string {
    if (value === null) return 'null'
    if (value === undefined) return 'undefined'

    const type = typeof value

    if (type === 'string') {
      const str = value as string
      return str.length > 50 ? `"${str.slice(0, 47)}..."` : `"${str}"`
    }

    if (type === 'number' || type === 'boolean') {
      return String(value)
    }

    if (Array.isArray(value)) {
      return `Array[${value.length}]`
    }

    if (type === 'object') {
      const keys = Object.keys(value as object)
      if (keys.length <= 3) {
        return `{${keys.join(', ')}}`
      }
      return `{${keys.slice(0, 3).join(', ')}, ...+${keys.length - 3}}`
    }

    return type
  }
}
