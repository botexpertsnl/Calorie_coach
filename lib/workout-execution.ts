import { WorkoutDay, WorkoutException, WorkoutExercise, WorkoutWeekPlan } from "@/lib/types";

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

export function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function getAmsterdamDate(date = new Date()) {
  const text = date.toLocaleString("sv-SE", { timeZone: "Europe/Amsterdam" });
  return new Date(text.replace(" ", "T"));
}

export function getCurrentWeekDateKeys() {
  const now = getAmsterdamDate();
  const jsDay = now.getDay(); // Sun=0
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

export type WorkoutAdjustedSummary = {
  plannedSessions: number;
  adjustedSessions: number;
  totalExercises: number;
  totalCalories: number;
  totalFitnessVolume: number;
  cardioSessions: number;
  fitnessSessions: number;
  crossfitSessions: number;
};

export function buildWorkoutAdjustedSummary(plan: WorkoutWeekPlan | null, exceptions: WorkoutException[], dateKeys: string[]): WorkoutAdjustedSummary {
  if (!plan) {
    return {
      plannedSessions: 0,
      adjustedSessions: 0,
      totalExercises: 0,
      totalCalories: 0,
      totalFitnessVolume: 0,
      cardioSessions: 0,
      fitnessSessions: 0,
      crossfitSessions: 0
    };
  }

  let plannedSessions = 0;
  let adjustedSessions = 0;
  let totalExercises = 0;
  let totalCalories = 0;
  let totalFitnessVolume = 0;
  let cardioSessions = 0;
  let fitnessSessions = 0;
  let crossfitSessions = 0;

  for (const dateKey of dateKeys) {
    const day = weekdayFromDateKey(dateKey);
    const planned = plan[day]?.exercises.filter((e) => !e.isPaused) ?? [];
    if (planned.length) plannedSessions += 1;

    const todaysExceptions = exceptions.filter((item) => item.date === dateKey);

    const missedIds = new Set(
      todaysExceptions.filter((item) => item.exceptionType === "missed" && item.originalWorkoutId).map((item) => item.originalWorkoutId as string)
    );
    const replacedMap = new Map(
      todaysExceptions
        .filter((item) => item.exceptionType === "replaced" && item.originalWorkoutId && item.replacementWorkoutData)
        .map((item) => [item.originalWorkoutId as string, item.replacementWorkoutData as WorkoutExercise])
    );

    let executed: WorkoutExercise[] = planned
      .filter((exercise) => !missedIds.has(exercise.id))
      .map((exercise) => replacedMap.get(exercise.id) ?? exercise);

    const extras = todaysExceptions
      .filter((item) => item.exceptionType === "extra" && item.extraWorkoutData)
      .map((item) => item.extraWorkoutData as WorkoutExercise);
    executed = [...executed, ...extras];

    const movedIn = exceptions
      .filter((item) => item.exceptionType === "rescheduled" && item.newDate === dateKey && item.originalWorkoutId)
      .map((item) => {
        const originDay = weekdayFromDateKey(item.date);
        const found = plan[originDay]?.exercises.find((exercise) => exercise.id === item.originalWorkoutId);
        return found ?? null;
      })
      .filter(Boolean) as WorkoutExercise[];

    const movedOutIds = new Set(
      todaysExceptions.filter((item) => item.exceptionType === "rescheduled" && item.originalWorkoutId).map((item) => item.originalWorkoutId as string)
    );

    executed = executed.filter((exercise) => !movedOutIds.has(exercise.id)).concat(movedIn);

    if (executed.length) adjustedSessions += 1;

    for (const exercise of executed) {
      totalExercises += 1;
      totalCalories += exercise.estimatedCalories;
      totalFitnessVolume += exercise.trainingVolume;
      if (exercise.type === "cardio") cardioSessions += 1;
      if (exercise.type === "fitness") fitnessSessions += 1;
      if (exercise.type === "crossfit") crossfitSessions += 1;
    }
  }

  return {
    plannedSessions,
    adjustedSessions,
    totalExercises,
    totalCalories: Math.round(totalCalories),
    totalFitnessVolume: Math.round(totalFitnessVolume),
    cardioSessions,
    fitnessSessions,
    crossfitSessions
  };
}

export function sortDaysByOrder(days: WorkoutDay[]) {
  return [...days].sort((a, b) => dayIndex[a] - dayIndex[b]);
}
