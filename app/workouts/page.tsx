"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { AppHeaderNav } from "@/components/AppHeaderNav";
import { MobileSwipePage } from "@/components/MobileSwipePage";
import { AppModal } from "@/components/AppModal";
import { recalculateAndPersistTodayTargets } from "@/lib/daily-targets";
import { getCurrentUserId, loadProfile, loadWorkoutExceptions, loadWorkoutPlan, replaceWorkoutExceptions, saveDailyTargets, saveWorkoutPlan } from "@/lib/supabase/user-data";
import { calculateTrainingVolume, estimateCaloriesForType } from "@/lib/workouts";
import { getAmsterdamWeekStartDateKey, withStoredWorkoutPoints } from "@/lib/workout-execution";
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
  WorkoutIntensity,
  WorkoutProgressEntry,
  WorkoutWeekPlan,
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

function getCurrentWeekDateForDay(day: WorkoutDay, weekStartDateKey = getAmsterdamWeekStartDateKey()) {
  const [year, month, dayOfMonth] = weekStartDateKey.split("-").map(Number);
  const monday = new Date(Date.UTC(year, month - 1, dayOfMonth));

  const target = new Date(monday);
  target.setUTCDate(monday.getUTCDate() + dayOrder.indexOf(day));
  return target.toISOString().slice(0, 10);
}

