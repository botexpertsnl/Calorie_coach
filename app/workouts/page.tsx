"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { AppHeaderNav } from "@/components/AppHeaderNav";
import { STORAGE_KEYS, readJson, writeJson } from "@/lib/local-data";
import { calculateTrainingVolume, estimateCaloriesForType } from "@/lib/workouts";
import {
  CardioExercise,
  CrossfitExercise,
  FitnessExercise,
  ProfileInput,
  WorkoutDay,
  WorkoutExercise,
  WorkoutExerciseType,
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

export default function WorkoutsPage() {
  const [plan, setPlan] = useState<WorkoutWeekPlan>(createDefaultPlan());
  const [selectedDay, setSelectedDay] = useState<WorkoutDay>("monday");
  const [draft, setDraft] = useState<PlannerDraft>(defaultDraft);
  const [editingExerciseId, setEditingExerciseId] = useState<string | null>(null);
  const [deleteExerciseId, setDeleteExerciseId] = useState<string | null>(null);
  const [progressExerciseId, setProgressExerciseId] = useState<string | null>(null);
  const [profileWeight, setProfileWeight] = useState(70);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const savedPlan = readJson<WorkoutWeekPlan>(STORAGE_KEYS.workouts);
    const savedProfile = readJson<ProfileInput>(STORAGE_KEYS.profile);

    if (savedPlan) setPlan(savedPlan);
    if (savedProfile?.weightKg) setProfileWeight(savedProfile.weightKg);
  }, []);

  useEffect(() => {
    writeJson(STORAGE_KEYS.workouts, plan);
  }, [plan]);

  function resetDraft(type: WorkoutExerciseType = "fitness") {
    setDraft({ ...defaultDraft, type });
    setEditingExerciseId(null);
  }

  const selectedExercises = useMemo(
    () => plan[selectedDay].exercises.filter((exercise) => !exercise.isPaused),
    [plan, selectedDay]
  );

  const progressExercise = useMemo(
    () => selectedExercises.find((exercise) => exercise.id === progressExerciseId) ?? null,
    [selectedExercises, progressExerciseId]
  );

  const previousProgresses = useMemo(() => {
    if (!progressExercise) return [];
    const history = getHistory(progressExercise);
    return history.slice(-2).reverse();
  }, [progressExercise]);

  const weeklySummary = useMemo(() => {
    let totalExercises = 0;
    let plannedSessions = 0;
    let totalCalories = 0;
    let totalFitnessVolume = 0;

    dayOrder.forEach((day) => {
      const hasExercises = plan[day].exercises.some((exercise) => !exercise.isPaused);
      if (hasExercises) plannedSessions += 1;

      plan[day].exercises.forEach((exercise) => {
        if (exercise.isPaused) return;
        totalExercises += 1;
        totalCalories += exercise.estimatedCalories;
        totalFitnessVolume += exercise.trainingVolume;
      });
    });

    return { plannedSessions, totalExercises, totalCalories, totalFitnessVolume };
  }, [plan]);

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

    // CrossFit: individually toggle optional fields
    const enabled = [draft.crossfitUseDuration, draft.crossfitUseSets, draft.crossfitUseReps, draft.crossfitUseWeight].some(Boolean);
    if (!enabled) return "Enable at least one CrossFit field (duration, sets, reps, or weight).";

    if (draft.crossfitUseDuration && draft.durationMinutes <= 0) return "CrossFit duration must be greater than zero when enabled.";
    if (draft.crossfitUseSets && draft.sets <= 0) return "CrossFit sets must be greater than zero when enabled.";
    if (draft.crossfitUseReps && draft.reps <= 0) return "CrossFit reps must be greater than zero when enabled.";
    if (draft.crossfitUseWeight && draft.weight < 0) return "CrossFit weight cannot be negative.";

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

      nextExercise = {
        id: editingExerciseId ?? crypto.randomUUID(),
        type: "cardio",
        durationMinutes: draft.durationMinutes,
        estimatedCalories,
        trainingVolume: 0,
        createdAt: existing?.createdAt ?? now,
        progressHistory: existing ? [...getHistory(existing), toProgressEntry(existing)] : [],
        ...shared
      } as CardioExercise;
    } else if (draft.type === "crossfit") {
      const duration = draft.crossfitUseDuration ? draft.durationMinutes : 0;
      const sets = draft.crossfitUseSets ? draft.sets : undefined;
      const reps = draft.crossfitUseReps ? draft.reps : undefined;
      const weight = draft.crossfitUseWeight ? draft.weight : undefined;

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

      nextExercise = {
        id: editingExerciseId ?? crypto.randomUUID(),
        type: "crossfit",
        durationMinutes: duration,
        weight,
        sets,
        reps,
        trainingVolume,
        estimatedCalories,
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

      nextExercise = {
        id: editingExerciseId ?? crypto.randomUUID(),
        type: "fitness",
        sets: draft.sets,
        reps: draft.reps,
        weight: draft.weight,
        trainingVolume,
        estimatedCalories,
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

    setMessage(editingExerciseId ? "Exercise updated." : "Exercise saved.");
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
              </div>
              <button type="button" onClick={closeProgress} className="rounded-md p-1 text-slate-400 hover:bg-slate-100">✕</button>
            </div>

            <form onSubmit={saveExercise} className="mt-4 space-y-4">
              <label className="block text-sm text-slate-700">Exercise name / description
                <input className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" value={draft.name} onChange={(event) => setDraftField("name", event.target.value)} />
              </label>

              {(draft.type === "cardio" || draft.type === "crossfit") ? (
                <label className="block text-sm text-slate-700">Duration (minutes)
                  <div className="mt-1 flex rounded-xl border border-slate-200">
                    <button type="button" onClick={() => setDraftField("durationMinutes", Math.max(0, draft.durationMinutes - 1))} className="px-3">-</button>
                    <input type="number" min={0} className="w-full border-x border-slate-200 px-2 py-2" value={draft.durationMinutes} onChange={(event) => setDraftField("durationMinutes", Number(event.target.value))} />
                    <button type="button" onClick={() => setDraftField("durationMinutes", draft.durationMinutes + 1)} className="px-3">+</button>
                  </div>
                </label>
              ) : null}

              {(draft.type === "fitness" || draft.type === "crossfit") ? (
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

        <section className="grid gap-4 md:grid-cols-4">
          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <p className="text-xs text-slate-500">Planned sessions</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">{weeklySummary.plannedSessions}</p>
          </div>
          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <p className="text-xs text-slate-500">Total exercises</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">{weeklySummary.totalExercises}</p>
          </div>
          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <p className="text-xs text-slate-500">Total calories</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">{weeklySummary.totalCalories}</p>
          </div>
          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <p className="text-xs text-slate-500">Total fitness volume</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">{weeklySummary.totalFitnessVolume}</p>
          </div>
        </section>

        <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <h1 className="text-3xl font-semibold text-slate-900">Workouts Planner</h1>
          <p className="mt-2 text-sm text-slate-500">Schedule workouts across the week and manage exercises by day.</p>
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
              <label className="block text-sm text-slate-700">Exercise type
                <select className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" value={draft.type} onChange={(event) => setDraftField("type", event.target.value as WorkoutExerciseType)}>
                  <option value="cardio">Cardio</option>
                  <option value="fitness">Fitness</option>
                  <option value="crossfit">CrossFit</option>
                </select>
              </label>

              <label className="block text-sm text-slate-700">Exercise name / description
                <input className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" value={draft.name} onChange={(event) => setDraftField("name", event.target.value)} placeholder="e.g., Bench Press" />
              </label>

              {draft.type === "cardio" ? (
                <label className="block text-sm text-slate-700">Duration (minutes)
                  <input type="number" min={1} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" value={draft.durationMinutes} onChange={(event) => setDraftField("durationMinutes", Number(event.target.value))} />
                </label>
              ) : null}

              {draft.type === "crossfit" ? (
                <div className="rounded-xl border border-slate-200 p-3 space-y-3">
                  <p className="text-sm font-semibold text-slate-800">CrossFit fields</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className={`rounded-lg border p-3 text-sm ${draft.crossfitUseDuration ? "border-emerald-200 bg-emerald-50/40 text-slate-700" : "border-slate-200 bg-slate-50 text-slate-500"}`}>
                      <span className="inline-flex items-center gap-2">
                        <input type="checkbox" checked={draft.crossfitUseDuration} onChange={(e) => setDraftField("crossfitUseDuration", e.target.checked)} />
                        Duration (minutes)
                      </span>
                      <div className={`mt-2 flex rounded-xl border ${draft.crossfitUseDuration ? "border-slate-200 bg-white" : "border-slate-200 bg-slate-100"}`}>
                        <button type="button" disabled={!draft.crossfitUseDuration} onClick={() => setDraftField("durationMinutes", Math.max(1, draft.durationMinutes - 1))} className="px-3 disabled:cursor-not-allowed disabled:opacity-50">-</button>
                        <input type="number" min={1} disabled={!draft.crossfitUseDuration} className="w-full border-x border-slate-200 px-2 py-2 disabled:bg-slate-100" value={draft.durationMinutes} onChange={(event) => setDraftField("durationMinutes", Number(event.target.value))} />
                        <button type="button" disabled={!draft.crossfitUseDuration} onClick={() => setDraftField("durationMinutes", draft.durationMinutes + 1)} className="px-3 disabled:cursor-not-allowed disabled:opacity-50">+</button>
                      </div>
                    </label>

                    <label className={`rounded-lg border p-3 text-sm ${draft.crossfitUseSets ? "border-emerald-200 bg-emerald-50/40 text-slate-700" : "border-slate-200 bg-slate-50 text-slate-500"}`}>
                      <span className="inline-flex items-center gap-2">
                        <input type="checkbox" checked={draft.crossfitUseSets} onChange={(e) => setDraftField("crossfitUseSets", e.target.checked)} />
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
                        <input type="checkbox" checked={draft.crossfitUseReps} onChange={(e) => setDraftField("crossfitUseReps", e.target.checked)} />
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
                        <input type="checkbox" checked={draft.crossfitUseWeight} onChange={(e) => setDraftField("crossfitUseWeight", e.target.checked)} />
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

              <label className="block text-sm text-slate-700">Intensity
                <select className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" value={draft.intensity} onChange={(event) => setDraftField("intensity", event.target.value as WorkoutIntensity)}>
                  <option value="low">Low</option>
                  <option value="moderate">Moderate</option>
                  <option value="high">High</option>
                </select>
              </label>

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
            {selectedExercises.length === 0 ? (
              <p className="mt-4 rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">No planned exercises yet.</p>
            ) : (
              <ul className="mt-4 space-y-3">
                {selectedExercises.map((exercise) => (
                  <li key={exercise.id} className="rounded-xl border border-slate-200 p-4 cursor-pointer hover:bg-slate-50" onClick={() => openProgress(exercise)}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-900">{exercise.name}</p>
                        {exercise.type === "cardio" ? <p className="mt-1 text-sm text-slate-600">Duration: {exercise.durationMinutes} minutes</p> : null}
                        {exercise.type === "fitness" ? <><p className="mt-1 text-sm text-slate-600">{exercise.sets} sets × {exercise.reps} reps × {exercise.weight} kg</p><p className="text-xs text-slate-500">Training Volume: {exercise.trainingVolume}</p></> : null}
                        {exercise.type === "crossfit" ? <><p className="mt-1 text-sm text-slate-600">Duration: {exercise.durationMinutes} minutes</p>{exercise.weight ? <p className="text-sm text-slate-600">Weight: {exercise.weight} kg</p> : null}{exercise.sets && exercise.reps ? <p className="text-sm text-slate-600">{exercise.sets} sets × {exercise.reps} reps</p> : null}</> : null}
                        {exercise.notes ? <p className="mt-1 text-xs text-slate-500">Notes: {exercise.notes}</p> : null}
                      </div>

                      <div className="flex gap-2">
                        <button type="button" onClick={(event) => { event.stopPropagation(); openProgress(exercise); }} className="rounded-lg border border-emerald-200 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50">Progress</button>
                        <button type="button" onClick={(event) => { event.stopPropagation(); setDeleteExerciseId(exercise.id); }} className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50">Delete</button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </main>
    </>
  );
}
