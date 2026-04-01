import { CalorieResponse, MealWeekday, QuickMeal, StoredMealLog } from "@/lib/types";

export const ALL_WEEKDAYS: MealWeekday[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday"
];

const weekdayMap: Record<number, MealWeekday> = {
  0: "sunday",
  1: "monday",
  2: "tuesday",
  3: "wednesday",
  4: "thursday",
  5: "friday",
  6: "saturday"
};

export function getLocalDateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function getWeekdayFromDateKey(dateKey: string): MealWeekday {
  const day = new Date(`${dateKey}T00:00:00`).getDay();
  return weekdayMap[day] ?? "monday";
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

function isMealEnabledOnWeekday(meal: QuickMeal, weekday: MealWeekday) {
  const mealDays = meal.dailyMealDays?.length ? meal.dailyMealDays : ALL_WEEKDAYS;
  return mealDays.includes(weekday);
}

export function applyDailyMealsForDate(meals: StoredMealLog[], quickMeals: QuickMeal[], dateKey: string) {
  const weekday = getWeekdayFromDateKey(dateKey);
  const dailyQuickMeals = quickMeals.filter((meal) => meal.isDailyMeal && isMealEnabledOnWeekday(meal, weekday));
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
