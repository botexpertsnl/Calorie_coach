import { DailyTargets, ProfileInput } from "@/lib/types";

export const STORAGE_KEYS = {
  meals: "ai-calorie-coach-meals",
  profile: "ai-calorie-coach-profile",
  targets: "ai-calorie-coach-targets",
  quickMeals: "ai-calorie-coach-quick-meals",
  disabledMacros: "ai-calorie-coach-disabled-macros",
  macroManualMode: "ai-calorie-coach-macro-manual-mode",
  weeklyMacroScheme: "ai-calorie-coach-weekly-macro-scheme",
  workouts: "ai-calorie-coach-workouts",
  workoutExceptions: "ai-calorie-coach-workout-exceptions"
} as const;

export function readJson<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(key);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as T;
  } catch {
    window.localStorage.removeItem(key);
    return null;
  }
}

export function writeJson<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

export type PersistedProfileState = {
  profile: ProfileInput;
  targets: DailyTargets | null;
};
