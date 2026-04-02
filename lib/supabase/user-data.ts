import { createClient } from "@/lib/supabase/client";
import { DailyTargets, MacroKey, ProfileInput, QuickMeal, StoredMealLog, WorkoutDay, WorkoutException, WorkoutExercise, WorkoutWeekPlan, BodyProgressHistory, BodyMetricProgressEntry } from "@/lib/types";

const dayOrder: WorkoutDay[] = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

function toDateKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export async function getCurrentUserId() {
  const supabase = createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!data.user) throw new Error("You must be logged in.");
  return data.user.id;
}

export async function loadProfile(userId: string): Promise<ProfileInput | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  return {
    age: data.age,
    gender: data.gender,
    heightCm: Number(data.height_cm),
    weightKg: Number(data.weight_kg),
    waistCm: Number(data.waist_cm),
    trainingExperience: data.training_experience,
    averageDailySteps: data.average_daily_steps,
    workType: data.work_type,
    primaryGoal: data.primary_goal ?? undefined,
    goalIntensity: data.goal_intensity ?? undefined,
    goalDescription: data.goal_description ?? undefined,
    goalText: data.goal_text
  } as ProfileInput;
}

export async function saveProfile(userId: string, profile: ProfileInput) {
  const supabase = createClient();
  const payload = {
    user_id: userId,
    age: profile.age,
    gender: profile.gender,
    height_cm: profile.heightCm,
    weight_kg: profile.weightKg,
    waist_cm: profile.waistCm,
    training_experience: profile.trainingExperience,
    average_daily_steps: profile.averageDailySteps,
    work_type: profile.workType,
    primary_goal: profile.primaryGoal ?? null,
    goal_intensity: profile.goalIntensity ?? null,
    goal_description: profile.goalDescription ?? null,
    goal_text: profile.goalText,
    updated_at: new Date().toISOString()
  };

  const { error } = await supabase.from("profiles").upsert(payload, { onConflict: "user_id" });
  if (error) throw error;
}

export async function loadUserSettings(userId: string): Promise<{
  disabledMacros: MacroKey[];
  macroManualMode: boolean;
  weeklyMacroScheme: Record<WorkoutDay, Record<MacroKey, number>> | null;
}> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("user_settings")
    .select("disabled_macros, macro_manual_mode, weekly_macro_scheme")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;

  return {
    disabledMacros: (data?.disabled_macros ?? []) as MacroKey[],
    macroManualMode: Boolean(data?.macro_manual_mode ?? false),
    weeklyMacroScheme: (data?.weekly_macro_scheme as Record<WorkoutDay, Record<MacroKey, number>> | null) ?? null
  };
}

export async function saveUserSettings(userId: string, settings: {
  disabledMacros: MacroKey[];
  macroManualMode: boolean;
  weeklyMacroScheme: Record<WorkoutDay, Record<MacroKey, number>>;
}) {
  const supabase = createClient();
  const { error } = await supabase.from("user_settings").upsert({
    user_id: userId,
    disabled_macros: settings.disabledMacros,
    macro_manual_mode: settings.macroManualMode,
    weekly_macro_scheme: settings.weeklyMacroScheme,
    updated_at: new Date().toISOString()
  }, { onConflict: "user_id" });
  if (error) throw error;
}

export async function loadDailyTargets(userId: string, dateKey = toDateKey()): Promise<DailyTargets | null> {
  const supabase = createClient();
  const { data, error } = await supabase.from("daily_targets").select("*").eq("user_id", userId).eq("target_date", dateKey).maybeSingle();
  if (error) throw error;
  if (!data) return null;

  return {
    goalCategory: data.goal_category,
    goalType: data.goal_type ?? undefined,
    bmr: data.bmr,
    activityFactor: Number(data.activity_factor),
    tdee: data.tdee,
    calorieStrategy: data.calorie_strategy,
    calories: data.calories,
    protein: data.protein,
    carbs: data.carbs,
    fat: data.fat,
    disabledMacros: (data.disabled_macros ?? []) as MacroKey[],
    explanation: data.explanation,
    macroReasoning: data.macro_reasoning
  } as DailyTargets;
}

