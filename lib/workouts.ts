import { WorkoutExerciseType, WorkoutIntensity } from "@/lib/types";

export function calculateTrainingVolume(sets?: number, reps?: number, weight?: number) {
  return Math.round((sets ?? 0) * (reps ?? 0) * (weight ?? 0));
}

function cardioMetByDescription(name: string, intensity: WorkoutIntensity) {
  const normalized = name.toLowerCase();
  let met = 6.5;

  if (/walk|hike/.test(normalized)) met = 4.5;
  if (/jog|run|sprint/.test(normalized)) met = 8.5;
  if (/bike|cycling|cycle/.test(normalized)) met = 7;
  if (/swim|rowing|elliptical|crossfit|hiit/.test(normalized)) met = 8.8;

  if (intensity === "low") met -= 1;
  if (intensity === "high") met += 1.5;

  return Math.max(3, met);
}

function intensityMultiplier(intensity?: WorkoutIntensity) {
  if (intensity === "low") return 0.85;
  if (intensity === "high") return 1.2;
  return 1;
}

export function estimateCardioCalories(weightKg: number, name: string, durationMinutes: number, intensity: WorkoutIntensity) {
  const met = cardioMetByDescription(name, intensity);
  const calories = (met * weightKg * 3.5) / 200 * durationMinutes;
  return Math.max(0, Math.round(calories));
}

export function estimateFitnessCalories(weightKg: number, sets: number, reps: number, weight: number, intensity?: WorkoutIntensity) {
  const volumeFactor = Math.max(0.2, Math.min(2.5, (sets * reps * Math.max(weight, 1)) / 2000));
  const baseCalories = weightKg * 0.08 * sets * (reps / 10);
  return Math.max(0, Math.round(baseCalories * volumeFactor * intensityMultiplier(intensity)));
}

export function estimateCrossfitCalories(weightKg: number, durationMinutes: number, intensity?: WorkoutIntensity) {
  const crossfitFactor = 0.14; // intentionally higher than regular strength training estimates
  return Math.max(0, Math.round(durationMinutes * weightKg * crossfitFactor * intensityMultiplier(intensity)));
}

export function estimateCaloriesForType(params: {
  type: WorkoutExerciseType;
  weightKg: number;
  name: string;
  durationMinutes?: number;
  sets?: number;
  reps?: number;
  weight?: number;
  intensity?: WorkoutIntensity;
}) {
  if (params.type === "cardio") {
    return estimateCardioCalories(params.weightKg, params.name, params.durationMinutes ?? 0, params.intensity ?? "moderate");
  }

  if (params.type === "crossfit") {
    return estimateCrossfitCalories(params.weightKg, params.durationMinutes ?? 0, params.intensity);
  }

  return estimateFitnessCalories(
    params.weightKg,
    params.sets ?? 0,
    params.reps ?? 0,
    params.weight ?? 0,
    params.intensity
  );
}
