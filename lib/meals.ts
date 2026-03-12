import { CalorieResponse, QuickMeal, StoredMealLog } from "@/lib/types";

export function getLocalDateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function getMealsForDate(meals: StoredMealLog[], dateKey: string) {
  return meals.filter((meal) => (meal.mealDate ?? meal.createdAt.slice(0, 10)) === dateKey);
}

export function toCalorieResponseFromQuickMeal(meal: QuickMeal): CalorieResponse {
  return {
    items: [
      {
        food: meal.title,
        quantity: "Saved quick meal",
        calories: meal.calories,
        protein: meal.protein,
        carbs: meal.carbs,
        fat: meal.fat
      }
    ],
    totals: {
      calories: meal.calories,
      protein: meal.protein,
      carbs: meal.carbs,
      fat: meal.fat
    },
    notes: "Added from Quick Meals"
  };
}

export function createDailyMealEntry(quickMeal: QuickMeal, dateKey: string): StoredMealLog {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    title: quickMeal.title,
    text: quickMeal.title,
    source: "quick_meal",
    sourceType: "daily",
    quickMealId: quickMeal.id,
    mealDate: dateKey,
    result: toCalorieResponseFromQuickMeal(quickMeal),
    createdAt: now
  };
}

export function applyDailyMealsForDate(meals: StoredMealLog[], quickMeals: QuickMeal[], dateKey: string) {
  const dailyQuickMeals = quickMeals.filter((meal) => meal.isDailyMeal);
  if (dailyQuickMeals.length === 0) return meals;

  const existingDailyIds = new Set(
    meals
      .filter((meal) => meal.mealDate === dateKey && meal.sourceType === "daily" && meal.quickMealId)
      .map((meal) => meal.quickMealId as string)
  );

  const additions = dailyQuickMeals
    .filter((meal) => !existingDailyIds.has(meal.id))
    .map((meal) => createDailyMealEntry(meal, dateKey));

  return additions.length ? [...additions, ...meals] : meals;
}
