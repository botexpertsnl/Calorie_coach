"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { AppHeaderNav } from "@/components/AppHeaderNav";
import { STORAGE_KEYS, readJson, writeJson } from "@/lib/local-data";
import {
  CardioExercise,
  FitnessExercise,
  ProfileInput,
  WorkoutDay,
  WorkoutDayLog,
  WorkoutExercise,
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

type ExerciseType = "cardio" | "fitness";

type Intensity = "low" | "moderate" | "high";

type CardioDraft = {
  name: string;
  durationMin: number;
  intensity: Intensity;
};

type FitnessDraft = {
  name: string;
  sets: number;
  reps: number;
  weightKg: number;
};

const defaultCardioDraft: CardioDraft = { name: "", durationMin: 30, intensity: "moderate" };
const defaultFitnessDraft: FitnessDraft = { name: "", sets: 3, reps: 10, weightKg: 20 };

function inferMetFromDescription(description: string, intensity: Intensity) {
  const normalized = description.toLowerCase();
  let met = 6.5;

  if (/walk|hike/.test(normalized)) met = 4.5;
  if (/jog|run|sprint/.test(normalized)) met = 8.5;
  if (/bike|cycling|cycle/.test(normalized)) met = 7;
  if (/swim|rowing|elliptical|crossfit|hiit/.test(normalized)) met = 8.5;

  if (intensity === "low") met -= 1;
  if (intensity === "high") met += 1.5;

  return Math.max(3, met);
}

function calculateCardioCalories(weightKg: number, description: string, durationMin: number, intensity: Intensity) {
  const met = inferMetFromDescription(description, intensity);
  const calories = (met * weightKg * 3.5) / 200 * durationMin;
  return Math.max(0, Math.round(calories));
}

function toProgressEntry(exercise: WorkoutExercise): WorkoutProgressEntry {
  if (exercise.type === "cardio") {
    return {
      recordedAt: new Date().toISOString(),
      durationMin: exercise.durationMin,
      intensity: exercise.intensity,
      caloriesBurned: exercise.caloriesBurned
    };
  }

  return {
    recordedAt: new Date().toISOString(),
    sets: exercise.sets,
    reps: exercise.reps,
    weightKg: exercise.weightKg,
    trainingVolume: exercise.trainingVolume
  };
}

export default function WorkoutsPage() {
  const [plan, setPlan] = useState<WorkoutWeekPlan>(createDefaultPlan());
  const [selectedDay, setSelectedDay] = useState<WorkoutDay>("monday");
  const [exerciseType, setExerciseType] = useState<ExerciseType>("cardio");
  const [cardioDraft, setCardioDraft] = useState<CardioDraft>(defaultCardioDraft);
  const [fitnessDraft, setFitnessDraft] = useState<FitnessDraft>(defaultFitnessDraft);
  const [profileWeight, setProfileWeight] = useState(70);
  const [message, setMessage] = useState<string | null>(null);

  const [progressExerciseId, setProgressExerciseId] = useState<string | null>(null);
  const [progressCardioDraft, setProgressCardioDraft] = useState<CardioDraft>(defaultCardioDraft);
  const [progressFitnessDraft, setProgressFitnessDraft] = useState<FitnessDraft>(defaultFitnessDraft);
  const [deleteExerciseId, setDeleteExerciseId] = useState<string | null>(null);

  useEffect(() => {
    const savedPlan = readJson<WorkoutWeekPlan>(STORAGE_KEYS.workouts);
    const savedProfile = readJson<ProfileInput>(STORAGE_KEYS.profile);

    if (savedPlan) setPlan(savedPlan);
    if (savedProfile?.weightKg) setProfileWeight(savedProfile.weightKg);
  }, []);

  useEffect(() => {
    writeJson(STORAGE_KEYS.workouts, plan);
  }, [plan]);

  useEffect(() => {
    resetForm();
    setMessage(null);
  }, [selectedDay]);

  const activeDay = plan[selectedDay];

  const progressExercise = useMemo(
    () => activeDay.exercises.find((exercise) => exercise.id === progressExerciseId) ?? null,
    [activeDay.exercises, progressExerciseId]
  );

  const previousProgress = useMemo(() => {
    if (!progressExercise || !progressExercise.progressHistory.length) return null;
    return progressExercise.progressHistory[progressExercise.progressHistory.length - 1];
  }, [progressExercise]);

  const activeExercises = useMemo(
    () => activeDay.exercises.filter((exercise) => !exercise.isPaused),
    [activeDay.exercises]
  );

  const pausedExercises = useMemo(
    () => activeDay.exercises.filter((exercise) => exercise.isPaused),
    [activeDay.exercises]
  );

  const weeklySummary = useMemo(() => {
    let totalExercises = 0;
    let totalCardioCalories = 0;
    let totalVolume = 0;

    dayOrder.forEach((day) => {
      plan[day].exercises.forEach((exercise) => {
        if (exercise.isPaused) return;
        totalExercises += 1;
        if (exercise.type === "cardio") totalCardioCalories += exercise.caloriesBurned;
        if (exercise.type === "fitness") totalVolume += exercise.trainingVolume;
      });
    });

    return { totalExercises, totalCardioCalories, totalVolume };
  }, [plan]);

  function resetForm() {
    setCardioDraft(defaultCardioDraft);
    setFitnessDraft(defaultFitnessDraft);
    setExerciseType("cardio");
  }

  function saveExercise(event: FormEvent) {
    event.preventDefault();

    if (exerciseType === "cardio") {
      if (!cardioDraft.name.trim() || cardioDraft.durationMin <= 0) {
        setMessage("Please add a cardio name and valid duration.");
        return;
      }

      const caloriesBurned = calculateCardioCalories(profileWeight, cardioDraft.name, cardioDraft.durationMin, cardioDraft.intensity);
      const nextExercise: CardioExercise = {
        id: crypto.randomUUID(),
        type: "cardio",
        name: cardioDraft.name.trim(),
        durationMin: cardioDraft.durationMin,
        intensity: cardioDraft.intensity,
        caloriesBurned,
        progressHistory: [],
        isPaused: false
      };

      setPlan((prev) => {
        const dayLog = prev[selectedDay];
        const exercises = [nextExercise, ...dayLog.exercises];

        return { ...prev, [selectedDay]: { ...dayLog, exercises } };
      });

      setMessage("Cardio exercise saved.");
      resetForm();
      return;
    }

    if (!fitnessDraft.name.trim() || fitnessDraft.sets <= 0 || fitnessDraft.reps <= 0 || fitnessDraft.weightKg < 0) {
      setMessage("Please complete all fitness fields with valid values.");
      return;
    }

    const volume = Math.round(fitnessDraft.sets * fitnessDraft.reps * fitnessDraft.weightKg);
    const nextExercise: FitnessExercise = {
      id: crypto.randomUUID(),
      type: "fitness",
      name: fitnessDraft.name.trim(),
      sets: fitnessDraft.sets,
      reps: fitnessDraft.reps,
      weightKg: fitnessDraft.weightKg,
      trainingVolume: volume,
      progressHistory: [],
      isPaused: false
    };

    setPlan((prev) => {
      const dayLog = prev[selectedDay];
      const exercises = [nextExercise, ...dayLog.exercises];

      return { ...prev, [selectedDay]: { ...dayLog, exercises } };
    });

    setMessage("Fitness exercise saved.");
    resetForm();
  }

  function confirmDeleteExercise(exerciseId: string) {
    setDeleteExerciseId(exerciseId);
  }

  function deleteExercise(exerciseId: string) {
    setPlan((prev) => {
      const dayLog = prev[selectedDay];
      return { ...prev, [selectedDay]: { ...dayLog, exercises: dayLog.exercises.filter((exercise) => exercise.id !== exerciseId) } };
    });

    if (progressExerciseId === exerciseId) setProgressExerciseId(null);
    setDeleteExerciseId(null);
    setMessage("Exercise deleted.");
  }

  function updateDayMeta(day: WorkoutDay, patch: Partial<WorkoutDayLog>) {
    setPlan((prev) => ({ ...prev, [day]: { ...prev[day], ...patch } }));
  }

  function openProgressModal(exercise: WorkoutExercise) {
    setProgressExerciseId(exercise.id);
    if (exercise.type === "cardio") {
      setProgressCardioDraft({
        name: exercise.name,
        durationMin: exercise.durationMin,
        intensity: exercise.intensity ?? "moderate"
      });
      return;
    }

    setProgressFitnessDraft({
      name: exercise.name,
      sets: exercise.sets,
      reps: exercise.reps,
      weightKg: exercise.weightKg
    });
  }

  function saveProgressUpdate() {
    if (!progressExercise) return;

    setPlan((prev) => {
      const dayLog = prev[selectedDay];
      const exercises = dayLog.exercises.map((exercise) => {
        if (exercise.id !== progressExercise.id) return exercise;

        if (exercise.type === "cardio") {
          return {
            ...exercise,
            name: progressCardioDraft.name.trim() || exercise.name,
            durationMin: progressCardioDraft.durationMin,
            intensity: progressCardioDraft.intensity,
            caloriesBurned: calculateCardioCalories(
              profileWeight,
              progressCardioDraft.name.trim() || exercise.name,
              progressCardioDraft.durationMin,
              progressCardioDraft.intensity
            ),
            progressHistory: [...exercise.progressHistory, toProgressEntry(exercise)]
          };
        }

        const volume = Math.round(progressFitnessDraft.sets * progressFitnessDraft.reps * progressFitnessDraft.weightKg);
        return {
          ...exercise,
          name: progressFitnessDraft.name.trim() || exercise.name,
          sets: progressFitnessDraft.sets,
          reps: progressFitnessDraft.reps,
          weightKg: progressFitnessDraft.weightKg,
          trainingVolume: volume,
          progressHistory: [...exercise.progressHistory, toProgressEntry(exercise)]
        };
      });

      return { ...prev, [selectedDay]: { ...dayLog, exercises } };
    });

    setProgressExerciseId(null);
    setMessage("Workout progress updated.");
  }

  function togglePauseWorkout(isPaused: boolean) {
    if (!progressExercise) return;

    setPlan((prev) => {
      const dayLog = prev[selectedDay];
      const exercises = dayLog.exercises.map((exercise) =>
        exercise.id === progressExercise.id ? { ...exercise, isPaused } : exercise
      );
      return { ...prev, [selectedDay]: { ...dayLog, exercises } };
    });

    setProgressExerciseId(null);
    setMessage(isPaused ? "Workout paused." : "Workout re-activated.");
  }

  return (
    <>
      {deleteExerciseId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl ring-1 ring-slate-200">
            <h3 className="text-lg font-semibold text-slate-900">Delete exercise?</h3>
            <p className="mt-2 text-sm text-slate-600">This action removes the exercise from the selected day.</p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setDeleteExerciseId(null)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">Cancel</button>
              <button type="button" onClick={() => deleteExercise(deleteExerciseId)} className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-500">Delete</button>
            </div>
          </div>
        </div>
      ) : null}

      {progressExercise ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4">
          <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-xl ring-1 ring-slate-200">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-semibold text-slate-900">Workout Progress</h3>
              <button type="button" onClick={() => setProgressExerciseId(null)} className="rounded-md p-1 text-slate-400 hover:bg-slate-100">✕</button>
            </div>

            <p className="mt-2 text-sm font-medium text-slate-800">{progressExercise.name}</p>
            {previousProgress ? (
              <p className="mt-1 text-xs text-slate-500">
                Previous: {progressExercise.type === "cardio"
                  ? `${previousProgress.durationMin ?? "-"} min • ${previousProgress.intensity ?? "-"} • ${previousProgress.caloriesBurned ?? "-"} kcal`
                  : `${previousProgress.sets ?? "-"} sets • ${previousProgress.reps ?? "-"} reps • ${previousProgress.weightKg ?? "-"}kg`}
              </p>
            ) : (
              <p className="mt-1 text-xs text-slate-500">No previous values yet.</p>
            )}

            {progressExercise.type === "cardio" ? (
              <div className="mt-4 space-y-3">
                <label className="block text-sm text-slate-700">Exercise
                  <input className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" value={progressCardioDraft.name} onChange={(e) => setProgressCardioDraft((p) => ({ ...p, name: e.target.value }))} />
                </label>
                <label className="block text-sm text-slate-700">Duration (min)
                  <input type="number" min={1} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" value={progressCardioDraft.durationMin} onChange={(e) => setProgressCardioDraft((p) => ({ ...p, durationMin: Number(e.target.value) }))} />
                </label>
                <label className="block text-sm text-slate-700">Intensity
                  <select className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" value={progressCardioDraft.intensity} onChange={(e) => setProgressCardioDraft((p) => ({ ...p, intensity: e.target.value as Intensity }))}>
                    <option value="low">Low</option>
                    <option value="moderate">Moderate</option>
                    <option value="high">High</option>
                  </select>
                </label>
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                <label className="block text-sm text-slate-700">Exercise
                  <input className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" value={progressFitnessDraft.name} onChange={(e) => setProgressFitnessDraft((p) => ({ ...p, name: e.target.value }))} />
                </label>
                <div className="grid gap-3 grid-cols-3">
                  <label className="text-sm text-slate-700">Sets
                    <div className="mt-1 flex rounded-xl border border-slate-200">
                      <button type="button" onClick={() => setProgressFitnessDraft((p) => ({ ...p, sets: Math.max(1, p.sets - 1) }))} className="px-3">-</button>
                      <input type="number" min={1} className="w-full border-x border-slate-200 px-2 py-2" value={progressFitnessDraft.sets} onChange={(e) => setProgressFitnessDraft((p) => ({ ...p, sets: Number(e.target.value) }))} />
                      <button type="button" onClick={() => setProgressFitnessDraft((p) => ({ ...p, sets: p.sets + 1 }))} className="px-3">+</button>
                    </div>
                  </label>
                  <label className="text-sm text-slate-700">Reps
                    <div className="mt-1 flex rounded-xl border border-slate-200">
                      <button type="button" onClick={() => setProgressFitnessDraft((p) => ({ ...p, reps: Math.max(1, p.reps - 1) }))} className="px-3">-</button>
                      <input type="number" min={1} className="w-full border-x border-slate-200 px-2 py-2" value={progressFitnessDraft.reps} onChange={(e) => setProgressFitnessDraft((p) => ({ ...p, reps: Number(e.target.value) }))} />
                      <button type="button" onClick={() => setProgressFitnessDraft((p) => ({ ...p, reps: p.reps + 1 }))} className="px-3">+</button>
                    </div>
                  </label>
                  <label className="text-sm text-slate-700">Weight (kg)
                    <div className="mt-1 flex rounded-xl border border-slate-200">
                      <button type="button" onClick={() => setProgressFitnessDraft((p) => ({ ...p, weightKg: Math.max(0, p.weightKg - 2.5) }))} className="px-3">-</button>
                      <input type="number" min={0} step="0.5" className="w-full border-x border-slate-200 px-2 py-2" value={progressFitnessDraft.weightKg} onChange={(e) => setProgressFitnessDraft((p) => ({ ...p, weightKg: Number(e.target.value) }))} />
                      <button type="button" onClick={() => setProgressFitnessDraft((p) => ({ ...p, weightKg: p.weightKg + 2.5 }))} className="px-3">+</button>
                    </div>
                  </label>
                </div>
              </div>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => togglePauseWorkout(!progressExercise.isPaused)}
                className="rounded-xl border border-amber-200 px-4 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-50"
              >
                {progressExercise.isPaused ? "Re-activate Workout" : "Pause Workout"}
              </button>
              <button type="button" onClick={() => setProgressExerciseId(null)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">Close</button>
              <button type="button" onClick={saveProgressUpdate} className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-400">Save Progress</button>
            </div>
          </div>
        </div>
      ) : null}

      <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8 md:px-8">
        <AppHeaderNav />

        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <p className="text-xs text-slate-500">Exercises this week</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">{weeklySummary.totalExercises}</p>
          </div>
          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <p className="text-xs text-slate-500">Cardio calories (est.)</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">{weeklySummary.totalCardioCalories}</p>
          </div>
          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <p className="text-xs text-slate-500">Fitness volume</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">{weeklySummary.totalVolume}</p>
          </div>
        </section>

        <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <h1 className="text-3xl font-semibold text-slate-900">Workouts</h1>
          <p className="mt-2 text-sm text-slate-500">Plan your week, add cardio or fitness exercises, and keep everything saved after refresh.</p>

          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-7">
            {dayOrder.map((day) => {
              const selected = day === selectedDay;
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => setSelectedDay(day)}
                  className={`rounded-xl border px-3 py-2 text-left text-sm ${selected ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-slate-200 text-slate-700 hover:bg-slate-50"}`}
                >
                  <p className="font-semibold">{dayLabels[day]}</p>
                  <p className="text-xs">{plan[day].exercises.filter((exercise) => !exercise.isPaused).length} active</p>
                </button>
              );
            })}
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.1fr,1.4fr]">
          <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <h2 className="text-xl font-semibold text-slate-900">{dayLabels[selectedDay]} setup</h2>

            <label className="mt-3 block text-sm text-slate-700">
              Notes
              <textarea
                className="mt-1 min-h-24 w-full rounded-xl border border-slate-200 px-3 py-2"
                value={activeDay.notes}
                onChange={(event) => updateDayMeta(selectedDay, { notes: event.target.value })}
                placeholder="Optional notes for this day..."
              />
            </label>

            <form onSubmit={saveExercise} className="mt-6 space-y-4">
              <div>
                <p className="mb-2 text-sm font-semibold text-slate-800">Exercise type</p>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setExerciseType("cardio")} className={`rounded-xl border px-3 py-2 text-sm ${exerciseType === "cardio" ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-slate-200 text-slate-700"}`}>
                    Cardio
                  </button>
                  <button type="button" onClick={() => setExerciseType("fitness")} className={`rounded-xl border px-3 py-2 text-sm ${exerciseType === "fitness" ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-slate-200 text-slate-700"}`}>
                    Fitness
                  </button>
                </div>
              </div>

              {exerciseType === "cardio" ? (
                <>
                  <label className="block text-sm text-slate-700">
                    Exercise name / description
                    <input className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" value={cardioDraft.name} onChange={(event) => setCardioDraft((prev) => ({ ...prev, name: event.target.value }))} placeholder="e.g., Treadmill intervals" />
                  </label>

                  <label className="block text-sm text-slate-700">
                    Duration (minutes)
                    <input type="number" min={1} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" value={cardioDraft.durationMin} onChange={(event) => setCardioDraft((prev) => ({ ...prev, durationMin: Number(event.target.value) }))} />
                  </label>

                  <label className="block text-sm text-slate-700">
                    Intensity (optional)
                    <select className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" value={cardioDraft.intensity} onChange={(event) => setCardioDraft((prev) => ({ ...prev, intensity: event.target.value as Intensity }))}>
                      <option value="low">Low</option>
                      <option value="moderate">Moderate</option>
                      <option value="high">High</option>
                    </select>
                  </label>

                  <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
                    Estimated calories (weight {profileWeight}kg): {calculateCardioCalories(profileWeight, cardioDraft.name, cardioDraft.durationMin, cardioDraft.intensity)} kcal
                  </p>
                </>
              ) : (
                <>
                  <label className="block text-sm text-slate-700">
                    Exercise name / description
                    <input className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" value={fitnessDraft.name} onChange={(event) => setFitnessDraft((prev) => ({ ...prev, name: event.target.value }))} placeholder="e.g., Barbell squat" />
                  </label>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <label className="text-sm text-slate-700">Sets
                      <div className="mt-1 flex rounded-xl border border-slate-200">
                        <button type="button" onClick={() => setFitnessDraft((p) => ({ ...p, sets: Math.max(1, p.sets - 1) }))} className="px-3">-</button>
                        <input type="number" min={1} className="w-full border-x border-slate-200 px-2 py-2" value={fitnessDraft.sets} onChange={(event) => setFitnessDraft((prev) => ({ ...prev, sets: Number(event.target.value) }))} />
                        <button type="button" onClick={() => setFitnessDraft((p) => ({ ...p, sets: p.sets + 1 }))} className="px-3">+</button>
                      </div>
                    </label>
                    <label className="text-sm text-slate-700">Reps
                      <div className="mt-1 flex rounded-xl border border-slate-200">
                        <button type="button" onClick={() => setFitnessDraft((p) => ({ ...p, reps: Math.max(1, p.reps - 1) }))} className="px-3">-</button>
                        <input type="number" min={1} className="w-full border-x border-slate-200 px-2 py-2" value={fitnessDraft.reps} onChange={(event) => setFitnessDraft((prev) => ({ ...prev, reps: Number(event.target.value) }))} />
                        <button type="button" onClick={() => setFitnessDraft((p) => ({ ...p, reps: p.reps + 1 }))} className="px-3">+</button>
                      </div>
                    </label>
                    <label className="text-sm text-slate-700">Weight (kg)
                      <div className="mt-1 flex rounded-xl border border-slate-200">
                        <button type="button" onClick={() => setFitnessDraft((p) => ({ ...p, weightKg: Math.max(0, p.weightKg - 2.5) }))} className="px-3">-</button>
                        <input type="number" min={0} step="0.5" className="w-full border-x border-slate-200 px-2 py-2" value={fitnessDraft.weightKg} onChange={(event) => setFitnessDraft((prev) => ({ ...prev, weightKg: Number(event.target.value) }))} />
                        <button type="button" onClick={() => setFitnessDraft((p) => ({ ...p, weightKg: p.weightKg + 2.5 }))} className="px-3">+</button>
                      </div>
                    </label>
                  </div>

                  <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
                    Training volume estimate: {Math.round(fitnessDraft.sets * fitnessDraft.reps * fitnessDraft.weightKg)}
                  </p>
                </>
              )}

              <div className="flex gap-2">
                <button type="submit" className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-400">
                  Save Exercise
                </button>
              </div>
            </form>

            {message ? <p className="mt-3 text-sm text-slate-600">{message}</p> : null}
          </div>

          <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <h2 className="text-xl font-semibold text-slate-900">{dayLabels[selectedDay]} exercises</h2>
            {activeExercises.length === 0 ? (
              <p className="mt-4 rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">No exercises yet for this day.</p>
            ) : (
              <ul className="mt-4 space-y-3">
                {activeExercises.map((exercise) => (
                  <li key={exercise.id} className="rounded-xl border border-slate-200 p-4 cursor-pointer hover:bg-slate-50" onClick={() => openProgressModal(exercise)}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-900">{exercise.name}</p>
                        {exercise.type === "cardio" ? (
                          <p className="mt-1 text-sm text-slate-600">Cardio • {exercise.durationMin} min • {exercise.intensity ?? "moderate"} • {exercise.caloriesBurned} kcal burned</p>
                        ) : (
                          <p className="mt-1 text-sm text-slate-600">Fitness • {exercise.sets} sets × {exercise.reps} reps @ {exercise.weightKg}kg • Volume {exercise.trainingVolume}</p>
                        )}
                      </div>

                      <div className="flex gap-2">
                        <button type="button" onClick={(event) => { event.stopPropagation(); openProgressModal(exercise); }} className="rounded-lg border border-emerald-200 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50">Progress</button>
                        <button type="button" onClick={(event) => { event.stopPropagation(); confirmDeleteExercise(exercise.id); }} className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50">Delete</button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {pausedExercises.length > 0 ? (
              <div className="mt-6 border-t border-slate-200 pt-4">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Paused workouts</h3>
                <ul className="mt-3 space-y-2">
                  {pausedExercises.map((exercise) => (
                    <li
                      key={exercise.id}
                      className="rounded-xl border border-amber-200 bg-amber-50 p-3 cursor-pointer"
                      onClick={() => openProgressModal(exercise)}
                    >
                      <p className="text-sm font-semibold text-amber-800">{exercise.name}</p>
                      <p className="text-xs text-amber-700">Paused • click to open and re-activate</p>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </section>
      </main>
    </>
  );
}
