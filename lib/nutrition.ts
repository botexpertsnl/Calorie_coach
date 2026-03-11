import { ActivityLevel, DailyTargets, GoalType, ProfileInput } from "@/lib/types";

const activityMultipliers: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  very_active: 1.725,
  athlete: 1.9
};

function inferGoalType(goalText: string): GoalType {
  const text = goalText.toLowerCase();

  if (/lose|cut|fat loss|lean out|slim/.test(text)) return "fat_loss";
  if (/gain|bulk|muscle|strength|mass/.test(text)) return "muscle_gain";
  if (/recomp|body composition|tone|toning/.test(text)) return "recomposition";
  return "maintenance";
}

function estimateBodyFatFromWaist(profile: ProfileInput): number {
  // Simple heuristic for future replacement with better body composition models.
  const ratio = profile.waistCm / profile.heightCm;
  if (profile.gender === "male") return Math.min(35, Math.max(10, ratio * 50 - 8));
  if (profile.gender === "female") return Math.min(45, Math.max(16, ratio * 55 - 8));
  return Math.min(40, Math.max(12, ratio * 52 - 8));
}

function bmrMifflinStJeor(profile: ProfileInput): number {
  const s = profile.gender === "male" ? 5 : profile.gender === "female" ? -161 : -78;
  return 10 * profile.weightKg + 6.25 * profile.heightCm - 5 * profile.age + s;
}

export function calculateDailyTargets(profile: ProfileInput): DailyTargets {
  const goalType = inferGoalType(profile.goalText);
  const bmr = bmrMifflinStJeor(profile);
  const tdee = bmr * activityMultipliers[profile.activityLevel];
  const bodyFat = estimateBodyFatFromWaist(profile);
  const leanMassKg = profile.weightKg * (1 - bodyFat / 100);

  let calorieFactor = 1;
  let proteinPerKg = 1.8;
  let fatPerKg = 0.8;

  if (goalType === "fat_loss") {
    calorieFactor = 0.82;
    proteinPerKg = 2.2;
    fatPerKg = 0.75;
  } else if (goalType === "muscle_gain") {
    calorieFactor = 1.12;
    proteinPerKg = 2;
    fatPerKg = 0.9;
  } else if (goalType === "recomposition") {
    calorieFactor = 0.95;
    proteinPerKg = 2.3;
    fatPerKg = 0.8;
  }

  const calories = Math.round(tdee * calorieFactor);
  const protein = Math.round((goalType === "recomposition" ? leanMassKg : profile.weightKg) * proteinPerKg);
  const fat = Math.round(profile.weightKg * fatPerKg);
  const remainingCalories = Math.max(calories - (protein * 4 + fat * 9), 0);
  const carbs = Math.round(remainingCalories / 4);

  return {
    goalType,
    calories,
    protein,
    carbs,
    fat,
    explanation:
      `Targets estimated using Mifflin-St Jeor BMR, ${profile.activityLevel.replace("_", " ")} activity, and a ${goalType.replace("_", " ")} strategy inferred from your goal.`
  };
}
