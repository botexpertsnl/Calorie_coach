import { NextResponse } from "next/server";
import OpenAI from "openai";
import { calculateDailyTargets, inferGoalCategoryFromText } from "@/lib/nutrition";
import { GoalType, ProfileInput } from "@/lib/types";
import { enforceAiRateLimit, jsonError, logApiError } from "@/lib/server/api-security";
import { serverEnv } from "@/lib/server/env";

function getOpenAIClient() {
  const apiKey = serverEnv.OPENAI_API_KEY;
  if (!apiKey) return null;
  return new OpenAI({ apiKey });
}

function isValidProfileInput(value: unknown): value is ProfileInput {
  if (!value || typeof value !== "object") return false;
  const profile = value as ProfileInput;
  const isNum = (n: unknown) => typeof n === "number" && Number.isFinite(n);

  return (
    isNum(profile.age) && profile.age >= 13 && profile.age <= 100 &&
    ["female", "male", "other"].includes(profile.gender) &&
    isNum(profile.heightCm) && profile.heightCm >= 120 && profile.heightCm <= 250 &&
    isNum(profile.weightKg) && profile.weightKg >= 30 && profile.weightKg <= 400 &&
    isNum(profile.waistCm) && profile.waistCm >= 30 && profile.waistCm <= 300 &&
    ["beginner", "intermediate", "advanced"].includes(profile.trainingExperience) &&
    ["1-5000", "5000-10000", "10000+"].includes(profile.averageDailySteps) &&
    ["sedentary", "light", "moderate", "heavy"].includes(profile.workType) &&
    typeof profile.goalText === "string" && profile.goalText.trim().length > 0 && profile.goalText.trim().length <= 500
  );
}

async function classifyGoalWithAI(openai: OpenAI, goalText: string): Promise<{ category: GoalType; reasoning: string }> {
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    temperature: 0,
    messages: [
      {
        role: "system",
        content:
          "Classify the user's goal text into exactly one of: fat_loss, maintenance, muscle_gain, recomposition. Return JSON only with keys: category, reasoning. reasoning should be short."
      },
      { role: "user", content: goalText }
    ]
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) throw new Error("AI goal classification returned no content.");

  const parsed = JSON.parse(content) as { category?: GoalType; reasoning?: string };
  const category = parsed.category;

  if (!category || !["fat_loss", "maintenance", "muscle_gain", "recomposition"].includes(category)) {
    throw new Error("AI goal classification returned an invalid category.");
  }

  return {
    category,
    reasoning: parsed.reasoning ?? "Goal category inferred from your goal text and profile context."
  };
}

export async function POST(request: Request) {
  const rateLimitResponse = await enforceAiRateLimit(request, "targets");
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const body = await request.json();
    const profile = typeof body === "object" && body !== null ? (body as { profile?: unknown }).profile : undefined;

    if (!isValidProfileInput(profile)) {
      return jsonError("Invalid profile payload.", 400);
    }

    const openai = getOpenAIClient();

    if (!openai) {
      const fallbackCategory = inferGoalCategoryFromText(profile.goalText);
      const targets = calculateDailyTargets(profile, fallbackCategory);
      return NextResponse.json({ data: targets, source: "fallback" });
    }

    try {
      const classified = await classifyGoalWithAI(openai, profile.goalText);
      const targets = calculateDailyTargets(profile, classified.category, classified.reasoning);
      return NextResponse.json({ data: targets, source: "ai" });
    } catch (classificationError) {
      logApiError("/api/targets/classification", classificationError);
      const fallbackCategory = inferGoalCategoryFromText(profile.goalText);
      const targets = calculateDailyTargets(profile, fallbackCategory);
      return NextResponse.json({ data: targets, source: "fallback" });
    }
  } catch (error) {
    logApiError("/api/targets", error);
    return jsonError("Unable to calculate targets right now.", 500);
  }
}
