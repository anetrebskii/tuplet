/**
 * Built-in Agents
 *
 * Agents that are always available. Cannot be disabled.
 */

import type { SubAgentConfig } from '../types.js'
import { exploreAgent } from './explore.js'
import { planAgent } from './plan.js'

export { exploreAgent } from './explore.js'
export { planAgent } from './plan.js'

/**
 * Get all built-in agents.
 * Returns agents that are always auto-injected into every Hive.
 */
export function getBuiltInAgents(): SubAgentConfig[] {
  return [exploreAgent, planAgent]
}
