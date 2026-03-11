import { NextResponse } from "next/server";
import OpenAI from "openai";
import { calculateDailyTargets, inferGoalCategoryFromText } from "@/lib/nutrition";
import { GoalType, ProfileInput } from "@/lib/types";

function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  return new OpenAI({ apiKey });
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
  try {
    const body = (await request.json()) as { profile?: ProfileInput };
    const profile = body.profile;

    if (!profile) {
      return NextResponse.json({ error: "Profile data is required." }, { status: 400 });
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
    } catch {
      const fallbackCategory = inferGoalCategoryFromText(profile.goalText);
      const targets = calculateDailyTargets(profile, fallbackCategory);
      return NextResponse.json({ data: targets, source: "fallback" });
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to calculate targets." },
      { status: 500 }
    );
  }
}
