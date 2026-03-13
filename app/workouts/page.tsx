"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { AppHeaderNav } from "@/components/AppHeaderNav";
import { STORAGE_KEYS, readJson, writeJson } from "@/lib/local-data";
import { recalculateAndPersistTodayTargets } from "@/lib/daily-targets";
import { calculateTrainingVolume, estimateCaloriesForType } from "@/lib/workouts";
import { buildWorkoutAdjustedSummary, calculateWorkoutPoints, deriveWeeklyWorkoutTargets, getCurrentWeekDateKeys, withStoredWorkoutPoints } from "@/lib/workout-execution";
import {
  CardioExercise,
  CrossfitExercise,
  FitnessExercise,
  ProfileInput,
  MovementType,
  MuscleGroup,
  WorkoutDay,
  WorkoutExercise,
  WorkoutExerciseType,
  WorkoutException,
  WorkoutExceptionType,
  WorkoutIntensity,
  WorkoutProgressEntry,
  WorkoutWeekPlan
} from "@/lib/types";

const dayOrder: WorkoutDay[] = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

const dayLabels: Record<WorkoutDay, string> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday"
};

const muscleGroupOptions: Array<{ value: MuscleGroup; label: string }> = [
  { value: "chest", label: "Chest" },
  { value: "back", label: "Back" },
  { value: "shoulders", label: "Shoulders" },
  { value: "biceps", label: "Biceps" },
  { value: "triceps", label: "Triceps" },
  { value: "quads", label: "Quads" },
  { value: "hamstrings", label: "Hamstrings" },
  { value: "glutes", label: "Glutes" },
  { value: "calves", label: "Calves" },
  { value: "core", label: "Core" },
  { value: "full_body", label: "Full Body" }
];

const movementTypeOptions: Array<{ value: MovementType; label: string }> = [
  { value: "powerlifting", label: "Powerlifting" },
  { value: "gymnastics", label: "Gymnastics" },
  { value: "conditioning", label: "Conditioning" },
  { value: "functional", label: "Functional" }
];

const movementTypeLabels: Record<MovementType, string> = {
  powerlifting: "Powerlifting",
  gymnastics: "Gymnastics",
  conditioning: "Conditioning",
  functional: "Functional"
};

const muscleGroupLabels: Record<MuscleGroup, string> = {
  chest: "Chest",
  back: "Back",
  shoulders: "Shoulders",
  biceps: "Biceps",
  triceps: "Triceps",
  quads: "Quads",
  hamstrings: "Hamstrings",
  glutes: "Glutes",
  calves: "Calves",
  core: "Core",
  full_body: "Full Body"
};

const typeIcons: Record<WorkoutExerciseType, string> = {
  cardio: "🏃",
  fitness: "🏋️",
  crossfit: "🔥"
};

function matchesTypeFilter(exercise: WorkoutExercise, filter: "all" | "fitness" | "cardio" | "crossfit") {
  if (filter === "all") return true;
  if (filter === "fitness") return exercise.type === "fitness";
  if (filter === "crossfit") return exercise.type === "crossfit";
  return exercise.type === "cardio" || (exercise.type === "crossfit" && exercise.movementType === "conditioning");
}

function getExerciseMainFilterGroup(exercise: WorkoutExercise): "fitness" | "cardio" | "crossfit" {
  if (exercise.type === "fitness") return "fitness";
  if (exercise.type === "crossfit" && exercise.movementType !== "conditioning") return "crossfit";
  return "cardio";
}

function inferExerciseDefaults(name: string): Partial<PlannerDraft> {
  const value = name.toLowerCase().trim();
  if (!value) return {};

  if (/run|jog|bike|cycle|walk|row|swim|elliptical|stair/.test(value)) {
    return { type: "cardio", movementType: "conditioning", muscleGroup: "full_body" };
  }

  if (/burpee|thruster|snatch|clean|jerk|amrap|metcon|wod|wall ball/.test(value)) {
    return { type: "crossfit", movementType: "conditioning", muscleGroup: "full_body" };
  }

  if (/bench|push up|fly|chest press/.test(value)) return { type: "fitness", muscleGroup: "chest" };
  if (/pull|lat|row/.test(value)) return { type: "fitness", muscleGroup: "back" };
  if (/shoulder|overhead press|lateral raise/.test(value)) return { type: "fitness", muscleGroup: "shoulders" };
  if (/curl/.test(value)) return { type: "fitness", muscleGroup: "biceps" };
  if (/tricep|dip|pushdown|skull/.test(value)) return { type: "fitness", muscleGroup: "triceps" };
  if (/squat|leg press|lunge/.test(value)) return { type: "fitness", muscleGroup: "quads" };
  if (/hamstring|rdl|deadlift/.test(value)) return { type: "fitness", muscleGroup: "hamstrings" };
  if (/glute|hip thrust/.test(value)) return { type: "fitness", muscleGroup: "glutes" };
  if (/calf/.test(value)) return { type: "fitness", muscleGroup: "calves" };
  if (/plank|crunch|core|ab/.test(value)) return { type: "fitness", muscleGroup: "core" };

  return {};
}

function formatPercentChange(current: number | undefined, previous: number | undefined) {
  if (typeof current !== "number" || typeof previous !== "number") return null;
  if (previous === 0) {
    if (current === 0) return 0;
    return 100;
  }

  return Math.round(((current - previous) / Math.abs(previous)) * 100);
}

function getAmsterdamToday(): WorkoutDay {
  const weekday = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    timeZone: "Europe/Amsterdam"
  })
    .format(new Date())
    .toLowerCase();

  if (weekday in dayLabels) return weekday as WorkoutDay;
  return "monday";
}

function createDefaultPlan(): WorkoutWeekPlan {
  return {
    monday: { notes: "", exercises: [] },
    tuesday: { notes: "", exercises: [] },
    wednesday: { notes: "", exercises: [] },
    thursday: { notes: "", exercises: [] },
    friday: { notes: "", exercises: [] },
    saturday: { notes: "", exercises: [] },
    sunday: { notes: "", exercises: [] }
  };
}

type PlannerDraft = {
  type: WorkoutExerciseType;
  name: string;
  durationMinutes: number;
  sets: number;
  reps: number;
  weight: number;
  intensity: WorkoutIntensity;
  notes: string;
  muscleGroup: MuscleGroup;
  movementType: MovementType;
  crossfitUseDuration: boolean;
  crossfitUseSets: boolean;
  crossfitUseReps: boolean;
  crossfitUseWeight: boolean;
};

const defaultDraft: PlannerDraft = {
  type: "fitness",
  name: "",
  durationMinutes: 20,
  sets: 3,
  reps: 10,
  weight: 20,
  intensity: "moderate",
  notes: "",
  muscleGroup: "full_body",
  movementType: "conditioning",
  crossfitUseDuration: true,
  crossfitUseSets: false,
  crossfitUseReps: false,
  crossfitUseWeight: false
};

function toProgressEntry(exercise: WorkoutExercise): WorkoutProgressEntry {
  return {
    recordedAt: new Date().toISOString(),
    durationMinutes: "durationMinutes" in exercise ? exercise.durationMinutes : undefined,
    intensity: exercise.intensity,
    estimatedCalories: exercise.estimatedCalories,
    sets: "sets" in exercise ? exercise.sets : undefined,
    reps: "reps" in exercise ? exercise.reps : undefined,
    weight: "weight" in exercise ? exercise.weight : undefined,
    trainingVolume: exercise.trainingVolume,
    notes: exercise.notes
  };
}

function getHistory(exercise: WorkoutExercise) {
  return Array.isArray((exercise as { progressHistory?: WorkoutProgressEntry[] }).progressHistory)
    ? (exercise as { progressHistory: WorkoutProgressEntry[] }).progressHistory
    : [];
}

