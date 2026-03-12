export type MacroTotals = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

export type MacroKey = keyof MacroTotals;

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
  disabledMacros?: MacroKey[];
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

export type WorkoutDay =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

export type CardioExercise = {
  id: string;
  type: "cardio";
  name: string;
  durationMin: number;
  intensity?: "low" | "moderate" | "high";
  caloriesBurned: number;
  progressHistory: WorkoutProgressEntry[];
};

export type FitnessExercise = {
  id: string;
  type: "fitness";
  name: string;
  sets: number;
  reps: number;
  weightKg: number;
  trainingVolume: number;
  progressHistory: WorkoutProgressEntry[];
};

export type WorkoutProgressEntry = {
  recordedAt: string;
  durationMin?: number;
  intensity?: "low" | "moderate" | "high";
  caloriesBurned?: number;
  sets?: number;
  reps?: number;
  weightKg?: number;
  trainingVolume?: number;
};

export type WorkoutExercise = CardioExercise | FitnessExercise;

export type WorkoutDayLog = {
  notes: string;
  exercises: WorkoutExercise[];
};

export type WorkoutWeekPlan = Record<WorkoutDay, WorkoutDayLog>;
