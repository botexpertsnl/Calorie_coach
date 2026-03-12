import { ActivityLevel, DailyTargets, GoalType, ProfileInput } from "@/lib/types";

const activityMultipliers: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  very_active: 1.725,
  athlete: 1.9
};

export function inferGoalCategoryFromText(goalText: string): GoalType {
  const text = goalText.toLowerCase();

  const mentionsFatLoss = /lose|cut|fat loss|lean out|slim|belly/.test(text);
  const mentionsMuscleGain = /gain|bulk|muscle|strength|mass/.test(text);
  const mentionsRecomp = /recomp|body composition|tone|toning|lose fat and.*muscle/.test(text);

  if (mentionsRecomp || (mentionsFatLoss && mentionsMuscleGain)) return "recomposition";
  if (mentionsFatLoss) return "fat_loss";
  if (mentionsMuscleGain) return "muscle_gain";
  return "maintenance";
}

function bmrMifflinStJeor(profile: ProfileInput): number {
  const genderConstant =
    profile.gender === "male" ? 5 : profile.gender === "female" ? -161 : -78;
  return 10 * profile.weightKg + 6.25 * profile.heightCm - 5 * profile.age + genderConstant;
}

function waistRiskSignal(profile: ProfileInput): "low" | "moderate" | "high" {
  const ratio = profile.waistCm / profile.heightCm;

  if (profile.gender === "male") {
    if (ratio >= 0.57) return "high";
    if (ratio >= 0.52) return "moderate";
    return "low";
  }

  if (profile.gender === "female") {
    if (ratio >= 0.54) return "high";
    if (ratio >= 0.49) return "moderate";
    return "low";
  }

  if (ratio >= 0.55) return "high";
  if (ratio >= 0.5) return "moderate";
  return "low";
}

function floorCarbsPerKg(activityLevel: ActivityLevel): number {
  if (activityLevel === "sedentary") return 1.5;
  if (activityLevel === "light") return 2;
  if (activityLevel === "moderate") return 2.5;
  if (activityLevel === "very_active") return 3;
  return 3.5;
}

export function calculateDailyTargets(
  profile: ProfileInput,
  preferredGoalCategory?: GoalType,
  aiReasoning?: string
): DailyTargets {
  const goalCategory = preferredGoalCategory ?? inferGoalCategoryFromText(profile.goalText);

  const bmr = bmrMifflinStJeor(profile);
  const activityFactor = activityMultipliers[profile.activityLevel];
  const tdee = bmr * activityFactor;
  const waistSignal = waistRiskSignal(profile);

  let calorieMultiplier = 1;
  let calorieStrategy = "maintenance calories";
  let proteinPerKg = 1.6;
  let fatPerKg = 0.9;

  if (goalCategory === "fat_loss") {
    calorieMultiplier = waistSignal === "high" ? 0.82 : waistSignal === "moderate" ? 0.85 : 0.88;
    calorieStrategy = `${Math.round((1 - calorieMultiplier) * 100)}% deficit`;
    proteinPerKg = 2.2;
    fatPerKg = 0.8;
  } else if (goalCategory === "muscle_gain") {
    calorieMultiplier = profile.activityLevel === "athlete" ? 1.12 : 1.08;
    calorieStrategy = `${Math.round((calorieMultiplier - 1) * 100)}% surplus`;
    proteinPerKg = 1.9;
    fatPerKg = 0.9;
  } else if (goalCategory === "recomposition") {
    calorieMultiplier = waistSignal === "high" ? 0.95 : 0.98;
    calorieStrategy = waistSignal === "high" ? "5% deficit" : "near-maintenance";
    proteinPerKg = 2.2;
    fatPerKg = 0.85;
  }

  const targetCalories = Math.round(tdee * calorieMultiplier);
  const targetProtein = Math.round(profile.weightKg * proteinPerKg);

  const minFat = profile.weightKg * 0.6;
  const targetFat = Math.round(Math.max(minFat, profile.weightKg * fatPerKg));

  let remainingCalories = targetCalories - (targetProtein * 4 + targetFat * 9);
  let targetCarbs = Math.round(remainingCalories / 4);

  const carbFloor = Math.round(
    profile.weightKg *
      Math.max(
        1.2,
        floorCarbsPerKg(profile.activityLevel) +
          (goalCategory === "muscle_gain" ? 0.3 : goalCategory === "fat_loss" ? -0.3 : 0)
      )
  );

  if (targetCarbs < carbFloor) {
    targetCarbs = carbFloor;
    remainingCalories = targetCalories - (targetProtein * 4 + targetCarbs * 4);

    // Rebalance fat so calories stay close to target while respecting minimum healthy fat.
    const rebalancedFat = Math.floor(Math.max(minFat, remainingCalories / 9));
    if (Number.isFinite(rebalancedFat) && rebalancedFat > 0) {
      const cappedFat = Math.min(rebalancedFat, Math.round(profile.weightKg * 1.2));
      const caloriesAfterRebalance = targetProtein * 4 + targetCarbs * 4 + cappedFat * 9;

      if (caloriesAfterRebalance > targetCalories * 1.05) {
        targetCarbs = Math.max(carbFloor, targetCarbs - Math.round((caloriesAfterRebalance - targetCalories) / 4));
      }

      return {
        goalCategory,
        goalType: goalCategory,
        bmr: Math.round(bmr),
        activityFactor,
        tdee: Math.round(tdee),
        calorieStrategy,
        calories: targetCalories,
        protein: targetProtein,
        carbs: targetCarbs,
        fat: cappedFat,
        explanation: aiReasoning ?? `Goal set to ${goalCategory.replace("_", " ")} with ${calorieStrategy} based on your profile and activity level.`,
        macroReasoning:
          "Protein uses a goal-specific g/kg target, fat keeps a healthy minimum, and carbs are set from remaining calories with activity-aware floors."
      };
    }
  }

  return {
    goalCategory,
    goalType: goalCategory,
    bmr: Math.round(bmr),
    activityFactor,
    tdee: Math.round(tdee),
    calorieStrategy,
    calories: targetCalories,
    protein: targetProtein,
    carbs: Math.max(targetCarbs, carbFloor),
    fat: targetFat,
    explanation:
      aiReasoning ??
      `Goal set to ${goalCategory.replace("_", " ")} with ${calorieStrategy} based on your profile and activity level.`,
    macroReasoning:
      "Protein uses a goal-specific g/kg target, fat keeps a healthy minimum, and carbs are calculated from remaining calories then rebalanced for realism."
  };
}
