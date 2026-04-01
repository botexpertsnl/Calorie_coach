import { NextResponse } from "next/server";
import OpenAI from "openai";
import { CalorieResponse } from "@/lib/types";
import { enforceAiRateLimit, jsonError, logApiError } from "@/lib/server/api-security";
import { requireServerEnv } from "@/lib/server/env";

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

const supportedMimeTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
const maxSizeInBytes = 8 * 1024 * 1024;

function getOpenAIClient() {
  const apiKey = requireServerEnv("OPENAI_API_KEY");
  return new OpenAI({ apiKey });
}

function parseJsonResponse(content: string): CalorieResponse {
  const cleaned = content.trim().replace(/^```json\s*/i, "").replace(/```$/, "").trim();
  return JSON.parse(cleaned) as CalorieResponse;
}

function isValidCalorieResponse(data: unknown): data is CalorieResponse {
  if (!data || typeof data !== "object") return false;
  const value = data as CalorieResponse;
  if (!Array.isArray(value.items) || !value.totals) return false;
  return ["calories", "protein", "carbs", "fat"].every((key) => typeof value.totals[key as keyof typeof value.totals] === "number");
}

export async function POST(request: Request) {
  const rateLimitResponse = await enforceAiRateLimit(request, "analyze-image");
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const formData = await request.formData();
    const image = formData.get("image");

    if (!(image instanceof File)) return jsonError("Image file is required.", 400);
    if (!supportedMimeTypes.includes(image.type as (typeof supportedMimeTypes)[number])) {
      return jsonError("Unsupported image type. Please use JPG, PNG, WEBP, or GIF.", 415);
    }
    if (image.size > maxSizeInBytes) {
      return jsonError("Image is too large. Please upload an image under 8MB.", 413);
    }

    const buffer = Buffer.from(await image.arrayBuffer());
    const base64Image = buffer.toString("base64");
    const dataUrl = `data:${image.type};base64,${base64Image}`;

    const openai = getOpenAIClient();

    const response = await openai.responses.create({
      model: "gpt-4o-mini",
      input: [
        {
          role: "system",
          content: [{ type: "input_text", text: systemPrompt }]
        },
        {
          role: "user",
          content: [
            { type: "input_text", text: "Analyze this meal photo and estimate nutrition." },
            { type: "input_image", image_url: dataUrl, detail: "auto" }
          ]
        }
      ]
    });

    const outputText = response.output_text;
    if (!outputText) throw new Error("No content returned from OpenAI.");

    const parsed = parseJsonResponse(outputText);
    if (!isValidCalorieResponse(parsed)) throw new Error("AI returned an unexpected response shape.");

    return NextResponse.json({ data: parsed });
  } catch (error) {
    logApiError("/api/analyze-image", error);
    return jsonError("Unable to analyze image right now.", 500);
  }
}
