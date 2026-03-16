"use client";

import { ReactNode, useEffect, useMemo, useState } from "react";
import { AppHeaderNav } from "@/components/AppHeaderNav";
import { TARGETS_UPDATED_EVENT, getDailyMacroTargets } from "@/lib/daily-targets";
import { ensureDemoSeedData } from "@/lib/demo-seed";
import { STORAGE_KEYS, readJson } from "@/lib/local-data";
import { buildEffectiveWorkoutInstances, buildWorkoutAdjustedSummary, getDateKeysInRange } from "@/lib/workout-execution";
import {
  BodyProgressHistory,
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

type RangePreset = "7d" | "30d" | "90d" | "custom";

type NutritionPoint = {
  date: string;
  actual: MacroTotals;
  target: MacroTotals;
};

type ExerciseRecord = {
  date: string;
  type: WorkoutExerciseType;
  muscleGroup: MuscleGroup;
  specifyMuscle?: SpecifyMuscle;
  weight: number;
  reps: number;
  sets: number;
  volume: number;
  duration: number;
  calories: number;
};

type TrendPoint = { x: string; y: number; tooltipLabel?: string };
type MultiSeriesPoint = { x: string; y: number; tooltipLabel?: string };
type MultiSeries = { key: string; label: string; color: string; points: MultiSeriesPoint[] };

const rangeOptions: Array<{ value: RangePreset; label: string }> = [
  { value: "7d", label: "Last 7 Days" },
  { value: "30d", label: "Last 30 Days" },
  { value: "90d", label: "Last 90 Days" },
  { value: "custom", label: "Custom Range" }
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

const lineColors = ["#0ea5e9", "#22c55e", "#a855f7", "#f97316", "#ef4444", "#14b8a6", "#6366f1", "#f59e0b"];

function toDateKey(input: string) {
  return input.slice(0, 10);
}

function formatShortDate(dateKey: string) {
  return dateKey.slice(5);
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

function formatDateOnly(value: string) {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", { year: "numeric", month: "short", day: "2-digit" }).format(date);
}

function getRangeWindow(rangePreset: RangePreset, customStart: string, customEnd: string) {
  const end = rangePreset === "custom" && customEnd ? new Date(customEnd) : new Date();
  if (rangePreset !== "custom") {
    const start = new Date(end);
    const daysBack = rangePreset === "7d" ? 6 : rangePreset === "30d" ? 29 : 89;
    start.setDate(end.getDate() - daysBack);
    return { start, end };
  }

  const start = customStart ? new Date(customStart) : new Date(end);
  if (!customStart) start.setDate(end.getDate() - 6);
  return start <= end ? { start, end } : { start: end, end: start };
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
  metricLabel,
  valueFormatter
}: {
  points: Array<{ date: string; actual: number; target: number }>;
  actualColor: string;
  targetColor: string;
  metricLabel: string;
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
          <circle key={`${point.date}-${index}`} cx={toX(index)} cy={toY(point.actual)} r="3" fill={actualColor}>
            <title>{`${formatDateOnly(point.date)}\n${metricLabel}: ${valueFormatter(point.actual)}`}</title>
          </circle>
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

function SimpleTrendChart({ points, color, unit, metricLabel }: { points: TrendPoint[]; color: string; unit: string; metricLabel: string }) {
  if (!points.length) return <p className="text-sm text-slate-500">No progress entries in this range.</p>;

  const width = 520;
  const height = 210;
  const padding = 30;
  const max = Math.max(...points.map((p) => p.y), 1);
  const min = Math.min(...points.map((p) => p.y), max);
  const range = Math.max(max - min, 1);

  const toX = (index: number) => padding + (index / Math.max(points.length - 1, 1)) * (width - padding * 2);
  const toY = (value: number) => height - padding - ((value - min) / range) * (height - padding * 2);
  const path = points.map((point, index) => `${index === 0 ? "M" : "L"}${toX(index)} ${toY(point.y)}`).join(" ");

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-52 w-full">
        <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="#cbd5e1" strokeWidth="1" />
        <line x1={padding} y1={padding} x2={padding} y2={height - padding} stroke="#cbd5e1" strokeWidth="1" />
        <path d={path} fill="none" stroke={color} strokeWidth="2.5" />
        {points.map((point, index) => (
          <circle key={`${point.x}-${index}`} cx={toX(index)} cy={toY(point.y)} r="3" fill={color}>
            <title>{`${formatDateTime(point.x)}\n${metricLabel}: ${point.y.toFixed(1)} ${unit}`}</title>
          </circle>
        ))}
      </svg>
      <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
        <span>{formatDateTime(points[0].x)}</span>
        <span>{Math.round(min)}–{Math.round(max)} {unit}</span>
        <span>{formatDateTime(points[points.length - 1].x)}</span>
      </div>
    </div>
  );
}

function MultiLineChart({ series }: { series: MultiSeries[] }) {
  const nonEmpty = series.filter((item) => item.points.some((point) => point.y > 0));
  if (!nonEmpty.length) return <p className="text-sm text-slate-500">No exercise progression in this range for the selected filters.</p>;

  const width = 960;
  const height = 280;
  const padding = 38;
  const maxValue = Math.max(...nonEmpty.flatMap((item) => item.points.map((point) => point.y)), 1);
  const pointCount = Math.max(...nonEmpty.map((item) => item.points.length));

  const toX = (index: number) => padding + (index / Math.max(pointCount - 1, 1)) * (width - padding * 2);
  const toY = (value: number) => height - padding - (value / maxValue) * (height - padding * 2);

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-64 w-full">
        <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="#cbd5e1" strokeWidth="1" />
        <line x1={padding} y1={padding} x2={padding} y2={height - padding} stroke="#cbd5e1" strokeWidth="1" />

        {nonEmpty.map((line) => {
          const path = line.points.map((point, index) => `${index === 0 ? "M" : "L"}${toX(index)} ${toY(point.y)}`).join(" ");
          return <path key={line.key} d={path} fill="none" stroke={line.color} strokeWidth="2.4" />;
        })}

        {nonEmpty.map((line) =>
          line.points.map((point, index) => (
            <circle key={`${line.key}-${point.x}`} cx={toX(index)} cy={toY(point.y)} r="3" fill={line.color}>
              <title>{`${point.tooltipLabel ?? formatDateOnly(point.x)}\n${line.label}: ${Math.round(point.y).toLocaleString()}`}</title>
            </circle>
          ))
        )}
      </svg>

      <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-700">
        {nonEmpty.map((line) => (
          <span key={`legend-${line.key}`} className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-2.5 py-1">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: line.color }} />
            {line.label}
          </span>
        ))}
      </div>
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
  const [bodyProgress, setBodyProgress] = useState<BodyProgressHistory>({ weight: [], waist: [] });

  const [typeFilter, setTypeFilter] = useState<WorkoutExerciseType>("fitness");
  const [muscleFilter, setMuscleFilter] = useState<"all" | MuscleGroup>("all");

  useEffect(() => {
    const sync = () => {
      ensureDemoSeedData();
      setMeals(readJson<StoredMealLog[]>(STORAGE_KEYS.meals) ?? []);
      setWorkouts(readJson<WorkoutWeekPlan>(STORAGE_KEYS.workouts));
      setWorkoutExceptions(readJson<WorkoutException[]>(STORAGE_KEYS.workoutExceptions) ?? []);
      setNutritionTargets(readJson<DailyTargets>(STORAGE_KEYS.targets));
      setProfile(readJson<ProfileInput>(STORAGE_KEYS.profile));
      setBodyProgress(readJson<BodyProgressHistory>(STORAGE_KEYS.bodyProgress) ?? { weight: [], waist: [] });
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
        STORAGE_KEYS.disabledMacros,
        STORAGE_KEYS.bodyProgress
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

  const { rangeStart, rangeEnd, rangeDateKeys } = useMemo(() => {
    const { start, end } = getRangeWindow(rangePreset, customStart, customEnd);
    return {
      rangeStart: start,
      rangeEnd: end,
      rangeDateKeys: getDateKeysInRange(start, end)
    };
  }, [customEnd, customStart, rangePreset]);

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
          muscleGroup: exercise.muscleGroup,
          specifyMuscle: exercise.specifyMuscle,
          weight: entry.weight ?? ("weight" in exercise ? exercise.weight ?? 0 : 0),
          reps: entry.reps ?? ("reps" in exercise ? exercise.reps ?? 0 : 0),
          sets: entry.sets ?? ("sets" in exercise ? exercise.sets ?? 0 : 0),
          volume: entry.trainingVolume ?? exercise.trainingVolume,
          duration: entry.durationMinutes ?? ("durationMinutes" in exercise ? exercise.durationMinutes : 0),
          calories: entry.estimatedCalories ?? exercise.estimatedCalories
        });
      });
    });

    return rows.filter((row) => rangeDateKeys.includes(row.date));
  }, [effectiveWorkouts, rangeDateKeys]);

  const filteredRecords = useMemo(() => {
    return exerciseRecords.filter((record) => {
      const typeOk = record.type === typeFilter;
      const muscleOk = muscleFilter === "all" ? true : record.muscleGroup === muscleFilter;
      return typeOk && muscleOk;
    });
  }, [exerciseRecords, muscleFilter, typeFilter]);

  const exerciseProgressSeries = useMemo<MultiSeries[]>(() => {
    const dateOrder = rangeDateKeys;
    const byLine = new Map<string, Map<string, number>>();

    const getLineKey = (record: ExerciseRecord) => {
      if (muscleFilter === "all") return record.muscleGroup;
      if (record.specifyMuscle && specifyMuscleByGroup[muscleFilter].includes(record.specifyMuscle)) return record.specifyMuscle;
      return "general";
    };

    const getWorkloadScore = (record: ExerciseRecord) => {
      const baseVolume = record.volume > 0 ? record.volume : record.weight * record.reps * Math.max(record.sets, 1);
      return baseVolume + record.reps * Math.max(record.sets, 1) + record.duration * 5;
    };

    filteredRecords.forEach((record) => {
      const lineKey = getLineKey(record);
      if (!byLine.has(lineKey)) byLine.set(lineKey, new Map<string, number>());
      const line = byLine.get(lineKey)!;
      line.set(record.date, (line.get(record.date) ?? 0) + getWorkloadScore(record));
    });

    const orderedKeys = Array.from(byLine.keys()).sort((a, b) => a.localeCompare(b));
    return orderedKeys.map((key, index) => {
      const lineData = byLine.get(key)!;
      const label = key === "general"
        ? `${muscleFilter === "all" ? "General" : muscleGroupLabels[muscleFilter]} (unspecified)`
        : muscleFilter === "all"
          ? muscleGroupLabels[key as MuscleGroup]
          : specifyMuscleLabels[key as SpecifyMuscle];

      return {
        key,
        label,
        color: lineColors[index % lineColors.length],
        points: dateOrder.map((dateKey) => ({
          x: dateKey,
          y: lineData.get(dateKey) ?? 0,
          tooltipLabel: formatDateOnly(dateKey)
        }))
      };
    });
  }, [filteredRecords, muscleFilter, rangeDateKeys]);

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

    const calorieAdherence = nutritionPoints.length
      ? Math.round(
          (nutritionPoints.reduce((score, point) => {
            const target = Math.max(point.target.calories, 1);
            const diffRatio = Math.abs(point.actual.calories - target) / target;
            return score + Math.max(0, 1 - diffRatio);
          }, 0) /
            nutritionPoints.length) *
            100
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

  const weightSeries = useMemo<TrendPoint[]>(() => {
    return bodyProgress.weight
      .filter((entry) => {
        const d = new Date(entry.recordedAt);
        return d >= rangeStart && d <= rangeEnd;
      })
      .sort((a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime())
      .map((entry) => ({ x: entry.recordedAt, y: entry.value }));
  }, [bodyProgress.weight, rangeEnd, rangeStart]);

  const waistSeries = useMemo<TrendPoint[]>(() => {
    return bodyProgress.waist
      .filter((entry) => {
        const d = new Date(entry.recordedAt);
        return d >= rangeStart && d <= rangeEnd;
      })
      .sort((a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime())
      .map((entry) => ({ x: entry.recordedAt, y: entry.value }));
  }, [bodyProgress.waist, rangeEnd, rangeStart]);

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

    const seriesTotals = exerciseProgressSeries.map((line) => line.points.reduce((sum, point) => sum + point.y, 0)).filter((total) => total > 0);
    if (seriesTotals.length >= 2) {
      const firstHalf = seriesTotals.slice(0, Math.ceil(seriesTotals.length / 2));
      const secondHalf = seriesTotals.slice(Math.floor(seriesTotals.length / 2));
      const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
      const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
      if (secondAvg > firstAvg * 1.08) tips.push("Exercise workload is progressing steadily in the selected range.");
    }

    if (goal.includes("fat loss") && summary.averages.protein < (profile?.weightKg ?? 0) * 1.8) {
      tips.push("For your fat-loss goal, higher protein intake could better support muscle retention.");
    }

    if (waistSeries.length >= 2 && weightSeries.length >= 2) {
      const waistDelta = waistSeries[waistSeries.length - 1].y - waistSeries[0].y;
      const weightDelta = weightSeries[weightSeries.length - 1].y - weightSeries[0].y;
      if (waistDelta < 0 && Math.abs(weightDelta) < 1) tips.push("Waist is trending down while weight is stable — this can indicate body recomposition progress.");
      if (goal.includes("fat loss") && waistDelta >= 0) tips.push("Waist is not trending downward in this range. Consider tightening calorie adherence and training consistency.");
    }

    if (!tips.length) tips.push("Great consistency so far. Keep progressive overload and steady nutrition adherence.");

    return tips.slice(0, 5);
  }, [exerciseProgressSeries, profile, summary, trainingBalanceBars, waistSeries, weightSeries]);

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
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:max-w-lg">
            <label className="text-sm text-slate-700">Start date & time
              <input type="datetime-local" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" />
            </label>
            <label className="text-sm text-slate-700">End date & time
              <input type="datetime-local" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" />
            </label>
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <h2 className="text-xl font-semibold text-slate-900">Weekly Summary</h2>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <p className="text-sm text-slate-700">Calories adherence: <span className="font-semibold text-slate-900">{summary.calorieAdherence}%</span></p>
          <p className="text-sm text-slate-700">Protein target reached: <span className="font-semibold text-slate-900">{summary.proteinDaysHit} / {summary.days} days</span></p>
          <p className="text-sm text-slate-700">Workout completion rate: <span className="font-semibold text-slate-900">{summary.workoutCompletion}%</span></p>
          <p className="text-sm text-slate-700">Workouts completed: <span className="font-semibold text-slate-900">{workoutSummary.completedSessions} / {workoutSummary.plannedSessions || 0}</span></p>
          <p className="text-sm text-slate-700">Total exercises completed: <span className="font-semibold text-slate-900">{workoutSummary.totalExercises}</span></p>
          <p className="text-sm text-slate-700">Training volume: <span className="font-semibold text-slate-900">{Math.round(workoutSummary.totalFitnessVolume).toLocaleString()} kg</span></p>
        </div>
      </section>

      <ChartCard title="Smart Coaching Insights">
        <ul className="space-y-2">
          {coachingInsights.map((insight, index) => (
            <li key={`${insight}-${index}`} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
              {insight}
            </li>
          ))}
        </ul>
      </ChartCard>

      <ChartCard title="Nutrition Insights">
        <div className="grid gap-5 lg:grid-cols-2">
          {macroConfigs
            .filter((macro) => !disabledMacros.includes(macro.key))
            .map((macro) => {
              const points = nutritionPoints.map((point) => ({ date: point.date, actual: point.actual[macro.key], target: point.target[macro.key] }));
              return (
                <div key={macro.key} className="rounded-xl border border-slate-200 p-3">
                  <p className="mb-2 text-sm font-semibold text-slate-800">{macro.label} vs Target</p>
                  <LineCompareChart
                    points={points}
                    actualColor={macro.color}
                    targetColor="#64748b"
                    metricLabel={macro.label}
                    valueFormatter={(value) => `${Math.round(value)} ${macro.unit}`}
                  />
                </div>
              );
            })}
        </div>
      </ChartCard>

      <ChartCard title="Exercise Progress Insights">
        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-sm text-slate-700">Workout Type
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as WorkoutExerciseType)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2">
              <option value="fitness">Fitness</option>
              <option value="cardio">Cardio</option>
              <option value="crossfit">CrossFit</option>
            </select>
          </label>

          <label className="text-sm text-slate-700">Muscle Group (optional)
            <select value={muscleFilter} onChange={(e) => setMuscleFilter(e.target.value as "all" | MuscleGroup)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2">
              <option value="all">All</option>
              {(Object.keys(muscleGroupLabels) as MuscleGroup[]).map((group) => (
                <option key={group} value={group}>{muscleGroupLabels[group]}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-4 rounded-xl border border-slate-200 p-3">
          <MultiLineChart series={exerciseProgressSeries} />
          <p className="mt-3 text-xs text-slate-500">Y-axis uses workload score derived from training volume, sets, reps, weight, and duration over time.</p>
        </div>
      </ChartCard>

      <ChartCard title="Training Balance Insights">
        <div className="grid gap-4 lg:grid-cols-[1.5fr,1fr]">
          <BarChart bars={trainingBalanceBars.map((bar) => ({ ...bar, color: "#10b981" }))} />
          <div className="rounded-xl border border-slate-200 p-4 text-sm text-slate-600">
            <p className="font-semibold text-slate-900">Deep dive notes</p>
            <p className="mt-2">This balance view follows the Exercise Progress filters, so you can inspect split quality by workout type and optional muscle group.</p>
            <p className="mt-2">Use this to spot imbalances like low legs volume or chest-heavy programming versus back.</p>
          </div>
        </div>
      </ChartCard>

      <ChartCard title="Body Progress Insights">
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-slate-200 p-3">
            <p className="mb-2 text-sm font-semibold text-slate-800">Weight Progress</p>
            <SimpleTrendChart points={weightSeries} color="#0ea5e9" unit="kg" metricLabel="Weight" />
          </div>
          <div className="rounded-xl border border-slate-200 p-3">
            <p className="mb-2 text-sm font-semibold text-slate-800">Waist Progress</p>
            <SimpleTrendChart points={waistSeries} color="#8b5cf6" unit="cm" metricLabel="Waist" />
          </div>
        </div>
      </ChartCard>
    </main>
  );
}

function toRecord(date: string, exercise: WorkoutExercise): ExerciseRecord {
  return {
    date,
    type: exercise.type,
    muscleGroup: exercise.muscleGroup,
    specifyMuscle: exercise.specifyMuscle,
    weight: "weight" in exercise ? exercise.weight ?? 0 : 0,
    reps: "reps" in exercise ? exercise.reps ?? 0 : 0,
    sets: "sets" in exercise ? exercise.sets ?? 0 : 0,
    volume: exercise.trainingVolume,
    duration: "durationMinutes" in exercise ? exercise.durationMinutes : 0,
    calories: exercise.estimatedCalories
  };
}
