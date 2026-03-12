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
  WorkoutWeekPlan
} from "@/lib/types";

const dayOrder: WorkoutDay[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday"
];

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
    monday: { notes: "", completed: false, exercises: [] },
    tuesday: { notes: "", completed: false, exercises: [] },
    wednesday: { notes: "", completed: false, exercises: [] },
    thursday: { notes: "", completed: false, exercises: [] },
    friday: { notes: "", completed: false, exercises: [] },
    saturday: { notes: "", completed: false, exercises: [] },
    sunday: { notes: "", completed: false, exercises: [] }
  };
}

type ExerciseType = "cardio" | "fitness";

type CardioDraft = {
  name: string;
  durationMin: number;
  intensity: "low" | "moderate" | "high";
};

type FitnessDraft = {
  name: string;
  sets: number;
  reps: number;
  weightKg: number;
};

const defaultCardioDraft: CardioDraft = {
  name: "",
  durationMin: 30,
  intensity: "moderate"
};

const defaultFitnessDraft: FitnessDraft = {
  name: "",
  sets: 3,
  reps: 10,
  weightKg: 20
};

function getMETByIntensity(intensity: CardioDraft["intensity"]) {
  if (intensity === "low") return 5;
  if (intensity === "high") return 9;
  return 7;
}

function calculateCardioCalories(weightKg: number, durationMin: number, intensity: CardioDraft["intensity"]) {
  const met = getMETByIntensity(intensity);
  const calories = (met * weightKg * 3.5) / 200 * durationMin;
  return Math.max(0, Math.round(calories));
}

