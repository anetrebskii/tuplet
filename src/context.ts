/**
 * Context - A virtual filesystem for agent communication
 *
 * Wraps VirtualFS from the shell module. AI agents interact with context
 * using bash-like commands (cat, echo, ls, grep, etc.) through the shell.
 *
 * Usage:
 * ```typescript
 * const context = new Context({
 *   paths: {
 *     'user/preferences.json': { value: { theme: 'dark' } }
 *   }
 * })
 *
 * // Get the shell for AI to use
 * const shell = context.getShell()
 *
 * // AI uses bash commands:
 * // cat /ctx/user/preferences.json
 * // echo '{"theme": "light"}' > /ctx/user/preferences.json
 * // ls /ctx/
 * // grep "theme" /ctx/
 *
 * // Read results after run
 * const prefs = context.read('/ctx/user/preferences.json')
 * ```
 */

import type { JSONSchema } from './types.js'
import { VirtualFS } from './shell/fs.js'
import { Shell } from './shell/shell.js'
import type { ShellConfig } from './shell/types.js'

export interface ContextEntry {
  value: unknown
  createdAt: number
  updatedAt: number
  /** Optional metadata about who wrote this entry */
  writtenBy?: string
}

export interface ContextListItem {
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

export interface ContextConfig {
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
   * const context = new Context({
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

export interface ContextConfigExt extends ContextConfig {
  /** Shell configuration for HTTP requests */
  shell?: ShellConfig
}

/**
 * Context provides a virtual filesystem for agent communication.
 * Wraps VirtualFS and provides Shell access for AI to use bash commands.
 */
export class Context {
  private fs: VirtualFS
  private shell: Shell
  private validators: Map<string, ValidatorEntry> = new Map()
  private definedPaths: Set<string> = new Set()
  private strict: boolean = false

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

  constructor(config?: ContextConfigExt) {
    this.strict = config?.strict ?? false
    this.fs = new VirtualFS()
    this.shell = new Shell({
      ...config?.shell,
      fs: this.fs // Share VirtualFS instance with shell
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
   * Get the underlying VirtualFS
   */
  getFS(): VirtualFS {
    return this.fs
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
   *
   * @example
   * // Format validation only (from .json extension)
   * context.registerPath('data/config.json', null)
   *
   * // With JSON Schema
   * context.registerPath('data/config.json', { type: 'object', properties: {...} })
   *
   * // With initial value
   * context.registerPath('data/user.json', { validator: schema, value: { name: "Guest" } })
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
    for (const [suffix, type] of Object.entries(Context.EXT_MAP)) {
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
   * Write a value to the context at the given path
   *
   * @param path - Dot-separated path (e.g., 'meals.today', 'user.preferences')
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

    // Normalize path to VirtualFS format
    const fsPath = path.startsWith('/ctx/') ? path : `/ctx/${path}`

    // Serialize value for VirtualFS storage
    const content = typeof value === 'string' ? value : JSON.stringify(value, null, 2)
    this.fs.write(fsPath, content)

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
      // Could add items validation here if needed
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
        // Must be object or array (valid JSON structure)
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
        // Must be string
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
        // Must be number
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
        // Must be boolean
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
   * Read a value from the context
   *
   * @param path - Path to read from (with or without /ctx/ prefix)
   * @returns The value, or undefined if not found
   */
  read<T = unknown>(path: string): T | undefined {
    const fsPath = path.startsWith('/ctx/') ? path : `/ctx/${path}`
    const content = this.fs.read(fsPath)
    if (content === null) return undefined

    try {
      return JSON.parse(content) as T
    } catch {
      return content as T
    }
  }

  /**
   * Check if a path exists in the context
   */
  has(path: string): boolean {
    const fsPath = path.startsWith('/ctx/') ? path : `/ctx/${path}`
    return this.fs.exists(fsPath)
  }

  /**
   * Delete a path from the context
   */
  delete(path: string): boolean {
    const fsPath = path.startsWith('/ctx/') ? path : `/ctx/${path}`
    return this.fs.delete(fsPath)
  }

  /**
   * List all paths, optionally filtered by prefix
   */
  list(prefix?: string): ContextListItem[] {
    const fsPrefix = prefix
      ? (prefix.startsWith('/ctx/') ? prefix : `/ctx/${prefix}`)
      : '/ctx/'

    const files = this.fs.glob(fsPrefix + '**/*')
    const items: ContextListItem[] = []

    for (const path of files) {
      if (this.fs.isDirectory(path)) continue

      const content = this.fs.read(path)
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
  keys(prefix?: string): string[] {
    const fsPrefix = prefix
      ? (prefix.startsWith('/ctx/') ? prefix : `/ctx/${prefix}`)
      : '/ctx/'

    return this.fs.glob(fsPrefix + '**/*')
      .filter(p => !this.fs.isDirectory(p))
      .sort()
  }

  /**
   * Clear all data from the context
   */
  clear(): void {
    this.fs.delete('/ctx')
    this.fs.mkdir('/ctx')
  }

  /**
   * Export all data as a plain object
   */
  toObject(): Record<string, unknown> {
    return this.fs.export()
  }

  /**
   * Import data from a plain object
   */
  fromObject(obj: Record<string, unknown>, _writtenBy?: string): void {
    for (const [path, value] of Object.entries(obj)) {
      this.write(path, value)
    }
  }

  /**
   * Get number of entries
   */
  get size(): number {
    return this.keys().length
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

// Note: Context tools (context_ls, context_read, context_write) have been removed.
// AI agents now use shell commands to interact with context:
//   ls /ctx/           - list context
//   cat /ctx/file.json - read from context
//   echo '...' > /ctx/file.json - write to context
//   grep "pattern" /ctx/ - search context
