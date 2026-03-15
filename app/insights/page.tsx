"use client";

import { useEffect, useMemo, useState } from "react";
import { AppHeaderNav } from "@/components/AppHeaderNav";
import { InsightsLineChart } from "@/components/InsightsLineChart";
import { STORAGE_KEYS, readJson } from "@/lib/local-data";
import { TARGETS_UPDATED_EVENT } from "@/lib/daily-targets";
import { ensureDemoSeedData } from "@/lib/demo-seed";
import { buildEffectiveWorkoutInstances, buildWorkoutAdjustedSummary, getCurrentWeekDateKeys, getDateKeysInRange } from "@/lib/workout-execution";
import { DailyTargets, MacroKey, MacroTotals, ProfileInput, StoredMealLog, WorkoutException, WorkoutWeekPlan } from "@/lib/types";

type RangePreset = "7d" | "1m" | "3m" | "6m" | "custom";

function startDateFromPreset(preset: Exclude<RangePreset, "custom">) {
  const now = new Date();
  const start = new Date(now);
  if (preset === "7d") start.setDate(now.getDate() - 6);
  if (preset === "1m") start.setMonth(now.getMonth() - 1);
  if (preset === "3m") start.setMonth(now.getMonth() - 3);
  if (preset === "6m") start.setMonth(now.getMonth() - 6);
  start.setHours(0, 0, 0, 0);
  return start;
}

