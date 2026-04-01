import { FULL_DAY_EXCEPTION_ID, WorkoutDay, WorkoutException, WorkoutExercise, WorkoutWeekPlan } from "@/lib/types";

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
};

export type EffectiveWorkoutInstance = {
  date: string;
  source: "planned" | "extra" | "replacement" | "rescheduled";
  exercise: WorkoutExercise;
};

export function withStoredWorkoutPoints<T extends WorkoutExercise>(exercise: T): T {
  return exercise;
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
  return (plan[day]?.exercises ?? []).filter((exercise) => !exercise.isPaused);
}

export function buildEffectiveWorkoutInstances(plan: WorkoutWeekPlan | null, exceptions: WorkoutException[], dateKeys: string[]) {
  if (!plan) return [] as EffectiveWorkoutInstance[];

  const instances: EffectiveWorkoutInstance[] = [];

  for (const dateKey of dateKeys) {
    const planned = getPlannedExercisesForDay(plan, dateKey);
    const todaysExceptions = exceptions.filter((item) => item.date === dateKey);

    const missedWholeDay = todaysExceptions.some(
      (item) => item.exceptionType === "missed" && item.originalWorkoutId === FULL_DAY_EXCEPTION_ID
    );

    const replacedWholeDay = todaysExceptions.find(
      (item) => item.exceptionType === "replaced" && item.originalWorkoutId === FULL_DAY_EXCEPTION_ID && item.replacementWorkoutData
    );

    const missedIds = new Set(
      todaysExceptions
        .filter((item) => item.exceptionType === "missed" && item.originalWorkoutId && item.originalWorkoutId !== FULL_DAY_EXCEPTION_ID)
        .map((item) => item.originalWorkoutId as string)
    );

    const replacedMap = new Map(
      todaysExceptions
        .filter(
          (item) =>
            item.exceptionType === "replaced" &&
            item.originalWorkoutId &&
            item.originalWorkoutId !== FULL_DAY_EXCEPTION_ID &&
            item.replacementWorkoutData
        )
        .map((item) => [item.originalWorkoutId as string, item.replacementWorkoutData as WorkoutExercise])
    );

    const rescheduledWholeDay = todaysExceptions.some(
      (item) => item.exceptionType === "rescheduled" && item.originalWorkoutId === FULL_DAY_EXCEPTION_ID
    );

    const movedOutIds = new Set(
      todaysExceptions
        .filter((item) => item.exceptionType === "rescheduled" && item.originalWorkoutId && item.originalWorkoutId !== FULL_DAY_EXCEPTION_ID)
        .map((item) => item.originalWorkoutId as string)
    );

    const plannedAfterAdjustments =
      missedWholeDay || rescheduledWholeDay
        ? []
        : planned
            .filter((exercise) => !missedIds.has(exercise.id) && !movedOutIds.has(exercise.id))
            .map((exercise) => {
              const replacement = replacedMap.get(exercise.id);
              return {
                date: dateKey,
                source: replacement ? "replacement" : "planned",
                exercise: replacement ?? exercise
              } as EffectiveWorkoutInstance;
            });

    if (replacedWholeDay?.replacementWorkoutData) {
      plannedAfterAdjustments.push({
        date: dateKey,
        source: "replacement",
        exercise: replacedWholeDay.replacementWorkoutData
      });
    }

    const extras = todaysExceptions
      .filter((item) => item.exceptionType === "extra" && item.extraWorkoutData)
      .map(
        (item) =>
          ({
            date: dateKey,
            source: "extra",
            exercise: item.extraWorkoutData as WorkoutExercise
          }) as EffectiveWorkoutInstance
      );

    const movedIn = exceptions
      .filter((item) => item.exceptionType === "rescheduled" && item.newDate === dateKey && item.originalWorkoutId)
      .flatMap((item) => {
        const sourceDayExercises = getPlannedExercisesForDay(plan, item.date);

        if (item.originalWorkoutId === FULL_DAY_EXCEPTION_ID) {
          return sourceDayExercises.map(
            (exercise) =>
              ({
                date: dateKey,
                source: "rescheduled",
                exercise
              }) as EffectiveWorkoutInstance
          );
        }

        const original = sourceDayExercises.find((exercise) => exercise.id === item.originalWorkoutId);
        if (!original) return [];

        return [
          {
            date: dateKey,
            source: "rescheduled",
            exercise: original
          } as EffectiveWorkoutInstance
        ];
      });

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
      crossfitSessions: 0
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

  for (const item of effective) {
    const exercise = item.exercise;
    totalCalories += exercise.estimatedCalories;
    totalFitnessVolume += exercise.trainingVolume;
    totalMinutes += estimateMinutes(exercise);

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
    crossfitSessions
  };
}

export function sortDaysByOrder(days: WorkoutDay[]) {
  return [...days].sort((a, b) => dayIndex[a] - dayIndex[b]);
}
