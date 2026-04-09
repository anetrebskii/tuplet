/**
 * Skill Tool - Lazy-loaded prompt activation
 *
 * When the model calls __skill__ with a skill name, the executor injects
 * the skill's full prompt as a user message. Only skill metadata
 * (name/description/whenToUse) is in the system prompt.
 */

import type { Tool, ToolResult, ToolContext, JSONSchema } from '../types.js'

export const SKILL_TOOL_NAME = '__skill__'

export interface SkillDef {
  name: string
  prompt: string
}

export function createSkillTool(skills: SkillDef[]): Tool {
  const skillMap = new Map(skills.map(s => [s.name, s]))

  return {
    name: SKILL_TOOL_NAME,
    description: `Activate a skill to load its detailed instructions into the conversation. Call this when the user's request matches a skill's "when to use" trigger. Available skills: ${skills.map(s => s.name).join(', ')}`,
    parameters: {
      type: 'object',
      properties: {
        skill: {
          type: 'string',
          description: 'Name of the skill to activate',
          enum: skills.map(s => s.name)
        }
      },
      required: ['skill']
    } as JSONSchema,
    execute: async (params: Record<string, unknown>, _context: ToolContext): Promise<ToolResult> => {
      const skillName = params.skill as string
      const skill = skillMap.get(skillName)
      if (!skill) {
        return {
          success: false,
          error: `Unknown skill: ${skillName}. Available: ${skills.map(s => s.name).join(', ')}`
        }
      }
      return {
        success: true,
        data: {
          __skillActivation: true,
          skillName: skill.name,
          skillPrompt: skill.prompt,
        }
      }
    }
  }
}
