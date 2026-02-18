/**
 * Run Tester
 *
 * Runs tests against recorded runs to verify agent behavior.
 */

import { readdir } from 'fs/promises'
import { join } from 'path'
import type { Tuplet } from '../../agent.js'
import type { RunOptions, AgentResult } from '../../types.js'
import type { RunRecord } from './base.js'
import { RunReplayer } from './replayer.js'

/**
 * Result of comparing a replay to a recorded run
 */
export interface TestResult {
  /** Run record ID */
  runId: string
  /** Whether the test passed */
  passed: boolean
  /** Input message that was tested */
  inputMessage: string
  /** Expected response from recording */
  expectedResponse: string
  /** Actual response from replay */
  actualResponse: string
  /** Whether status matched */
  statusMatch: boolean
  /** Whether tool call count matched */
  toolCallCountMatch: boolean
  /** Whether response matched exactly */
  responseMatch: boolean
  /** Error if test failed to run */
  error?: string
  /** Duration of the replay in ms */
  durationMs: number
}

/**
 * Summary of all test results
 */
export interface TestSummary {
  /** Total number of tests run */
  total: number
  /** Number of passed tests */
  passed: number
  /** Number of failed tests */
  failed: number
  /** Individual test results */
  results: TestResult[]
  /** Total duration in ms */
  durationMs: number
}

/**
 * Configuration for RunTester
 */
export interface RunTesterConfig {
  /** Directory containing recorded run JSON files */
  runsDir: string
  /** Custom comparison function (optional) */
  compareFn?: (expected: AgentResult, actual: AgentResult, record: RunRecord) => boolean
  /** Additional run options to pass to agent.run() */
  runOptions?: Partial<RunOptions>
  /** Called before each test */
  beforeEach?: (record: RunRecord) => Promise<void> | void
  /** Called after each test */
  afterEach?: (result: TestResult, record: RunRecord) => Promise<void> | void
}

/**
 * Runs tests against recorded runs
 */
export class RunTester {
  private runsDir: string
  private replayer: RunReplayer
  private config: RunTesterConfig

  constructor(config: RunTesterConfig) {
    this.runsDir = config.runsDir
    this.replayer = new RunReplayer()
    this.config = config
  }

  /**
   * Run all tests in the runs directory
   */
  async runAll(agent: Tuplet): Promise<TestSummary> {
    const startTime = Date.now()
    const files = await this.getRunFiles()
    const results: TestResult[] = []

    for (const file of files) {
      const result = await this.runOne(agent, file)
      results.push(result)
    }

    return {
      total: results.length,
      passed: results.filter(r => r.passed).length,
      failed: results.filter(r => !r.passed).length,
      results,
      durationMs: Date.now() - startTime
    }
  }

  /**
   * Run a single test from a file
   */
  async runOne(agent: Tuplet, filePath: string): Promise<TestResult> {
    const startTime = Date.now()

    try {
      const record = await this.replayer.load(filePath)

      // Call beforeEach hook
      if (this.config.beforeEach) {
        await this.config.beforeEach(record)
      }

      // Run the agent with same initial state
      const result = await agent.run(record.inputMessage, {
        history: record.initialHistory,
        ...this.config.runOptions
      })

      // Compare results
      const statusMatch = result.status === record.result.status
      const toolCallCountMatch = result.toolCalls.length === record.result.toolCalls.length
      const responseMatch = result.response === record.result.response

      // Use custom compare function if provided, otherwise require all matches
      const passed = this.config.compareFn
        ? this.config.compareFn(record.result as AgentResult, result, record)
        : (statusMatch && toolCallCountMatch)

      const testResult: TestResult = {
        runId: record.id,
        passed,
        inputMessage: record.inputMessage,
        expectedResponse: record.result.response,
        actualResponse: result.response,
        statusMatch,
        toolCallCountMatch,
        responseMatch,
        durationMs: Date.now() - startTime
      }

      // Call afterEach hook
      if (this.config.afterEach) {
        await this.config.afterEach(testResult, record)
      }

      return testResult
    } catch (error) {
      return {
        runId: filePath,
        passed: false,
        inputMessage: '',
        expectedResponse: '',
        actualResponse: '',
        statusMatch: false,
        toolCallCountMatch: false,
        responseMatch: false,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startTime
      }
    }
  }

  /**
   * Get all run files in the directory
   */
  private async getRunFiles(): Promise<string[]> {
    const files = await readdir(this.runsDir)
    return files
      .filter(f => f.endsWith('.json'))
      .map(f => join(this.runsDir, f))
      .sort()
  }

  /**
   * Print test summary to console
   */
  static printSummary(summary: TestSummary): void {
    console.log('\n' + '='.repeat(60))
    console.log('TEST SUMMARY')
    console.log('='.repeat(60))
    console.log(`Total: ${summary.total}`)
    console.log(`Passed: ${summary.passed}`)
    console.log(`Failed: ${summary.failed}`)
    console.log(`Duration: ${summary.durationMs}ms`)
    console.log('')

    for (const result of summary.results) {
      const icon = result.passed ? '✓' : '✗'
      const status = result.passed ? 'PASS' : 'FAIL'
      console.log(`${icon} [${status}] ${result.runId}`)

      if (!result.passed) {
        if (result.error) {
          console.log(`    Error: ${result.error}`)
        } else {
          console.log(`    Status match: ${result.statusMatch}`)
          console.log(`    Tool call count match: ${result.toolCallCountMatch}`)
          console.log(`    Response match: ${result.responseMatch}`)
          if (!result.responseMatch) {
            console.log(`    Expected: "${result.expectedResponse.slice(0, 100)}..."`)
            console.log(`    Actual: "${result.actualResponse.slice(0, 100)}..."`)
          }
        }
      }
    }

    console.log('\n' + '='.repeat(60))
    const passRate = summary.total > 0 ? ((summary.passed / summary.total) * 100).toFixed(1) : 0
    console.log(`Pass rate: ${passRate}%`)
    console.log('='.repeat(60) + '\n')
  }
}