function ensureCalories(exercise: WorkoutExercise, weightKg: number) {
  if (exercise.estimatedCalories > 0) return Math.round(exercise.estimatedCalories);

  if (exercise.type === "cardio") {
    return estimateCaloriesForType({
      type: "cardio",
      weightKg,
      name: exercise.name,
      durationMinutes: Math.max(1, exercise.durationMinutes),
      intensity: exercise.intensity
    });
  }

  if (exercise.type === "fitness") {
    return estimateCaloriesForType({
      type: "fitness",
      weightKg,
      name: exercise.name,
      sets: Math.max(1, exercise.sets),
      reps: Math.max(1, exercise.reps),
      weight: Math.max(0, exercise.weight),
      intensity: exercise.intensity
    });
  }

  return estimateCaloriesForType({
    type: "crossfit",
    weightKg,
    name: exercise.name,
    durationMinutes: Math.max(1, exercise.durationMinutes),
    intensity: exercise.intensity
  });
}

function normalizePlanWithMetrics(plan: WorkoutWeekPlan, weightKg: number): WorkoutWeekPlan {
  const normalized = { ...plan };

  for (const day of dayOrder) {
    normalized[day] = {
      ...plan[day],
      exercises: (plan[day]?.exercises ?? []).map((exercise) => {
        if (exercise.systemTag === "daily_steps") return null;
        const withPoints = withStoredWorkoutPoints(exercise);
        const normalizedLabels = {
          muscleGroup: withPoints.muscleGroup ?? "full_body",
          movementType: withPoints.type === "cardio" ? "conditioning" : withPoints.movementType
        };
        return {
          ...withPoints,
          ...normalizedLabels,
          estimatedCalories: ensureCalories(withPoints, weightKg)
        };
      }).filter(Boolean) as WorkoutExercise[]
    };
  }

  return normalized;
}