export async function saveDailyTargets(userId: string, targets: DailyTargets, dateKey = toDateKey()) {
  const supabase = createClient();
  const { error } = await supabase.from("daily_targets").upsert({
    user_id: userId,
    target_date: dateKey,
    goal_category: targets.goalCategory,
    goal_type: targets.goalType ?? null,
    bmr: targets.bmr,
    activity_factor: targets.activityFactor,
    tdee: targets.tdee,
    calorie_strategy: targets.calorieStrategy,
    calories: targets.calories,
    protein: targets.protein,
    carbs: targets.carbs,
    fat: targets.fat,
    disabled_macros: targets.disabledMacros ?? [],
    explanation: targets.explanation,
    macro_reasoning: targets.macroReasoning,
    updated_at: new Date().toISOString()
  }, { onConflict: "user_id,target_date" });
  if (error) throw error;
}

export async function loadMeals(userId: string): Promise<StoredMealLog[]> {
  const supabase = createClient();
  const { data, error } = await supabase.from("meals").select("*").eq("user_id", userId).order("created_at", { ascending: false });
  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    title: row.title ?? undefined,
    text: row.text,
    source: row.source,
    sourceType: row.source_type,
    quickMealId: row.quick_meal_id ?? undefined,
    mealDate: row.meal_date,
    result: row.result,
    createdAt: row.created_at
  })) as StoredMealLog[];
}

export async function replaceMeals(userId: string, meals: StoredMealLog[]) {
  const supabase = createClient();
  const { error: delError } = await supabase.from("meals").delete().eq("user_id", userId);
  if (delError) throw delError;
  if (!meals.length) return;

  const { error } = await supabase.from("meals").insert(
    meals.map((meal) => ({
      id: meal.id,
      user_id: userId,
      title: meal.title ?? null,
      text: meal.text,
      source: meal.source,
      source_type: meal.sourceType,
      quick_meal_id: meal.quickMealId ?? null,
      meal_date: meal.mealDate,
      result: meal.result,
      created_at: meal.createdAt
    }))
  );
  if (error) throw error;
}

export async function loadQuickMeals(userId: string): Promise<QuickMeal[]> {
  const supabase = createClient();
  const { data, error } = await supabase.from("quick_meals").select("*").eq("user_id", userId).order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    calories: row.calories,
    protein: row.protein,
    carbs: row.carbs,
    fat: row.fat,
    isDailyMeal: row.is_daily_meal,
    dailyMealDays: row.daily_meal_days,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  })) as QuickMeal[];
}

export async function replaceQuickMeals(userId: string, quickMeals: QuickMeal[]) {
  const supabase = createClient();
  const { error: delError } = await supabase.from("quick_meals").delete().eq("user_id", userId);
  if (delError) throw delError;
  if (!quickMeals.length) return;

  const { error } = await supabase.from("quick_meals").insert(
    quickMeals.map((meal) => ({
      id: meal.id,
      user_id: userId,
      title: meal.title,
      calories: meal.calories,
      protein: meal.protein,
      carbs: meal.carbs,
      fat: meal.fat,
      is_daily_meal: meal.isDailyMeal,
      daily_meal_days: meal.dailyMealDays,
      created_at: meal.createdAt,
      updated_at: meal.updatedAt
    }))
  );
  if (error) throw error;
}

