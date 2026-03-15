import { calculateDailyTargets } from "@/lib/nutrition";
import { ALL_WEEKDAYS, applyDailyMealsForDate } from "@/lib/meals";
import { STORAGE_KEYS, readJson, writeJson } from "@/lib/local-data";
import { calculateWorkoutPoints } from "@/lib/workout-execution";
import { calculateTrainingVolume, estimateFitnessCalories } from "@/lib/workouts";
import { DailyTargets, MacroKey, ProfileInput, QuickMeal, StoredMealLog, WorkoutDay, WorkoutWeekPlan } from "@/lib/types";

const DEMO_SEED_VERSION = "v1";
const DEMO_SEED_KEY = "ai-calorie-coach-demo-seed-version";

function getAmsterdamNow() {
  const now = new Date();
  const amsterdamText = now.toLocaleString("sv-SE", { timeZone: "Europe/Amsterdam" }).replace(" ", "T");
  return new Date(amsterdamText);
}

function getDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function toIsoFromAmsterdamDateAndTime(dateKey: string, time: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Amsterdam",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });

  const parts = formatter.formatToParts(utcGuess);
  const getPart = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  const asUtc = Date.UTC(
    getPart("year"),
    getPart("month") - 1,
    getPart("day"),
    getPart("hour"),
    getPart("minute"),
    getPart("second")
  );
  const offsetMs = asUtc - utcGuess.getTime();
  return new Date(utcGuess.getTime() - offsetMs).toISOString();
}

function createDemoProfile(): ProfileInput {
  return {
    age: 34,
    gender: "male",
    heightCm: 178,
    weightKg: 77,
    waistCm: 92,
    trainingExperience: "advanced",
    averageDailySteps: "1-5000",
    workType: "sedentary",
    primaryGoal: "Fat Loss",
    goalIntensity: "slow",
    goalDescription: "I would like to lose belly fat and gain muscle at the same time.",
    goalText:
      "Main goal: Fat Loss. Goal intensity: slow. Goal details: I would like to lose belly fat and gain muscle at the same time."
  };
}

type DemoExerciseSpec = {
  name: string;
  muscleGroup: "chest" | "back" | "legs" | "shoulders" | "arms" | "core";
  sets: number;
  reps: number;
  weight: number;
};

function toFitnessExercise(spec: DemoExerciseSpec, day: WorkoutDay, profile: ProfileInput, index: number) {
  const trainingVolume = calculateTrainingVolume(spec.sets, spec.reps, spec.weight);
  const estimatedCalories = estimateFitnessCalories(profile.weightKg, spec.sets, spec.reps, spec.weight, "moderate");
  const now = new Date().toISOString();

  const base = {
    id: `demo-${day}-${index}`,
    type: "fitness" as const,
    workoutDayId: day,
    name: spec.name,
    sets: spec.sets,
    reps: spec.reps,
    weight: spec.weight,
    trainingVolume,
    estimatedCalories,
    strengthPoints: 0,
    cardioPoints: 0,
    notes: "Demo seeded workout",
    progressHistory: [],
    createdAt: now,
    updatedAt: now,
    intensity: "moderate" as const,
    isPaused: false,
    sourceType: "user" as const,
    muscleGroup: spec.muscleGroup
  };

  const points = calculateWorkoutPoints(base);
  return { ...base, ...points };
}

