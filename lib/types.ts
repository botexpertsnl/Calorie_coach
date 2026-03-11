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
  goalType: GoalType;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  explanation: string;
};