function formatDayDateLabel(dateKey: string) {
  const [year, month, day] = dateKey.split("-");
  return `${day}-${month}-${year}`;
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

const WEIGHT_STEP_KG = 1;

function parseLocalizedWeightInput(value: string): number | null {
  const normalized = value.replace(",", ".").trim();
  if (!normalized) return null;

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

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
          movementType: withPoints.type === "cardio" ? "conditioning" : withPoints.type === "crossfit" ? withPoints.movementType : undefined
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
  const [deleteExerciseScope, setDeleteExerciseScope] = useState<"single_date" | "weekly_schedule">("single_date");
  const [progressExerciseId, setProgressExerciseId] = useState<string | null>(null);
  const [duplicateExerciseId, setDuplicateExerciseId] = useState<string | null>(null);
  const [duplicateTargets, setDuplicateTargets] = useState<WorkoutDay[]>([]);
  const [draggedExerciseId, setDraggedExerciseId] = useState<string | null>(null);
  const [isAddExerciseOpen, setIsAddExerciseOpen] = useState(false);
  const [showScheduleDays, setShowScheduleDays] = useState(false);
  const [addExerciseDays, setAddExerciseDays] = useState<WorkoutDay[]>([selectedDay]);
  const [addExerciseTodayOnly, setAddExerciseTodayOnly] = useState(false);
  const [isPlannerDaysExpanded, setIsPlannerDaysExpanded] = useState(false);
  const [profileWeight, setProfileWeight] = useState(70);
  const [profile, setProfile] = useState<ProfileInput | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [exceptions, setExceptions] = useState<WorkoutException[]>([]);
  const [typeFilter, setTypeFilter] = useState<"all" | "fitness" | "cardio" | "crossfit">("all");
  const [subFilter, setSubFilter] = useState<string>("all");
  const [specifyFilter, setSpecifyFilter] = useState<"all" | SpecifyMuscle>("all");
  const [hasLoadedInitialData, setHasLoadedInitialData] = useState(false);
  const [currentWeekStartDateKey, setCurrentWeekStartDateKey] = useState(getAmsterdamWeekStartDateKey());
  const [userId, setUserId] = useState<string | null>(null);
  const [popupSubmissionNotice, setPopupSubmissionNotice] = useState<string | null>(null);
  const [weightInput, setWeightInput] = useState(() => String(defaultDraft.weight));

  useEffect(() => {
    let isMounted = true;
    async function hydrate() {
      try {
        const authUserId = await getCurrentUserId();
        if (!isMounted) return;
        setUserId(authUserId);

        const [savedPlan, savedProfile, savedExceptions] = await Promise.all([
          loadWorkoutPlan(authUserId),
          loadProfile(authUserId),
          loadWorkoutExceptions(authUserId)
        ]);

        if (!isMounted) return;
        const initialWeekStartDateKey = getAmsterdamWeekStartDateKey();
        const currentWeekDateKeys = new Set(dayOrder.map((day) => getCurrentWeekDateForDay(day, initialWeekStartDateKey)));
        const currentWeekExceptions = savedExceptions.filter(
          (item) => currentWeekDateKeys.has(item.date) || (item.newDate ? currentWeekDateKeys.has(item.newDate) : false)
        );

        const profileWeightKg = savedProfile?.weightKg ?? 70;
        if (savedPlan) setPlan(normalizePlanWithMetrics(savedPlan, profileWeightKg));
        if (savedProfile?.weightKg) setProfileWeight(savedProfile.weightKg);
        if (savedProfile) setProfile(savedProfile);
        setExceptions(currentWeekExceptions);
        setCurrentWeekStartDateKey(initialWeekStartDateKey);
        setHasLoadedInitialData(true);
      } catch (error) {
        if (!isMounted) return;
        setMessage(error instanceof Error ? error.message : "Unable to load workout data.");
      }
    }

    void hydrate();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      const latestWeekStartDateKey = getAmsterdamWeekStartDateKey();
      if (latestWeekStartDateKey === currentWeekStartDateKey) return;

      const nextWeekDateKeys = new Set(dayOrder.map((day) => getCurrentWeekDateForDay(day, latestWeekStartDateKey)));
      setExceptions((previous) =>
        previous.filter((item) => nextWeekDateKeys.has(item.date) || (item.newDate ? nextWeekDateKeys.has(item.newDate) : false))
      );
      setCurrentWeekStartDateKey(latestWeekStartDateKey);
    }, 60_000);

    return () => window.clearInterval(intervalId);
  }, [currentWeekStartDateKey]);

  useEffect(() => {
    if (!hasLoadedInitialData || !userId) return;
    void saveWorkoutPlan(userId, plan);
  }, [hasLoadedInitialData, plan, userId]);

  useEffect(() => {
    if (!hasLoadedInitialData || !userId) return;
    void replaceWorkoutExceptions(userId, exceptions);
  }, [exceptions, hasLoadedInitialData, userId]);

  useEffect(() => {
    if (!hasLoadedInitialData) return;
    const nextTargets = recalculateAndPersistTodayTargets({
      profile,
      workouts: plan,
      exceptions,
      disabledMacros: [],
      force: true
    });
    if (nextTargets && userId) void saveDailyTargets(userId, nextTargets);
  }, [exceptions, hasLoadedInitialData, plan, profile, userId]);

  useEffect(() => {
    if (!isAddExerciseOpen) {
      setAddExerciseDays([selectedDay]);
      setShowScheduleDays(false);
      setAddExerciseTodayOnly(false);
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
    return selectedExercises
      .filter((exercise) => {
        const matchType = matchesTypeFilter(exercise, typeFilter);
        const matchSub = subFilter === "all" ? true : exercise.muscleGroup === subFilter;
        const matchSpecify = specifyFilter === "all" ? true : exercise.specifyMuscle === specifyFilter;
        return matchType && matchSub && matchSpecify;
      });
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
    return history.slice(-3).reverse();
  }, [progressExercise]);

  const selectedDaySummary = useMemo(() => {
    return selectedExercises.reduce(
      (sum, exercise) => ({
        calories: sum.calories + ensureCalories(exercise, profileWeight)
      }),
      { calories: 0 }
    );
  }, [profileWeight, selectedExercises]);

  const selectedDateKey = useMemo(
    () => getCurrentWeekDateForDay(selectedDay, currentWeekStartDateKey),
    [currentWeekStartDateKey, selectedDay]
  );

  const pausedExerciseIdsForSelectedDate = useMemo(() => {
    const pausedIds = new Set<string>();
    for (const item of exceptions) {
      if (item.exceptionType !== "missed" || item.date !== selectedDateKey) continue;
      if (typeof item.originalWorkoutId === "string") pausedIds.add(item.originalWorkoutId);
    }
    return pausedIds;
  }, [exceptions, selectedDateKey]);

  useEffect(() => {
    setWeightInput(String(draft.weight));
  }, [draft.weight]);

  function setDraftField<K extends keyof PlannerDraft>(key: K, value: PlannerDraft[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function handleWeightInputChange(rawValue: string) {
    setWeightInput(rawValue);
    const parsedWeight = parseLocalizedWeightInput(rawValue);
    if (parsedWeight !== null) {
      setDraftField("weight", parsedWeight);
    }
  }

  function handleWeightInputBlur() {
    const parsedWeight = parseLocalizedWeightInput(weightInput);
    const nextWeight = parsedWeight ?? 0;
    setDraftField("weight", nextWeight);
    setWeightInput(String(nextWeight));
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
    setAddExerciseTodayOnly(false);
    setMessage(null);
    setIsAddExerciseOpen(true);
  }

  function closeAddExerciseModal() {
    setIsAddExerciseOpen(false);
    setShowScheduleDays(false);
    setAddExerciseDays([selectedDay]);
    setAddExerciseTodayOnly(false);
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

    if (addExerciseTodayOnly) {
      const todayDay = getAmsterdamToday();
      const todayDateKey = getCurrentWeekDateForDay(todayDay, currentWeekStartDateKey);
      const nowIso = new Date().toISOString();
      const oneTimeExercise = buildExerciseForDay(todayDay);
      const oneTimeException: WorkoutException = {
        id: crypto.randomUUID(),
        date: todayDateKey,
        exceptionType: "extra",
        extraWorkoutData: oneTimeExercise,
        createdAt: nowIso,
        updatedAt: nowIso
      };
      setExceptions((prev) => [oneTimeException, ...prev]);
      setMessage(`One-time exercise added for today (${formatDayDateLabel(todayDateKey)}).`);
      setPopupSubmissionNotice("Exercise saved.");
      closeAddExerciseModal();
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
    setPopupSubmissionNotice("Exercise saved.");
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
    setPopupSubmissionNotice(editingExerciseId ? "Exercise updated." : "Exercise saved.");

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

  useEffect(() => {
    if (!popupSubmissionNotice) return;
    const timeoutId = window.setTimeout(() => setPopupSubmissionNotice(null), 2200);
    return () => window.clearTimeout(timeoutId);
  }, [popupSubmissionNotice]);

  function confirmDelete() {
    if (!deleteExerciseId) return;

    if (deleteExerciseScope === "single_date") {
      const now = new Date().toISOString();
      const selectedDateKey = getCurrentWeekDateForDay(selectedDay, currentWeekStartDateKey);
      const payload: WorkoutException = {
        id: crypto.randomUUID(),
        date: selectedDateKey,
        exceptionType: "missed",
        originalWorkoutId: deleteExerciseId,
        createdAt: now,
        updatedAt: now
      };
      setExceptions((prev) => [payload, ...prev]);
      setMessage("Exercise updated.");
    } else {
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
      setMessage("Exercise removed from weekly schedule.");
    }

    setDeleteExerciseId(null);
    setDeleteExerciseScope("single_date");
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

  function reorderExercisesForSelectedDay(sourceExerciseId: string, targetExerciseId: string) {
    if (sourceExerciseId === targetExerciseId) return;

    setPlan((prev) => {
      const dayLog = prev[selectedDay];
      const sourceIndex = dayLog.exercises.findIndex((exercise) => exercise.id === sourceExerciseId);
      const targetIndex = dayLog.exercises.findIndex((exercise) => exercise.id === targetExerciseId);

      if (sourceIndex < 0 || targetIndex < 0) return prev;

      const nextExercises = [...dayLog.exercises];
      const [movedExercise] = nextExercises.splice(sourceIndex, 1);
      if (!movedExercise) return prev;
      nextExercises.splice(targetIndex, 0, movedExercise);

      return {
        ...prev,
        [selectedDay]: {
          ...dayLog,
          exercises: nextExercises
        }
      };
    });
  }

  return (
    <>
      {deleteExerciseId ? (
        <AppModal
          title="Delete exercise?"
          onClose={() => { setDeleteExerciseId(null); setDeleteExerciseScope("single_date"); }}
          maxWidthClassName="sm:max-w-md"
          footer={(
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => { setDeleteExerciseId(null); setDeleteExerciseScope("single_date"); }} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">Cancel</button>
              <button type="button" onClick={confirmDelete} className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-500">Delete</button>
            </div>
          )}
        >
            <p className="mt-2 text-sm text-slate-600">Choose whether to remove this exercise for just this date or from the weekly plan.</p>
            <div className="mt-4 space-y-2">
              <label className="flex items-start gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700">
                <input
                  type="radio"
                  name="delete-scope"
                  checked={deleteExerciseScope === "single_date"}
                  onChange={() => setDeleteExerciseScope("single_date")}
                />
                <span>Only this date ({formatDayDateLabel(getCurrentWeekDateForDay(selectedDay, currentWeekStartDateKey))})</span>
              </label>
              <label className="flex items-start gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700">
                <input
                  type="radio"
                  name="delete-scope"
                  checked={deleteExerciseScope === "weekly_schedule"}
                  onChange={() => setDeleteExerciseScope("weekly_schedule")}
                />
                <span>Remove from weekly schedule</span>
              </label>
            </div>
        </AppModal>
      ) : null}

      {duplicateExercise ? (
        <AppModal
          title="Duplicate Exercise"
          onClose={closeDuplicateModal}
          maxWidthClassName="sm:max-w-md"
          footer={(
            <div className="flex justify-end gap-2">
              <button type="button" onClick={closeDuplicateModal} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">Cancel</button>
              <button type="button" onClick={duplicateExerciseToDays} disabled={!duplicateTargets.length} className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-slate-300">Duplicate Exercise</button>
            </div>
          )}
        >
            <p className="text-sm font-medium text-slate-700">{duplicateExercise.name}</p>
            <p className="text-xs text-slate-500">Currently on: {dayLabels[selectedDay]}</p>
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

        </AppModal>
      ) : null}

      {progressExercise ? (
        <AppModal
          title="Exercise Progress"
          onClose={closeProgress}
          maxWidthClassName="sm:max-w-2xl"
          footer={(
            <div className="flex justify-end gap-2">
              <button type="button" onClick={closeProgress} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">Close</button>
              <button type="submit" form="exercise-progress-form" className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-400">Save Changes</button>
            </div>
          )}
        >
              <div>
                <p className="text-sm text-slate-500">{progressExercise.name}</p>
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
                      <tr className="border-t border-emerald-100 bg-emerald-50 text-slate-700">
                        <td className="px-3 py-2 font-semibold">Current</td>
                        <td className="px-3 py-2">{draft.type === "cardio" || (draft.type === "crossfit" && draft.crossfitUseDuration) ? `${draft.durationMinutes} min` : "-"}</td>
                        <td className="px-3 py-2">{draft.type === "fitness" || (draft.type === "crossfit" && draft.crossfitUseSets) ? draft.sets : "-"}</td>
                        <td className="px-3 py-2">{draft.type === "fitness" || (draft.type === "crossfit" && draft.crossfitUseReps) ? draft.reps : "-"}</td>
                        <td className="px-3 py-2">{draft.type === "fitness" || (draft.type === "crossfit" && draft.crossfitUseWeight) ? `${draft.weight} kg` : "-"}</td>
                      </tr>
                      {previousProgresses.length ? previousProgresses.map((entry, index) => (
                        <tr key={`${entry.recordedAt}-${index}`} className="border-t border-slate-100 text-slate-600">
                          <td className="px-3 py-2">{formatRecordedDate(entry.recordedAt)}</td>
                          <td className="px-3 py-2">{typeof entry.durationMinutes === "number" ? `${entry.durationMinutes} min` : "-"}</td>
                          <td className="px-3 py-2">{typeof entry.sets === "number" ? entry.sets : "-"}</td>
                          <td className="px-3 py-2">{typeof entry.reps === "number" ? entry.reps : "-"}</td>
                          <td className="px-3 py-2">{typeof entry.weight === "number" ? `${entry.weight} kg` : "-"}</td>
                        </tr>
                      )) : (
                        <tr className="border-t border-slate-100 text-slate-500">
                          <td className="px-3 py-2" colSpan={5}>No previous changes yet.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            <form id="exercise-progress-form" onSubmit={saveExercise} className="mt-4 space-y-4">
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
                      <button type="button" onClick={() => setDraftField("weight", Math.max(0, draft.weight - WEIGHT_STEP_KG))} className="px-3">-</button>
                      <input type="text" inputMode="decimal" className="w-full border-x border-slate-200 px-2 py-2" value={weightInput} onChange={(event) => handleWeightInputChange(event.target.value)} onBlur={handleWeightInputBlur} onFocus={(event) => event.target.select()} />
                      <button type="button" onClick={() => setDraftField("weight", draft.weight + WEIGHT_STEP_KG)} className="px-3">+</button>
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
                        <button type="button" disabled={!draft.crossfitUseWeight} onClick={() => setDraftField("weight", Math.max(0, draft.weight - WEIGHT_STEP_KG))} className="px-3 disabled:cursor-not-allowed disabled:opacity-50">-</button>
                        <input type="text" inputMode="decimal" disabled={!draft.crossfitUseWeight} className="w-full border-x border-slate-200 px-2 py-2 disabled:bg-slate-100" value={weightInput} onChange={(event) => handleWeightInputChange(event.target.value)} onBlur={handleWeightInputBlur} onFocus={(event) => event.target.select()} />
                        <button type="button" disabled={!draft.crossfitUseWeight} onClick={() => setDraftField("weight", draft.weight + WEIGHT_STEP_KG)} className="px-3 disabled:cursor-not-allowed disabled:opacity-50">+</button>
                      </div>
                    </label>
                  </div>
                </div>
              ) : null}

              <label className="block text-sm text-slate-700">Notes
                <textarea className="mt-1 min-h-20 w-full rounded-xl border border-slate-200 px-3 py-2" value={draft.notes} onChange={(event) => setDraftField("notes", event.target.value)} />
              </label>

            </form>
        </AppModal>
      ) : null}

      {isAddExerciseOpen ? (
        <AppModal
          title={editingExerciseId ? "Edit Exercise" : "Add Exercise"}
          onClose={closeAddExerciseModal}
          maxWidthClassName="sm:max-w-2xl"
          footer={(
            <div className="space-y-3">
              <div className="flex gap-2">
                <button type="button" onClick={closeAddExerciseModal} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">Cancel</button>
                <button type="button" onClick={saveExerciseForSelectedDays} className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-400">Save Exercise</button>
              </div>
              {message ? <p className="text-sm text-slate-600">{message}</p> : null}
            </div>
          )}
        >
            <p className="text-sm text-slate-500">{dayLabels[selectedDay]}</p>
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
                        <button type="button" onClick={() => setDraftField("weight", Math.max(0, draft.weight - WEIGHT_STEP_KG))} className="px-3">-</button>
                        <input type="text" inputMode="decimal" className="w-full border-x border-slate-200 px-2 py-2 bg-transparent" value={weightInput} onChange={(event) => handleWeightInputChange(event.target.value)} onBlur={handleWeightInputBlur} onFocus={(event) => event.target.select()} />
                        <button type="button" onClick={() => setDraftField("weight", draft.weight + WEIGHT_STEP_KG)} className="px-3">+</button>
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
                      <button type="button" onClick={() => setDraftField("weight", Math.max(0, draft.weight - WEIGHT_STEP_KG))} className="px-3">-</button>
                      <input type="text" inputMode="decimal" className="w-full border-x border-slate-200 px-2 py-2" value={weightInput} onChange={(event) => handleWeightInputChange(event.target.value)} onBlur={handleWeightInputBlur} onFocus={(event) => event.target.select()} />
                      <button type="button" onClick={() => setDraftField("weight", draft.weight + WEIGHT_STEP_KG)} className="px-3">+</button>
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
                    checked={addExerciseTodayOnly}
                    onChange={(event) => {
                      const checked = event.target.checked;
                      setAddExerciseTodayOnly(checked);
                      if (checked) {
                        setShowScheduleDays(false);
                        setAddExerciseDays([selectedDay]);
                      }
                    }}
                  />
                  Schedule this exercise one time only for today ({formatDayDateLabel(getCurrentWeekDateForDay(getAmsterdamToday(), currentWeekStartDateKey))})
                </label>

                <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={showScheduleDays}
                    disabled={addExerciseTodayOnly}
                    onChange={(event) => {
                      const checked = event.target.checked;
                      if (addExerciseTodayOnly) return;
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

              </div>
            </form>
        </AppModal>
      ) : null}
      {popupSubmissionNotice ? (
        <div className="fixed inset-x-4 bottom-4 z-[60] mx-auto w-full max-w-sm rounded-xl bg-slate-900 px-4 py-3 text-center text-sm font-medium text-white shadow-lg">
          {popupSubmissionNotice}
        </div>
      ) : null}

      <MobileSwipePage className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8 md:px-8">
        <AppHeaderNav />

        <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-3xl font-semibold text-slate-900">Workouts Planner</h1>
              <p className="mt-2 text-sm text-slate-500">Plan your weekly workouts and update progress per exercise.</p>
            </div>
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
              <h2 className="text-xl font-semibold text-slate-900">{formatDayDateLabel(selectedDateKey)} | {dayLabels[selectedDay]}</h2>
              <button type="button" onClick={openAddExerciseModal} className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-400">Add Exercise</button>
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

              {subFilter !== "all" ? (
                <div>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Specific muscle</p>
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
                </div>
              ) : null}

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
            <p className="mt-3 text-xs text-slate-500">Tip: drag and drop exercises to change their display order.</p>

            {selectedExercises.length === 0 ? (
              <p className="mt-4 rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">No planned exercises yet.</p>
            ) : filteredExercises.length === 0 ? (
              <p className="mt-4 rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">No exercises match the selected filters.</p>
            ) : (
              <ul className="mt-4 space-y-3">
                {filteredExercises.map((exercise) => {
                  const isPausedForDate = pausedExerciseIdsForSelectedDate.has(exercise.id);
                  return (
                    <li
                      key={exercise.id}
                      draggable
                      onDragStart={(event) => {
                        setDraggedExerciseId(exercise.id);
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData("text/plain", exercise.id);
                      }}
                      onDragOver={(event) => {
                        event.preventDefault();
                        event.dataTransfer.dropEffect = "move";
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        const sourceId = draggedExerciseId ?? event.dataTransfer.getData("text/plain");
                        if (!sourceId) return;
                        reorderExercisesForSelectedDay(sourceId, exercise.id);
                        setDraggedExerciseId(null);
                      }}
                      onDragEnd={() => setDraggedExerciseId(null)}
                      className={`rounded-xl border border-slate-200 p-4 cursor-pointer hover:bg-slate-50 ${draggedExerciseId === exercise.id ? "opacity-50" : ""}`}
                      onClick={() => openProgress(exercise)}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className={`font-semibold ${isPausedForDate ? "text-slate-500 line-through" : "text-slate-900"}`}>{exercise.name}</p>
                          {isPausedForDate ? (
                            <p className="mt-1 text-xs font-medium text-rose-700">🗑️ This excersize is only deleted for {formatDayDateLabel(selectedDateKey)}.</p>
                          ) : null}
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
                          {exercise.sourceType !== "system" ? <button type="button" aria-label="Duplicate exercise" onClick={(event) => { event.stopPropagation(); openDuplicateModal(exercise); }} className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100">Duplicate</button> : null}
                          {exercise.sourceType !== "system" ? <button type="button" aria-label="Delete exercise" onClick={(event) => { event.stopPropagation(); setDeleteExerciseId(exercise.id); }} className="rounded-lg border border-rose-200 px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50">Delete</button> : null}
                        </div>
                      </div>
                    </li>
                  );
                })}
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
      </MobileSwipePage>
    </>
  );
}
