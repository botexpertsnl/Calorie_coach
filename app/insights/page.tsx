"use client";

import { ReactNode, useEffect, useMemo, useState } from "react";
import { AppHeaderNav } from "@/components/AppHeaderNav";
import { TARGETS_UPDATED_EVENT, getDailyMacroTargets } from "@/lib/daily-targets";
import { ensureDemoSeedData } from "@/lib/demo-seed";
import { STORAGE_KEYS, readJson } from "@/lib/local-data";
import { getLocalDateKey } from "@/lib/meals";
import { buildEffectiveWorkoutInstances, buildWorkoutAdjustedSummary, getCurrentWeekDateKeys, getDateKeysInRange } from "@/lib/workout-execution";
import {
  DailyTargets,
  MacroKey,
  MacroTotals,
  MuscleGroup,
  ProfileInput,
  SpecifyMuscle,
  StoredMealLog,
  WorkoutException,
  WorkoutExercise,
  WorkoutExerciseType,
  WorkoutWeekPlan
} from "@/lib/types";

type RangePreset = "7d" | "1m" | "3m" | "6m" | "custom";
type ProgressMetric = "weight" | "reps" | "volume" | "duration" | "calories";

type NutritionPoint = {
  date: string;
  actual: MacroTotals;
  target: MacroTotals;
};

type ExerciseRecord = {
  date: string;
  type: WorkoutExerciseType;
  exerciseName: string;
  muscleGroup: MuscleGroup;
  specifyMuscle?: SpecifyMuscle;
  weight: number;
  reps: number;
  volume: number;
  duration: number;
  calories: number;
};

const rangeOptions: Array<{ value: RangePreset; label: string }> = [
  { value: "7d", label: "7 days" },
  { value: "1m", label: "1 month" },
  { value: "3m", label: "3 months" },
  { value: "6m", label: "6 months" },
  { value: "custom", label: "Custom" }
];

const macroConfigs: Array<{ key: MacroKey; label: string; unit: string; color: string }> = [
  { key: "calories", label: "Calories", unit: "kcal", color: "#f97316" },
  { key: "protein", label: "Protein", unit: "g", color: "#22c55e" },
  { key: "carbs", label: "Carbs", unit: "g", color: "#3b82f6" },
  { key: "fat", label: "Fat", unit: "g", color: "#a855f7" }
];

const muscleGroupLabels: Record<MuscleGroup, string> = {
  chest: "Chest",
  back: "Back",
  legs: "Legs",
  shoulders: "Shoulders",
  arms: "Arms",
  core: "Core"
};

const specifyMuscleLabels: Record<SpecifyMuscle, string> = {
  upper_chest: "Upper Chest",
  mid_chest: "Mid Chest",
  lower_chest: "Lower Chest",
  inner_chest: "Inner Chest",
  lats: "Lats",
  upper_back: "Upper Back",
  mid_back: "Mid Back",
  lower_back: "Lower Back",
  traps: "Traps",
  quads: "Quads",
  hamstrings: "Hamstrings",
  glutes: "Glutes",
  calves: "Calves",
  adductors: "Adductors",
  hip_flexors: "Hip Flexors",
  front_delts: "Front Delts",
  side_delts: "Side Delts",
  rear_delts: "Rear Delts",
  biceps: "Biceps",
  triceps: "Triceps",
  forearms: "Forearms",
  brachialis: "Brachialis",
  upper_abs: "Upper Abs",
  lower_abs: "Lower Abs",
  obliques: "Obliques",
  deep_core: "Deep Core"
};

const specifyMuscleByGroup: Record<MuscleGroup, SpecifyMuscle[]> = {
  chest: ["upper_chest", "mid_chest", "lower_chest", "inner_chest"],
  back: ["lats", "upper_back", "mid_back", "lower_back", "traps"],
  legs: ["quads", "hamstrings", "glutes", "calves", "adductors", "hip_flexors"],
  shoulders: ["front_delts", "side_delts", "rear_delts", "traps"],
  arms: ["biceps", "triceps", "forearms", "brachialis"],
  core: ["upper_abs", "lower_abs", "obliques", "lower_back", "deep_core"]
};

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