export default function WorkoutsPage() {
  const [plan, setPlan] = useState<WorkoutWeekPlan>(createDefaultPlan());
  const [selectedDay, setSelectedDay] = useState<WorkoutDay>("monday");
  const [exerciseType, setExerciseType] = useState<ExerciseType>("cardio");
  const [cardioDraft, setCardioDraft] = useState<CardioDraft>(defaultCardioDraft);
  const [fitnessDraft, setFitnessDraft] = useState<FitnessDraft>(defaultFitnessDraft);
  const [editingExerciseId, setEditingExerciseId] = useState<string | null>(null);
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

  const activeDay = plan[selectedDay];

  const weeklySummary = useMemo(() => {
    let totalExercises = 0;
    let totalCardioCalories = 0;
    let totalVolume = 0;

    dayOrder.forEach((day) => {
      plan[day].exercises.forEach((exercise) => {
        totalExercises += 1;
        if (exercise.type === "cardio") totalCardioCalories += exercise.caloriesBurned;
        if (exercise.type === "fitness") totalVolume += exercise.trainingVolume;
      });
    });

    return {
      totalExercises,
      totalCardioCalories,
      totalVolume,
      completedDays: dayOrder.filter((day) => plan[day].completed).length
    };
  }, [plan]);

  function resetForm() {
    setEditingExerciseId(null);
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

      const nextExercise: CardioExercise = {
        id: editingExerciseId ?? crypto.randomUUID(),
        type: "cardio",
        name: cardioDraft.name.trim(),
        durationMin: cardioDraft.durationMin,
        intensity: cardioDraft.intensity,
        caloriesBurned: calculateCardioCalories(profileWeight, cardioDraft.durationMin, cardioDraft.intensity)
      };

      setPlan((prev) => {
        const dayLog = prev[selectedDay];
        const exercises = editingExerciseId
          ? dayLog.exercises.map((exercise) => (exercise.id === editingExerciseId ? nextExercise : exercise))
          : [nextExercise, ...dayLog.exercises];

        return {
          ...prev,
          [selectedDay]: {
            ...dayLog,
            exercises
          }
        };
      });

      setMessage("Cardio exercise saved.");
      resetForm();
      return;
    }

    if (!fitnessDraft.name.trim() || fitnessDraft.sets <= 0 || fitnessDraft.reps <= 0 || fitnessDraft.weightKg < 0) {
      setMessage("Please complete all fitness fields with valid values.");
      return;
    }

    const volume = fitnessDraft.sets * fitnessDraft.reps * fitnessDraft.weightKg;
    const nextExercise: FitnessExercise = {
      id: editingExerciseId ?? crypto.randomUUID(),
      type: "fitness",
      name: fitnessDraft.name.trim(),
      sets: fitnessDraft.sets,
      reps: fitnessDraft.reps,
      weightKg: fitnessDraft.weightKg,
      trainingVolume: Math.round(volume)
    };

    setPlan((prev) => {
      const dayLog = prev[selectedDay];
      const exercises = editingExerciseId
        ? dayLog.exercises.map((exercise) => (exercise.id === editingExerciseId ? nextExercise : exercise))
        : [nextExercise, ...dayLog.exercises];

      return {
        ...prev,
        [selectedDay]: {
          ...dayLog,
          exercises
        }
      };
    });

    setMessage("Fitness exercise saved.");
    resetForm();
  }

  function startEdit(exercise: WorkoutExercise) {
    setEditingExerciseId(exercise.id);
    setExerciseType(exercise.type);

    if (exercise.type === "cardio") {
      setCardioDraft({
        name: exercise.name,
        durationMin: exercise.durationMin,
        intensity: exercise.intensity ?? "moderate"
      });
      return;
    }

    setFitnessDraft({
      name: exercise.name,
      sets: exercise.sets,
      reps: exercise.reps,
      weightKg: exercise.weightKg
    });
  }

  function deleteExercise(exerciseId: string) {
    setPlan((prev) => {
      const dayLog = prev[selectedDay];
      return {
        ...prev,
        [selectedDay]: {
          ...dayLog,
          exercises: dayLog.exercises.filter((exercise) => exercise.id !== exerciseId)
        }
      };
    });

    if (editingExerciseId === exerciseId) resetForm();
    setMessage("Exercise deleted.");
  }

  function updateDayMeta(day: WorkoutDay, patch: Partial<WorkoutDayLog>) {
    setPlan((prev) => ({
      ...prev,
      [day]: {
        ...prev[day],
        ...patch
      }
    }));
  }

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8 md:px-8">
      <AppHeaderNav />

      <section className="grid gap-4 md:grid-cols-4">
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
        <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <p className="text-xs text-slate-500">Completed days</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{weeklySummary.completedDays} / 7</p>
        </div>
      </section>

      <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <h1 className="text-3xl font-semibold text-slate-900">Workouts</h1>
        <p className="mt-2 text-sm text-slate-500">Plan your week, add cardio or fitness exercises, and keep everything saved after refresh.</p>

        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-7">
          {dayOrder.map((day) => {
            const dayLog = plan[day];
            const selected = day === selectedDay;
            return (
              <button
                key={day}
                type="button"
                onClick={() => setSelectedDay(day)}
                className={`rounded-xl border px-3 py-2 text-left text-sm ${selected ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-slate-200 text-slate-700 hover:bg-slate-50"}`}
              >
                <p className="font-semibold">{dayLabels[day]}</p>
                <p className="text-xs">{dayLog.exercises.length} exercise(s)</p>
              </button>
            );
          })}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.1fr,1.4fr]">
        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold text-slate-900">{dayLabels[selectedDay]} setup</h2>
            <label className="inline-flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={activeDay.completed}
                onChange={(event) => updateDayMeta(selectedDay, { completed: event.target.checked })}
              />
              Completed
            </label>
          </div>

          <label className="text-sm text-slate-700">
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
                <button
                  type="button"
                  onClick={() => setExerciseType("cardio")}
                  className={`rounded-xl border px-3 py-2 text-sm ${exerciseType === "cardio" ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-slate-200 text-slate-700"}`}
                >
                  Cardio
                </button>
                <button
                  type="button"
                  onClick={() => setExerciseType("fitness")}
                  className={`rounded-xl border px-3 py-2 text-sm ${exerciseType === "fitness" ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-slate-200 text-slate-700"}`}
                >
                  Fitness
                </button>
              </div>
            </div>

            {exerciseType === "cardio" ? (
              <>
                <label className="block text-sm text-slate-700">
                  Exercise name / description
                  <input
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
                    value={cardioDraft.name}
                    onChange={(event) => setCardioDraft((prev) => ({ ...prev, name: event.target.value }))}
                    placeholder="e.g., Treadmill intervals"
                  />
                </label>

                <label className="block text-sm text-slate-700">
                  Duration (minutes)
                  <input
                    type="number"
                    min={1}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
                    value={cardioDraft.durationMin}
                    onChange={(event) => setCardioDraft((prev) => ({ ...prev, durationMin: Number(event.target.value) }))}
                  />
                </label>

                <label className="block text-sm text-slate-700">
                  Intensity (optional)
                  <select
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
                    value={cardioDraft.intensity}
                    onChange={(event) => setCardioDraft((prev) => ({ ...prev, intensity: event.target.value as CardioDraft["intensity"] }))}
                  >
                    <option value="low">Low</option>
                    <option value="moderate">Moderate</option>
                    <option value="high">High</option>
                  </select>
                </label>

                <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
                  Estimated calories (weight {profileWeight}kg): {calculateCardioCalories(profileWeight, cardioDraft.durationMin, cardioDraft.intensity)} kcal
                </p>
              </>
            ) : (
              <>
                <label className="block text-sm text-slate-700">
                  Exercise name / description
                  <input
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
                    value={fitnessDraft.name}
                    onChange={(event) => setFitnessDraft((prev) => ({ ...prev, name: event.target.value }))}
                    placeholder="e.g., Barbell squat"
                  />
                </label>

                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="block text-sm text-slate-700">Sets
                    <input type="number" min={1} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" value={fitnessDraft.sets} onChange={(event) => setFitnessDraft((prev) => ({ ...prev, sets: Number(event.target.value) }))} />
                  </label>
                  <label className="block text-sm text-slate-700">Reps
                    <input type="number" min={1} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" value={fitnessDraft.reps} onChange={(event) => setFitnessDraft((prev) => ({ ...prev, reps: Number(event.target.value) }))} />
                  </label>
                  <label className="block text-sm text-slate-700">Weight (kg)
                    <input type="number" min={0} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" value={fitnessDraft.weightKg} onChange={(event) => setFitnessDraft((prev) => ({ ...prev, weightKg: Number(event.target.value) }))} />
                  </label>
                </div>

                <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
                  Training volume estimate: {Math.round(fitnessDraft.sets * fitnessDraft.reps * fitnessDraft.weightKg)}
                </p>
              </>
            )}

            <div className="flex gap-2">
              <button type="submit" className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-400">
                {editingExerciseId ? "Save Changes" : "Save Exercise"}
              </button>
              {editingExerciseId ? (
                <button type="button" onClick={resetForm} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                  Cancel Edit
                </button>
              ) : null}
            </div>
          </form>

          {message ? <p className="mt-3 text-sm text-slate-600">{message}</p> : null}
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <h2 className="text-xl font-semibold text-slate-900">{dayLabels[selectedDay]} exercises</h2>
          {activeDay.exercises.length === 0 ? (
            <p className="mt-4 rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">No exercises yet for this day.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {activeDay.exercises.map((exercise) => (
                <li key={exercise.id} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-900">{exercise.name}</p>
                      {exercise.type === "cardio" ? (
                        <p className="mt-1 text-sm text-slate-600">
                          Cardio • {exercise.durationMin} min • {exercise.intensity ?? "moderate"} intensity • {exercise.caloriesBurned} kcal burned
                        </p>
                      ) : (
                        <p className="mt-1 text-sm text-slate-600">
                          Fitness • {exercise.sets} sets × {exercise.reps} reps @ {exercise.weightKg}kg • Volume {exercise.trainingVolume}
                        </p>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <button type="button" onClick={() => startEdit(exercise)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">Edit</button>
                      <button type="button" onClick={() => deleteExercise(exercise.id)} className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50">Delete</button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </main>
  );
}
