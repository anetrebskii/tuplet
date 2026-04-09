# Skills

Skills are lazy-loaded prompts for specialized workflows. Only metadata (name, description, when to use) goes into the system prompt. The full instructions are loaded on demand when the model activates a skill, keeping the base prompt compact.

```typescript
import type { SkillConfig } from 'tuplet'

const logMeal: SkillConfig = {
  name: 'log_meal',
  description: 'Log what the user ate with nutrition data',
  whenToUse: 'User mentions eating or drinking something',
  prompt: `Log the user's meal with accurate nutrition data.

Steps:
1. Extract food items from the user's message
2. Call search_food to find nutrition data
3. Ask for portion size if not specified
4. Call log_meal for each item
5. Summarize what was logged`
}

const agent = new Tuplet({
  role: 'a nutrition consultant',
  skills: [logMeal],
  tools: [searchFoodTool, logMealTool],
  llm: provider
})
```

## How It Works

1. **System prompt** gets a compact table with skill name + description + when to use
2. Model sees a user request, matches it to a skill's trigger, calls `__skill__({ skill: "log_meal" })`
3. Tuplet injects the full skill prompt as a `<skill>` message into the conversation
4. Model follows the detailed instructions on the next turn

This is the same pattern Claude Code uses for its skill system.

## Skills vs Sub-Agents

| | Skills | Sub-Agents |
|---|---|---|
| **What** | Prompt injection into main conversation | Separate LLM invocation |
| **Cost** | No extra LLM call | New LLM call with its own context |
| **Tools** | Uses main agent's tools | Has its own tool set |
| **When** | Change *how* the agent behaves | Delegate *work* to a specialist |

Use skills when you want the main agent to follow specific instructions for a task. Use sub-agents when the task needs its own context, tools, or model.

## Configuration

```typescript
interface SkillConfig {
  name: string                    // Unique identifier
  description: string             // Short - shown in system prompt
  whenToUse: string               // Trigger description for the model
  prompt: string                  // Full instructions - loaded on activation
  disableModelInvocation?: boolean // Only user can trigger (not model)
}
```

## Disable Model Invocation

For skills with side effects (deploy, send email), prevent the model from auto-activating:

```typescript
const deploySkill: SkillConfig = {
  name: 'deploy',
  description: 'Deploy the application to production',
  whenToUse: 'User explicitly asks to deploy',
  prompt: '...',
  disableModelInvocation: true  // model can't auto-trigger this
}
```

Skills with `disableModelInvocation: true` are excluded from the system prompt listing and can only be triggered programmatically.

## Example: Multiple Skills

```typescript
const skills: SkillConfig[] = [
  {
    name: 'collect_profile',
    description: 'Collect user profile and calculate daily targets',
    whenToUse: 'New user or user asks to set up their profile',
    prompt: `Collect user info step by step:
1. Goal (weight loss, muscle gain, maintenance)
2. Weight and height
3. Activity level
Calculate TDEE and save to workspace.`
  },
  {
    name: 'log_meal',
    description: 'Log what the user ate with nutrition lookup',
    whenToUse: 'User mentions eating or drinking something',
    prompt: `Log the meal:
1. Search for the food in the database
2. Ask for portion size if unclear
3. Record with nutrition data
4. Show summary with calories and macros`
  },
  {
    name: 'analyze_day',
    description: 'Daily nutrition analysis and recommendations',
    whenToUse: 'User asks for summary, analysis, or recommendations',
    prompt: `Analyze today's nutrition:
1. Get daily totals
2. Compare against targets from user profile
3. Give 1-2 actionable suggestions for remaining meals`
  }
]

const agent = new Tuplet({
  role: 'a nutrition consultant',
  skills,
  tools: [searchFoodTool, logMealTool, getDailyTotalsTool],
  llm: provider
})
```