export default function InsightsPage() {
  const [rangePreset, setRangePreset] = useState<RangePreset>("7d");
  const [metric, setMetric] = useState<keyof MacroTotals>("calories");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [disabledMacros, setDisabledMacros] = useState<MacroKey[]>([]);

  const [meals, setMeals] = useState<StoredMealLog[]>([]);
  const [workouts, setWorkouts] = useState<WorkoutWeekPlan | null>(null);
  const [workoutExceptions, setWorkoutExceptions] = useState<WorkoutException[]>([]);
  const [nutritionTargets, setNutritionTargets] = useState<DailyTargets | null>(null);
  const [profile, setProfile] = useState<ProfileInput | null>(null);
  const weekDateKeys = useMemo(() => getCurrentWeekDateKeys(), []);

  useEffect(() => {
    const sync = () => {
      ensureDemoSeedData();
      setMeals(readJson<StoredMealLog[]>(STORAGE_KEYS.meals) ?? []);
      setWorkouts(readJson<WorkoutWeekPlan>(STORAGE_KEYS.workouts));
      setWorkoutExceptions(readJson<WorkoutException[]>(STORAGE_KEYS.workoutExceptions) ?? []);
      setNutritionTargets(readJson<DailyTargets>(STORAGE_KEYS.targets));
      const savedProfile = readJson<ProfileInput>(STORAGE_KEYS.profile);
      setProfile(savedProfile);
      setDisabledMacros(readJson<MacroKey[]>(STORAGE_KEYS.disabledMacros) ?? []);
    };

    const onStorage = (event: StorageEvent) => {
      if (!event.key) {
        sync();
        return;
      }

      const watchKeys = new Set<string>([
        STORAGE_KEYS.meals,
        STORAGE_KEYS.workouts,
        STORAGE_KEYS.workoutExceptions,
        STORAGE_KEYS.targets,
        STORAGE_KEYS.profile,
        STORAGE_KEYS.disabledMacros
      ]);

      if (watchKeys.has(event.key)) sync();
    };

    const onTargetsUpdated = (event: Event) => {
      const custom = event as CustomEvent<DailyTargets>;
      if (custom.detail) setNutritionTargets(custom.detail);
    };

    sync();
    window.addEventListener("storage", onStorage);
    window.addEventListener(TARGETS_UPDATED_EVENT, onTargetsUpdated as EventListener);

    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(TARGETS_UPDATED_EVENT, onTargetsUpdated as EventListener);
    };
  }, []);

  const availableMetrics = useMemo(
    () => (["calories", "protein", "carbs", "fat"] as const).filter((item) => !disabledMacros.includes(item)),
    [disabledMacros]
  );

  useEffect(() => {
    if (!availableMetrics.length) return;
    if (!availableMetrics.includes(metric)) setMetric(availableMetrics[0]);
  }, [availableMetrics, metric]);

  const filteredMeals = useMemo(() => {
    const now = new Date();
    const end = rangePreset === "custom" && customEnd ? new Date(customEnd) : now;
    end.setHours(23, 59, 59, 999);

    const start =
      rangePreset === "custom"
        ? customStart
          ? new Date(customStart)
          : new Date(0)
        : startDateFromPreset(rangePreset);

    return meals.filter((meal) => {
      const createdAt = new Date(meal.createdAt || new Date().toISOString());
      return createdAt >= start && createdAt <= end;
    });
  }, [customEnd, customStart, meals, rangePreset]);

  const workoutDateKeys = useMemo(() => {
    if (rangePreset === "custom") {
      const start = customStart ? new Date(customStart) : new Date(0);
      const end = customEnd ? new Date(customEnd) : new Date();
      return getDateKeysInRange(start, end);
    }

    if (rangePreset === "7d") return weekDateKeys;

    const end = new Date();
    const start = startDateFromPreset(rangePreset);
    return getDateKeysInRange(start, end);
  }, [customEnd, customStart, rangePreset, weekDateKeys]);

  const workoutSummary = useMemo(
    () => buildWorkoutAdjustedSummary(workouts, workoutExceptions, workoutDateKeys),
    [workouts, workoutExceptions, workoutDateKeys]
  );

  const muscleGroupBalance = useMemo(() => {
    const counts = { chest: 0, back: 0, legs: 0, shoulders: 0, arms: 0, core: 0 };
    const effective = buildEffectiveWorkoutInstances(workouts, workoutExceptions, workoutDateKeys);

    effective.forEach((instance) => {
      counts[instance.exercise.muscleGroup] += 1;
    });

    return counts;
  }, [workouts, workoutExceptions, workoutDateKeys]);

  const points = useMemo(() => {
    const bucket = new Map<string, MacroTotals>();

    filteredMeals.forEach((meal) => {
      const day = new Date(meal.createdAt || new Date().toISOString()).toISOString().slice(0, 10);
      const existing = bucket.get(day) ?? { calories: 0, protein: 0, carbs: 0, fat: 0 };
      bucket.set(day, {
        calories: existing.calories + meal.result.totals.calories,
        protein: existing.protein + meal.result.totals.protein,
        carbs: existing.carbs + meal.result.totals.carbs,
        fat: existing.fat + meal.result.totals.fat
      });
    });

    return Array.from(bucket.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, totals]) => ({ date, totals }));
  }, [filteredMeals]);

  const summary = useMemo(() => {
    const totals = filteredMeals.reduce(
      (sum, meal) => ({
        calories: sum.calories + meal.result.totals.calories,
        protein: sum.protein + meal.result.totals.protein,
        carbs: sum.carbs + meal.result.totals.carbs,
        fat: sum.fat + meal.result.totals.fat
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0 }
    );

    const days = Math.max(points.length, 1);
    return {
      totals,
      averages: {
        calories: Math.round(totals.calories / days),
        protein: Math.round(totals.protein / days),
        carbs: Math.round(totals.carbs / days),
        fat: Math.round(totals.fat / days)
      }
    };
  }, [filteredMeals, points.length]);

  const adherence = useMemo(() => {
    const consistency = workoutSummary.plannedSessions
      ? Math.min(100, Math.round((workoutSummary.completedSessions / workoutSummary.plannedSessions) * 100))
      : 0;

    const proteinTarget = nutritionTargets?.protein ?? null;
    const calorieTarget = nutritionTargets?.calories ?? null;

    const proteinHitRate =
      proteinTarget && proteinTarget > 0
        ? Math.min(100, Math.round((summary.averages.protein / proteinTarget) * 100))
        : null;

    const calorieHitRate =
      calorieTarget && calorieTarget > 0
        ? Math.max(0, 100 - Math.abs(Math.round(((summary.averages.calories - calorieTarget) / calorieTarget) * 100)))
        : null;

    const combinedScore = Math.round((consistency + (proteinHitRate ?? consistency) + (calorieHitRate ?? consistency)) / 3);

    let narrative = "Your training consistency and nutrition adherence look balanced.";

    if (consistency < 70) narrative = "Workout consistency is trending low this period. Aim to complete more planned sessions.";
    else if ((proteinHitRate ?? 100) < 80) narrative = "Protein intake is below target on average; consider adding a protein-rich meal.";
    else if ((calorieHitRate ?? 100) < 75) narrative = "Average calories are drifting away from your target range.";

    return { consistency, proteinHitRate, calorieHitRate, combinedScore, narrative };
  }, [nutritionTargets, summary.averages.calories, summary.averages.protein, workoutSummary]);

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8 md:px-8">
      <AppHeaderNav />

      <section className="grid gap-4 md:grid-cols-4 xl:grid-cols-8">
        <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200"><p className="text-xs text-slate-500">Planned Sessions</p><p className="mt-1 text-2xl font-semibold text-slate-900">{workoutSummary.plannedSessions}</p></div>
        <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200"><p className="text-xs text-slate-500">Completed Sessions</p><p className="mt-1 text-2xl font-semibold text-slate-900">{workoutSummary.completedSessions}</p></div>
        <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200"><p className="text-xs text-slate-500">Missed Sessions</p><p className="mt-1 text-2xl font-semibold text-slate-900">{workoutSummary.missedSessions}</p></div>
        <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200"><p className="text-xs text-slate-500">Extra Sessions</p><p className="mt-1 text-2xl font-semibold text-slate-900">{workoutSummary.extraSessions}</p></div>
        <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200"><p className="text-xs text-slate-500">Total Exercises</p><p className="mt-1 text-2xl font-semibold text-slate-900">{workoutSummary.totalExercises}</p></div>
        <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200"><p className="text-xs text-slate-500">Workout Minutes</p><p className="mt-1 text-2xl font-semibold text-slate-900">{workoutSummary.totalMinutes}</p></div>
        <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200"><p className="text-xs text-slate-500">Workout Calories</p><p className="mt-1 text-2xl font-semibold text-slate-900">{workoutSummary.totalCalories}</p></div>
        <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200"><p className="text-xs text-slate-500">Fitness Volume</p><p className="mt-1 text-2xl font-semibold text-slate-900">{workoutSummary.totalFitnessVolume}</p></div>
              </section>

      <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <h1 className="text-3xl font-semibold text-slate-900">Insights</h1>

          <div className="flex flex-wrap gap-2">
            {([
              ["7d", "7 days"],
              ["1m", "1 month"],
              ["3m", "3 months"],
              ["6m", "6 months"],
              ["custom", "Custom"]
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setRangePreset(value)}
                className={`rounded-xl border px-3 py-2 text-sm ${rangePreset === value ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-slate-200 text-slate-700 hover:bg-slate-50"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {rangePreset === "custom" ? (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <label className="text-sm text-slate-700">Start date
              <input type="date" value={customStart} onChange={(e)=>setCustomStart(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" />
            </label>
            <label className="text-sm text-slate-700">End date
              <input type="date" value={customEnd} onChange={(e)=>setCustomEnd(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" />
            </label>
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-2">
          {availableMetrics.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setMetric(key)}
              className={`rounded-xl border px-3 py-2 text-sm capitalize ${metric === key ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 text-slate-700 hover:bg-slate-50"}`}
            >
              {key}
            </button>
          ))}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200"><p className="text-xs text-slate-500">Workout Consistency</p><p className="text-2xl font-semibold text-slate-900">{adherence.consistency}%</p></div>
        <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200"><p className="text-xs text-slate-500">Protein Target Hit</p><p className="text-2xl font-semibold text-slate-900">{adherence.proteinHitRate ?? "n/a"}{adherence.proteinHitRate !== null ? "%" : ""}</p></div>
        <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200"><p className="text-xs text-slate-500">Combined Weekly Goal Score</p><p className="text-2xl font-semibold text-slate-900">{adherence.combinedScore}%</p></div>
      </section>

      <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <h3 className="text-lg font-semibold text-slate-900">Goal Context</h3>
        <p className="mt-2 text-sm text-slate-600">
          Main goal: <span className="font-semibold text-slate-900">{profile?.primaryGoal ?? "Not set"}</span>
          {" · "}
          Intensity: <span className="font-semibold text-slate-900">{profile?.goalIntensity ?? "medium"}</span>
        </p>
      </section>

      <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <h3 className="text-lg font-semibold text-slate-900">Smart Summary</h3>
        <p className="mt-2 text-sm text-slate-600">{adherence.narrative}</p>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <p className="text-sm text-slate-600">Protein target hit rate: <span className="font-semibold text-slate-900">{adherence.proteinHitRate ?? "n/a"}{adherence.proteinHitRate !== null ? "%" : ""}</span></p>
          <p className="text-sm text-slate-600">Calorie target adherence: <span className="font-semibold text-slate-900">{adherence.calorieHitRate ?? "n/a"}{adherence.calorieHitRate !== null ? "%" : ""}</span></p>
        </div>
      </section>

      <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <h3 className="text-lg font-semibold text-slate-900">Workout Timeline</h3>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-7">
          {workoutDateKeys.slice(-7).map((dateKey) => {
            const daySummary = buildWorkoutAdjustedSummary(workouts, workoutExceptions, [dateKey]);
            return (
              <div key={dateKey} className="rounded-xl border border-slate-200 p-3">
                <p className="text-xs text-slate-500">{dateKey}</p>
                <p className="text-sm font-semibold text-slate-900">{daySummary.completedSessions} sessions</p>
                <p className="text-xs text-slate-500">{daySummary.totalExercises} exercises · {daySummary.totalMinutes} min</p>
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <h3 className="text-lg font-semibold text-slate-900">Training Balance by Muscle Group</h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(muscleGroupBalance).map(([group, count]) => (
            <div key={group} className="rounded-xl border border-slate-200 p-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">{group}</p>
              <p className="text-xl font-semibold text-slate-900">{count} exercises</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        {availableMetrics.length ? <InsightsLineChart points={points} metric={metric} /> : <p className="text-sm text-slate-500">All macros are disabled in Profile. Re-enable at least one macro to show insights.</p>}
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        {!disabledMacros.includes("calories") ? <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200"><p className="text-xs text-slate-500">Avg Calories</p><p className="text-2xl font-semibold text-slate-900">{summary.averages.calories}</p></div> : null}
        {!disabledMacros.includes("protein") ? <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200"><p className="text-xs text-slate-500">Avg Protein</p><p className="text-2xl font-semibold text-slate-900">{summary.averages.protein}g</p></div> : null}
        {!disabledMacros.includes("carbs") ? <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200"><p className="text-xs text-slate-500">Avg Carbs</p><p className="text-2xl font-semibold text-slate-900">{summary.averages.carbs}g</p></div> : null}
        {!disabledMacros.includes("fat") ? <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200"><p className="text-xs text-slate-500">Avg Fat</p><p className="text-2xl font-semibold text-slate-900">{summary.averages.fat}g</p></div> : null}
      </section>
    </main>
  );
}