export async function loadWorkoutPlan(userId: string): Promise<WorkoutWeekPlan | null> {
  const supabase = createClient();
  const { data: planRow, error: planError } = await supabase.from("workout_plans").select("id").eq("user_id", userId).maybeSingle();
  if (planError) throw planError;
  if (!planRow) return null;

  const { data: dayLogs, error: logsError } = await supabase.from("workout_day_logs").select("id, day_of_week, notes").eq("plan_id", planRow.id);
  if (logsError) throw logsError;

  const dayLogIds = (dayLogs ?? []).map((row) => row.id);
  const { data: exercises, error: exError } = dayLogIds.length
    ? await supabase.from("workout_exercises").select("*").in("day_log_id", dayLogIds)
    : { data: [], error: null };
  if (exError) throw exError;

  const byDayLog = new Map<string, WorkoutExercise[]>();
  (exercises ?? []).forEach((exerciseRow) => {
    const mapped: WorkoutExercise = {
      id: exerciseRow.id,
      type: exerciseRow.type,
      workoutDayId: exerciseRow.workout_day_id,
      name: exerciseRow.name,
      durationMinutes: exerciseRow.duration_minutes,
      sets: exerciseRow.sets,
      reps: exerciseRow.reps,
      weight: exerciseRow.weight,
      trainingVolume: exerciseRow.training_volume,
      estimatedCalories: exerciseRow.estimated_calories,
      strengthPoints: exerciseRow.strength_points,
      cardioPoints: exerciseRow.cardio_points,
      notes: exerciseRow.notes,
      progressHistory: exerciseRow.progress_history ?? [],
      createdAt: exerciseRow.created_at,
      updatedAt: exerciseRow.updated_at,
      intensity: exerciseRow.intensity,
      isPaused: exerciseRow.is_paused,
      sourceType: exerciseRow.source_type,
      systemTag: exerciseRow.system_tag,
      muscleGroup: exerciseRow.muscle_group,
      specifyMuscle: exerciseRow.specify_muscle,
      movementType: exerciseRow.movement_type
    } as WorkoutExercise;

    const list = byDayLog.get(exerciseRow.day_log_id) ?? [];
    list.push(mapped);
    byDayLog.set(exerciseRow.day_log_id, list);
  });

  const defaultPlan = dayOrder.reduce((acc, day) => {
    acc[day] = { notes: "", exercises: [] };
    return acc;
  }, {} as WorkoutWeekPlan);

  (dayLogs ?? []).forEach((logRow) => {
    const day = logRow.day_of_week as WorkoutDay;
    defaultPlan[day] = {
      notes: logRow.notes ?? "",
      exercises: byDayLog.get(logRow.id) ?? []
    };
  });

  return defaultPlan;
}

export async function saveWorkoutPlan(userId: string, plan: WorkoutWeekPlan) {
  const supabase = createClient();
  const { data: planRow, error: planError } = await supabase
    .from("workout_plans")
    .upsert({ user_id: userId, updated_at: new Date().toISOString() }, { onConflict: "user_id" })
    .select("id")
    .single();
  if (planError) throw planError;

  const planId = planRow.id;

  const { error: deleteLogsError } = await supabase.from("workout_day_logs").delete().eq("plan_id", planId);
  if (deleteLogsError) throw deleteLogsError;

  const { data: insertedLogs, error: insertLogsError } = await supabase
    .from("workout_day_logs")
    .insert(dayOrder.map((day) => ({ plan_id: planId, day_of_week: day, notes: plan[day]?.notes ?? "" })))
    .select("id, day_of_week");
  if (insertLogsError) throw insertLogsError;

  const logIdByDay = new Map<WorkoutDay, string>((insertedLogs ?? []).map((row) => [row.day_of_week as WorkoutDay, row.id]));

  const exerciseRows = dayOrder.flatMap((day) => {
    const dayLogId = logIdByDay.get(day);
    if (!dayLogId) return [];

    return (plan[day]?.exercises ?? []).map((exercise) => ({
      id: exercise.id,
      day_log_id: dayLogId,
      type: exercise.type,
      workout_day_id: exercise.workoutDayId,
      name: exercise.name,
      duration_minutes: "durationMinutes" in exercise ? exercise.durationMinutes : null,
      sets: "sets" in exercise ? exercise.sets ?? null : null,
      reps: "reps" in exercise ? exercise.reps ?? null : null,
      weight: "weight" in exercise ? exercise.weight ?? null : null,
      training_volume: exercise.trainingVolume,
      estimated_calories: exercise.estimatedCalories,
      strength_points: exercise.strengthPoints,
      cardio_points: exercise.cardioPoints,
      notes: exercise.notes,
      progress_history: exercise.progressHistory,
      intensity: exercise.intensity ?? null,
      is_paused: exercise.isPaused,
      source_type: exercise.sourceType ?? null,
      system_tag: exercise.systemTag ?? null,
      muscle_group: exercise.muscleGroup,
      specify_muscle: exercise.specifyMuscle ?? null,
      movement_type: exercise.movementType ?? null,
      created_at: exercise.createdAt,
      updated_at: exercise.updatedAt
    }));
  });

  if (!exerciseRows.length) return;
  const { error: insertExercisesError } = await supabase.from("workout_exercises").insert(exerciseRows);
  if (insertExercisesError) throw insertExercisesError;
}

