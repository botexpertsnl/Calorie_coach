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


export type MealWeekday = "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday";

export type MealSourceType = "manual" | "ai" | "quick" | "daily";

export type StoredMealLog = {
  id: string;
  title?: string;
  text: string;
  source: "text" | "image" | "quick_meal";
  sourceType: MealSourceType;
  quickMealId?: string;
  mealDate: string;
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
  isDailyMeal: boolean;
  dailyMealDays: MealWeekday[];
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

export type WorkoutExerciseType = "cardio" | "fitness" | "crossfit";

export type WorkoutIntensity = "low" | "moderate" | "high";

export type CardioExercise = {
  id: string;
  type: "cardio";
  workoutDayId: WorkoutDay;
  name: string;
  durationMinutes: number;
  intensity?: WorkoutIntensity;
  trainingVolume: number;
  estimatedCalories: number;
  strengthPoints: number;
  cardioPoints: number;
  notes: string;
  progressHistory: WorkoutProgressEntry[];
  createdAt: string;
  updatedAt: string;
  isPaused: boolean;
};

export type FitnessExercise = {
  id: string;
  type: "fitness";
  workoutDayId: WorkoutDay;
  name: string;
  sets: number;
  reps: number;
  weight: number;
  trainingVolume: number;
  estimatedCalories: number;
  strengthPoints: number;
  cardioPoints: number;
  notes: string;
  progressHistory: WorkoutProgressEntry[];
  createdAt: string;
  updatedAt: string;
  intensity?: WorkoutIntensity;
  isPaused: boolean;
};

export type CrossfitExercise = {
  id: string;
  type: "crossfit";
  workoutDayId: WorkoutDay;
  name: string;
  durationMinutes: number;
  weight?: number;
  sets?: number;
  reps?: number;
  trainingVolume: number;
  estimatedCalories: number;
  strengthPoints: number;
  cardioPoints: number;
  notes: string;
  intensity?: WorkoutIntensity;
  progressHistory: WorkoutProgressEntry[];
  createdAt: string;
  updatedAt: string;
  isPaused: boolean;
};

export type WorkoutProgressEntry = {
  recordedAt: string;
  durationMinutes?: number;
  intensity?: WorkoutIntensity;
  estimatedCalories?: number;
  sets?: number;
  reps?: number;
  weight?: number;
  trainingVolume?: number;
  notes?: string;
};

export type WorkoutExercise = CardioExercise | FitnessExercise | CrossfitExercise;

export type WorkoutDayLog = {
  notes: string;
  exercises: WorkoutExercise[];
};

export type WorkoutWeekPlan = Record<WorkoutDay, WorkoutDayLog>;


export type WorkoutExceptionType = "missed" | "extra" | "replaced" | "rescheduled";

export type WorkoutException = {
  id: string;
  date: string;
  exceptionType: WorkoutExceptionType;
  originalWorkoutId?: string;
  replacementWorkoutData?: WorkoutExercise;
  extraWorkoutData?: WorkoutExercise;
  newDate?: string;
  createdAt: string;
  updatedAt: string;
};
