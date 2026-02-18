/**
 * Built-in Agents
 *
 * Agents that are always available. Cannot be disabled.
 */

import type { SubAgentConfig } from '../types.js'
import { exploreAgent } from './explore.js'
import { planAgent } from './plan.js'
import { workerAgent } from './worker.js'

export { exploreAgent } from './explore.js'
export { planAgent } from './plan.js'
export { workerAgent } from './worker.js'

/**
 * Get all built-in agents.
 * Returns agents that are always auto-injected into every Tuplet.
 */
export function getBuiltInAgents(): SubAgentConfig[] {
  return [exploreAgent, planAgent, workerAgent]
}