export async function loadWorkoutExceptions(userId: string): Promise<WorkoutException[]> {
  const supabase = createClient();
  const { data, error } = await supabase.from("workout_exceptions").select("*").eq("user_id", userId).order("created_at", { ascending: false });
  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    date: row.date,
    exceptionType: row.exception_type,
    originalWorkoutId: row.original_workout_id ?? undefined,
    replacementWorkoutData: row.replacement_workout_data ?? undefined,
    extraWorkoutData: row.extra_workout_data ?? undefined,
    newDate: row.new_date ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  })) as WorkoutException[];
}

export async function replaceWorkoutExceptions(userId: string, exceptions: WorkoutException[]) {
  const supabase = createClient();
  const { error: deleteError } = await supabase.from("workout_exceptions").delete().eq("user_id", userId);
  if (deleteError) throw deleteError;
  if (!exceptions.length) return;

  const { error } = await supabase.from("workout_exceptions").insert(exceptions.map((item) => ({
    id: item.id,
    user_id: userId,
    date: item.date,
    exception_type: item.exceptionType,
    original_workout_id: item.originalWorkoutId ?? null,
    replacement_workout_data: item.replacementWorkoutData ?? null,
    extra_workout_data: item.extraWorkoutData ?? null,
    new_date: item.newDate ?? null,
    created_at: item.createdAt,
    updated_at: item.updatedAt
  })));
  if (error) throw error;
}

export async function loadBodyProgress(userId: string): Promise<BodyProgressHistory> {
  const supabase = createClient();
  const { data, error } = await supabase.from("body_metric_entries").select("*").eq("user_id", userId).order("recorded_at", { ascending: true });
  if (error) throw error;

  const weight: BodyMetricProgressEntry[] = [];
  const waist: BodyMetricProgressEntry[] = [];

  (data ?? []).forEach((row) => {
    const entry = {
      id: row.id,
      value: Number(row.value),
      recordedAt: row.recorded_at,
      createdAt: row.created_at
    };
    if (row.metric === "weight") weight.push(entry);
    if (row.metric === "waist") waist.push(entry);
  });

  return { weight, waist };
}

export async function replaceBodyProgress(userId: string, bodyProgress: BodyProgressHistory) {
  const supabase = createClient();
  const { error: deleteError } = await supabase.from("body_metric_entries").delete().eq("user_id", userId);
  if (deleteError) throw deleteError;

  const rows = [
    ...bodyProgress.weight.map((entry) => ({
      id: entry.id,
      user_id: userId,
      metric: "weight",
      value: entry.value,
      recorded_at: entry.recordedAt,
      created_at: entry.createdAt
    })),
    ...bodyProgress.waist.map((entry) => ({
      id: entry.id,
      user_id: userId,
      metric: "waist",
      value: entry.value,
      recorded_at: entry.recordedAt,
      created_at: entry.createdAt
    }))
  ];

  if (!rows.length) return;
  const { error } = await supabase.from("body_metric_entries").insert(rows);
  if (error) throw error;
}
