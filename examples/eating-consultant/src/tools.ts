/**
 * Eating Consultant Tools
 *
 * Uses OpenFoodFacts API for real nutrition data.
 */

import type { Tool } from 'tuplet'

// Meal log storage
interface MealEntry {
  id: string
  food: string
  brand?: string
  portionGrams: number
  meal: 'breakfast' | 'lunch' | 'dinner' | 'snack'
  time: string
  nutrition: {
    calories: number
    protein: number
    carbs: number
    fat: number
    fiber: number
  }
}

const mealLog: MealEntry[] = []

/**
 * Search OpenFoodFacts for food products
 */
export const searchFoodTool: Tool = {
  name: 'search_food',
  description: `Search OpenFoodFacts database for food products.

Returns a list of matching products with their nutrition info per 100g.

Examples:
- { "query": "coca cola" }
- { "query": "chicken breast" }
- { "query": "greek yogurt" }`,
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Food name to search for'
      }
    },
    required: ['query']
  },
  execute: async (params) => {
    const { query } = params as { query: string }

    try {
      const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=5`

      const response = await fetch(url, {
        headers: { 'User-Agent': 'EatingConsultant/1.0' }
      })

      if (!response.ok) {
        return { success: false, error: `API error: ${response.status}` }
      }

      const data = await response.json() as {
        products: Array<{
          _id: string
          product_name?: string
          brands?: string
          nutriments?: {
            'energy-kcal_100g'?: number
            proteins_100g?: number
            carbohydrates_100g?: number
            fat_100g?: number
            fiber_100g?: number
          }
        }>
      }

      const products = data.products
        .filter(p => p.product_name && p.nutriments)
        .slice(0, 5)
        .map(p => ({
          id: p._id,
          name: p.product_name,
          brand: p.brands || 'Unknown',
          per100g: {
            calories: Math.round(p.nutriments?.['energy-kcal_100g'] || 0),
            protein: Math.round((p.nutriments?.proteins_100g || 0) * 10) / 10,
            carbs: Math.round((p.nutriments?.carbohydrates_100g || 0) * 10) / 10,
            fat: Math.round((p.nutriments?.fat_100g || 0) * 10) / 10,
            fiber: Math.round((p.nutriments?.fiber_100g || 0) * 10) / 10
          }
        }))

      if (products.length === 0) {
        return {
          success: true,
          data: { message: `No products found for "${query}"`, products: [] }
        }
      }

      return {
        success: true,
        data: {
          query,
          count: products.length,
          products
        }
      }
    } catch (error) {
      return {
        success: false,
        error: `Failed to search: ${error instanceof Error ? error.message : String(error)}`
      }
    }
  }
}

/**
 * Log a meal with nutrition data
 */
export const logMealTool: Tool = {
  name: 'log_meal',
  description: `Log a food item that the user has eaten.

You should first search for the food to get accurate nutrition data.

Example:
{
  "food": "Chicken Breast",
  "portionGrams": 150,
  "meal": "lunch",
  "calories": 165,
  "protein": 31,
  "carbs": 0,
  "fat": 3.6,
  "fiber": 0
}`,
  parameters: {
    type: 'object',
    properties: {
      food: {
        type: 'string',
        description: 'Name of the food'
      },
      brand: {
        type: 'string',
        description: 'Brand name (optional)'
      },
      portionGrams: {
        type: 'string',
        description: 'Portion size in grams'
      },
      meal: {
        type: 'string',
        enum: ['breakfast', 'lunch', 'dinner', 'snack'],
        description: 'Which meal this was'
      },
      calories: {
        type: 'string',
        description: 'Calories per 100g'
      },
      protein: {
        type: 'string',
        description: 'Protein per 100g'
      },
      carbs: {
        type: 'string',
        description: 'Carbs per 100g'
      },
      fat: {
        type: 'string',
        description: 'Fat per 100g'
      },
      fiber: {
        type: 'string',
        description: 'Fiber per 100g'
      }
    },
    required: ['food', 'portionGrams', 'meal', 'calories', 'protein', 'carbs', 'fat']
  },
  execute: async (params) => {
    const { food, brand, portionGrams, meal, calories, protein, carbs, fat, fiber } = params as {
      food: string
      brand?: string
      portionGrams: number
      meal: 'breakfast' | 'lunch' | 'dinner' | 'snack'
      calories: number
      protein: number
      carbs: number
      fat: number
      fiber?: number
    }

    const multiplier = portionGrams / 100
    const portionNutrition = {
      calories: Math.round(calories * multiplier),
      protein: Math.round(protein * multiplier * 10) / 10,
      carbs: Math.round(carbs * multiplier * 10) / 10,
      fat: Math.round(fat * multiplier * 10) / 10,
      fiber: Math.round((fiber || 0) * multiplier * 10) / 10
    }

    const entry: MealEntry = {
      id: Date.now().toString(),
      food,
      brand,
      portionGrams,
      meal,
      time: new Date().toLocaleTimeString(),
      nutrition: portionNutrition
    }

    mealLog.push(entry)

    return {
      success: true,
      data: {
        message: `Logged ${portionGrams}g of ${food}${brand ? ` (${brand})` : ''} for ${meal}`,
        nutrition: portionNutrition,
        totalMealsToday: mealLog.length
      }
    }
  }
}

/**
 * Get daily nutrition totals
 */
export const getDailyTotalsTool: Tool = {
  name: 'get_daily_totals',
  description: `Get the total nutrition consumed today.

Returns sum of all logged meals with breakdown.

Example: { }`,
  parameters: {
    type: 'object',
    properties: {},
    required: []
  },
  execute: async () => {
    if (mealLog.length === 0) {
      return {
        success: true,
        data: {
          message: 'No meals logged yet today.',
          totals: { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
          meals: []
        }
      }
    }

    const totals = { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 }

    for (const entry of mealLog) {
      totals.calories += entry.nutrition.calories
      totals.protein += entry.nutrition.protein
      totals.carbs += entry.nutrition.carbs
      totals.fat += entry.nutrition.fat
      totals.fiber += entry.nutrition.fiber
    }

    // Round totals
    totals.protein = Math.round(totals.protein * 10) / 10
    totals.carbs = Math.round(totals.carbs * 10) / 10
    totals.fat = Math.round(totals.fat * 10) / 10
    totals.fiber = Math.round(totals.fiber * 10) / 10

    // Group by meal
    const byMeal: Record<string, MealEntry[]> = {}
    for (const entry of mealLog) {
      if (!byMeal[entry.meal]) byMeal[entry.meal] = []
      byMeal[entry.meal].push(entry)
    }

    return {
      success: true,
      data: {
        totals,
        mealCount: mealLog.length,
        byMeal: Object.entries(byMeal).map(([meal, entries]) => ({
          meal,
          items: entries.map(e => `${e.food} (${e.portionGrams}g)`),
          subtotal: {
            calories: entries.reduce((sum, e) => sum + e.nutrition.calories, 0),
            protein: Math.round(entries.reduce((sum, e) => sum + e.nutrition.protein, 0) * 10) / 10
          }
        }))
      }
    }
  }
}

/**
 * Clear meal log (for new day)
 */
export const clearMealLogTool: Tool = {
  name: 'clear_meal_log',
  description: `Clear all logged meals (start fresh for a new day).

Example: { }`,
  parameters: {
    type: 'object',
    properties: {},
    required: []
  },
  execute: async () => {
    const count = mealLog.length
    mealLog.length = 0
    return {
      success: true,
      data: { message: `Cleared ${count} meal entries. Starting fresh!` }
    }
  }
}

// Tools for the nutrition counter sub-agent
export const nutritionCounterTools = [
  searchFoodTool,
  logMealTool,
  getDailyTotalsTool,
  clearMealLogTool
]

// Main agent only gets high-level tools (delegates to sub-agent)
export const mainAgentTools = [
  getDailyTotalsTool,
  clearMealLogTool
]
