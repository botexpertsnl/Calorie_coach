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

function parseJsonResponse(content: string): CalorieResponse {
  const cleaned = content.trim().replace(/^```json\s*/i, "").replace(/```$/, "").trim();
  return JSON.parse(cleaned) as CalorieResponse;
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

    const supportedMimeTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!supportedMimeTypes.includes(image.type)) {
      return NextResponse.json(
        { error: "Unsupported image type. Please use JPG, PNG, WEBP, or GIF." },
        { status: 400 }
      );
    }

    const mimeType = image.type;

    const maxSizeInBytes = 8 * 1024 * 1024;
    if (image.size > maxSizeInBytes) {
      return NextResponse.json(
        { error: "Image is too large. Please upload an image under 8MB." },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await image.arrayBuffer());
    const base64Image = buffer.toString("base64");
    const dataUrl = `data:${mimeType};base64,${base64Image}`;

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
    if (!isValid(parsed)) throw new Error("AI returned an unexpected response shape.");

    return NextResponse.json({ data: parsed });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to analyze image." },
      { status: 500 }
    );
  }
}
