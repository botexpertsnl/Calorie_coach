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

  const caloriesDelta = Math.round(load.totalCalories * 0.6);
  const proteinDelta = Math.max(0, Math.round((load.totalExercises > 0 ? 5 : 0) + load.totalFitnessVolume / 600));
  const carbsDelta = Math.max(0, Math.round(load.totalMinutes * 0.2));
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
  const profile = input.profile ?? null;
  if (!profile) return null;
  if (!input.force && input.disabledMacros === undefined) return null;

  const workouts = input.workouts ?? null;
  const exceptions = input.exceptions ?? [];
  const disabledMacros = input.disabledMacros ?? [];

  const todayKey = getLocalDateKey();
  const nextTargets = {
    ...getDailyMacroTargets(todayKey, profile, workouts, exceptions),
    disabledMacros
  };
  notifyTargetsUpdated(nextTargets);
  return nextTargets;
}