function createDemoWorkoutPlan(profile: ProfileInput): WorkoutWeekPlan {
  const monday: DemoExerciseSpec[] = [
    { name: "Bench Press", muscleGroup: "chest", sets: 4, reps: 6, weight: 21.25 },
    { name: "Incline Dumbbell Press", muscleGroup: "chest", sets: 3, reps: 8, weight: 20 },
    { name: "Setting Machine Fly", muscleGroup: "chest", sets: 4, reps: 8, weight: 54 },
    { name: "Single Arm Cable Fly", muscleGroup: "chest", sets: 3, reps: 6, weight: 12 },
    { name: "Overhead Press", muscleGroup: "shoulders", sets: 3, reps: 8, weight: 30 },
    { name: "Lateral Raises", muscleGroup: "shoulders", sets: 4, reps: 10, weight: 10 },
    { name: "Rope Overhead Extension", muscleGroup: "arms", sets: 4, reps: 8, weight: 24.5 },
    { name: "Triceps Pushdown", muscleGroup: "arms", sets: 3, reps: 8, weight: 28 }
  ];

  const tuesday: DemoExerciseSpec[] = [
    { name: "Pull-ups / Lat Pulldown", muscleGroup: "back", sets: 4, reps: 6, weight: 67 },
    { name: "Barbell Row", muscleGroup: "back", sets: 3, reps: 8, weight: 15 },
    { name: "Seated Cable Row (Narrow)", muscleGroup: "back", sets: 3, reps: 8, weight: 57 },
    { name: "Rear Delt Cable Fly", muscleGroup: "shoulders", sets: 4, reps: 8, weight: 7.5 },
    { name: "Barbell Curl Seated", muscleGroup: "arms", sets: 3, reps: 8, weight: 11.25 },
    { name: "Barbell Curl Small Standing", muscleGroup: "arms", sets: 3, reps: 8, weight: 20 },
    { name: "Hammer Curl", muscleGroup: "arms", sets: 3, reps: 6, weight: 10 },
    { name: "Core Roll on Floor / Hanging Leg Raises", muscleGroup: "core", sets: 5, reps: 10, weight: 0 }
  ];

  const thursday: DemoExerciseSpec[] = [
    { name: "Squat", muscleGroup: "legs", sets: 4, reps: 8, weight: 60 },
    { name: "Romanian Deadlift", muscleGroup: "legs", sets: 3, reps: 8, weight: 30 },
    { name: "Walking Lunges", muscleGroup: "legs", sets: 3, reps: 6, weight: 16 },
    { name: "Seated Leg Curl", muscleGroup: "legs", sets: 3, reps: 8, weight: 54 },
    { name: "Leg Extension", muscleGroup: "legs", sets: 3, reps: 8, weight: 26 },
    { name: "Sitting Calf Raises", muscleGroup: "legs", sets: 4, reps: 8, weight: 30 },
    { name: "Leg Press Calves", muscleGroup: "legs", sets: 3, reps: 8, weight: 65 },
    { name: "Hanging Leg Raises", muscleGroup: "core", sets: 3, reps: 8, weight: 0 }
  ];

  return {
    monday: { notes: "Push", exercises: monday.map((exercise, index) => toFitnessExercise(exercise, "monday", profile, index)) },
    tuesday: { notes: "Pull", exercises: tuesday.map((exercise, index) => toFitnessExercise(exercise, "tuesday", profile, index)) },
    wednesday: { notes: "Recovery", exercises: [] },
    thursday: { notes: "Legs", exercises: thursday.map((exercise, index) => toFitnessExercise(exercise, "thursday", profile, index)) },
    friday: { notes: "Recovery", exercises: [] },
    saturday: { notes: "Recovery", exercises: [] },
    sunday: { notes: "Recovery", exercises: [] }
  };
}

const dailyMealTemplates = [
  {
    id: "demo-quick-meal-1",
    title: "Meal 1 – Breakfast",
    text: "1 scoop whey isolate protein shake, 1/3 cup Brinta, 5 g creatine",
    calories: 220,
    protein: 29,
    carbs: 21,
    fat: 1.5,
    time: "07:30"
  },
  {
    id: "demo-quick-meal-2",
    title: "Meal 2 – Late Morning / Lunch",
    text: "3 fried eggs, 1 can tuna in water",
    calories: 360,
    protein: 53,
    carbs: 1,
    fat: 16,
    time: "11:15"
  },
  {
    id: "demo-quick-meal-3",
    title: "Meal 3 – Afternoon Snack",
    text: "1 banana, 2 rice cakes",
    calories: 175,
    protein: 3,
    carbs: 42,
    fat: 0.5,
    time: "14:00"
  },
  {
    id: "demo-quick-meal-4",
    title: "Meal 4 – Afternoon Snack",
    text: "2 rice cakes, chicken breast slices (about 50 g)",
    calories: 140,
    protein: 12,
    carbs: 15,
    fat: 1,
    time: "16:00"
  },
  {
    id: "demo-quick-meal-5",
    title: "Meal 5 – Dinner",
    text: "200 g chicken breast, 200 g cooked rice, broccoli, sauce",
    calories: 680,
    protein: 70,
    carbs: 63,
    fat: 8,
    time: "19:00"
  },
  {
    id: "demo-quick-meal-6",
    title: "Meal 6 – Post Workout / Evening",
    text: "1 scoop whey protein shake",
    calories: 110,
    protein: 25,
    carbs: 1,
    fat: 0.5,
    time: "21:15"
  },
  {
    id: "demo-quick-meal-7",
    title: "Meal 7 – Late Evening",
    text: "300 g low-fat quark, mixed nuts, cacao nibs, dark chocolate sprinkles, raspberries",
    calories: 455,
    protein: 35,
    carbs: 30,
    fat: 22,
    time: "22:30"
  }
] as const;

