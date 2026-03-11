import { NextResponse } from "next/server";
import OpenAI from "openai";
import { CalorieResponse } from "@/lib/types";

const systemPrompt = `You are a nutrition assistant analyzing a meal image.
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
- Be realistic about portions.
- totals must equal the sum of items.`;

function isValid(data: CalorieResponse) {
  return (
    Array.isArray(data.items) &&
    !!data.totals &&
    ["calories", "protein", "carbs", "fat"].every(
      (key) => typeof data.totals[key as keyof typeof data.totals] === "number"
    )
  );
}

function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  return new OpenAI({ apiKey });
}

export async function POST(request: Request) {
  const openai = getOpenAIClient();
  if (!openai) {
    return NextResponse.json({ error: "OPENAI_API_KEY is not configured on the server." }, { status: 500 });
  }

  try {
    const formData = await request.formData();
    const image = formData.get("image");

    if (!(image instanceof File)) {
      return NextResponse.json({ error: "Image file is required." }, { status: 400 });
    }

    if (!image.type.startsWith("image/")) {
      return NextResponse.json({ error: "Uploaded file must be an image." }, { status: 400 });
    }

    const buffer = Buffer.from(await image.arrayBuffer());
    const base64Image = buffer.toString("base64");
    const dataUrl = `data:${image.type};base64,${base64Image}`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            { type: "text", text: "Analyze this meal photo and estimate nutrition." },
            { type: "image_url", image_url: { url: dataUrl } }
          ]
        }
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
      { error: error instanceof Error ? error.message : "Failed to analyze image." },
      { status: 500 }
    );
  }
}