export default function WorkoutsPage() {
  const [plan, setPlan] = useState<WorkoutWeekPlan>(createDefaultPlan());
  const [selectedDay, setSelectedDay] = useState<WorkoutDay>(getAmsterdamToday());
  const [draft, setDraft] = useState<PlannerDraft>(defaultDraft);
  const [editingExerciseId, setEditingExerciseId] = useState<string | null>(null);
  const [deleteExerciseId, setDeleteExerciseId] = useState<string | null>(null);
  const [progressExerciseId, setProgressExerciseId] = useState<string | null>(null);
  const [profileWeight, setProfileWeight] = useState(70);
  const [profile, setProfile] = useState<ProfileInput | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [exceptions, setExceptions] = useState<WorkoutException[]>([]);
  const [isExceptionsOpen, setIsExceptionsOpen] = useState(false);
  const [exceptionType, setExceptionType] = useState<WorkoutExceptionType>("missed");
  const [exceptionDate, setExceptionDate] = useState(new Date().toISOString().slice(0, 10));
  const [exceptionNewDate, setExceptionNewDate] = useState(new Date().toISOString().slice(0, 10));
  const [exceptionOriginalWorkoutId, setExceptionOriginalWorkoutId] = useState("");
  const [exceptionExerciseName, setExceptionExerciseName] = useState("");
  const [exceptionExerciseType, setExceptionExerciseType] = useState<WorkoutExerciseType>("fitness");
  const [exceptionDuration, setExceptionDuration] = useState(20);
  const [exceptionSets, setExceptionSets] = useState(3);
  const [exceptionReps, setExceptionReps] = useState(10);
  const [exceptionWeight, setExceptionWeight] = useState(20);
  const [exceptionIntensity, setExceptionIntensity] = useState<WorkoutIntensity>("moderate");
  const [typeFilter, setTypeFilter] = useState<"all" | "fitness" | "cardio" | "crossfit">("all");
  const [subFilter, setSubFilter] = useState<string>("all");
  const [hasLoadedInitialData, setHasLoadedInitialData] = useState(false);

  useEffect(() => {
    const savedPlan = readJson<WorkoutWeekPlan>(STORAGE_KEYS.workouts);
    const savedProfile = readJson<ProfileInput>(STORAGE_KEYS.profile);
    const savedExceptions = readJson<WorkoutException[]>(STORAGE_KEYS.workoutExceptions) ?? [];

    const profileWeightKg = savedProfile?.weightKg ?? 70;
    if (savedPlan) setPlan(normalizePlanWithMetrics(savedPlan, profileWeightKg));
    if (savedProfile?.weightKg) setProfileWeight(savedProfile.weightKg);
    if (savedProfile) setProfile(savedProfile);
    setExceptions(savedExceptions);
    setHasLoadedInitialData(true);
  }, []);

  useEffect(() => {
    writeJson(STORAGE_KEYS.workouts, plan);
  }, [plan]);

  useEffect(() => {
    writeJson(STORAGE_KEYS.workoutExceptions, exceptions);
  }, [exceptions]);

  useEffect(() => {
    if (!hasLoadedInitialData) return;
    recalculateAndPersistTodayTargets({
      profile,
      workouts: plan,
      exceptions
    });
  }, [exceptions, hasLoadedInitialData, plan, profile]);

  function resetDraft(type: WorkoutExerciseType = "fitness") {
    if (type === "crossfit") {
      setDraft({ ...defaultDraft, type, durationMinutes: 0, sets: 0, reps: 0, weight: 0, movementType: "conditioning" });
    } else {
      setDraft({ ...defaultDraft, type });
    }
    setEditingExerciseId(null);
  }

  const selectedExercises = useMemo(
    () => plan[selectedDay].exercises.filter((exercise) => !exercise.isPaused),
    [plan, selectedDay]
  );

  const availableTypeFilters = useMemo(() => {
    const available: Array<"fitness" | "cardio" | "crossfit"> = [];
    if (selectedExercises.some((exercise) => exercise.type === "fitness")) available.push("fitness");
    if (selectedExercises.some((exercise) => exercise.type === "cardio" || (exercise.type === "crossfit" && exercise.movementType === "conditioning"))) available.push("cardio");
    if (selectedExercises.some((exercise) => exercise.type === "crossfit")) available.push("crossfit");
    return available;
  }, [selectedExercises]);

  const availableSubFilters = useMemo(() => {
    const values = new Set<string>();
    for (const exercise of selectedExercises) {
      if (!matchesTypeFilter(exercise, typeFilter)) continue;
      if (exercise.muscleGroup) values.add(exercise.muscleGroup);
      if (exercise.movementType) values.add(exercise.movementType);
    }
    return Array.from(values);
  }, [selectedExercises, typeFilter]);


  useEffect(() => {
    if (subFilter === "all") return;
    if (!availableSubFilters.includes(subFilter)) {
      setSubFilter("all");
    }
  }, [availableSubFilters, subFilter]);

  const filteredExercises = useMemo(() => {
    const sorted = selectedExercises
      .filter((exercise) => {
        const matchType = matchesTypeFilter(exercise, typeFilter);
        const matchSub = subFilter === "all" ? true : exercise.muscleGroup === subFilter || exercise.movementType === subFilter;
        return matchType && matchSub;
      })
      .sort((a, b) => {
        const typeOrder: Record<"fitness" | "cardio" | "crossfit", number> = { fitness: 0, cardio: 1, crossfit: 2 };
        const aType = getExerciseMainFilterGroup(a);
        const bType = getExerciseMainFilterGroup(b);

        if (aType !== bType) return typeOrder[aType] - typeOrder[bType];

        const aSub = a.muscleGroup ? muscleGroupLabels[a.muscleGroup] : a.movementType ? movementTypeLabels[a.movementType] : "";
        const bSub = b.muscleGroup ? muscleGroupLabels[b.muscleGroup] : b.movementType ? movementTypeLabels[b.movementType] : "";

        if (aSub !== bSub) return aSub.localeCompare(bSub);
        return a.name.localeCompare(b.name);
      });

    return sorted;
  }, [selectedExercises, subFilter, typeFilter]);

  const progressExercise = useMemo(
    () => selectedExercises.find((exercise) => exercise.id === progressExerciseId) ?? null,
    [selectedExercises, progressExerciseId]
  );

  const previousProgresses = useMemo(() => {
    if (!progressExercise) return [];
    const history = getHistory(progressExercise);
    return history.slice(-2).reverse();
  }, [progressExercise]);

  const latestPreviousProgress = previousProgresses[0];

  const progressComparisons = useMemo(() => {
    if (!latestPreviousProgress) return [] as Array<{ label: string; value: number | null }>;

    return [
      { label: "Duration", value: formatPercentChange(draft.durationMinutes, latestPreviousProgress.durationMinutes) },
      { label: "Sets", value: formatPercentChange(draft.sets, latestPreviousProgress.sets) },
      { label: "Reps", value: formatPercentChange(draft.reps, latestPreviousProgress.reps) },
      { label: "Weight", value: formatPercentChange(draft.weight, latestPreviousProgress.weight) }
    ];
  }, [draft.durationMinutes, draft.reps, draft.sets, draft.weight, latestPreviousProgress]);

  const selectedDaySummary = useMemo(() => {
    return selectedExercises.reduce(
      (sum, exercise) => ({
        strengthPoints: sum.strengthPoints + exercise.strengthPoints,
        cardioPoints: sum.cardioPoints + exercise.cardioPoints,
        calories: sum.calories + ensureCalories(exercise, profileWeight)
      }),
      { strengthPoints: 0, cardioPoints: 0, calories: 0 }
    );
  }, [profileWeight, selectedExercises]);

  const weekDateKeys = useMemo(() => getCurrentWeekDateKeys(), []);

  const adjustedSummary = useMemo(
    () => buildWorkoutAdjustedSummary(plan, exceptions, weekDateKeys),
    [plan, exceptions, weekDateKeys]
  );

  const weeklyTargets = useMemo(() => deriveWeeklyWorkoutTargets(profile), [profile]);

  const plannedOptionsForExceptionDay = useMemo(() => {
    const day = new Date(`${exceptionDate}T00:00:00`).toLocaleDateString("en-US", { weekday: "long" }).toLowerCase() as WorkoutDay;
    return (plan[day]?.exercises ?? []).filter((exercise) => !exercise.isPaused);
  }, [exceptionDate, plan]);

  function setDraftField<K extends keyof PlannerDraft>(key: K, value: PlannerDraft[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function validateDraft() {
    if (!draft.name.trim()) return "Please provide an exercise name.";

    if (draft.type === "cardio") {
      if (draft.durationMinutes <= 0) return "Please provide a valid duration.";
      return null;
    }

    if (draft.type === "fitness") {
      if (draft.sets <= 0 || draft.reps <= 0) return "Please provide valid sets and reps.";
      return null;
    }

    const enabled = [draft.durationMinutes, draft.sets, draft.reps, draft.weight].some((value) => value > 0);
    if (!enabled) return "Set at least one CrossFit value above 0 (duration, sets, reps, or weight).";

    if (draft.durationMinutes < 0 || draft.sets < 0 || draft.reps < 0 || draft.weight < 0) {
      return "CrossFit values cannot be negative.";
    }

    return null;
  }

  function saveExercise(event: FormEvent) {
    event.preventDefault();

    const validationError = validateDraft();
    if (validationError) {
      setMessage(validationError);
      return;
    }

    const now = new Date().toISOString();
    const shared = {
      name: draft.name.trim(),
      notes: draft.notes.trim(),
      intensity: draft.intensity,
      muscleGroup: draft.muscleGroup,
      movementType: draft.type === "cardio" ? "conditioning" : draft.type === "crossfit" ? draft.movementType : undefined,
      workoutDayId: selectedDay,
      updatedAt: now,
      isPaused: false
    };

    let nextExercise: WorkoutExercise;

    if (draft.type === "cardio") {
      const estimatedCalories = estimateCaloriesForType({
        type: "cardio",
        weightKg: profileWeight,
        name: draft.name,
        durationMinutes: draft.durationMinutes,
        intensity: draft.intensity
      });

      const existing = editingExerciseId
        ? plan[selectedDay].exercises.find((exercise) => exercise.id === editingExerciseId && exercise.type === "cardio")
        : null;

      const points = calculateWorkoutPoints({
        id: editingExerciseId ?? crypto.randomUUID(),
        type: "cardio",
        durationMinutes: draft.durationMinutes,
        estimatedCalories,
        trainingVolume: 0,
        strengthPoints: 0,
        cardioPoints: 0,
        createdAt: existing?.createdAt ?? now,
        progressHistory: existing ? [...getHistory(existing), toProgressEntry(existing)] : [],
        ...shared
      } as CardioExercise);

      nextExercise = {
        id: editingExerciseId ?? crypto.randomUUID(),
        type: "cardio",
        durationMinutes: draft.durationMinutes,
        estimatedCalories,
        trainingVolume: 0,
        strengthPoints: points.strengthPoints,
        cardioPoints: points.cardioPoints,
        createdAt: existing?.createdAt ?? now,
        progressHistory: existing ? [...getHistory(existing), toProgressEntry(existing)] : [],
        ...shared
      } as CardioExercise;
    } else if (draft.type === "crossfit") {
      const duration = draft.durationMinutes > 0 ? draft.durationMinutes : 0;
      const sets = draft.sets > 0 ? draft.sets : undefined;
      const reps = draft.reps > 0 ? draft.reps : undefined;
      const weight = draft.weight > 0 ? draft.weight : undefined;

      const estimatedCalories = estimateCaloriesForType({
        type: "crossfit",
        weightKg: profileWeight,
        name: draft.name,
        durationMinutes: duration,
        intensity: draft.intensity
      });

      const trainingVolume = calculateTrainingVolume(sets, reps, weight);

      const existing = editingExerciseId
        ? plan[selectedDay].exercises.find((exercise) => exercise.id === editingExerciseId && exercise.type === "crossfit")
        : null;

      const points = calculateWorkoutPoints({
        id: editingExerciseId ?? crypto.randomUUID(),
        type: "crossfit",
        durationMinutes: duration,
        weight,
        sets,
        reps,
        trainingVolume,
        estimatedCalories,
        strengthPoints: 0,
        cardioPoints: 0,
        createdAt: existing?.createdAt ?? now,
        progressHistory: existing ? [...getHistory(existing), toProgressEntry(existing)] : [],
        ...shared
      } as CrossfitExercise);

      nextExercise = {
        id: editingExerciseId ?? crypto.randomUUID(),
        type: "crossfit",
        durationMinutes: duration,
        weight,
        sets,
        reps,
        trainingVolume,
        estimatedCalories,
        strengthPoints: points.strengthPoints,
        cardioPoints: points.cardioPoints,
        createdAt: existing?.createdAt ?? now,
        progressHistory: existing ? [...getHistory(existing), toProgressEntry(existing)] : [],
        ...shared
      } as CrossfitExercise;
    } else {
      const trainingVolume = calculateTrainingVolume(draft.sets, draft.reps, draft.weight);
      const estimatedCalories = estimateCaloriesForType({
        type: "fitness",
        weightKg: profileWeight,
        name: draft.name,
        sets: draft.sets,
        reps: draft.reps,
        weight: draft.weight,
        intensity: draft.intensity
      });

      const existing = editingExerciseId
        ? plan[selectedDay].exercises.find((exercise) => exercise.id === editingExerciseId && exercise.type === "fitness")
        : null;

      const points = calculateWorkoutPoints({
        id: editingExerciseId ?? crypto.randomUUID(),
        type: "fitness",
        sets: draft.sets,
        reps: draft.reps,
        weight: draft.weight,
        trainingVolume,
        estimatedCalories,
        strengthPoints: 0,
        cardioPoints: 0,
        createdAt: existing?.createdAt ?? now,
        progressHistory: existing ? [...getHistory(existing), toProgressEntry(existing)] : [],
        ...shared
      } as FitnessExercise);

      nextExercise = {
        id: editingExerciseId ?? crypto.randomUUID(),
        type: "fitness",
        sets: draft.sets,
        reps: draft.reps,
        weight: draft.weight,
        trainingVolume,
        estimatedCalories,
        strengthPoints: points.strengthPoints,
        cardioPoints: points.cardioPoints,
        createdAt: existing?.createdAt ?? now,
        progressHistory: existing ? [...getHistory(existing), toProgressEntry(existing)] : [],
        ...shared
      } as FitnessExercise;
    }

    setPlan((prev) => {
      const dayLog = prev[selectedDay];
      const exercises = editingExerciseId
        ? dayLog.exercises.map((exercise) => (exercise.id === editingExerciseId ? nextExercise : exercise))
        : [nextExercise, ...dayLog.exercises];
      return { ...prev, [selectedDay]: { ...dayLog, exercises } };
    });

    const wasProgressSave = Boolean(progressExerciseId);
    setMessage(editingExerciseId ? "Exercise updated." : "Exercise saved.");

    if (wasProgressSave) {
      closeProgress();
      return;
    }

    resetDraft(draft.type);
  }

  function startEdit(exercise: WorkoutExercise) {
    setEditingExerciseId(exercise.id);
    setDraft({
      type: exercise.type,
      name: exercise.name,
      durationMinutes: "durationMinutes" in exercise ? exercise.durationMinutes : 20,
      sets: "sets" in exercise && typeof exercise.sets === "number" ? exercise.sets : 3,
      reps: "reps" in exercise && typeof exercise.reps === "number" ? exercise.reps : 10,
      weight: "weight" in exercise && typeof exercise.weight === "number" ? exercise.weight : 0,
      intensity: exercise.intensity ?? "moderate",
      notes: exercise.notes ?? "",
      muscleGroup: exercise.muscleGroup ?? "full_body",
      movementType: exercise.movementType ?? "conditioning",
      crossfitUseDuration: exercise.type === "crossfit" ? exercise.durationMinutes > 0 : true,
      crossfitUseSets: exercise.type === "crossfit" ? typeof exercise.sets === "number" : false,
      crossfitUseReps: exercise.type === "crossfit" ? typeof exercise.reps === "number" : false,
      crossfitUseWeight: exercise.type === "crossfit" ? typeof exercise.weight === "number" : false
    });
  }

  function confirmDelete() {
    if (!deleteExerciseId) return;
    setPlan((prev) => {
      const dayLog = prev[selectedDay];
      return {
        ...prev,
        [selectedDay]: {
          ...dayLog,
          exercises: dayLog.exercises.filter((exercise) => exercise.id !== deleteExerciseId)
        }
      };
    });
    setDeleteExerciseId(null);
    setMessage("Exercise deleted.");
  }

  function openProgress(exercise: WorkoutExercise) {
    startEdit(exercise);
    setProgressExerciseId(exercise.id);
  }

  function closeProgress() {
    setProgressExerciseId(null);
    setEditingExerciseId(null);
  }

  function createExerciseFromException(type: WorkoutExerciseType): WorkoutExercise {
    const now = new Date().toISOString();

    if (type === "cardio") {
      const estimatedCalories = estimateCaloriesForType({
        type: "cardio",
        weightKg: profileWeight,
        name: exceptionExerciseName,
        durationMinutes: Math.max(1, exceptionDuration),
        intensity: exceptionIntensity
      });

      const baseExercise = {
        id: crypto.randomUUID(),
        type: "cardio",
        workoutDayId: selectedDay,
        name: exceptionExerciseName.trim(),
        durationMinutes: Math.max(1, exceptionDuration),
        intensity: exceptionIntensity,
        trainingVolume: 0,
        estimatedCalories,
        strengthPoints: 0,
        cardioPoints: 0,
        notes: "",
        muscleGroup: "full_body",
        movementType: "conditioning",
        progressHistory: [],
        createdAt: now,
        updatedAt: now,
        isPaused: false
      } as CardioExercise;

      const points = calculateWorkoutPoints(baseExercise);
      return { ...baseExercise, ...points };
    }

    if (type === "crossfit") {
      const duration = Math.max(0, exceptionDuration);
      const sets = exceptionSets > 0 ? exceptionSets : undefined;
      const reps = exceptionReps > 0 ? exceptionReps : undefined;
      const weight = exceptionWeight > 0 ? exceptionWeight : undefined;

      const baseExercise = {
        id: crypto.randomUUID(),
        type: "crossfit",
        workoutDayId: selectedDay,
        name: exceptionExerciseName.trim(),
        durationMinutes: duration,
        sets,
        reps,
        weight,
        trainingVolume: calculateTrainingVolume(sets, reps, weight),
        estimatedCalories: estimateCaloriesForType({
          type: "crossfit",
          weightKg: profileWeight,
          name: exceptionExerciseName,
          durationMinutes: duration,
          intensity: exceptionIntensity
        }),
        strengthPoints: 0,
        cardioPoints: 0,
        notes: "",
        muscleGroup: "full_body",
        movementType: "functional",
        intensity: exceptionIntensity,
        progressHistory: [],
        createdAt: now,
        updatedAt: now,
        isPaused: false
      } as CrossfitExercise;

      const points = calculateWorkoutPoints(baseExercise);
      return { ...baseExercise, ...points };
    }

    const baseExercise = {
      id: crypto.randomUUID(),
      type: "fitness",
      workoutDayId: selectedDay,
      name: exceptionExerciseName.trim(),
      sets: Math.max(1, exceptionSets),
      reps: Math.max(1, exceptionReps),
      weight: Math.max(0, exceptionWeight),
      trainingVolume: calculateTrainingVolume(Math.max(1, exceptionSets), Math.max(1, exceptionReps), Math.max(0, exceptionWeight)),
      estimatedCalories: estimateCaloriesForType({
        type: "fitness",
        weightKg: profileWeight,
        name: exceptionExerciseName,
        sets: Math.max(1, exceptionSets),
        reps: Math.max(1, exceptionReps),
        weight: Math.max(0, exceptionWeight),
        intensity: exceptionIntensity
      }),
      strengthPoints: 0,
      cardioPoints: 0,
      notes: "",
      muscleGroup: "full_body",
      movementType: undefined,
      intensity: exceptionIntensity,
      progressHistory: [],
      createdAt: now,
      updatedAt: now,
      isPaused: false
    } as FitnessExercise;

    const points = calculateWorkoutPoints(baseExercise);
    return { ...baseExercise, ...points };
  }

  function saveException(event: FormEvent) {
    event.preventDefault();

    if ((exceptionType === "missed" || exceptionType === "replaced" || exceptionType === "rescheduled") && !exceptionOriginalWorkoutId) {
      setMessage("Select a planned workout for this exception.");
      return;
    }

    if ((exceptionType === "extra" || exceptionType === "replaced") && !exceptionExerciseName.trim()) {
      setMessage("Provide a workout title for extra/replacement workout.");
      return;
    }

    if (exceptionType === "rescheduled" && !exceptionNewDate) {
      setMessage("Choose a new date for rescheduled workout.");
      return;
    }

    const now = new Date().toISOString();
    const payload: WorkoutException = {
      id: crypto.randomUUID(),
      date: exceptionDate,
      exceptionType,
      originalWorkoutId: exceptionOriginalWorkoutId || undefined,
      newDate: exceptionType === "rescheduled" ? exceptionNewDate : undefined,
      replacementWorkoutData: exceptionType === "replaced" ? createExerciseFromException(exceptionExerciseType) : undefined,
      extraWorkoutData: exceptionType === "extra" ? createExerciseFromException(exceptionExerciseType) : undefined,
      createdAt: now,
      updatedAt: now
    };

    setExceptions((prev) => [payload, ...prev]);
    setMessage("Workout exception saved.");
    setIsExceptionsOpen(false);
    setExceptionOriginalWorkoutId("");
    setExceptionExerciseName("");
  }

  return (
    <>
      {deleteExerciseId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl ring-1 ring-slate-200">
            <h3 className="text-lg font-semibold text-slate-900">Delete exercise?</h3>
            <p className="mt-2 text-sm text-slate-600">This removes the exercise from the weekly plan.</p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setDeleteExerciseId(null)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">Cancel</button>
              <button type="button" onClick={confirmDelete} className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-500">Delete</button>
            </div>
          </div>
        </div>
      ) : null}

      {isExceptionsOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl ring-1 ring-slate-200">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-xl font-semibold text-slate-900">Workout Exceptions</h3>
                <p className="text-sm text-slate-500">Only log differences from your weekly plan.</p>
              </div>
              <button type="button" onClick={() => setIsExceptionsOpen(false)} className="rounded-md p-1 text-slate-400 hover:bg-slate-100">✕</button>
            </div>

            <form onSubmit={saveException} className="mt-4 space-y-4">
              <label className="block text-sm text-slate-700">Exception type
                <select className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" value={exceptionType} onChange={(e) => setExceptionType(e.target.value as WorkoutExceptionType)}>
                  <option value="missed">Missed Workout</option>
                  <option value="extra">Extra Workout</option>
                  <option value="replaced">Replaced Workout</option>
                  <option value="rescheduled">Rescheduled Workout</option>
                </select>
              </label>

              <label className="block text-sm text-slate-700">Date
                <input type="date" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" value={exceptionDate} onChange={(e) => setExceptionDate(e.target.value)} />
              </label>

              {(exceptionType === "missed" || exceptionType === "replaced" || exceptionType === "rescheduled") ? (
                <label className="block text-sm text-slate-700">Planned workout
                  <select className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" value={exceptionOriginalWorkoutId} onChange={(e) => setExceptionOriginalWorkoutId(e.target.value)}>
                    <option value="">Select workout</option>
                    {plannedOptionsForExceptionDay.map((exercise) => (<option key={exercise.id} value={exercise.id}>{exercise.name} ({exercise.type})</option>))}
                  </select>
                </label>
              ) : null}

              {exceptionType === "rescheduled" ? (
                <label className="block text-sm text-slate-700">New date
                  <input type="date" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" value={exceptionNewDate} onChange={(e) => setExceptionNewDate(e.target.value)} />
                </label>
              ) : null}

              {(exceptionType === "extra" || exceptionType === "replaced") ? (
                <div className="space-y-3 rounded-xl border border-slate-200 p-4">
                  <label className="block text-sm text-slate-700">Workout title
                    <input className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" value={exceptionExerciseName} onChange={(e) => setExceptionExerciseName(e.target.value)} />
                  </label>
                  <label className="block text-sm text-slate-700">Type
                    <select className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" value={exceptionExerciseType} onChange={(e) => setExceptionExerciseType(e.target.value as WorkoutExerciseType)}>
                      <option value="cardio">Cardio</option>
                      <option value="fitness">Fitness</option>
                      <option value="crossfit">CrossFit</option>
                    </select>
                  </label>
                  {(exceptionExerciseType === "cardio" || exceptionExerciseType === "crossfit") ? <label className="block text-sm text-slate-700">Duration (minutes)<input type="number" min={0} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" value={exceptionDuration} onChange={(e)=>setExceptionDuration(Number(e.target.value))} /></label> : null}
                  {(exceptionExerciseType === "fitness" || exceptionExerciseType === "crossfit") ? <div className="grid gap-3 sm:grid-cols-3"><label className="text-sm text-slate-700">Sets<input type="number" min={0} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" value={exceptionSets} onChange={(e)=>setExceptionSets(Number(e.target.value))} /></label><label className="text-sm text-slate-700">Reps<input type="number" min={0} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" value={exceptionReps} onChange={(e)=>setExceptionReps(Number(e.target.value))} /></label><label className="text-sm text-slate-700">Weight (kg)<input type="number" min={0} step="0.5" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" value={exceptionWeight} onChange={(e)=>setExceptionWeight(Number(e.target.value))} /></label></div> : null}
                  <label className="block text-sm text-slate-700">Intensity
                    <select className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" value={exceptionIntensity} onChange={(e)=>setExceptionIntensity(e.target.value as WorkoutIntensity)}>
                      <option value="low">Low</option><option value="moderate">Moderate</option><option value="high">High</option>
                    </select>
                  </label>
                </div>
              ) : null}

              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setIsExceptionsOpen(false)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">Cancel</button>
                <button type="submit" className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-400">Save Exception</button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {progressExercise ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl ring-1 ring-slate-200">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-xl font-semibold text-slate-900">Exercise Progress</h3>
                <p className="text-sm text-slate-500">{progressExercise.name}</p>
                {previousProgresses.length ? (
                  <div className="mt-2 space-y-1">
                    {previousProgresses.map((entry, index) => (
                      <p key={`${entry.recordedAt}-${index}`} className="text-xs text-slate-500">
                        Previous {index + 1}:
                        {typeof entry.durationMinutes === "number" ? ` ${entry.durationMinutes} min` : ""}
                        {typeof entry.sets === "number" ? ` • ${entry.sets} sets` : ""}
                        {typeof entry.reps === "number" ? ` • ${entry.reps} reps` : ""}
                        {typeof entry.weight === "number" ? ` • ${entry.weight} kg` : ""}
                        {entry.notes ? ` • ${entry.notes}` : ""}
                      </p>
                    ))}
                  </div>
                ) : null}

                {latestPreviousProgress ? (
                  <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Growth vs previous entry</p>
                    <div className="mt-2 grid gap-2 sm:grid-cols-4">
                      {progressComparisons.map((item) => {
                        const value = item.value;
                        const isPositive = (value ?? 0) > 0;
                        const isNegative = (value ?? 0) < 0;

                        return (
                          <div key={item.label} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                            <p className="text-[11px] uppercase tracking-wide text-slate-500">{item.label}</p>
                            <p className={`text-sm font-semibold ${isPositive ? "text-emerald-600" : isNegative ? "text-rose-600" : "text-slate-700"}`}>
                              {value === null ? "n/a" : `${value > 0 ? "+" : ""}${value}%`}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </div>
              <button type="button" onClick={closeProgress} className="rounded-md p-1 text-slate-400 hover:bg-slate-100">✕</button>
            </div>

            <form onSubmit={saveExercise} className="mt-4 space-y-4">
              <label className="block text-sm text-slate-700">Exercise name / description
                <input className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" value={draft.name} onChange={(event) => setDraftField("name", event.target.value)} />
              </label>

              {draft.type === "cardio" ? (
                <label className="block text-sm text-slate-700">Duration (minutes)
                  <div className="mt-1 flex rounded-xl border border-slate-200">
                    <button type="button" onClick={() => setDraftField("durationMinutes", Math.max(0, draft.durationMinutes - 1))} className="px-3">-</button>
                    <input type="number" min={0} className="w-full border-x border-slate-200 px-2 py-2" value={draft.durationMinutes} onChange={(event) => setDraftField("durationMinutes", Number(event.target.value))} />
                    <button type="button" onClick={() => setDraftField("durationMinutes", draft.durationMinutes + 1)} className="px-3">+</button>
                  </div>
                </label>
              ) : null}

              {draft.type === "fitness" ? (
                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="text-sm text-slate-700">Sets
                    <div className="mt-1 flex rounded-xl border border-slate-200">
                      <button type="button" onClick={() => setDraftField("sets", Math.max(0, draft.sets - 1))} className="px-3">-</button>
                      <input type="number" min={0} className="w-full border-x border-slate-200 px-2 py-2" value={draft.sets} onChange={(event) => setDraftField("sets", Number(event.target.value))} />
                      <button type="button" onClick={() => setDraftField("sets", draft.sets + 1)} className="px-3">+</button>
                    </div>
                  </label>
                  <label className="text-sm text-slate-700">Reps
                    <div className="mt-1 flex rounded-xl border border-slate-200">
                      <button type="button" onClick={() => setDraftField("reps", Math.max(0, draft.reps - 1))} className="px-3">-</button>
                      <input type="number" min={0} className="w-full border-x border-slate-200 px-2 py-2" value={draft.reps} onChange={(event) => setDraftField("reps", Number(event.target.value))} />
                      <button type="button" onClick={() => setDraftField("reps", draft.reps + 1)} className="px-3">+</button>
                    </div>
                  </label>
                  <label className="text-sm text-slate-700">Weight (kg)
                    <div className="mt-1 flex rounded-xl border border-slate-200">
                      <button type="button" onClick={() => setDraftField("weight", Math.max(0, draft.weight - 2.5))} className="px-3">-</button>
                      <input type="number" min={0} step="0.5" className="w-full border-x border-slate-200 px-2 py-2" value={draft.weight} onChange={(event) => setDraftField("weight", Number(event.target.value))} />
                      <button type="button" onClick={() => setDraftField("weight", draft.weight + 2.5)} className="px-3">+</button>
                    </div>
                  </label>
                </div>
              ) : null}

              {draft.type === "crossfit" ? (
                <div className="space-y-3 rounded-xl border border-slate-200 p-3">
                  <p className="text-sm font-semibold text-slate-800">CrossFit fields</p>

                  <label className={`block rounded-lg border p-3 text-sm ${draft.crossfitUseDuration ? "border-emerald-200 bg-emerald-50/40 text-slate-700" : "border-slate-200 bg-slate-50 text-slate-500"}`}>
                    <span className="inline-flex items-center gap-2">
                      <input type="checkbox" checked={draft.crossfitUseDuration} onChange={(event) => setDraftField("crossfitUseDuration", event.target.checked)} />
                      Duration (minutes)
                    </span>
                    <div className={`mt-2 flex rounded-xl border ${draft.crossfitUseDuration ? "border-slate-200 bg-white" : "border-slate-200 bg-slate-100"}`}>
                      <button type="button" disabled={!draft.crossfitUseDuration} onClick={() => setDraftField("durationMinutes", Math.max(1, draft.durationMinutes - 1))} className="px-3 disabled:cursor-not-allowed disabled:opacity-50">-</button>
                      <input type="number" min={1} disabled={!draft.crossfitUseDuration} className="w-full border-x border-slate-200 px-2 py-2 disabled:bg-slate-100" value={draft.durationMinutes} onChange={(event) => setDraftField("durationMinutes", Number(event.target.value))} />
                      <button type="button" disabled={!draft.crossfitUseDuration} onClick={() => setDraftField("durationMinutes", draft.durationMinutes + 1)} className="px-3 disabled:cursor-not-allowed disabled:opacity-50">+</button>
                    </div>
                  </label>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <label className={`rounded-lg border p-3 text-sm ${draft.crossfitUseSets ? "border-emerald-200 bg-emerald-50/40 text-slate-700" : "border-slate-200 bg-slate-50 text-slate-500"}`}>
                      <span className="inline-flex items-center gap-2">
                        <input type="checkbox" checked={draft.crossfitUseSets} onChange={(event) => setDraftField("crossfitUseSets", event.target.checked)} />
                        Sets
                      </span>
                      <div className={`mt-2 flex rounded-xl border ${draft.crossfitUseSets ? "border-slate-200 bg-white" : "border-slate-200 bg-slate-100"}`}>
                        <button type="button" disabled={!draft.crossfitUseSets} onClick={() => setDraftField("sets", Math.max(1, draft.sets - 1))} className="px-3 disabled:cursor-not-allowed disabled:opacity-50">-</button>
                        <input type="number" min={1} disabled={!draft.crossfitUseSets} className="w-full border-x border-slate-200 px-2 py-2 disabled:bg-slate-100" value={draft.sets} onChange={(event) => setDraftField("sets", Number(event.target.value))} />
                        <button type="button" disabled={!draft.crossfitUseSets} onClick={() => setDraftField("sets", draft.sets + 1)} className="px-3 disabled:cursor-not-allowed disabled:opacity-50">+</button>
                      </div>
                    </label>

                    <label className={`rounded-lg border p-3 text-sm ${draft.crossfitUseReps ? "border-emerald-200 bg-emerald-50/40 text-slate-700" : "border-slate-200 bg-slate-50 text-slate-500"}`}>
                      <span className="inline-flex items-center gap-2">
                        <input type="checkbox" checked={draft.crossfitUseReps} onChange={(event) => setDraftField("crossfitUseReps", event.target.checked)} />
                        Reps
                      </span>
                      <div className={`mt-2 flex rounded-xl border ${draft.crossfitUseReps ? "border-slate-200 bg-white" : "border-slate-200 bg-slate-100"}`}>
                        <button type="button" disabled={!draft.crossfitUseReps} onClick={() => setDraftField("reps", Math.max(1, draft.reps - 1))} className="px-3 disabled:cursor-not-allowed disabled:opacity-50">-</button>
                        <input type="number" min={1} disabled={!draft.crossfitUseReps} className="w-full border-x border-slate-200 px-2 py-2 disabled:bg-slate-100" value={draft.reps} onChange={(event) => setDraftField("reps", Number(event.target.value))} />
                        <button type="button" disabled={!draft.crossfitUseReps} onClick={() => setDraftField("reps", draft.reps + 1)} className="px-3 disabled:cursor-not-allowed disabled:opacity-50">+</button>
                      </div>
                    </label>

                    <label className={`rounded-lg border p-3 text-sm ${draft.crossfitUseWeight ? "border-emerald-200 bg-emerald-50/40 text-slate-700" : "border-slate-200 bg-slate-50 text-slate-500"}`}>
                      <span className="inline-flex items-center gap-2">
                        <input type="checkbox" checked={draft.crossfitUseWeight} onChange={(event) => setDraftField("crossfitUseWeight", event.target.checked)} />
                        Weight (kg)
                      </span>
                      <div className={`mt-2 flex rounded-xl border ${draft.crossfitUseWeight ? "border-slate-200 bg-white" : "border-slate-200 bg-slate-100"}`}>
                        <button type="button" disabled={!draft.crossfitUseWeight} onClick={() => setDraftField("weight", Math.max(0, draft.weight - 2.5))} className="px-3 disabled:cursor-not-allowed disabled:opacity-50">-</button>
                        <input type="number" min={0} step="0.5" disabled={!draft.crossfitUseWeight} className="w-full border-x border-slate-200 px-2 py-2 disabled:bg-slate-100" value={draft.weight} onChange={(event) => setDraftField("weight", Number(event.target.value))} />
                        <button type="button" disabled={!draft.crossfitUseWeight} onClick={() => setDraftField("weight", draft.weight + 2.5)} className="px-3 disabled:cursor-not-allowed disabled:opacity-50">+</button>
                      </div>
                    </label>
                  </div>
                </div>
              ) : null}

              <label className="block text-sm text-slate-700">Notes
                <textarea className="mt-1 min-h-20 w-full rounded-xl border border-slate-200 px-3 py-2" value={draft.notes} onChange={(event) => setDraftField("notes", event.target.value)} />
              </label>

              <div className="flex justify-end gap-2">
                <button type="button" onClick={closeProgress} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">Close</button>
                <button type="submit" className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-400">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8 md:px-8">
        <AppHeaderNav />

        <section className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <p className="text-xs text-slate-500">Strength Progress</p>
            <p className="text-lg font-semibold text-slate-900">{adjustedSummary.strengthPoints} / {weeklyTargets.strengthPoints} points</p>
            <div className="mt-2 h-1.5 rounded-full bg-slate-200"><div className="h-1.5 rounded-full bg-emerald-500" style={{ width: `${Math.min(100, (adjustedSummary.strengthPoints / Math.max(weeklyTargets.strengthPoints, 1)) * 100)}%` }} /></div>
          </div>
          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <p className="text-xs text-slate-500">Cardio Progress</p>
            <p className="text-lg font-semibold text-slate-900">{adjustedSummary.cardioPoints} / {weeklyTargets.cardioPoints} points</p>
            <div className="mt-2 h-1.5 rounded-full bg-slate-200"><div className="h-1.5 rounded-full bg-sky-500" style={{ width: `${Math.min(100, (adjustedSummary.cardioPoints / Math.max(weeklyTargets.cardioPoints, 1)) * 100)}%` }} /></div>
          </div>
        </section>

        <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-3xl font-semibold text-slate-900">Workouts Planner</h1>
              <p className="mt-2 text-sm text-slate-500">Planned workouts are treated as completed by default. Only log exceptions when reality differed from plan.</p>
            </div>
            <button type="button" onClick={() => setIsExceptionsOpen(true)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Workout Exceptions</button>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-7">
            {dayOrder.map((day) => (
              <button
                key={day}
                type="button"
                onClick={() => setSelectedDay(day)}
                className={`rounded-xl border p-3 text-left transition ${selectedDay === day ? "border-emerald-500 bg-emerald-50" : "border-slate-200 hover:bg-slate-50"}`}
              >
                <p className="font-semibold text-slate-900">{dayLabels[day]}</p>
                <p className="text-xs text-slate-500">{plan[day].exercises.filter((e) => !e.isPaused).length} planned</p>
              </button>
            ))}
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.1fr,1.4fr]">
          <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <h2 className="text-xl font-semibold text-slate-900">{editingExerciseId ? "Edit Exercise" : "Add Exercise"}</h2>
            <p className="mt-1 text-sm text-slate-500">{dayLabels[selectedDay]}</p>

            <form onSubmit={saveExercise} className="mt-4 space-y-4">
              <label className="block text-sm text-slate-700">Exercise name / description
                <input className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" value={draft.name} onChange={(event) => {
                  const value = event.target.value;
                  const inferred = inferExerciseDefaults(value);
                  setDraft((prev) => {
                    const nextType = (inferred.type ?? prev.type) as WorkoutExerciseType;
                    return {
                      ...prev,
                      name: value,
                      ...inferred,
                      durationMinutes: nextType === "crossfit" ? 0 : prev.durationMinutes,
                      sets: nextType === "crossfit" ? 0 : prev.sets,
                      reps: nextType === "crossfit" ? 0 : prev.reps,
                      weight: nextType === "crossfit" ? 0 : prev.weight
                    };
                  });
                }} placeholder="e.g., Bench Press" />
              </label>

              <label className="block text-sm text-slate-700">Exercise type
                <select className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" value={draft.type} onChange={(event) => {
                  const nextType = event.target.value as WorkoutExerciseType;
                  if (nextType === "crossfit") {
                    setDraft((prev) => ({ ...prev, type: nextType, durationMinutes: 0, sets: 0, reps: 0, weight: 0, movementType: "conditioning" }));
                    return;
                  }
                  setDraftField("type", nextType);
                }}>
                  <option value="cardio">Cardio</option>
                  <option value="fitness">Fitness</option>
                  <option value="crossfit">CrossFit</option>
                </select>
              </label>

              {draft.type === "fitness" ? <label className="block text-sm text-slate-700">Muscle Group
                <select className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" value={draft.muscleGroup} onChange={(event) => setDraftField("muscleGroup", event.target.value as MuscleGroup)}>
                  {muscleGroupOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label> : null}

              {draft.type === "crossfit" ? (
                <label className="block text-sm text-slate-700">Movement Type
                  <select className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" value={draft.movementType} onChange={(event) => setDraftField("movementType", event.target.value as MovementType)}>
                    {movementTypeOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
              ) : null}

              {draft.type === "cardio" ? (
                <label className="block text-sm text-slate-700">Duration (minutes)
                  <input type="number" min={1} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" value={draft.durationMinutes} onChange={(event) => setDraftField("durationMinutes", Number(event.target.value))} />
                </label>
              ) : null}

              {draft.type === "crossfit" ? (
                <div className="space-y-3">
                  <p className="text-sm font-semibold text-slate-800">CrossFit fields</p>

                  <label className={`block text-sm ${draft.durationMinutes > 0 ? "text-slate-700" : "text-slate-400"}`}>Duration (minutes)
                    <div className={`mt-1 flex rounded-xl border ${draft.durationMinutes > 0 ? "border-slate-200" : "border-slate-200 bg-slate-100"}`}>
                      <button type="button" onClick={() => setDraftField("durationMinutes", Math.max(0, draft.durationMinutes - 1))} className="px-3">-</button>
                      <input type="number" min={0} className="w-full border-x border-slate-200 px-2 py-2 bg-transparent" value={draft.durationMinutes} onChange={(event) => setDraftField("durationMinutes", Number(event.target.value))} />
                      <button type="button" onClick={() => setDraftField("durationMinutes", draft.durationMinutes + 1)} className="px-3">+</button>
                    </div>
                  </label>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <label className={`text-sm ${draft.sets > 0 ? "text-slate-700" : "text-slate-400"}`}>Sets
                      <div className={`mt-1 flex rounded-xl border ${draft.sets > 0 ? "border-slate-200" : "border-slate-200 bg-slate-100"}`}>
                        <button type="button" onClick={() => setDraftField("sets", Math.max(0, draft.sets - 1))} className="px-3">-</button>
                        <input type="number" min={0} className="w-full border-x border-slate-200 px-2 py-2 bg-transparent" value={draft.sets} onChange={(event) => setDraftField("sets", Number(event.target.value))} />
                        <button type="button" onClick={() => setDraftField("sets", draft.sets + 1)} className="px-3">+</button>
                      </div>
                    </label>

                    <label className={`text-sm ${draft.reps > 0 ? "text-slate-700" : "text-slate-400"}`}>Reps
                      <div className={`mt-1 flex rounded-xl border ${draft.reps > 0 ? "border-slate-200" : "border-slate-200 bg-slate-100"}`}>
                        <button type="button" onClick={() => setDraftField("reps", Math.max(0, draft.reps - 1))} className="px-3">-</button>
                        <input type="number" min={0} className="w-full border-x border-slate-200 px-2 py-2 bg-transparent" value={draft.reps} onChange={(event) => setDraftField("reps", Number(event.target.value))} />
                        <button type="button" onClick={() => setDraftField("reps", draft.reps + 1)} className="px-3">+</button>
                      </div>
                    </label>

                    <label className={`text-sm ${draft.weight > 0 ? "text-slate-700" : "text-slate-400"}`}>Weight (kg)
                      <div className={`mt-1 flex rounded-xl border ${draft.weight > 0 ? "border-slate-200" : "border-slate-200 bg-slate-100"}`}>
                        <button type="button" onClick={() => setDraftField("weight", Math.max(0, draft.weight - 2.5))} className="px-3">-</button>
                        <input type="number" min={0} step="0.5" className="w-full border-x border-slate-200 px-2 py-2 bg-transparent" value={draft.weight} onChange={(event) => setDraftField("weight", Number(event.target.value))} />
                        <button type="button" onClick={() => setDraftField("weight", draft.weight + 2.5)} className="px-3">+</button>
                      </div>
                    </label>
                  </div>
                </div>
              ) : null}

              {draft.type === "fitness" ? (
                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="text-sm text-slate-700">Sets
                    <div className="mt-1 flex rounded-xl border border-slate-200">
                      <button type="button" onClick={() => setDraftField("sets", Math.max(1, draft.sets - 1))} className="px-3">-</button>
                      <input type="number" min={1} className="w-full border-x border-slate-200 px-2 py-2" value={draft.sets} onChange={(event) => setDraftField("sets", Number(event.target.value))} />
                      <button type="button" onClick={() => setDraftField("sets", draft.sets + 1)} className="px-3">+</button>
                    </div>
                  </label>
                  <label className="text-sm text-slate-700">Reps
                    <div className="mt-1 flex rounded-xl border border-slate-200">
                      <button type="button" onClick={() => setDraftField("reps", Math.max(1, draft.reps - 1))} className="px-3">-</button>
                      <input type="number" min={1} className="w-full border-x border-slate-200 px-2 py-2" value={draft.reps} onChange={(event) => setDraftField("reps", Number(event.target.value))} />
                      <button type="button" onClick={() => setDraftField("reps", draft.reps + 1)} className="px-3">+</button>
                    </div>
                  </label>
                  <label className="text-sm text-slate-700">Weight (kg)
                    <div className="mt-1 flex rounded-xl border border-slate-200">
                      <button type="button" onClick={() => setDraftField("weight", Math.max(0, draft.weight - 2.5))} className="px-3">-</button>
                      <input type="number" min={0} step="0.5" className="w-full border-x border-slate-200 px-2 py-2" value={draft.weight} onChange={(event) => setDraftField("weight", Number(event.target.value))} />
                      <button type="button" onClick={() => setDraftField("weight", draft.weight + 2.5)} className="px-3">+</button>
                    </div>
                  </label>
                </div>
              ) : null}

              <label className="block text-sm text-slate-700">Notes
                <textarea className="mt-1 min-h-20 w-full rounded-xl border border-slate-200 px-3 py-2" value={draft.notes} onChange={(event) => setDraftField("notes", event.target.value)} placeholder="Optional notes" />
              </label>

              <div className="flex gap-2">
                <button type="submit" className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-400">{editingExerciseId ? "Save Changes" : "Save Exercise"}</button>
                {editingExerciseId ? <button type="button" onClick={() => resetDraft(draft.type)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">Cancel</button> : null}
              </div>
            </form>

            {message ? <p className="mt-3 text-sm text-slate-600">{message}</p> : null}
          </div>

          <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <h2 className="text-xl font-semibold text-slate-900">{dayLabels[selectedDay]} planned exercises</h2>
            <div className="mt-3">
              <div className="flex flex-wrap gap-2">
              {availableTypeFilters.map((filterType) => (
                <button
                  key={filterType}
                  type="button"
                  onClick={() => setTypeFilter((prev) => (prev === filterType ? "all" : filterType))}
                  className={`min-w-[132px] rounded-full border px-5 py-2.5 text-sm font-semibold ${typeFilter === filterType ? "border-emerald-500 bg-emerald-50 text-emerald-700 shadow-sm" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}
                >
                  {filterType === "crossfit" ? "CrossFit" : filterType === "cardio" ? "Cardio" : "Fitness"}
                </button>
              ))}
              </div>
            </div>

            <div className="mt-3">
              <div className="flex flex-wrap gap-2">
              {availableSubFilters.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setSubFilter((prev) => (prev === value ? "all" : value))}
                  className={`rounded-full border px-3 py-1 text-xs font-medium ${subFilter === value ? "border-sky-500 bg-sky-50 text-sky-700" : "border-sky-200 bg-white text-slate-600 hover:bg-sky-50"}`}
                >
                  {value in muscleGroupLabels ? muscleGroupLabels[value as MuscleGroup] : movementTypeLabels[value as MovementType]}
                </button>
              ))}
              {(typeFilter !== "all" || subFilter !== "all") ? (
                <button
                  type="button"
                  onClick={() => {
                    setTypeFilter("all");
                    setSubFilter("all");
                  }}
                  className="rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                >
                  Clear filters
                </button>
              ) : null}
              </div>
            </div>

            {selectedExercises.length === 0 ? (
              <p className="mt-4 rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">No planned exercises yet.</p>
            ) : filteredExercises.length === 0 ? (
              <p className="mt-4 rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">No exercises match the selected filters.</p>
            ) : (
              <ul className="mt-4 space-y-3">
                {filteredExercises.map((exercise) => (
                  <li key={exercise.id} className="rounded-xl border border-slate-200 p-4 cursor-pointer hover:bg-slate-50" onClick={() => openProgress(exercise)}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="flex items-center gap-2 font-semibold text-slate-900"><span className="inline-flex h-5 w-5 items-center justify-center text-sm">{typeIcons[exercise.type]}</span><span>{exercise.name}</span></p>
                        {exercise.sourceType === "system" ? <p className="mt-1 inline-block rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-700">Auto-generated</p> : null}
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {exercise.muscleGroup ? <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-700">{muscleGroupLabels[exercise.muscleGroup]}</span> : null}
                          {exercise.movementType ? <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase text-emerald-700">{movementTypeLabels[exercise.movementType]}</span> : null}
                        </div>
                        {exercise.type === "cardio" ? <p className="mt-1 text-sm text-slate-600">Duration: {exercise.durationMinutes} minutes</p> : null}
                        {exercise.type === "fitness" ? <p className="mt-1 text-sm text-slate-600">{exercise.sets} sets × {exercise.reps} reps × {exercise.weight} kg</p> : null}
                        {exercise.type === "crossfit" ? <><p className="mt-1 text-sm text-slate-600">Duration: {exercise.durationMinutes} minutes</p>{exercise.weight ? <p className="text-sm text-slate-600">Weight: {exercise.weight} kg</p> : null}{exercise.sets && exercise.reps ? <p className="text-sm text-slate-600">{exercise.sets} sets × {exercise.reps} reps</p> : null}</> : null}
                        {exercise.notes ? <p className="mt-1 text-xs text-slate-500">Notes: {exercise.notes}</p> : null}
                      </div>

                      <div className="flex gap-2">
                        {exercise.sourceType !== "system" ? <button type="button" onClick={(event) => { event.stopPropagation(); openProgress(exercise); }} className="rounded-lg border border-emerald-200 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50">Progress</button> : null}
                        {exercise.sourceType !== "system" ? <button type="button" onClick={(event) => { event.stopPropagation(); setDeleteExerciseId(exercise.id); }} className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50">Delete</button> : null}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <h3 className="text-sm font-semibold text-slate-900">Workout Summary</h3>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                <p className="text-sm text-slate-600">Strength Points: <span className="font-semibold text-slate-900">{selectedDaySummary.strengthPoints}</span></p>
                <p className="text-sm text-slate-600">Cardio Points: <span className="font-semibold text-slate-900">{selectedDaySummary.cardioPoints}</span></p>
                <p className="text-sm text-slate-600">Calories Burned: <span className="font-semibold text-slate-900">{selectedDaySummary.calories} kcal</span></p>
              </div>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
