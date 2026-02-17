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
   *     "today/meals.json": { value: [] }
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
}

/**
 * Workspace provides a virtual filesystem for agent communication.
 * Uses WorkspaceProvider directly and provides Shell access for AI to use bash commands.
 */
export class Workspace {
  private provider: WorkspaceProvider
  private shell: Shell
  private validators: Map<string, ValidatorEntry> = new Map()
  private definedPaths: Set<string> = new Set()
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
    this.shell = new Shell({
      ...config?.shell,
      fs: this.provider
    })

    if (config?.paths) {
      for (const [key, value] of Object.entries(config.paths)) {
        this.registerPath(key, value)
      }
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
   * Check if a path is defined (registered)
   */
  isDefined(path: string): boolean {
    return this.definedPaths.has(path)
  }

  /**
   * Get all defined paths
   */
  getDefinedPaths(): string[] {
    return Array.from(this.definedPaths).sort()
  }

  /**
   * Register a path with optional validator and initial value
   */
  registerPath(
    path: string,
    config: JSONSchema | ValidatorFn | ZodLike | PathConfig | null
  ): void {
    // Always track this as a defined path
    this.definedPaths.add(path)

    // Handle PathConfig (with value and/or validator)
    if (config && typeof config === 'object' && ('value' in config || 'validator' in config || 'description' in config)) {
      const pc = config as PathConfig
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

    // Handle direct validator (JSONSchema, ValidatorFn, ZodLike, null)
    this.setValidator(path, config as JSONSchema | ValidatorFn | ZodLike | null)
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
    // Strict mode: only allow writing to defined paths
    if (this.strict && !this.definedPaths.has(path)) {
      return {
        success: false,
        errors: [{
          path,
          message: `Path "${path}" is not defined. Available paths: ${this.getDefinedPaths().join(', ') || 'none'}`
        }]
      }
    }

    const { ext } = this.parsePathExt(path)
    const validator = this.validators.get(path)
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
    const content = await this.provider.read(fsPath)
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
    return this.provider.exists(fsPath)
  }

  /**
   * Delete a path from the workspace
   */
  async delete(path: string): Promise<boolean> {
    const fsPath = path.startsWith('/') ? path : `/${path}`
    return this.provider.delete(fsPath)
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
