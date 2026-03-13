import { inferGoalCategoryFromText } from "@/lib/nutrition";
import { ProfileInput, WorkoutDay, WorkoutException, WorkoutExercise, WorkoutWeekPlan } from "@/lib/types";

const dayOrder: WorkoutDay[] = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

const dayIndex: Record<WorkoutDay, number> = {
  monday: 0,
  tuesday: 1,
  wednesday: 2,
  thursday: 3,
  friday: 4,
  saturday: 5,
  sunday: 6
};

export type WorkoutPointTotals = {
  strengthPoints: number;
  cardioPoints: number;
};

export type WorkoutAdjustedSummary = {
  plannedSessions: number;
  adjustedSessions: number;
  completedSessions: number;
  missedSessions: number;
  extraSessions: number;
  replacedSessions: number;
  rescheduledSessions: number;
  totalExercises: number;
  totalCalories: number;
  totalFitnessVolume: number;
  totalMinutes: number;
  cardioSessions: number;
  fitnessSessions: number;
  crossfitSessions: number;
  strengthPoints: number;
  cardioPoints: number;
};

export type EffectiveWorkoutInstance = {
  date: string;
  source: "planned" | "extra" | "replacement" | "rescheduled";
  exercise: WorkoutExercise;
};

export type WorkoutWeeklyTargets = {
  strengthPoints: number;
  cardioPoints: number;
};

function clampPoints(value: number) {
  return Math.max(1, Math.min(20, Math.round(value)));
}

function intensityMultiplier(exercise: WorkoutExercise) {
  if (exercise.intensity === "low") return 0.85;
  if (exercise.intensity === "high") return 1.2;
  return 1;
}

export function calculateWorkoutPoints(exercise: WorkoutExercise): WorkoutPointTotals {
  const intensity = intensityMultiplier(exercise);

  if (exercise.type === "fitness") {
    const base = exercise.trainingVolume / 240 + exercise.weight / 20 + (exercise.sets * exercise.reps) / 30;
    return {
      strengthPoints: clampPoints(base * intensity),
      cardioPoints: 1
    };
  }

  if (exercise.type === "cardio") {
    const base = exercise.durationMinutes / 5 + exercise.estimatedCalories / 130;
    return {
      strengthPoints: 1,
      cardioPoints: clampPoints(base * intensity)
    };
  }

  const volume = exercise.trainingVolume / 260;
  const duration = exercise.durationMinutes / 6;
  const calories = exercise.estimatedCalories / 160;

  return {
    strengthPoints: clampPoints((volume + (exercise.weight ?? 0) / 24 + (exercise.sets ?? 0) / 2.5) * intensity),
    cardioPoints: clampPoints((duration + calories + (exercise.reps ?? 0) / 35) * intensity)
  };
}

export function withStoredWorkoutPoints<T extends WorkoutExercise>(exercise: T): T {
  const fallback = calculateWorkoutPoints(exercise);
  return {
    ...exercise,
    strengthPoints: Number.isFinite(exercise.strengthPoints) ? exercise.strengthPoints : fallback.strengthPoints,
    cardioPoints: Number.isFinite(exercise.cardioPoints) ? exercise.cardioPoints : fallback.cardioPoints
  };
}

export function getExercisePointSplit(exercise: WorkoutExercise): WorkoutPointTotals {
  if (Number.isFinite(exercise.strengthPoints) && Number.isFinite(exercise.cardioPoints)) {
    return {
      strengthPoints: exercise.strengthPoints,
      cardioPoints: exercise.cardioPoints
    };
  }

  return calculateWorkoutPoints(exercise);
}

export function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function getAmsterdamDate(date = new Date()) {
  const text = date.toLocaleString("sv-SE", { timeZone: "Europe/Amsterdam" });
  return new Date(text.replace(" ", "T"));
}

export function getCurrentWeekDateKeys() {
  const now = getAmsterdamDate();
  const jsDay = now.getDay();
  const mondayOffset = jsDay === 0 ? -6 : 1 - jsDay;
  const monday = new Date(now);
  monday.setDate(now.getDate() + mondayOffset);
  monday.setHours(0, 0, 0, 0);

  return dayOrder.map((_, idx) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + idx);
    return toDateKey(d);
  });
}

