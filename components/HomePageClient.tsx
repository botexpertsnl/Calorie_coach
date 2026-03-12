"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { AppHeaderNav } from "@/components/AppHeaderNav";
import { NutritionAnalysisModal } from "@/components/NutritionAnalysisModal";
import { QuickMealsModal } from "@/components/QuickMealsModal";
import { Spinner } from "@/components/Spinner";
import { STORAGE_KEYS, readJson, writeJson } from "@/lib/local-data";
import { ALL_WEEKDAYS, applyDailyMealsForDate, getLocalDateKey, getMealsForDate, toCalorieResponseFromQuickMeal } from "@/lib/meals";
import { CalorieResponse, DailyTargets, MacroKey, MealSourceType, QuickMeal, StoredMealLog } from "@/lib/types";

type MacroRowProps = {
  label: string;
  unit: string;
  value: number;
  target?: number;
  accent: string;
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

function normalizeSourceType(source: StoredMealLog["source"]): MealSourceType {
  if (source === "quick_meal") return "quick";
  return "ai";
}

function normalizeHistoryEntry(entry: StoredMealLog): StoredMealLog {
  return {
    ...entry,
    sourceType: entry.sourceType ?? normalizeSourceType(entry.source),
    mealDate: entry.mealDate ?? entry.createdAt.slice(0, 10)
  };
}

function normalizeQuickMeal(meal: QuickMeal): QuickMeal {
  return {
    ...meal,
    isDailyMeal: meal.isDailyMeal ?? false,
    dailyMealDays: meal.dailyMealDays?.length ? meal.dailyMealDays : [...ALL_WEEKDAYS]
  };
}

function getNowDateTimeInputValues() {
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  return { date, time };
}

function toIsoFromDateTime(date: string, time: string) {
  const safeDate = date || getNowDateTimeInputValues().date;
  const safeTime = time || getNowDateTimeInputValues().time;
  const localDateTime = new Date(`${safeDate}T${safeTime}:00`);
  return Number.isNaN(localDateTime.getTime()) ? new Date().toISOString() : localDateTime.toISOString();
}

export function HomePageClient() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [dailyTargets, setDailyTargets] = useState<DailyTargets | null>(null);
  const [disabledMacros, setDisabledMacros] = useState<MacroKey[]>([]);
  const [mealDescription, setMealDescription] = useState("");
  const [isTextLoading, setIsTextLoading] = useState(false);
  const [isImageLoading, setIsImageLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<StoredMealLog[]>([]);
  const [quickMeals, setQuickMeals] = useState<QuickMeal[]>([]);
  const [isQuickMealsOpen, setIsQuickMealsOpen] = useState(false);
  const [todayKey, setTodayKey] = useState(getLocalDateKey());
  const [deleteMealId, setDeleteMealId] = useState<string | null>(null);

  const [isAnalysisModalOpen, setIsAnalysisModalOpen] = useState(false);
  const [analysisStatus, setAnalysisStatus] = useState<"loading" | "success" | "error">("loading");
  const [analysisResult, setAnalysisResult] = useState<CalorieResponse | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [pendingMealMeta, setPendingMealMeta] = useState<{ text: string; source: "text" | "image" } | null>(null);
  const [mealDateInput, setMealDateInput] = useState(getNowDateTimeInputValues().date);
  const [mealTimeInput, setMealTimeInput] = useState(getNowDateTimeInputValues().time);

  useEffect(() => {
    const savedMeals = readJson<StoredMealLog[]>(STORAGE_KEYS.meals);
    const savedTargets = readJson<DailyTargets>(STORAGE_KEYS.targets);
    const savedQuickMeals = readJson<QuickMeal[]>(STORAGE_KEYS.quickMeals);
    const savedDisabledMacros = readJson<MacroKey[]>(STORAGE_KEYS.disabledMacros);

    if (savedMeals) {
      setHistory(savedMeals.map(normalizeHistoryEntry));
    }
    if (savedTargets) setDailyTargets(savedTargets);
    if (savedQuickMeals) {
      setQuickMeals(savedQuickMeals.map(normalizeQuickMeal));
    }
    if (savedDisabledMacros) setDisabledMacros(savedDisabledMacros);
  }, []);

  useEffect(() => {
    writeJson(STORAGE_KEYS.meals, history);
  }, [history]);

  useEffect(() => {
    writeJson(STORAGE_KEYS.quickMeals, quickMeals);
  }, [quickMeals]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      const nextKey = getLocalDateKey();
      setTodayKey((prev) => (prev === nextKey ? prev : nextKey));
    }, 30_000);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    setHistory((prev) => {
      const next = applyDailyMealsForDate(prev, quickMeals, todayKey);
      return next.length === prev.length ? prev : next;
    });
  }, [quickMeals, todayKey]);

  const todayMeals = useMemo(() => getMealsForDate(history, todayKey), [history, todayKey]);
  const mealPendingDelete = useMemo(() => todayMeals.find((meal) => meal.id === deleteMealId) ?? null, [todayMeals, deleteMealId]);

  const consumed = useMemo(
    () =>
      todayMeals.reduce(
        (sum, meal) => ({
          calories: sum.calories + meal.result.totals.calories,
          protein: sum.protein + meal.result.totals.protein,
          carbs: sum.carbs + meal.result.totals.carbs,
          fat: sum.fat + meal.result.totals.fat
        }),
        { calories: 0, protein: 0, carbs: 0, fat: 0 }
      ),
    [todayMeals]
  );

  async function runAnalysis(requestFn: () => Promise<{ data?: CalorieResponse; error?: string; ok: boolean }>, meta: { text: string; source: "text" | "image" }) {
    setError(null);
    setAnalysisResult(null);
    setAnalysisError(null);
    setPendingMealMeta(meta);
    const now = getNowDateTimeInputValues();
    setMealDateInput(now.date);
    setMealTimeInput(now.time);
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

  function closeAnalysisModal() {
    setIsAnalysisModalOpen(false);
    setPendingMealMeta(null);
    setAnalysisResult(null);
    setAnalysisError(null);
    const now = getNowDateTimeInputValues();
    setMealDateInput(now.date);
    setMealTimeInput(now.time);
  }

  function handleAddQuickMealToDay(meal: QuickMeal, date: string, time: string) {
    const createdAt = toIsoFromDateTime(date, time);
    const mealDate = createdAt.slice(0, 10);

    setHistory((prev) => [
      {
        id: crypto.randomUUID(),
        title: meal.title,
        text: meal.title,
        source: "quick_meal",
        sourceType: "quick",
        quickMealId: meal.id,
        mealDate,
        result: toCalorieResponseFromQuickMeal(meal),
        createdAt
      },
      ...prev
    ]);
    setIsQuickMealsOpen(false);
  }

  function handleCreateOrUpdateQuickMeal(
    meal: Omit<QuickMeal, "id" | "createdAt" | "updatedAt">,
    mealId?: string
  ) {
    if (mealId) {
      setQuickMeals((prev) =>
        prev.map((item) =>
          item.id === mealId
            ? { ...item, ...meal, updatedAt: new Date().toISOString() }
            : item
        )
      );
      return;
    }

    const now = new Date().toISOString();
    setQuickMeals((prev) => [
      {
        id: crypto.randomUUID(),
        ...meal,
        createdAt: now,
        updatedAt: now
      },
      ...prev
    ]);
  }

  function handleDeleteQuickMeal(mealId: string) {
    setQuickMeals((prev) => prev.filter((meal) => meal.id !== mealId));
  }

  function handleAddMeal() {
    if (!analysisResult || !pendingMealMeta) return;

    const createdAt = toIsoFromDateTime(mealDateInput, mealTimeInput);
    const mealDate = createdAt.slice(0, 10);

    setHistory((prev) => [
      {
        id: crypto.randomUUID(),
        title: pendingMealMeta.text,
        text: pendingMealMeta.text,
        source: pendingMealMeta.source,
        sourceType: "ai",
        mealDate,
        result: analysisResult,
        createdAt
      },
      ...prev
    ]);
    closeAnalysisModal();
  }

  function confirmDeleteMeal() {
    if (!deleteMealId) return;
    setHistory((prev) => prev.filter((entry) => entry.id !== deleteMealId));
    setDeleteMealId(null);
  }

  return (
    <>
      {deleteMealId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-900">Delete meal?</h3>
            <p className="mt-2 text-sm text-slate-600">Are you sure you want to delete this meal?</p>
            {mealPendingDelete ? <p className="mt-2 text-xs text-slate-500">{mealPendingDelete.text}</p> : null}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setDeleteMealId(null)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">Cancel</button>
              <button type="button" onClick={confirmDeleteMeal} className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-500">Delete</button>
            </div>
          </div>
        </div>
      ) : null}

      <NutritionAnalysisModal
        isOpen={isAnalysisModalOpen}
        status={analysisStatus}
        result={analysisResult}
        errorMessage={analysisError}
        onClose={closeAnalysisModal}
        onAddMeal={handleAddMeal}
        mealDate={mealDateInput}
        mealTime={mealTimeInput}
        onMealDateChange={setMealDateInput}
        onMealTimeChange={setMealTimeInput}
      />
      <QuickMealsModal
        isOpen={isQuickMealsOpen}
        quickMeals={quickMeals}
        onClose={() => setIsQuickMealsOpen(false)}
        onAddQuickMealToDay={handleAddQuickMealToDay}
        onCreateOrUpdateQuickMeal={handleCreateOrUpdateQuickMeal}
        onDeleteQuickMeal={handleDeleteQuickMeal}
      />

      <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8 md:px-8">
        <AppHeaderNav />

        <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <div className="grid gap-4 md:grid-cols-2">
            {!disabledMacros.includes("calories") ? <MacroProgressRow label="Calories" unit="kcal" value={consumed.calories} target={dailyTargets?.calories} accent="bg-slate-700" /> : null}
            {!disabledMacros.includes("protein") ? <MacroProgressRow label="Protein" unit="g" value={consumed.protein} target={dailyTargets?.protein} accent="bg-emerald-500" /> : null}
            {!disabledMacros.includes("carbs") ? <MacroProgressRow label="Carbs" unit="g" value={consumed.carbs} target={dailyTargets?.carbs} accent="bg-amber-500" /> : null}
            {!disabledMacros.includes("fat") ? <MacroProgressRow label="Fat" unit="g" value={consumed.fat} target={dailyTargets?.fat} accent="bg-rose-500" /> : null}
          </div>
        </section>

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
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsQuickMealsOpen(true)}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Quick Add
                </button>
                <button type="submit" disabled={isTextLoading} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-400 disabled:opacity-60">{isTextLoading ? <Spinner /> : <BoltIcon />}Analyze Meal</button>
              </div>
            </div>
          </form>

          {isImageLoading ? <p className="mt-4 inline-flex items-center gap-2 text-xs text-slate-500"><Spinner />Analyzing selected image...</p> : null}
          {error ? <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">{error}</p> : null}
        </section>

        <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <h2 className="text-xl font-semibold text-slate-900">Meals Today</h2>
          {todayMeals.length === 0 ? <div className="mt-8 rounded-xl border border-dashed border-slate-200 py-10 text-center text-slate-500">No meals logged for today yet.</div> : (
            <ul className="mt-4 space-y-3">
              {todayMeals.map((entry) => (
                <li key={entry.id} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-slate-400">{entry.sourceType === "daily" ? "Daily meal" : entry.source === "image" ? "Photo meal" : entry.source === "quick_meal" ? "Quick meal" : "Text meal"} · {new Date(entry.createdAt).toLocaleDateString()} {new Date(entry.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
                      <p className="mt-1 text-sm text-slate-700">{entry.text}</p>
                      <p className="mt-1 text-xs text-slate-500">{entry.result.totals.calories} kcal • {entry.result.totals.protein}g protein • {entry.result.totals.carbs}g carbs • {entry.result.totals.fat}g fat</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setDeleteMealId(entry.id)}
                      className="rounded-lg border border-rose-200 px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                      aria-label={`Delete meal ${entry.text}`}
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </>
  );
}
