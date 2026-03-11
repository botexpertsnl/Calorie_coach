"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppHeaderNav } from "@/components/AppHeaderNav";
import { NutritionAnalysisModal } from "@/components/NutritionAnalysisModal";
import { ProfileGoalsModal } from "@/components/ProfileGoalsModal";
import { Spinner } from "@/components/Spinner";
import { STORAGE_KEYS, readJson, writeJson } from "@/lib/local-data";
import { calculateDailyTargets } from "@/lib/nutrition";
import { CalorieResponse, DailyTargets, ProfileInput, StoredMealLog } from "@/lib/types";

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
  return <span>⚡</span>;
}

function CameraIcon() {
  return <span>📷</span>;
}

export function HomePageClient() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const searchParams = useSearchParams();
  const router = useRouter();

  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [profile, setProfile] = useState<ProfileInput>(defaultProfile);
  const [dailyTargets, setDailyTargets] = useState<DailyTargets | null>(null);

  const [mealDescription, setMealDescription] = useState("");
  const [isTextLoading, setIsTextLoading] = useState(false);
  const [isImageLoading, setIsImageLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<StoredMealLog[]>([]);

  const [isAnalysisModalOpen, setIsAnalysisModalOpen] = useState(false);
  const [analysisStatus, setAnalysisStatus] = useState<"loading" | "success" | "error">("loading");
  const [analysisResult, setAnalysisResult] = useState<CalorieResponse | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [pendingMealMeta, setPendingMealMeta] = useState<{ text: string; source: "text" | "image" } | null>(null);

  useEffect(() => {
    const savedMeals = readJson<StoredMealLog[]>(STORAGE_KEYS.meals);
    const savedProfile = readJson<ProfileInput>(STORAGE_KEYS.profile);
    const savedTargets = readJson<DailyTargets>(STORAGE_KEYS.targets);

    if (savedMeals) setHistory(savedMeals);
    if (savedProfile) setProfile(savedProfile);
    if (savedTargets) setDailyTargets(savedTargets);
  }, []);

  useEffect(() => {
    writeJson(STORAGE_KEYS.meals, history);
  }, [history]);

  useEffect(() => {
    if (!searchParams.get("openProfile")) return;
    setIsProfileModalOpen(true);
    router.replace("/");
  }, [router, searchParams]);

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

  function handleSaveProfile(nextProfile: ProfileInput) {
    const targets = calculateDailyTargets(nextProfile);
    setProfile(nextProfile);
    setDailyTargets(targets);
    writeJson(STORAGE_KEYS.profile, nextProfile);
    writeJson(STORAGE_KEYS.targets, targets);
  }

  async function runAnalysis(requestFn: () => Promise<{ data?: CalorieResponse; error?: string; ok: boolean }>, meta: { text: string; source: "text" | "image" }) {
    setError(null);
    setAnalysisResult(null);
    setAnalysisError(null);
    setPendingMealMeta(meta);
    setAnalysisStatus("loading");
    setIsAnalysisModalOpen(true);

    try {
      const payload = await requestFn();
      if (!payload.ok || !payload.data) throw new Error(payload.error ?? "Unable to analyze meal right now.");
      setAnalysisResult(payload.data);
      setAnalysisStatus("success");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Something went wrong.";
      setError(msg);
      setAnalysisError(msg);
      setAnalysisStatus("error");
    }
  }

  async function analyzeMealText(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = mealDescription.trim();
    if (!trimmed) return setError("Please describe your meal before analyzing.");
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
    setIsImageLoading(true);
    await runAnalysis(async () => {
      const formData = new FormData();
      formData.append("image", file);
      const response = await fetch("/api/analyze-image", { method: "POST", body: formData });
      const payload = (await response.json()) as { data?: CalorieResponse; error?: string };
      return { ...payload, ok: response.ok };
    }, { text: file.name || "Photo meal", source: "image" });
    setIsImageLoading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleAddMeal() {
    if (!analysisResult || !pendingMealMeta) return;
    setHistory((prev) => [{ id: crypto.randomUUID(), createdAt: new Date().toISOString(), ...pendingMealMeta, result: analysisResult }, ...prev]);
    setIsAnalysisModalOpen(false);
    setAnalysisResult(null);
    setPendingMealMeta(null);
    setAnalysisError(null);
  }

  return (
    <>
      <ProfileGoalsModal isOpen={isProfileModalOpen} initialProfile={profile} onClose={() => setIsProfileModalOpen(false)} onSave={handleSaveProfile} />
      <NutritionAnalysisModal isOpen={isAnalysisModalOpen} status={analysisStatus} result={analysisResult} errorMessage={analysisError} onClose={() => setIsAnalysisModalOpen(false)} onAddMeal={handleAddMeal} />

      <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8 md:px-8">
        <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <div className="grid gap-4 md:grid-cols-2">
            <MacroProgressRow label="Calories" unit="kcal" value={consumed.calories} target={dailyTargets?.calories} accent="bg-slate-700" />
            <MacroProgressRow label="Protein" unit="g" value={consumed.protein} target={dailyTargets?.protein} accent="bg-emerald-500" />
            <MacroProgressRow label="Carbs" unit="g" value={consumed.carbs} target={dailyTargets?.carbs} accent="bg-amber-500" />
            <MacroProgressRow label="Fat" unit="g" value={consumed.fat} target={dailyTargets?.fat} accent="bg-rose-500" />
          </div>
        </section>

        <AppHeaderNav onProfileClick={() => setIsProfileModalOpen(true)} />

        <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <h2 className="text-2xl font-semibold text-slate-900">What did you eat?</h2>
          <p className="mt-1 text-sm text-slate-500">Describe your meal in detail or take a photo for better accuracy.</p>

          <form onSubmit={analyzeMealText} className="mt-4 space-y-4">
            <textarea className="min-h-36 w-full rounded-2xl border border-slate-200 bg-white p-4 text-slate-800 outline-none transition focus:border-emerald-400" placeholder="e.g., Two scrambled eggs with a slice of whole grain toast and half an avocado..." value={mealDescription} onChange={(event) => setMealDescription(event.target.value)} />

            <input ref={fileInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void analyzeMealImage(file);
            }} />

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <button type="button" onClick={() => fileInputRef.current?.click()} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"><CameraIcon />Take Photo</button>
              <button type="submit" disabled={isTextLoading} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-400 disabled:opacity-60">{isTextLoading ? <Spinner /> : <BoltIcon />}Analyze Meal</button>
            </div>
          </form>

          {isImageLoading ? <p className="mt-4 inline-flex items-center gap-2 text-xs text-slate-500"><Spinner />Analyzing selected image...</p> : null}
          {error ? <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">{error}</p> : null}
        </section>

        <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <h2 className="text-xl font-semibold text-slate-900">Meal History</h2>
          {history.length === 0 ? <div className="mt-8 rounded-xl border border-dashed border-slate-200 py-10 text-center text-slate-500">No meals logged yet.</div> : (
            <ul className="mt-4 space-y-3">
              {history.map((entry) => (
                <li key={entry.id} className="rounded-xl border border-slate-200 p-4">
                  <p className="text-xs uppercase tracking-wide text-slate-400">{entry.source === "image" ? "Photo meal" : "Text meal"} · {new Date(entry.createdAt).toLocaleDateString()}</p>
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
