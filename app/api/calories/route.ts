import { NextResponse } from "next/server";
import OpenAI from "openai";
import { CalorieResponse } from "@/lib/types";
import { enforceAiRateLimit, jsonError, logApiError } from "@/lib/server/api-security";
import { requireServerEnv } from "@/lib/server/env";

const systemPrompt = `You are a nutrition assistant. Given a meal description, estimate calories and macros.
Return ONLY valid JSON with this exact shape:
{
  "items": [
    {
      "food": "string",
      "quantity": "string",
      "calories": number,
      "protein": number,
      "carbs": number,
      "fat": number
    }
  ],
  "totals": {
    "calories": number,
    "protein": number,
    "carbs": number,
    "fat": number
  },
  "notes": "optional short note"
}
Rules:
- No markdown.
- totals values must equal sum of item values.
- Keep values realistic and rounded to whole numbers.`;

function getOpenAIClient() {
  const apiKey = requireServerEnv("OPENAI_API_KEY");
  return new OpenAI({ apiKey });
}

function validateMealDescription(body: unknown) {
  const value = typeof body === "object" && body !== null ? (body as { mealDescription?: unknown }).mealDescription : undefined;
  if (typeof value !== "string") return { ok: false as const, message: "Meal description is required." };
  const trimmed = value.trim();
  if (!trimmed) return { ok: false as const, message: "Meal description is required." };
  if (trimmed.length > 2000) return { ok: false as const, message: "Meal description is too long." };
  return { ok: true as const, mealDescription: trimmed };
}

function isValidCalorieResponse(data: unknown): data is CalorieResponse {
  if (!data || typeof data !== "object") return false;
  const value = data as CalorieResponse;
  if (!Array.isArray(value.items) || !value.totals) return false;
  return ["calories", "protein", "carbs", "fat"].every((key) => typeof value.totals[key as keyof typeof value.totals] === "number");
}

export async function POST(request: Request) {
  const rateLimitResponse = await enforceAiRateLimit(request, "calories");
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const body = await request.json();
    const validated = validateMealDescription(body);
    if (!validated.ok) return jsonError(validated.message, 400);

    const openai = getOpenAIClient();

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: validated.mealDescription }
      ],
      temperature: 0.2
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) throw new Error("No content returned from OpenAI.");

    const parsed = JSON.parse(content);
    if (!isValidCalorieResponse(parsed)) throw new Error("AI returned an unexpected response shape.");

    return NextResponse.json({ data: parsed });
  } catch (error) {
    logApiError("/api/calories", error);
    return jsonError("Unable to analyze meal right now.", 500);
  }
}
