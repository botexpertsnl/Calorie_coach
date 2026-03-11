export type MacroTotals = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

export type MealItem = {
  food: string;
  quantity: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

export type CalorieResponse = {
  items: MealItem[];
  totals: MacroTotals;
  notes?: string;
};

export type ActivityLevel =
  | "sedentary"
  | "light"
  | "moderate"
  | "very_active"
  | "athlete";

export type Gender = "female" | "male" | "other";

export type ProfileInput = {
  age: number;
  gender: Gender;
  heightCm: number;
  weightKg: number;
  waistCm: number;
  activityLevel: ActivityLevel;
  goalText: string;
};

export type GoalType =
  | "fat_loss"
  | "muscle_gain"
  | "maintenance"
  | "recomposition";

export type DailyTargets = {
  goalCategory: GoalType;
  // Backward-compatible alias for older UI code.
  goalType?: GoalType;
  bmr: number;
  activityFactor: number;
  tdee: number;
  calorieStrategy: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  explanation: string;
  macroReasoning: string;
};


export type StoredMealLog = {
  id: string;
  text: string;
  source: "text" | "image" | "quick_meal";
  result: CalorieResponse;
  createdAt: string;
};


export type QuickMeal = {
  id: string;
  title: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  createdAt: string;
  updatedAt: string;
};