function toDateKey(input: string) {
  return input.slice(0, 10);
}

function formatShortDate(dateKey: string) {
  return dateKey.slice(5);
}

function ChartCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function LineCompareChart({
  points,
  actualColor,
  targetColor,
  valueFormatter
}: {
  points: Array<{ date: string; actual: number; target: number }>;
  actualColor: string;
  targetColor: string;
  valueFormatter: (n: number) => string;
}) {
  if (!points.length) return <p className="text-sm text-slate-500">No data in this range yet.</p>;

  const width = 820;
  const height = 220;
  const padding = 34;
  const allValues = points.flatMap((point) => [point.actual, point.target]);
  const maxValue = Math.max(...allValues, 1);

  const toX = (index: number) => padding + (index / Math.max(points.length - 1, 1)) * (width - padding * 2);
  const toY = (value: number) => height - padding - (value / maxValue) * (height - padding * 2);

  const actualPath = points.map((point, index) => `${index === 0 ? "M" : "L"}${toX(index)} ${toY(point.actual)}`).join(" ");
  const targetPath = points.map((point, index) => `${index === 0 ? "M" : "L"}${toX(index)} ${toY(point.target)}`).join(" ");

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-56 w-full">
        <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="#cbd5e1" strokeWidth="1" />
        <line x1={padding} y1={padding} x2={padding} y2={height - padding} stroke="#cbd5e1" strokeWidth="1" />

        <path d={targetPath} fill="none" stroke={targetColor} strokeWidth="2" strokeDasharray="6 4" />
        <path d={actualPath} fill="none" stroke={actualColor} strokeWidth="2.5" />

        {points.map((point, index) => (
          <circle key={`${point.date}-${index}`} cx={toX(index)} cy={toY(point.actual)} r="2.5" fill={actualColor} />
        ))}
      </svg>
      <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
        <span>{formatShortDate(points[0].date)}</span>
        <span>Target line is dotted · max {valueFormatter(maxValue)}</span>
        <span>{formatShortDate(points[points.length - 1].date)}</span>
      </div>
    </div>
  );
}

