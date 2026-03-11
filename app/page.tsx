"use client";

import Image from "next/image";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { NutritionAnalysisModal } from "@/components/NutritionAnalysisModal";
import { ProfileGoalsModal } from "@/components/ProfileGoalsModal";
import { Spinner } from "@/components/Spinner";
import { calculateDailyTargets } from "@/lib/nutrition";
import { CalorieResponse, DailyTargets, ProfileInput } from "@/lib/types";

type MealLog = {
  id: string;
  text: string;
  source: "text" | "image";
  result: CalorieResponse;
};

type MacroRowProps = {
  label: string;
  unit: string;
  value: number;
  target?: number;
  accent: string;
};

const defaultProfile: ProfileInput = {
  heightCm: 170,
  weightKg: 70,
  waistCm: 80,
  age: 30,
  gender: "female",
  activityLevel: "moderate",
  goalText: "I want to improve body composition and feel more energetic."
};

function MacroProgressRow({ label, unit, value, target, accent }: MacroRowProps) {
  const percent = target && target > 0 ? Math.min(Math.round((value / target) * 100), 100) : 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <p className="font-medium text-slate-700">{label}</p>
        <p className="text-slate-500">{value} / {target ?? "--"} {unit}</p>
      </div>
      <div className="h-1.5 w-full rounded-full bg-slate-200">
        <div className={`h-1.5 rounded-full ${accent}`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function BoltIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
      <path d="M11.25 1.5a.75.75 0 0 0-1.37-.17l-6 10a.75.75 0 0 0 .64 1.17h4.06l-1.8 5.4a.75.75 0 0 0 1.35.63l8-12A.75.75 0 0 0 15.5 5h-4.24l.74-2.95a.75.75 0 0 0-.75-.55Z" />
    </svg>
  );
}

function CameraIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
      <path d="M4.5 5.5A2.5 2.5 0 0 0 2 8v6a2.5 2.5 0 0 0 2.5 2.5h11A2.5 2.5 0 0 0 18 14V8a2.5 2.5 0 0 0-2.5-2.5h-1.88a1 1 0 0 1-.83-.45l-.58-.88a1 1 0 0 0-.83-.45H8.62a1 1 0 0 0-.83.45l-.58.88a1 1 0 0 1-.83.45H4.5Zm5.5 3a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z" />
    </svg>
  );
}