export function getDateKeysInRange(start: Date, end: Date) {
  const dateKeys: string[] = [];
  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);

  const rangeEnd = new Date(end);
  rangeEnd.setHours(0, 0, 0, 0);

  while (cursor <= rangeEnd) {
    dateKeys.push(toDateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return dateKeys;
}

function weekdayFromDateKey(dateKey: string): WorkoutDay {
  const d = new Date(`${dateKey}T00:00:00`);
  const isoDay = d.getDay();
  const map: Record<number, WorkoutDay> = {
    0: "sunday",
    1: "monday",
    2: "tuesday",
    3: "wednesday",
    4: "thursday",
    5: "friday",
    6: "saturday"
  };
  return map[isoDay];
}

function estimateMinutes(exercise: WorkoutExercise) {
  if (exercise.type === "cardio") return exercise.durationMinutes;
  if (exercise.type === "crossfit") return Math.max(exercise.durationMinutes, (exercise.sets ?? 0) * 3);

  const setTime = exercise.sets * 3;
  return Math.max(20, setTime);
}

function getPlannedExercisesForDay(plan: WorkoutWeekPlan, dateKey: string) {
  const day = weekdayFromDateKey(dateKey);
  return (plan[day]?.exercises ?? []).filter((exercise) => !exercise.isPaused).map(withStoredWorkoutPoints);
}

export function buildEffectiveWorkoutInstances(plan: WorkoutWeekPlan | null, exceptions: WorkoutException[], dateKeys: string[]) {
  if (!plan) return [] as EffectiveWorkoutInstance[];

  const instances: EffectiveWorkoutInstance[] = [];

  for (const dateKey of dateKeys) {
    const planned = getPlannedExercisesForDay(plan, dateKey);
    const todaysExceptions = exceptions.filter((item) => item.date === dateKey);

    const missedIds = new Set(
      todaysExceptions.filter((item) => item.exceptionType === "missed" && item.originalWorkoutId).map((item) => item.originalWorkoutId as string)
    );

    const replacedMap = new Map(
      todaysExceptions
        .filter((item) => item.exceptionType === "replaced" && item.originalWorkoutId && item.replacementWorkoutData)
        .map((item) => [item.originalWorkoutId as string, withStoredWorkoutPoints(item.replacementWorkoutData as WorkoutExercise)])
    );

    const movedOutIds = new Set(
      todaysExceptions.filter((item) => item.exceptionType === "rescheduled" && item.originalWorkoutId).map((item) => item.originalWorkoutId as string)
    );

    const plannedAfterAdjustments = planned
      .filter((exercise) => !missedIds.has(exercise.id) && !movedOutIds.has(exercise.id))
      .map((exercise) => {
        const replacement = replacedMap.get(exercise.id);
        return {
          date: dateKey,
          source: replacement ? "replacement" : "planned",
          exercise: replacement ?? exercise
        } as EffectiveWorkoutInstance;
      });

    const extras = todaysExceptions
      .filter((item) => item.exceptionType === "extra" && item.extraWorkoutData)
      .map(
        (item) =>
          ({
            date: dateKey,
            source: "extra",
            exercise: withStoredWorkoutPoints(item.extraWorkoutData as WorkoutExercise)
          }) as EffectiveWorkoutInstance
      );

    const movedIn = exceptions
      .filter((item) => item.exceptionType === "rescheduled" && item.newDate === dateKey && item.originalWorkoutId)
      .map((item) => {
        const sourceDayExercises = getPlannedExercisesForDay(plan, item.date);
        const original = sourceDayExercises.find((exercise) => exercise.id === item.originalWorkoutId);
        if (!original) return null;
        return {
          date: dateKey,
          source: "rescheduled",
          exercise: original
        } as EffectiveWorkoutInstance;
      })
      .filter(Boolean) as EffectiveWorkoutInstance[];

    instances.push(...plannedAfterAdjustments, ...extras, ...movedIn);
  }

  return instances;
}

export function buildWorkoutAdjustedSummary(plan: WorkoutWeekPlan | null, exceptions: WorkoutException[], dateKeys: string[]): WorkoutAdjustedSummary {
  if (!plan) {
    return {
      plannedSessions: 0,
      adjustedSessions: 0,
      completedSessions: 0,
      missedSessions: 0,
      extraSessions: 0,
      replacedSessions: 0,
      rescheduledSessions: 0,
      totalExercises: 0,
      totalCalories: 0,
      totalFitnessVolume: 0,
      totalMinutes: 0,
      cardioSessions: 0,
      fitnessSessions: 0,
      crossfitSessions: 0,
      strengthPoints: 0,
      cardioPoints: 0
    };
  }

  const effective = buildEffectiveWorkoutInstances(plan, exceptions, dateKeys);
  const plannedSessions = dateKeys.filter((dateKey) => getPlannedExercisesForDay(plan, dateKey).length > 0).length;
  const completedSessions = new Set(effective.map((item) => item.date)).size;

  const missedSessions = exceptions.filter((item) => item.exceptionType === "missed" && dateKeys.includes(item.date)).length;
  const extraSessions = exceptions.filter((item) => item.exceptionType === "extra" && dateKeys.includes(item.date)).length;
  const replacedSessions = exceptions.filter((item) => item.exceptionType === "replaced" && dateKeys.includes(item.date)).length;
  const rescheduledSessions = exceptions.filter((item) => item.exceptionType === "rescheduled" && (dateKeys.includes(item.date) || (item.newDate ? dateKeys.includes(item.newDate) : false))).length;

  let totalCalories = 0;
  let totalFitnessVolume = 0;
  let totalMinutes = 0;
  let cardioSessions = 0;
  let fitnessSessions = 0;
  let crossfitSessions = 0;
  let strengthPoints = 0;
  let cardioPoints = 0;

  for (const item of effective) {
    const exercise = item.exercise;
    const points = getExercisePointSplit(exercise);
    totalCalories += exercise.estimatedCalories;
    totalFitnessVolume += exercise.trainingVolume;
    totalMinutes += estimateMinutes(exercise);
    strengthPoints += points.strengthPoints;
    cardioPoints += points.cardioPoints;

    if (exercise.type === "cardio") cardioSessions += 1;
    if (exercise.type === "fitness") fitnessSessions += 1;
    if (exercise.type === "crossfit") crossfitSessions += 1;
  }

  return {
    plannedSessions,
    adjustedSessions: completedSessions,
    completedSessions,
    missedSessions,
    extraSessions,
    replacedSessions,
    rescheduledSessions,
    totalExercises: effective.length,
    totalCalories: Math.round(totalCalories),
    totalFitnessVolume: Math.round(totalFitnessVolume),
    totalMinutes: Math.round(totalMinutes),
    cardioSessions,
    fitnessSessions,
    crossfitSessions,
    strengthPoints: Math.round(strengthPoints),
    cardioPoints: Math.round(cardioPoints)
  };
}

export function deriveWeeklyWorkoutTargets(profile: ProfileInput | null): WorkoutWeeklyTargets {
  if (!profile) {
    return {
      strengthPoints: 60,
      cardioPoints: 50
    };
  }

  const goal = inferGoalCategoryFromText(profile.goalText);
  const experienceFactor = profile.trainingExperience === "advanced" ? 1.2 : profile.trainingExperience === "intermediate" ? 1 : 0.82;
  const stepsCardioBump = profile.averageDailySteps === "10000+" ? 8 : profile.averageDailySteps === "5000-10000" ? 4 : 0;

  if (goal === "fat_loss") {
    return {
      strengthPoints: Math.round(36 * experienceFactor),
      cardioPoints: Math.round((62 + stepsCardioBump) * experienceFactor)
    };
  }

  if (goal === "muscle_gain") {
    return {
      strengthPoints: Math.round(74 * experienceFactor),
      cardioPoints: Math.round((18 + Math.round(stepsCardioBump / 2)) * experienceFactor)
    };
  }

  if (goal === "recomposition") {
    return {
      strengthPoints: Math.round(58 * experienceFactor),
      cardioPoints: Math.round((44 + stepsCardioBump) * experienceFactor)
    };
  }

  return {
    strengthPoints: Math.round(42 * experienceFactor),
    cardioPoints: Math.round((52 + stepsCardioBump) * experienceFactor)
  };
}

export function sortDaysByOrder(days: WorkoutDay[]) {
  return [...days].sort((a, b) => dayIndex[a] - dayIndex[b]);
}
