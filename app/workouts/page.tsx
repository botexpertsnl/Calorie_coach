"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { AppHeaderNav } from "@/components/AppHeaderNav";
import { STORAGE_KEYS, readJson, writeJson } from "@/lib/local-data";
import { recalculateAndPersistTodayTargets } from "@/lib/daily-targets";
import { ensureDemoSeedData } from "@/lib/demo-seed";
import { calculateTrainingVolume, estimateCaloriesForType } from "@/lib/workouts";
import { withStoredWorkoutPoints } from "@/lib/workout-execution";
import {
  CardioExercise,
  CrossfitExercise,
  FitnessExercise,
  ProfileInput,
  MovementType,
  MuscleGroup,
  SpecifyMuscle,
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
  { value: "legs", label: "Legs" },
  { value: "shoulders", label: "Shoulders" },
  { value: "arms", label: "Arms" },
  { value: "core", label: "Core" }
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
  legs: "Legs",
  shoulders: "Shoulders",
  arms: "Arms",
  core: "Core"
};

const specifyMuscleOptionsByGroup: Record<MuscleGroup, Array<{ value: SpecifyMuscle; label: string }>> = {
  chest: [
    { value: "upper_chest", label: "Upper Chest" },
    { value: "mid_chest", label: "Mid Chest" },
    { value: "lower_chest", label: "Lower Chest" },
    { value: "inner_chest", label: "Inner Chest" }
  ],
  back: [
    { value: "lats", label: "Lats" },
    { value: "upper_back", label: "Upper Back" },
    { value: "mid_back", label: "Mid Back" },
    { value: "lower_back", label: "Lower Back" },
    { value: "traps", label: "Traps" }
  ],
  legs: [
    { value: "quads", label: "Quads" },
    { value: "hamstrings", label: "Hamstrings" },
    { value: "glutes", label: "Glutes" },
    { value: "calves", label: "Calves" },
    { value: "adductors", label: "Adductors" },
    { value: "hip_flexors", label: "Hip Flexors" }
  ],
  shoulders: [
    { value: "front_delts", label: "Front Delts" },
    { value: "side_delts", label: "Side Delts" },
    { value: "rear_delts", label: "Rear Delts" },
    { value: "traps", label: "Traps" }
  ],
  arms: [
    { value: "biceps", label: "Biceps" },
    { value: "triceps", label: "Triceps" },
    { value: "forearms", label: "Forearms" },
    { value: "brachialis", label: "Brachialis" }
  ],
  core: [
    { value: "upper_abs", label: "Upper Abs" },
    { value: "lower_abs", label: "Lower Abs" },
    { value: "obliques", label: "Obliques" },
    { value: "lower_back", label: "Lower Back" },
    { value: "deep_core", label: "Deep Core" }
  ]
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


function normalizeMuscleGroup(muscleGroup: string | undefined, exerciseName: string, type: WorkoutExerciseType): MuscleGroup {
  const value = (muscleGroup ?? "").toLowerCase();

  if (value === "chest" || value === "back" || value === "legs" || value === "shoulders" || value === "arms" || value === "core") {
    return value as MuscleGroup;
  }

  if (["biceps", "triceps"].includes(value)) return "arms";
  if (["quads", "hamstrings", "glutes", "calves", "full_body"].includes(value)) {
    const inferred = inferExerciseDefaults(exerciseName);
    if (inferred.muscleGroup) return inferred.muscleGroup;
    return "legs";
  }

  if (type === "cardio") return "legs";
  const inferred = inferExerciseDefaults(exerciseName);
  return inferred.muscleGroup ?? "legs";
}

function inferSpecifyMuscle(name: string, muscleGroup: MuscleGroup): SpecifyMuscle | undefined {
  const value = name.toLowerCase().trim();
  if (!value) return undefined;

  if (muscleGroup === "chest") {
    if (/incline|upper/.test(value)) return "upper_chest";
    if (/decline|lower/.test(value)) return "lower_chest";
    if (/cable fly|pec deck|inner/.test(value)) return "inner_chest";
    return "mid_chest";
  }

  if (muscleGroup === "back") {
    if (/lat|pull-up|pulldown/.test(value)) return "lats";
    if (/shrug|trap/.test(value)) return "traps";
    if (/lower back|hyperextension/.test(value)) return "lower_back";
    if (/seated row|row/.test(value)) return "mid_back";
    return "upper_back";
  }

  if (muscleGroup === "legs") {
    if (/squat|leg extension/.test(value)) return "quads";
    if (/rdl|deadlift|hamstring|leg curl/.test(value)) return "hamstrings";
    if (/glute|hip thrust/.test(value)) return "glutes";
    if (/calf/.test(value)) return "calves";
    if (/adductor/.test(value)) return "adductors";
    if (/hip flexor/.test(value)) return "hip_flexors";
    return undefined;
  }

  if (muscleGroup === "shoulders") {
    if (/rear delt|reverse fly/.test(value)) return "rear_delts";
    if (/lateral|side/.test(value)) return "side_delts";
    if (/trap|shrug/.test(value)) return "traps";
    return "front_delts";
  }

  if (muscleGroup === "arms") {
    if (/tricep|pushdown|extension|skull/.test(value)) return "triceps";
    if (/forearm/.test(value)) return "forearms";
    if (/hammer|brachialis/.test(value)) return "brachialis";
    if (/curl/.test(value)) return "biceps";
    return undefined;
  }

  if (muscleGroup === "core") {
    if (/leg raise|lower abs/.test(value)) return "lower_abs";
    if (/oblique|twist/.test(value)) return "obliques";
    if (/lower back|extension/.test(value)) return "lower_back";
    if (/vacuum|brace|deep core/.test(value)) return "deep_core";
    if (/plank|crunch|ab/.test(value)) return "upper_abs";
  }

  return undefined;
}

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
    return { type: "cardio", movementType: "conditioning", muscleGroup: "legs", specifyMuscle: "quads" };
  }

  if (/burpee|thruster|snatch|clean|jerk|amrap|metcon|wod|wall ball/.test(value)) {
    return { type: "crossfit", movementType: "conditioning", muscleGroup: "legs", specifyMuscle: "quads" };
  }

  if (/bench|push up|fly|chest press/.test(value)) return { type: "fitness", muscleGroup: "chest", specifyMuscle: "mid_chest" };
  if (/pull|lat|row/.test(value)) return { type: "fitness", muscleGroup: "back", specifyMuscle: "lats" };
  if (/shoulder|overhead press|lateral raise/.test(value)) return { type: "fitness", muscleGroup: "shoulders", specifyMuscle: "front_delts" };
  if (/curl/.test(value)) return { type: "fitness", muscleGroup: "arms", specifyMuscle: "biceps" };
  if (/tricep|dip|pushdown|skull/.test(value)) return { type: "fitness", muscleGroup: "arms", specifyMuscle: "triceps" };
  if (/squat|leg press|lunge/.test(value)) return { type: "fitness", muscleGroup: "legs", specifyMuscle: "quads" };
  if (/hamstring|rdl|deadlift/.test(value)) return { type: "fitness", muscleGroup: "legs", specifyMuscle: "hamstrings" };
  if (/glute|hip thrust/.test(value)) return { type: "fitness", muscleGroup: "legs", specifyMuscle: "glutes" };
  if (/calf/.test(value)) return { type: "fitness", muscleGroup: "legs", specifyMuscle: "calves" };
  if (/plank|crunch|core|ab/.test(value)) return { type: "fitness", muscleGroup: "core", specifyMuscle: "upper_abs" };

  return {};
}