export default function HomePage() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [profile, setProfile] = useState<ProfileInput>(defaultProfile);
  const [dailyTargets, setDailyTargets] = useState<DailyTargets | null>(null);

  const [mealDescription, setMealDescription] = useState("");
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isTextLoading, setIsTextLoading] = useState(false);
  const [isImageLoading, setIsImageLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [history, setHistory] = useState<MealLog[]>([]);

  const [isAnalysisModalOpen, setIsAnalysisModalOpen] = useState(false);
  const [analysisStatus, setAnalysisStatus] = useState<"loading" | "success" | "error">("loading");
  const [analysisResult, setAnalysisResult] = useState<CalorieResponse | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [pendingMealMeta, setPendingMealMeta] = useState<{ text: string; source: "text" | "image" } | null>(null);

  const consumed = useMemo(
    () =>
      history.reduce(
        (sum, meal) => ({
          calories: sum.calories + meal.result.totals.calories,
          protein: sum.protein + meal.result.totals.protein,
          carbs: sum.carbs + meal.result.totals.carbs,
          fat: sum.fat + meal.result.totals.fat
        }),
        { calories: 0, protein: 0, carbs: 0, fat: 0 }
      ),
    [history]
  );

  useEffect(() => {
    if (!selectedImage) {
      setPreviewUrl(null);
      return;
    }

    const url = URL.createObjectURL(selectedImage);
    setPreviewUrl(url);

    return () => {
      URL.revokeObjectURL(url);
    };
  }, [selectedImage]);

  function handleSaveProfile(nextProfile: ProfileInput) {
    setProfile(nextProfile);
    setDailyTargets(calculateDailyTargets(nextProfile));
  }

  async function runAnalysis(
    requestFn: () => Promise<{ data?: CalorieResponse; error?: string; ok: boolean }>,
    mealMeta: { text: string; source: "text" | "image" }
  ) {
    setError(null);
    setAnalysisResult(null);
    setAnalysisError(null);
    setPendingMealMeta(mealMeta);
    setAnalysisStatus("loading");
    setIsAnalysisModalOpen(true);

    try {
      const payload = await requestFn();

      if (!payload.ok || !payload.data) {
        throw new Error(payload.error ?? "Unable to analyze meal right now.");
      }

      setAnalysisResult(payload.data);
      setAnalysisStatus("success");
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : "Something went wrong.";
      setError(message);
      setAnalysisError(message);
      setAnalysisStatus("error");
    }
  }

  async function analyzeMealText(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = mealDescription.trim();

    if (!trimmed) {
      setError("Please describe your meal before analyzing.");
      return;
    }

    setIsTextLoading(true);

    await runAnalysis(async () => {
      const response = await fetch("/api/calories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mealDescription: trimmed })
      });

      const payload = (await response.json()) as { data?: CalorieResponse; error?: string };
      return { ...payload, ok: response.ok };
    }, { text: trimmed, source: "text" });

    setIsTextLoading(false);
    setMealDescription("");
  }

  async function analyzeMealImage(file: File) {
    setSelectedImage(file);
    setIsImageLoading(true);

    await runAnalysis(async () => {
      const formData = new FormData();
      formData.append("image", file);

      const response = await fetch("/api/analyze-image", {
        method: "POST",
        body: formData
      });

      const payload = (await response.json()) as { data?: CalorieResponse; error?: string };
      return { ...payload, ok: response.ok };
    }, { text: file.name || "Photo meal", source: "image" });

    setIsImageLoading(false);
  }

  function handleAddMeal() {
    if (!analysisResult || !pendingMealMeta) return;

    setHistory((prev) => [
      {
        id: crypto.randomUUID(),
        text: pendingMealMeta.text,
        source: pendingMealMeta.source,
        result: analysisResult
      },
      ...prev
    ]);

    setIsAnalysisModalOpen(false);
    setAnalysisResult(null);
    setPendingMealMeta(null);
  }

  return (
    <>
      <ProfileGoalsModal
        isOpen={isProfileModalOpen}
        initialProfile={profile}
        onClose={() => setIsProfileModalOpen(false)}
        onSave={handleSaveProfile}
      />

      <NutritionAnalysisModal
        isOpen={isAnalysisModalOpen}
        status={analysisStatus}
        result={analysisResult}
        errorMessage={analysisError}
        onClose={() => setIsAnalysisModalOpen(false)}
        onAddMeal={handleAddMeal}
      />

      <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8 md:px-8">
        <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <div className="grid gap-4 md:grid-cols-2">
            <MacroProgressRow label="Calories" unit="kcal" value={consumed.calories} target={dailyTargets?.calories} accent="bg-slate-700" />
            <MacroProgressRow label="Protein" unit="g" value={consumed.protein} target={dailyTargets?.protein} accent="bg-emerald-500" />
            <MacroProgressRow label="Carbs" unit="g" value={consumed.carbs} target={dailyTargets?.carbs} accent="bg-amber-500" />
            <MacroProgressRow label="Fat" unit="g" value={consumed.fat} target={dailyTargets?.fat} accent="bg-rose-500" />
          </div>
        </section>

        <header className="flex flex-col items-start justify-between gap-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 md:flex-row md:items-center">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">🥗</div>
            <div>
              <p className="text-lg font-semibold text-slate-900">AI Calorie Coach</p>
              <p className="text-sm text-slate-500">Smart nutrition tracking dashboard</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50">Insights</button>
            <button type="button" onClick={() => setIsProfileModalOpen(true)} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50">Profile</button>
            <button type="button" className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50">Account</button>
          </div>
        </header>

        <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <h2 className="text-2xl font-semibold text-slate-900">What did you eat?</h2>
          <p className="mt-1 text-sm text-slate-500">Describe your meal in detail or take a photo for better accuracy.</p>

          <form onSubmit={analyzeMealText} className="mt-4 space-y-4">
            <textarea
              className="min-h-36 w-full rounded-2xl border border-slate-200 bg-white p-4 text-slate-800 outline-none transition focus:border-emerald-400"
              placeholder="e.g., Two scrambled eggs with a slice of whole grain toast and half an avocado..."
              value={mealDescription}
              onChange={(event) => setMealDescription(event.target.value)}
            />

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  void analyzeMealImage(file);
                }
              }}
            />

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <button type="button" onClick={() => fileInputRef.current?.click()} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                <CameraIcon />
                Take Photo
              </button>

              <button type="submit" disabled={isTextLoading} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-400 disabled:opacity-60">
                {isTextLoading ? <Spinner /> : <BoltIcon />}
                Analyze Meal
              </button>
            </div>
          </form>

          <p className="mt-3 text-xs text-slate-500">On mobile, this opens your camera when supported. If not available, it gracefully falls back to the image picker.</p>

          {previewUrl ? (
            <div className="mt-4 space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-medium text-slate-700">Latest photo preview</p>
              <div className="relative h-56 w-full overflow-hidden rounded-xl border border-slate-200 bg-white">
                <Image src={previewUrl} alt="Selected meal preview" fill className="object-cover" unoptimized />
              </div>
              {isImageLoading ? (
                <p className="inline-flex items-center gap-2 text-xs text-slate-500">
                  <Spinner />
                  Analyzing selected image...
                </p>
              ) : null}
            </div>
          ) : null}

          {error ? <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">{error}</p> : null}
        </section>

        <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <h2 className="text-xl font-semibold text-slate-900">Meal History</h2>

          {history.length === 0 ? (
            <div className="mt-8 rounded-xl border border-dashed border-slate-200 py-10 text-center text-slate-500">No meals logged yet.</div>
          ) : (
            <ul className="mt-4 space-y-3">
              {history.map((entry) => (
                <li key={entry.id} className="rounded-xl border border-slate-200 p-4">
                  <p className="text-xs uppercase tracking-wide text-slate-400">{entry.source === "image" ? "Photo meal" : "Text meal"}</p>
                  <p className="mt-1 text-sm text-slate-700">{entry.text}</p>
                  <p className="mt-1 text-xs text-slate-500">{entry.result.totals.calories} kcal • {entry.result.totals.protein}g protein • {entry.result.totals.carbs}g carbs • {entry.result.totals.fat}g fat</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </>
  );
}
