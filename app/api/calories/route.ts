import { NextResponse } from "next/server";
import OpenAI from "openai";
import { CalorieResponse } from "@/lib/types";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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

function isValid(data: CalorieResponse) {
  return (
    Array.isArray(data.items) &&
    !!data.totals &&
    ["calories", "protein", "carbs", "fat"].every(
      (key) => typeof data.totals[key as keyof typeof data.totals] === "number"
    )
  );
}

export async function POST(request: Request) {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "OPENAI_API_KEY is not configured on the server." }, { status: 500 });
  }

  try {
    const body = (await request.json()) as { mealDescription?: string };
    const mealDescription = body.mealDescription?.trim();

    if (!mealDescription) {
      return NextResponse.json({ error: "Meal description is required." }, { status: 400 });
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: mealDescription }
      ],
      temperature: 0.2
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) throw new Error("No content returned from OpenAI.");

    const parsed = JSON.parse(content) as CalorieResponse;
    if (!isValid(parsed)) throw new Error("AI returned an unexpected response shape.");

    return NextResponse.json({ data: parsed });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to calculate calories." },
      { status: 500 }
    );
  }
}