function formatNumericDelta(current: number | undefined, previous: number | undefined) {
  if (typeof current !== "number" || typeof previous !== "number") return null;
  const diff = current - previous;
  if (!Number.isFinite(diff)) return null;
  return Number(diff.toFixed(2));
}

function formatRecordedDate(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "n/a";
  return new Intl.DateTimeFormat("nl-NL", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
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
  specifyMuscle: SpecifyMuscle | "";
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
  muscleGroup: "legs",
  specifyMuscle: "",
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

function cloneExerciseToDay(exercise: WorkoutExercise, targetDay: WorkoutDay): WorkoutExercise {
  const now = new Date().toISOString();
  return {
    ...exercise,
    id: crypto.randomUUID(),
    workoutDayId: targetDay,
    createdAt: now,
    updatedAt: now,
    progressHistory: [...getHistory(exercise)]
  };
}


function isSameExerciseConfiguration(a: WorkoutExercise, b: WorkoutExercise) {
  const key = (exercise: WorkoutExercise) => JSON.stringify({
    type: exercise.type,
    name: exercise.name.trim().toLowerCase(),
    muscleGroup: exercise.muscleGroup,
    specifyMuscle: exercise.specifyMuscle ?? null,
    intensity: exercise.intensity,
    movementType: exercise.movementType ?? null,
    durationMinutes: "durationMinutes" in exercise ? exercise.durationMinutes : null,
    sets: "sets" in exercise ? exercise.sets ?? null : null,
    reps: "reps" in exercise ? exercise.reps ?? null : null,
    weight: "weight" in exercise ? exercise.weight ?? null : null,
    notes: exercise.notes ?? ""
  });

  return key(a) === key(b);
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
        const normalizedMuscleGroup = normalizeMuscleGroup(withPoints.muscleGroup, withPoints.name, withPoints.type);
        const normalizedLabels = {
          muscleGroup: normalizedMuscleGroup,
          specifyMuscle: withPoints.specifyMuscle ?? inferSpecifyMuscle(withPoints.name, normalizedMuscleGroup),
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
  const [duplicateExerciseId, setDuplicateExerciseId] = useState<string | null>(null);
  const [duplicateTargets, setDuplicateTargets] = useState<WorkoutDay[]>([]);
  const [isAddExerciseOpen, setIsAddExerciseOpen] = useState(false);
  const [showScheduleDays, setShowScheduleDays] = useState(false);
  const [addExerciseDays, setAddExerciseDays] = useState<WorkoutDay[]>([selectedDay]);
  const [isPlannerDaysExpanded, setIsPlannerDaysExpanded] = useState(false);
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
  const [specifyFilter, setSpecifyFilter] = useState<"all" | SpecifyMuscle>("all");
  const [hasLoadedInitialData, setHasLoadedInitialData] = useState(false);

  useEffect(() => {
    ensureDemoSeedData();

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


  useEffect(() => {
    if (!isAddExerciseOpen) {
      setAddExerciseDays([selectedDay]);
      setShowScheduleDays(false);
    }
  }, [isAddExerciseOpen, selectedDay]);

  function resetDraft(type: WorkoutExerciseType = "fitness") {
    if (type === "crossfit") {
      setDraft({ ...defaultDraft, type, durationMinutes: 0, sets: 0, reps: 0, weight: 0, movementType: "conditioning", specifyMuscle: "" });
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
      values.add(exercise.muscleGroup);
    }
    return Array.from(values);
  }, [selectedExercises, typeFilter]);



  const availableSpecifyMuscleFilters = useMemo(() => {
    const values = new Set<SpecifyMuscle>();
    for (const exercise of selectedExercises) {
      if (!matchesTypeFilter(exercise, typeFilter)) continue;
      if (subFilter !== "all" && exercise.muscleGroup !== subFilter) continue;
      if (exercise.specifyMuscle) values.add(exercise.specifyMuscle);
    }
    return Array.from(values);
  }, [selectedExercises, subFilter, typeFilter]);

  useEffect(() => {
    if (subFilter === "all") return;
    if (!availableSubFilters.includes(subFilter)) {
      setSubFilter("all");
    }
  }, [availableSubFilters, subFilter]);

  useEffect(() => {
    if (specifyFilter === "all") return;
    if (!availableSpecifyMuscleFilters.includes(specifyFilter)) {
      setSpecifyFilter("all");
    }
  }, [availableSpecifyMuscleFilters, specifyFilter]);

  const filteredExercises = useMemo(() => {
    const sorted = selectedExercises
      .filter((exercise) => {
        const matchType = matchesTypeFilter(exercise, typeFilter);
        const matchSub = subFilter === "all" ? true : exercise.muscleGroup === subFilter;
        const matchSpecify = specifyFilter === "all" ? true : exercise.specifyMuscle === specifyFilter;
        return matchType && matchSub && matchSpecify;
      })
      .sort((a, b) => {
        const typeOrder: Record<"fitness" | "cardio" | "crossfit", number> = { fitness: 0, cardio: 1, crossfit: 2 };
        const aType = getExerciseMainFilterGroup(a);
        const bType = getExerciseMainFilterGroup(b);

        if (aType !== bType) return typeOrder[aType] - typeOrder[bType];

        const aSub = muscleGroupLabels[a.muscleGroup];
        const bSub = muscleGroupLabels[b.muscleGroup];

        if (aSub !== bSub) return aSub.localeCompare(bSub);
        return a.name.localeCompare(b.name);
      });

    return sorted;
  }, [selectedExercises, specifyFilter, subFilter, typeFilter]);

  const progressExercise = useMemo(
    () => selectedExercises.find((exercise) => exercise.id === progressExerciseId) ?? null,
    [selectedExercises, progressExerciseId]
  );

  const duplicateExercise = useMemo(
    () => selectedExercises.find((exercise) => exercise.id === duplicateExerciseId) ?? null,
    [duplicateExerciseId, selectedExercises]
  );

  const previousProgresses = useMemo(() => {
    if (!progressExercise) return [];
    const history = getHistory(progressExercise);
    return history.slice(-2).reverse();
  }, [progressExercise]);

  const latestPreviousProgress = previousProgresses[0];

  const progressComparisons = useMemo(() => {
    if (!latestPreviousProgress) return [] as Array<{ label: string; value: number | null; unit: string }>;

    return [
      { label: "Duration", value: formatNumericDelta(draft.durationMinutes, latestPreviousProgress.durationMinutes), unit: "min" },
      { label: "Sets", value: formatNumericDelta(draft.sets, latestPreviousProgress.sets), unit: "sets" },
      { label: "Reps", value: formatNumericDelta(draft.reps, latestPreviousProgress.reps), unit: "reps" },
      { label: "Weight", value: formatNumericDelta(draft.weight, latestPreviousProgress.weight), unit: "kg" }
    ];
  }, [draft.durationMinutes, draft.reps, draft.sets, draft.weight, latestPreviousProgress]);

  const selectedDaySummary = useMemo(() => {
    return selectedExercises.reduce(
      (sum, exercise) => ({
        calories: sum.calories + ensureCalories(exercise, profileWeight)
      }),
      { calories: 0 }
    );
  }, [profileWeight, selectedExercises]);


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


  function buildExerciseForDay(day: WorkoutDay, existingId?: string | null): WorkoutExercise {
    const now = new Date().toISOString();
    const shared = {
      name: draft.name.trim(),
      notes: draft.notes.trim(),
      intensity: draft.intensity,
      muscleGroup: draft.muscleGroup,
      specifyMuscle: draft.specifyMuscle || undefined,
      movementType: draft.type === "cardio" ? "conditioning" : draft.type === "crossfit" ? draft.movementType : undefined,
      workoutDayId: day,
      updatedAt: now,
      isPaused: false
    };

    if (draft.type === "cardio") {
      const estimatedCalories = estimateCaloriesForType({
        type: "cardio",
        weightKg: profileWeight,
        name: draft.name,
        durationMinutes: draft.durationMinutes,
        intensity: draft.intensity
      });

      const existing = existingId
        ? plan[day].exercises.find((exercise) => exercise.id === existingId && exercise.type === "cardio")
        : null;

      return {
        id: existingId ?? crypto.randomUUID(),
        type: "cardio",
        durationMinutes: draft.durationMinutes,
        estimatedCalories,
        trainingVolume: 0,
        strengthPoints: 0,
        cardioPoints: 0,
        createdAt: existing?.createdAt ?? now,
        progressHistory: existing ? [...getHistory(existing), toProgressEntry(existing)] : [],
        ...shared
      } as CardioExercise;
    }

    if (draft.type === "crossfit") {
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

      const existing = existingId
        ? plan[day].exercises.find((exercise) => exercise.id === existingId && exercise.type === "crossfit")
        : null;

      return {
        id: existingId ?? crypto.randomUUID(),
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
      } as CrossfitExercise;
    }

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

    const existing = existingId
      ? plan[day].exercises.find((exercise) => exercise.id === existingId && exercise.type === "fitness")
      : null;

    return {
      id: existingId ?? crypto.randomUUID(),
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
    } as FitnessExercise;
  }

  function openAddExerciseModal() {
    resetDraft("fitness");
    setAddExerciseDays([selectedDay]);
    setShowScheduleDays(false);
    setIsAddExerciseOpen(true);
  }

  function closeAddExerciseModal() {
    setIsAddExerciseOpen(false);
    setShowScheduleDays(false);
    setAddExerciseDays([selectedDay]);
    resetDraft("fitness");
  }

  function toggleAddExerciseDay(day: WorkoutDay, checked: boolean) {
    setAddExerciseDays((prev) => checked ? [...prev, day] : prev.filter((item) => item !== day));
  }

  function saveExerciseForSelectedDays() {
    const validationError = validateDraft();
    if (validationError) {
      setMessage(validationError);
      return;
    }
    const targetDays = showScheduleDays ? addExerciseDays : [selectedDay];
    if (!targetDays.length) {
      setMessage("Please select at least one day.");
      return;
    }

    setPlan((prev) => {
      const next = { ...prev };
      targetDays.forEach((day) => {
        const nextExercise = buildExerciseForDay(day);
        next[day] = { ...next[day], exercises: [nextExercise, ...next[day].exercises] };
      });
      return next;
    });

    setMessage(`Exercise saved for ${targetDays.length} day${targetDays.length > 1 ? "s" : ""}.`);
    closeAddExerciseModal();
  }

  function saveExercise(event: FormEvent) {
    event.preventDefault();

    const validationError = validateDraft();
    if (validationError) {
      setMessage(validationError);
      return;
    }

    const nextExercise = buildExerciseForDay(selectedDay, editingExerciseId);

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
      muscleGroup: normalizeMuscleGroup(exercise.muscleGroup, exercise.name, exercise.type),
      specifyMuscle: exercise.specifyMuscle ?? inferSpecifyMuscle(exercise.name, normalizeMuscleGroup(exercise.muscleGroup, exercise.name, exercise.type)) ?? "",
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

  function openDuplicateModal(exercise: WorkoutExercise) {
    setDuplicateExerciseId(exercise.id);
    const scheduledDays = dayOrder.filter((day) =>
      plan[day].exercises.some((candidate) => !candidate.isPaused && isSameExerciseConfiguration(candidate, exercise))
    );
    setDuplicateTargets(scheduledDays);
  }

  function closeDuplicateModal() {
    setDuplicateExerciseId(null);
    setDuplicateTargets([]);
  }

  function toggleDuplicateDay(day: WorkoutDay, checked: boolean) {
    setDuplicateTargets((prev) => checked ? [...prev, day] : prev.filter((item) => item !== day));
  }

  function duplicateExerciseToDays() {
    if (!duplicateExercise) return;

    setPlan((prev) => {
      const next = { ...prev };

      dayOrder.forEach((day) => {
        const shouldExist = duplicateTargets.includes(day);
        const existingMatches = next[day].exercises.filter((candidate) => isSameExerciseConfiguration(candidate, duplicateExercise));

        if (shouldExist && existingMatches.length === 0) {
          const cloned = cloneExerciseToDay(duplicateExercise, day);
          next[day] = { ...next[day], exercises: [cloned, ...next[day].exercises] };
        }

        if (!shouldExist && existingMatches.length > 0) {
          next[day] = {
            ...next[day],
            exercises: next[day].exercises.filter((candidate) => !isSameExerciseConfiguration(candidate, duplicateExercise))
          };
        }
      });

      return next;
    });

    setMessage("Exercise schedule updated across selected days.");
    closeDuplicateModal();
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
        muscleGroup: "legs",
        movementType: "conditioning",
        progressHistory: [],
        createdAt: now,
        updatedAt: now,
        isPaused: false
      } as CardioExercise;

      return baseExercise;
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
        muscleGroup: "legs",
        movementType: "functional",
        intensity: exceptionIntensity,
        progressHistory: [],
        createdAt: now,
        updatedAt: now,
        isPaused: false
      } as CrossfitExercise;

      return baseExercise;
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
      muscleGroup: "legs",
      movementType: undefined,
      intensity: exceptionIntensity,
      progressHistory: [],
      createdAt: now,
      updatedAt: now,
      isPaused: false
    } as FitnessExercise;

    return baseExercise;
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-3 sm:p-4">
          <div className="w-full max-w-md max-h-[86vh] overflow-y-auto rounded-2xl bg-white p-4 shadow-xl ring-1 ring-slate-200 sm:p-6">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-3 sm:p-4">
          <div className="w-full max-w-2xl max-h-[86vh] overflow-y-auto rounded-2xl bg-white p-4 shadow-xl ring-1 ring-slate-200 sm:p-6">
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

      {duplicateExercise ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-3 sm:p-4">
          <div className="w-full max-w-md max-h-[86vh] overflow-y-auto rounded-2xl bg-white p-4 shadow-xl ring-1 ring-slate-200 sm:p-6">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Duplicate Exercise</h3>
                <p className="mt-1 text-sm font-medium text-slate-700">{duplicateExercise.name}</p>
                <p className="text-xs text-slate-500">Currently on: {dayLabels[selectedDay]}</p>
              </div>
              <button type="button" onClick={closeDuplicateModal} className="rounded-md p-1 text-slate-400 hover:bg-slate-100">✕</button>
            </div>

            <div className="mt-4 space-y-2">
              <p className="text-sm font-medium text-slate-700">Copy to:</p>
              {dayOrder.map((day) => {
                return (
                  <label key={day} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={duplicateTargets.includes(day)}
                      onChange={(event) => toggleDuplicateDay(day, event.target.checked)}
                    />
                    {dayLabels[day]}
                  </label>
                );
              })}
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={closeDuplicateModal} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">Cancel</button>
              <button type="button" onClick={duplicateExerciseToDays} disabled={!duplicateTargets.length} className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-slate-300">Duplicate Exercise</button>
            </div>
          </div>
        </div>
      ) : null}

      {progressExercise ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-3 sm:p-4">
          <div className="w-full max-w-2xl max-h-[86vh] overflow-y-auto rounded-2xl bg-white p-4 shadow-xl ring-1 ring-slate-200 sm:p-6">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-xl font-semibold text-slate-900">Exercise Progress</h3>
                <p className="text-sm text-slate-500">{progressExercise.name}</p>
                {previousProgresses.length ? (
                  <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200">
                    <table className="min-w-full text-xs">
                      <thead className="bg-slate-50 text-slate-600">
                        <tr>
                          <th className="px-3 py-2 text-left font-semibold">Change date</th>
                          <th className="px-3 py-2 text-left font-semibold">Duration</th>
                          <th className="px-3 py-2 text-left font-semibold">Sets</th>
                          <th className="px-3 py-2 text-left font-semibold">Reps</th>
                          <th className="px-3 py-2 text-left font-semibold">Weight</th>
                        </tr>
                      </thead>
                      <tbody>
                        {previousProgresses.map((entry, index) => (
                          <tr key={`${entry.recordedAt}-${index}`} className="border-t border-slate-100 text-slate-600">
                            <td className="px-3 py-2">{formatRecordedDate(entry.recordedAt)}</td>
                            <td className="px-3 py-2">{typeof entry.durationMinutes === "number" ? `${entry.durationMinutes} min` : "-"}</td>
                            <td className="px-3 py-2">{typeof entry.sets === "number" ? entry.sets : "-"}</td>
                            <td className="px-3 py-2">{typeof entry.reps === "number" ? entry.reps : "-"}</td>
                            <td className="px-3 py-2">{typeof entry.weight === "number" ? `${entry.weight} kg` : "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}

                {latestPreviousProgress ? (
                  <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Current vs previous entry ({formatRecordedDate(latestPreviousProgress.recordedAt)})</p>
                    <div className="mt-2 grid gap-2 sm:grid-cols-4">
                      {progressComparisons.map((item) => {
                        const value = item.value;
                        const isPositive = (value ?? 0) > 0;
                        const isNegative = (value ?? 0) < 0;

                        return (
                          <div key={item.label} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                            <p className="text-[11px] uppercase tracking-wide text-slate-500">{item.label}</p>
                            <p className={`text-sm font-semibold ${isPositive ? "text-emerald-600" : isNegative ? "text-rose-600" : "text-slate-700"}`}>
                              {value === null ? "n/a" : `${value > 0 ? "+" : ""}${value} ${item.unit}` }
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

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm text-slate-700">Muscle Group
                  <select className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" value={draft.muscleGroup} onChange={(event) => {
                    const nextGroup = event.target.value as MuscleGroup;
                    const nextOptions = specifyMuscleOptionsByGroup[nextGroup].map((item) => item.value);
                    const nextSpecific = nextOptions.includes(draft.specifyMuscle as SpecifyMuscle) ? draft.specifyMuscle : "";
                    setDraft((prev) => ({ ...prev, muscleGroup: nextGroup, specifyMuscle: nextSpecific }));
                  }}>
                    {muscleGroupOptions.map((option) => (<option key={option.value} value={option.value}>{option.label}</option>))}
                  </select>
                </label>

                <label className="block text-sm text-slate-700">Specify Muscle <span className="text-slate-400">(optional)</span>
                  <select
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
                    value={draft.specifyMuscle}
                    onChange={(event) => setDraftField("specifyMuscle", event.target.value as SpecifyMuscle | "")}
                  >
                    <option value="">Select specific muscle</option>
                    {specifyMuscleOptionsByGroup[draft.muscleGroup].map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
              </div>

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


      {isAddExerciseOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-3 sm:p-4">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-xl ring-1 ring-slate-200">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-xl font-semibold text-slate-900">{editingExerciseId ? "Edit Exercise" : "Add Exercise"}</h3>
                <p className="text-sm text-slate-500">{dayLabels[selectedDay]}</p>
              </div>
              <button type="button" onClick={closeAddExerciseModal} className="rounded-md p-1 text-slate-400 hover:bg-slate-100">✕</button>
            </div>

            <form onSubmit={(event) => event.preventDefault()} className="mt-4 space-y-4">

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
                      specifyMuscle: inferred.specifyMuscle ?? inferSpecifyMuscle(value, (inferred.muscleGroup ?? prev.muscleGroup) as MuscleGroup) ?? prev.specifyMuscle,
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
                    setDraft((prev) => ({ ...prev, type: nextType, durationMinutes: 0, sets: 0, reps: 0, weight: 0, movementType: "conditioning", specifyMuscle: "" }));
                    return;
                  }
                  setDraftField("type", nextType);
                }}>
                  <option value="cardio">Cardio</option>
                  <option value="fitness">Fitness</option>
                  <option value="crossfit">CrossFit</option>
                </select>
              </label>

              <label className="block text-sm text-slate-700">Muscle Group
                <select required className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" value={draft.muscleGroup} onChange={(event) => {
                  const nextGroup = event.target.value as MuscleGroup;
                  setDraft((prev) => {
                    const nextOptions = specifyMuscleOptionsByGroup[nextGroup].map((item) => item.value);
                    const nextSpecific = nextOptions.includes(prev.specifyMuscle as SpecifyMuscle)
                      ? prev.specifyMuscle
                      : inferSpecifyMuscle(prev.name, nextGroup) ?? "";
                    return { ...prev, muscleGroup: nextGroup, specifyMuscle: nextSpecific };
                  });
                }}>
                  {muscleGroupOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              <label className="block text-sm text-slate-700">Specify Muscle <span className="text-slate-400">(optional)</span>
                <select
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 disabled:bg-slate-100 disabled:text-slate-400"
                  value={draft.specifyMuscle}
                  onChange={(event) => setDraftField("specifyMuscle", event.target.value as SpecifyMuscle | "")}
                  disabled={!draft.muscleGroup}
                >
                  <option value="">Not specified</option>
                  {specifyMuscleOptionsByGroup[draft.muscleGroup].map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>

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

              <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={showScheduleDays}
                    onChange={(event) => {
                      const checked = event.target.checked;
                      setShowScheduleDays(checked);
                      if (!checked) {
                        setAddExerciseDays([selectedDay]);
                      }
                    }}
                  />
                  Schedule this exercise for multiple days
                </label>

                {showScheduleDays ? (
                  <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
                    <p className="text-sm font-semibold text-slate-900">Select days</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {dayOrder.map((day) => (
                        <label key={day} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700">
                          <input
                            type="checkbox"
                            checked={addExerciseDays.includes(day)}
                            onChange={(event) => toggleAddExerciseDay(day, event.target.checked)}
                          />
                          {dayLabels[day]}
                        </label>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">Exercise will be scheduled for {dayLabels[selectedDay]}.</p>
                )}

                <div className="flex gap-2">
                  <button type="button" onClick={closeAddExerciseModal} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">Cancel</button>
                  <button type="button" onClick={saveExerciseForSelectedDays} className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-400">Save Exercise</button>
                </div>
              </div>
            </form>

            {message ? <p className="mt-3 text-sm text-slate-600">{message}</p> : null}
          </div>
        </div>
      ) : null}


      <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8 md:px-8">
        <AppHeaderNav />

        <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-3xl font-semibold text-slate-900">Workouts Planner</h1>
              <p className="mt-2 text-sm text-slate-500">Planned workouts are treated as completed by default. Only log exceptions when reality differed from plan.</p>
            </div>
            <button type="button" onClick={openAddExerciseModal} className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-400">Add Exercise</button>
          </div>
          <div className="mt-4 flex items-center justify-between md:hidden">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Planner days</p>
            <button type="button" onClick={() => setIsPlannerDaysExpanded((prev) => !prev)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700">
              {isPlannerDaysExpanded ? "Hide days" : "Show days"}
            </button>
          </div>
          <div className={`mt-3 ${isPlannerDaysExpanded ? "grid" : "hidden"} gap-2 sm:grid-cols-2 lg:grid-cols-7 md:grid`}>
            {dayOrder.map((day) => (
              <button
                key={day}
                type="button"
                onClick={() => { setSelectedDay(day); setIsPlannerDaysExpanded(false); }}
                className={`rounded-xl border p-3 text-left transition ${selectedDay === day ? "border-emerald-500 bg-emerald-50" : "border-slate-200 hover:bg-slate-50"}`}
              >
                <p className="font-semibold text-slate-900">{dayLabels[day]}</p>
                <p className="text-xs text-slate-500">{plan[day].exercises.filter((e) => !e.isPaused).length} planned</p>
              </button>
            ))}
          </div>
        </section>

        <section>
          <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xl font-semibold text-slate-900">{dayLabels[selectedDay]} planned exercises</h2>
              <button type="button" onClick={() => setIsExceptionsOpen(true)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Workout Exceptions</button>
            </div>
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

            <div className="mt-3 space-y-3 rounded-xl border border-slate-200 bg-slate-100/70 p-3">
              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Main muscle group</p>
                <div className="flex flex-wrap gap-2">
                  {availableSubFilters.map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setSubFilter((prev) => (prev === value ? "all" : value))}
                      className={`rounded-full border px-3 py-1 text-xs font-semibold ${subFilter === value ? "border-slate-700 bg-slate-700 text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}
                    >
                      {muscleGroupLabels[value as MuscleGroup]}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Specific muscle (sub-group)</p>
                {subFilter === "all" ? (
                  <p className="text-xs text-slate-500">Select a main muscle group to show relevant specific muscle filters.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {availableSpecifyMuscleFilters.length ? availableSpecifyMuscleFilters.map((value) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setSpecifyFilter((prev) => (prev === value ? "all" : value))}
                        className={`rounded-full border px-3 py-1 text-xs font-semibold ${specifyFilter === value ? "border-indigo-600 bg-indigo-100 text-indigo-800" : "border-slate-300 bg-white text-slate-700 hover:bg-indigo-50"}`}
                      >
                        {specifyMuscleLabels[value]}
                      </button>
                    )) : (
                      <p className="text-xs text-slate-500">No specific muscle labels for this selection.</p>
                    )}
                  </div>
                )}
              </div>

              {(typeFilter !== "all" || subFilter !== "all" || specifyFilter !== "all") ? (
                <button
                  type="button"
                  onClick={() => {
                    setTypeFilter("all");
                    setSubFilter("all");
                    setSpecifyFilter("all");
                  }}
                  className="rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                >
                  Clear filters
                </button>
              ) : null}
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
                        <p className="font-semibold text-slate-900">{exercise.name}</p>
                        {exercise.sourceType === "system" ? <p className="mt-1 inline-block rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-700">Auto-generated</p> : null}
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <button
                            type="button"
                            onClick={(event) => { event.stopPropagation(); setSubFilter(exercise.muscleGroup); }}
                            className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-700 hover:bg-slate-200"
                          >
                            {muscleGroupLabels[exercise.muscleGroup]}
                          </button>
                          {exercise.specifyMuscle ? (
                            <button
                              type="button"
                              onClick={(event) => { event.stopPropagation(); setSpecifyFilter(exercise.specifyMuscle!); }}
                              className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold uppercase text-indigo-700 hover:bg-indigo-100"
                            >
                              {specifyMuscleLabels[exercise.specifyMuscle]}
                            </button>
                          ) : null}
                        </div>
                        {exercise.type === "cardio" ? <p className="mt-1 text-sm text-slate-600">Duration: {exercise.durationMinutes} minutes</p> : null}
                        {exercise.type === "fitness" ? <p className="mt-1 text-sm text-slate-600">{exercise.sets} sets × {exercise.reps} reps × {exercise.weight} kg</p> : null}
                        {exercise.type === "crossfit" ? <><p className="mt-1 text-sm text-slate-600">Duration: {exercise.durationMinutes} minutes</p>{exercise.weight ? <p className="text-sm text-slate-600">Weight: {exercise.weight} kg</p> : null}{exercise.sets && exercise.reps ? <p className="text-sm text-slate-600">{exercise.sets} sets × {exercise.reps} reps</p> : null}</> : null}
                        {exercise.notes ? <p className="mt-1 text-xs text-slate-500">Notes: {exercise.notes}</p> : null}
                      </div>

                      <div className="flex gap-2">
                        {exercise.sourceType !== "system" ? <button type="button" aria-label="Edit progress" onClick={(event) => { event.stopPropagation(); openProgress(exercise); }} className="rounded-lg border border-emerald-200 px-2 py-1.5 text-sm text-emerald-700 hover:bg-emerald-50">✎</button> : null}
                        {exercise.sourceType !== "system" ? <button type="button" aria-label="Duplicate exercise" onClick={(event) => { event.stopPropagation(); openDuplicateModal(exercise); }} className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-100">⧉</button> : null}
                        {exercise.sourceType !== "system" ? <button type="button" aria-label="Delete exercise" onClick={(event) => { event.stopPropagation(); setDeleteExerciseId(exercise.id); }} className="rounded-lg border border-rose-200 px-2 py-1.5 text-sm text-rose-700 hover:bg-rose-50">🗑</button> : null}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <h3 className="text-sm font-semibold text-slate-900">Workout Summary</h3>
              <div className="mt-2 grid gap-2 sm:grid-cols-1">
                <p className="text-sm text-slate-600">Calories Burned: <span className="font-semibold text-slate-900">{selectedDaySummary.calories} kcal</span></p>
              </div>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
