import { STORAGE_KEYS, readJson, writeJson } from "@/lib/local-data";
import { getLocalDateKey } from "@/lib/meals";
import { calculateDailyTargets } from "@/lib/nutrition";
import { buildWorkoutAdjustedSummary } from "@/lib/workout-execution";
import { DailyTargets, MacroKey, ProfileInput, WorkoutException, WorkoutWeekPlan } from "@/lib/types";

export const TARGETS_UPDATED_EVENT = "ai-calorie-coach:targets-updated";

export function getBaseMacroTargets(profile: ProfileInput) {
  return calculateDailyTargets(profile);
}

export function getWorkoutLoadForDate(
  dateKey: string,
  plan: WorkoutWeekPlan | null,
  exceptions: WorkoutException[]
) {
  return buildWorkoutAdjustedSummary(plan, exceptions, [dateKey]);
}

export function getDailyMacroTargets(
  dateKey: string,
  profile: ProfileInput,
  plan: WorkoutWeekPlan | null,
  exceptions: WorkoutException[]
): DailyTargets {
  const base = getBaseMacroTargets(profile);
  const load = getWorkoutLoadForDate(dateKey, plan, exceptions);

  const caloriesDelta = Math.round(load.totalCalories * 0.6 + load.strengthPoints * 3 + load.cardioPoints * 4);
  const proteinDelta = Math.max(0, Math.round(load.strengthPoints * 0.25 + (load.totalExercises > 0 ? 5 : 0)));
  const carbsDelta = Math.max(0, Math.round(load.cardioPoints * 0.6 + load.totalMinutes * 0.2));
  const fatDelta = Math.max(0, Math.round(caloriesDelta * 0.15 / 9));

  return {
    ...base,
    calories: base.calories + caloriesDelta,
    protein: base.protein + proteinDelta,
    carbs: base.carbs + carbsDelta,
    fat: base.fat + fatDelta,
    explanation: `${base.explanation} Updated for today's scheduled training load.`
  };
}

export function notifyTargetsUpdated(targets: DailyTargets) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<DailyTargets>(TARGETS_UPDATED_EVENT, { detail: targets }));
}

type RecalculateTodayInput = {
  profile?: ProfileInput | null;
  workouts?: WorkoutWeekPlan | null;
  exceptions?: WorkoutException[];
  disabledMacros?: MacroKey[];
  force?: boolean;
};

export function recalculateAndPersistTodayTargets(input: RecalculateTodayInput = {}) {
  if (typeof window === "undefined") return null;

  const manualMode = readJson<boolean>(STORAGE_KEYS.macroManualMode) ?? false;
  if (manualMode && !input.force) return null;

  const profile = input.profile ?? readJson<ProfileInput>(STORAGE_KEYS.profile);
  if (!profile) return null;

  const workouts = input.workouts ?? readJson<WorkoutWeekPlan>(STORAGE_KEYS.workouts);
  const exceptions = input.exceptions ?? readJson<WorkoutException[]>(STORAGE_KEYS.workoutExceptions) ?? [];
  const disabledMacros = input.disabledMacros ?? readJson<MacroKey[]>(STORAGE_KEYS.disabledMacros) ?? [];

  const todayKey = getLocalDateKey();
  const nextTargets = {
    ...getDailyMacroTargets(todayKey, profile, workouts, exceptions),
    disabledMacros
  };

  writeJson(STORAGE_KEYS.targets, nextTargets);
  notifyTargetsUpdated(nextTargets);
  return nextTargets;
}