function BarChart({ bars }: { bars: Array<{ label: string; value: number; color?: string }> }) {
  if (!bars.length) return <p className="text-sm text-slate-500">No data in this range yet.</p>;
  const maxValue = Math.max(...bars.map((bar) => bar.value), 1);

  return (
    <div className="space-y-3">
      {bars.map((bar) => (
        <div key={bar.label}>
          <div className="mb-1 flex items-center justify-between text-sm">
            <span className="font-medium text-slate-700">{bar.label}</span>
            <span className="text-slate-500">{Math.round(bar.value).toLocaleString()}</span>
          </div>
          <div className="h-2.5 rounded-full bg-slate-200">
            <div
              className="h-2.5 rounded-full"
              style={{ width: `${Math.max(4, (bar.value / maxValue) * 100)}%`, backgroundColor: bar.color ?? "#0ea5e9" }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function InsightsPage() {
  const [rangePreset, setRangePreset] = useState<RangePreset>("7d");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [disabledMacros, setDisabledMacros] = useState<MacroKey[]>([]);

  const [meals, setMeals] = useState<StoredMealLog[]>([]);
  const [workouts, setWorkouts] = useState<WorkoutWeekPlan | null>(null);
  const [workoutExceptions, setWorkoutExceptions] = useState<WorkoutException[]>([]);
  const [nutritionTargets, setNutritionTargets] = useState<DailyTargets | null>(null);
  const [profile, setProfile] = useState<ProfileInput | null>(null);

  const [progressMetric, setProgressMetric] = useState<ProgressMetric>("volume");
  const [typeFilter, setTypeFilter] = useState<"all" | WorkoutExerciseType>("all");
  const [muscleFilter, setMuscleFilter] = useState<"all" | MuscleGroup>("all");
  const [specifyFilter, setSpecifyFilter] = useState<"all" | SpecifyMuscle>("all");
  const [exerciseFilter, setExerciseFilter] = useState<"all" | string>("all");

  const weekDateKeys = useMemo(() => getCurrentWeekDateKeys(), []);

  useEffect(() => {
    const sync = () => {
      ensureDemoSeedData();
      setMeals(readJson<StoredMealLog[]>(STORAGE_KEYS.meals) ?? []);
      setWorkouts(readJson<WorkoutWeekPlan>(STORAGE_KEYS.workouts));
      setWorkoutExceptions(readJson<WorkoutException[]>(STORAGE_KEYS.workoutExceptions) ?? []);
      setNutritionTargets(readJson<DailyTargets>(STORAGE_KEYS.targets));
      setProfile(readJson<ProfileInput>(STORAGE_KEYS.profile));
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

  const rangeDateKeys = useMemo(() => {
    if (rangePreset === "custom") {
      const start = customStart ? new Date(customStart) : startDateFromPreset("7d");
      const end = customEnd ? new Date(customEnd) : new Date();
      return getDateKeysInRange(start, end);
    }

    if (rangePreset === "7d") return weekDateKeys;

    const end = new Date();
    const start = startDateFromPreset(rangePreset);
    return getDateKeysInRange(start, end);
  }, [customEnd, customStart, rangePreset, weekDateKeys]);

  const mealsByDate = useMemo(() => {
    const map = new Map<string, MacroTotals>();

    meals.forEach((meal) => {
      const dateKey = meal.mealDate || toDateKey(meal.createdAt);
      const current = map.get(dateKey) ?? { calories: 0, protein: 0, carbs: 0, fat: 0 };
      map.set(dateKey, {
        calories: current.calories + meal.result.totals.calories,
        protein: current.protein + meal.result.totals.protein,
        carbs: current.carbs + meal.result.totals.carbs,
        fat: current.fat + meal.result.totals.fat
      });
    });

    return map;
  }, [meals]);

  const nutritionPoints = useMemo<NutritionPoint[]>(() => {
    if (!profile) {
      return rangeDateKeys.map((dateKey) => ({
        date: dateKey,
        actual: mealsByDate.get(dateKey) ?? { calories: 0, protein: 0, carbs: 0, fat: 0 },
        target: {
          calories: nutritionTargets?.calories ?? 0,
          protein: nutritionTargets?.protein ?? 0,
          carbs: nutritionTargets?.carbs ?? 0,
          fat: nutritionTargets?.fat ?? 0
        }
      }));
    }

    return rangeDateKeys.map((dateKey) => {
      const target = getDailyMacroTargets(dateKey, profile, workouts, workoutExceptions);
      return {
        date: dateKey,
        actual: mealsByDate.get(dateKey) ?? { calories: 0, protein: 0, carbs: 0, fat: 0 },
        target: {
          calories: target.calories,
          protein: target.protein,
          carbs: target.carbs,
          fat: target.fat
        }
      };
    });
  }, [mealsByDate, nutritionTargets, profile, rangeDateKeys, workoutExceptions, workouts]);

  const workoutSummary = useMemo(
    () => buildWorkoutAdjustedSummary(workouts, workoutExceptions, rangeDateKeys),
    [rangeDateKeys, workoutExceptions, workouts]
  );

  const effectiveWorkouts = useMemo(
    () => buildEffectiveWorkoutInstances(workouts, workoutExceptions, rangeDateKeys),
    [rangeDateKeys, workoutExceptions, workouts]
  );

  const exerciseRecords = useMemo<ExerciseRecord[]>(() => {
    const rows: ExerciseRecord[] = [];

    effectiveWorkouts.forEach((instance) => {
      const exercise = instance.exercise;
      rows.push(toRecord(instance.date, exercise));

      const history = Array.isArray(exercise.progressHistory) ? exercise.progressHistory : [];
      history.forEach((entry) => {
        const date = toDateKey(entry.recordedAt || instance.date);
        rows.push({
          date,
          type: exercise.type,
          exerciseName: exercise.name,
          muscleGroup: exercise.muscleGroup,
          specifyMuscle: exercise.specifyMuscle,
          weight: entry.weight ?? ("weight" in exercise ? exercise.weight ?? 0 : 0),
          reps: entry.reps ?? ("reps" in exercise ? exercise.reps ?? 0 : 0),
          volume: entry.trainingVolume ?? exercise.trainingVolume,
          duration: entry.durationMinutes ?? ("durationMinutes" in exercise ? exercise.durationMinutes : 0),
          calories: entry.estimatedCalories ?? exercise.estimatedCalories
        });
      });
    });

    return rows.filter((row) => rangeDateKeys.includes(row.date));
  }, [effectiveWorkouts, rangeDateKeys]);

  const availableSpecifyOptions = useMemo(() => {
    if (muscleFilter === "all") return [] as SpecifyMuscle[];
    return specifyMuscleByGroup[muscleFilter];
  }, [muscleFilter]);

  useEffect(() => {
    if (muscleFilter === "all") setSpecifyFilter("all");
    if (specifyFilter !== "all" && muscleFilter !== "all" && !specifyMuscleByGroup[muscleFilter].includes(specifyFilter)) {
      setSpecifyFilter("all");
    }
  }, [muscleFilter, specifyFilter]);

  const filteredRecords = useMemo(() => {
    return exerciseRecords.filter((record) => {
      const typeOk = typeFilter === "all" ? true : record.type === typeFilter;
      const muscleOk = muscleFilter === "all" ? true : record.muscleGroup === muscleFilter;
      const specifyOk = specifyFilter === "all" ? true : record.specifyMuscle === specifyFilter;
      const exerciseOk = exerciseFilter === "all" ? true : record.exerciseName === exerciseFilter;
      return typeOk && muscleOk && specifyOk && exerciseOk;
    });
  }, [exerciseFilter, exerciseRecords, muscleFilter, specifyFilter, typeFilter]);

  const exerciseOptions = useMemo(() => {
    const names = new Set(filteredRecords.map((record) => record.exerciseName));
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [filteredRecords]);

  useEffect(() => {
    if (exerciseFilter === "all") return;
    if (!exerciseOptions.includes(exerciseFilter)) setExerciseFilter("all");
  }, [exerciseFilter, exerciseOptions]);

  const progressTrend = useMemo(() => {
    const bucket = new Map<string, number>();

    filteredRecords.forEach((record) => {
      const value =
        progressMetric === "weight"
          ? record.weight
          : progressMetric === "reps"
            ? record.reps
            : progressMetric === "duration"
              ? record.duration
              : progressMetric === "calories"
                ? record.calories
                : record.volume;

      bucket.set(record.date, (bucket.get(record.date) ?? 0) + value);
    });

    return rangeDateKeys.map((date) => ({ date, value: bucket.get(date) ?? 0 }));
  }, [filteredRecords, progressMetric, rangeDateKeys]);

  const trainingBalanceBars = useMemo(() => {
    const volumeByGroup: Record<MuscleGroup, number> = {
      chest: 0,
      back: 0,
      legs: 0,
      shoulders: 0,
      arms: 0,
      core: 0
    };

    filteredRecords.forEach((record) => {
      volumeByGroup[record.muscleGroup] += record.volume;
    });

    return (Object.keys(volumeByGroup) as MuscleGroup[]).map((key) => ({
      label: muscleGroupLabels[key],
      value: volumeByGroup[key],
      color: "#0ea5e9"
    }));
  }, [filteredRecords]);

  const weeklyConsistencyBars = useMemo(() => {
    const weekBuckets = new Map<string, { scheduled: number; completed: number }>();

    rangeDateKeys.forEach((dateKey) => {
      const weekKey = `${dateKey.slice(0, 8)}W${Math.ceil(Number(dateKey.slice(8, 10)) / 7)}`;
      const daySummary = buildWorkoutAdjustedSummary(workouts, workoutExceptions, [dateKey]);
      const bucket = weekBuckets.get(weekKey) ?? { scheduled: 0, completed: 0 };
      bucket.scheduled += daySummary.plannedSessions;
      bucket.completed += daySummary.completedSessions;
      weekBuckets.set(weekKey, bucket);
    });

    return Array.from(weekBuckets.entries()).map(([weekKey, value]) => ({
      label: weekKey,
      value: value.scheduled ? (value.completed / value.scheduled) * 100 : 0,
      color: "#22c55e"
    }));
  }, [rangeDateKeys, workoutExceptions, workouts]);

  const summary = useMemo(() => {
    const days = Math.max(nutritionPoints.length, 1);

    const totals = nutritionPoints.reduce(
      (acc, point) => ({
        calories: acc.calories + point.actual.calories,
        protein: acc.protein + point.actual.protein,
        carbs: acc.carbs + point.actual.carbs,
        fat: acc.fat + point.actual.fat
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0 }
    );

    const calorieAdherence =
      nutritionPoints.length > 0
        ? Math.round(
            nutritionPoints.reduce((sum, point) => {
              if (point.target.calories <= 0) return sum;
              const adherence = Math.max(0, 100 - Math.abs(((point.actual.calories - point.target.calories) / point.target.calories) * 100));
              return sum + adherence;
            }, 0) / nutritionPoints.length
          )
        : 0;

    const proteinDaysHit = nutritionPoints.filter((point) => point.target.protein > 0 && point.actual.protein >= point.target.protein).length;

    const workoutCompletion = workoutSummary.plannedSessions
      ? Math.round((workoutSummary.completedSessions / workoutSummary.plannedSessions) * 100)
      : 0;

    return {
      days,
      totals,
      averages: {
        calories: Math.round(totals.calories / days),
        protein: Math.round(totals.protein / days),
        carbs: Math.round(totals.carbs / days),
        fat: Math.round(totals.fat / days)
      },
      calorieAdherence,
      proteinDaysHit,
      workoutCompletion
    };
  }, [nutritionPoints, workoutSummary]);

  const coachingInsights = useMemo(() => {
    const tips: string[] = [];
    const goal = (profile?.primaryGoal ?? "").toLowerCase();
    const isAdvanced = profile?.trainingExperience === "advanced";

    if (summary.calorieAdherence < (isAdvanced ? 85 : 75)) {
      tips.push("Calorie adherence is below target range. Tightening meal consistency should improve goal progress.");
    }

    if (summary.proteinDaysHit < Math.ceil(summary.days * (isAdvanced ? 0.75 : 0.6))) {
      tips.push("Protein targets are missed on multiple days. Increasing protein intake can support muscle retention and recovery.");
    }

    if (summary.workoutCompletion < (isAdvanced ? 90 : 80)) {
      tips.push("Workout completion is trending low. Hitting scheduled sessions more consistently should improve progress.");
    }

    const chestVolume = trainingBalanceBars.find((item) => item.label === "Chest")?.value ?? 0;
    const backVolume = trainingBalanceBars.find((item) => item.label === "Back")?.value ?? 0;
    const legsVolume = trainingBalanceBars.find((item) => item.label === "Legs")?.value ?? 0;

    if (legsVolume < Math.max(chestVolume, backVolume) * 0.5) {
      tips.push("Leg training volume is relatively low versus upper-body work. Adding lower-body volume would improve balance.");
    }

    if (chestVolume > backVolume * 1.4 && backVolume > 0) {
      tips.push("Chest volume is notably higher than back volume. More pulling work may improve posture and shoulder balance.");
    }

    const trendValues = progressTrend.map((point) => point.value).filter((value) => value > 0);
    if (trendValues.length >= 4) {
      const half = Math.floor(trendValues.length / 2);
      const firstAvg = trendValues.slice(0, half).reduce((a, b) => a + b, 0) / Math.max(half, 1);
      const secondAvg = trendValues.slice(half).reduce((a, b) => a + b, 0) / Math.max(trendValues.length - half, 1);
      if (secondAvg > firstAvg * 1.08) tips.push("Exercise performance trend is improving steadily in the selected range.");
      else if (secondAvg < firstAvg * 0.95) tips.push("Exercise progress appears to be stalling. Consider adjusting load, reps, or recovery.");
    }

    if (goal.includes("fat loss") && summary.averages.protein < (profile?.weightKg ?? 0) * 1.8) {
      tips.push("For your fat-loss goal, higher protein intake could better support muscle retention.");
    }

    if (!tips.length) tips.push("Great consistency so far. Keep progressive overload and steady nutrition adherence.");

    return tips.slice(0, 5);
  }, [profile, progressTrend, summary, trainingBalanceBars]);

  return (
    <main className="mx-auto w-full max-w-7xl space-y-6 px-4 py-8 md:px-8">
      <AppHeaderNav />

      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-3xl font-semibold text-slate-900">Insights Dashboard</h1>
            <p className="mt-1 text-sm text-slate-500">Central analytics and coaching overview for nutrition, training, and progression.</p>
          </div>

          <div className="flex flex-wrap gap-2">
            {rangeOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setRangePreset(option.value)}
                className={`rounded-xl border px-3 py-2 text-sm ${rangePreset === option.value ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 text-slate-700 hover:bg-slate-50"}`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {rangePreset === "custom" ? (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <label className="text-sm text-slate-700">Start date
              <input type="date" value={customStart} onChange={(event) => setCustomStart(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" />
            </label>
            <label className="text-sm text-slate-700">End date
              <input type="date" value={customEnd} onChange={(event) => setCustomEnd(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" />
            </label>
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl bg-gradient-to-r from-emerald-50 to-sky-50 p-6 shadow-sm ring-1 ring-emerald-100">
        <h2 className="text-xl font-semibold text-slate-900">Weekly Summary</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <p className="text-sm text-slate-700">Calories adherence: <span className="font-semibold text-slate-900">{summary.calorieAdherence}%</span></p>
          <p className="text-sm text-slate-700">Protein target reached: <span className="font-semibold text-slate-900">{summary.proteinDaysHit} / {summary.days} days</span></p>
          <p className="text-sm text-slate-700">Workout completion rate: <span className="font-semibold text-slate-900">{summary.workoutCompletion}%</span></p>
          <p className="text-sm text-slate-700">Workouts completed: <span className="font-semibold text-slate-900">{workoutSummary.completedSessions} / {workoutSummary.plannedSessions || 0}</span></p>
          <p className="text-sm text-slate-700">Total exercises completed: <span className="font-semibold text-slate-900">{workoutSummary.totalExercises}</span></p>
          <p className="text-sm text-slate-700">Training volume: <span className="font-semibold text-slate-900">{Math.round(workoutSummary.totalFitnessVolume).toLocaleString()} kg</span></p>
        </div>
      </section>

      <ChartCard title="Nutrition Insights">
        <div className="grid gap-5 lg:grid-cols-2">
          {macroConfigs
            .filter((macro) => !disabledMacros.includes(macro.key))
            .map((macro) => {
              const points = nutritionPoints.map((point) => ({ date: point.date, actual: point.actual[macro.key], target: point.target[macro.key] }));
              return (
                <div key={macro.key} className="rounded-xl border border-slate-200 p-3">
                  <p className="mb-2 text-sm font-semibold text-slate-800">{macro.label} vs Target</p>
                  <LineCompareChart points={points} actualColor={macro.color} targetColor="#64748b" valueFormatter={(value) => `${Math.round(value)} ${macro.unit}`} />
                </div>
              );
            })}
        </div>
      </ChartCard>

      <ChartCard title="Workout Consistency Insights">
        <div className="grid gap-4 lg:grid-cols-[1.5fr,1fr]">
          <BarChart bars={weeklyConsistencyBars} />
          <div className="rounded-xl border border-slate-200 p-4">
            <p className="text-sm text-slate-600">Scheduled workouts</p>
            <p className="text-2xl font-semibold text-slate-900">{workoutSummary.plannedSessions}</p>
            <p className="mt-2 text-sm text-slate-600">Completed workouts</p>
            <p className="text-2xl font-semibold text-slate-900">{workoutSummary.completedSessions}</p>
            <p className="mt-2 text-sm text-slate-600">Missed workouts</p>
            <p className="text-2xl font-semibold text-slate-900">{workoutSummary.missedSessions}</p>
            <p className="mt-2 text-sm text-slate-600">Extra workouts</p>
            <p className="text-2xl font-semibold text-slate-900">{workoutSummary.extraSessions}</p>
          </div>
        </div>
      </ChartCard>

      <ChartCard title="Exercise Progress Insights">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <label className="text-sm text-slate-700">Progress view
            <select value={progressMetric} onChange={(e) => setProgressMetric(e.target.value as ProgressMetric)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2">
              <option value="weight">Weight lifted</option>
              <option value="reps">Total reps</option>
              <option value="volume">Training volume</option>
              <option value="duration">Duration</option>
              <option value="calories">Estimated calories</option>
            </select>
          </label>

          <label className="text-sm text-slate-700">Workout Type
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as "all" | WorkoutExerciseType)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2">
              <option value="all">All</option>
              <option value="fitness">Fitness</option>
              <option value="cardio">Cardio</option>
              <option value="crossfit">CrossFit</option>
            </select>
          </label>

          <label className="text-sm text-slate-700">Muscle Group
            <select value={muscleFilter} onChange={(e) => setMuscleFilter(e.target.value as "all" | MuscleGroup)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2">
              <option value="all">All</option>
              {(Object.keys(muscleGroupLabels) as MuscleGroup[]).map((group) => (
                <option key={group} value={group}>{muscleGroupLabels[group]}</option>
              ))}
            </select>
          </label>

          <label className="text-sm text-slate-700">Specify Muscle
            <select value={specifyFilter} onChange={(e) => setSpecifyFilter(e.target.value as "all" | SpecifyMuscle)} disabled={muscleFilter === "all"} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 disabled:bg-slate-100 disabled:text-slate-400">
              <option value="all">All</option>
              {availableSpecifyOptions.map((item) => (
                <option key={item} value={item}>{specifyMuscleLabels[item]}</option>
              ))}
            </select>
          </label>

          <label className="text-sm text-slate-700">Exercise Name
            <select value={exerciseFilter} onChange={(e) => setExerciseFilter(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2">
              <option value="all">All</option>
              {exerciseOptions.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-4 rounded-xl border border-slate-200 p-3">
          <LineCompareChart
            points={progressTrend.map((point) => ({ date: point.date, actual: point.value, target: 0 }))}
            actualColor="#0ea5e9"
            targetColor="#cbd5e1"
            valueFormatter={(value) => String(Math.round(value))}
          />
        </div>
      </ChartCard>

      <ChartCard title="Training Balance Insights">
        <div className="grid gap-4 lg:grid-cols-[1.5fr,1fr]">
          <BarChart bars={trainingBalanceBars.map((bar) => ({ ...bar, color: "#10b981" }))} />
          <div className="rounded-xl border border-slate-200 p-4 text-sm text-slate-600">
            <p className="font-semibold text-slate-900">Deep dive notes</p>
            <p className="mt-2">Filters from the Exercise Progress section also apply here, so you can inspect balance by workout type, muscle group, specify muscle, and exercise name.</p>
            <p className="mt-2">Use this to spot imbalances like low legs volume or chest-heavy programming versus back.</p>
          </div>
        </div>
      </ChartCard>

      <ChartCard title="Smart Coaching Insights">
        <ul className="space-y-2">
          {coachingInsights.map((insight, index) => (
            <li key={`${insight}-${index}`} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
              {insight}
            </li>
          ))}
        </ul>
      </ChartCard>
    </main>
  );
}

function toRecord(date: string, exercise: WorkoutExercise): ExerciseRecord {
  return {
    date,
    type: exercise.type,
    exerciseName: exercise.name,
    muscleGroup: exercise.muscleGroup,
    specifyMuscle: exercise.specifyMuscle,
    weight: "weight" in exercise ? exercise.weight ?? 0 : 0,
    reps: "reps" in exercise ? exercise.reps ?? 0 : 0,
    volume: exercise.trainingVolume,
    duration: "durationMinutes" in exercise ? exercise.durationMinutes : 0,
    calories: exercise.estimatedCalories
  };
}