function createDemoQuickMeals(nowIso: string): QuickMeal[] {
  return dailyMealTemplates.map((meal) => ({
    id: meal.id,
    title: meal.title,
    calories: meal.calories,
    protein: meal.protein,
    carbs: meal.carbs,
    fat: meal.fat,
    isDailyMeal: true,
    dailyMealDays: [...ALL_WEEKDAYS],
    createdAt: nowIso,
    updatedAt: nowIso
  }));
}

function createDemoMealsHistory(): StoredMealLog[] {
  const amsterdamNow = getAmsterdamNow();
  const entries: StoredMealLog[] = [];

  for (let daysAgo = 6; daysAgo >= 0; daysAgo -= 1) {
    const date = new Date(amsterdamNow);
    date.setDate(amsterdamNow.getDate() - daysAgo);
    const dateKey = getDateKey(date);

    dailyMealTemplates.forEach((meal, index) => {
      entries.push({
        id: `demo-log-${dateKey}-${index + 1}`,
        title: meal.title,
        text: meal.text,
        source: "quick_meal",
        sourceType: "daily",
        quickMealId: meal.id,
        mealDate: dateKey,
        result: {
          items: [
            {
              food: meal.title,
              quantity: "Demo daily meal",
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
          notes: "Seeded demo daily meal"
        },
        createdAt: toIsoFromAmsterdamDateAndTime(dateKey, meal.time)
      });
    });
  }

  return entries;
}

export function ensureDemoSeedData() {
  if (typeof window === "undefined") return;

  const alreadySeeded = window.localStorage.getItem(DEMO_SEED_KEY);
  if (alreadySeeded === DEMO_SEED_VERSION) return;

  const profile = readJson<ProfileInput>(STORAGE_KEYS.profile);
  const workouts = readJson<WorkoutWeekPlan>(STORAGE_KEYS.workouts);
  const meals = readJson<StoredMealLog[]>(STORAGE_KEYS.meals);
  const quickMeals = readJson<QuickMeal[]>(STORAGE_KEYS.quickMeals);
  const targets = readJson<DailyTargets>(STORAGE_KEYS.targets);
  const disabledMacros = readJson<MacroKey[]>(STORAGE_KEYS.disabledMacros);
  const manualMode = readJson<boolean>(STORAGE_KEYS.macroManualMode);

  const demoProfile = profile ?? createDemoProfile();
  if (!profile) writeJson(STORAGE_KEYS.profile, demoProfile);

  if (!workouts) {
    writeJson(STORAGE_KEYS.workouts, createDemoWorkoutPlan(demoProfile));
    writeJson(STORAGE_KEYS.workoutExceptions, []);
  }

  if (!quickMeals) {
    const nowIso = new Date().toISOString();
    writeJson(STORAGE_KEYS.quickMeals, createDemoQuickMeals(nowIso));
  }

  if (!meals) {
    const seededHistory = createDemoMealsHistory();
    const todaysDateKey = getDateKey(getAmsterdamNow());
    const seededQuickMeals = createDemoQuickMeals(new Date().toISOString());
    const withTodayApplied = applyDailyMealsForDate(seededHistory, seededQuickMeals, todaysDateKey);
    writeJson(STORAGE_KEYS.meals, withTodayApplied);
  }

  if (!targets) {
    writeJson(STORAGE_KEYS.targets, calculateDailyTargets(demoProfile));
  }

  if (!disabledMacros) writeJson(STORAGE_KEYS.disabledMacros, [] as MacroKey[]);
  if (manualMode === null) writeJson(STORAGE_KEYS.macroManualMode, false);

  window.localStorage.setItem(DEMO_SEED_KEY, DEMO_SEED_VERSION);
}
