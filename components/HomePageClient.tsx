"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { AppHeaderNav } from "@/components/AppHeaderNav";
import { MobileSwipePage } from "@/components/MobileSwipePage";
import { QuickMealsModal } from "@/components/QuickMealsModal";
import { Spinner } from "@/components/Spinner";
import { AppModal } from "@/components/AppModal";
import { TARGETS_UPDATED_EVENT } from "@/lib/daily-targets";
import { ALL_WEEKDAYS, applyDailyMealsForDate, getLocalDateKey, getMealsForDate, toCalorieResponseFromQuickMeal } from "@/lib/meals";
import { getCurrentUserId, loadDailyTargets, loadMeals, loadQuickMeals, loadUserSettings, replaceMeals, replaceQuickMeals } from "@/lib/supabase/user-data";
import { CalorieResponse, DailyTargets, MacroKey, MealSourceType, MealWeekday, QuickMeal, StoredMealLog } from "@/lib/types";

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
  const amsterdamDate = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Amsterdam",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(now);
  const amsterdamTime = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Amsterdam",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(now);

  return { date: amsterdamDate, time: amsterdamTime };
}

function getAmsterdamOffsetMs(date: Date) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Amsterdam",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });

  const parts = formatter.formatToParts(date);
  const getPart = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  const asUtc = Date.UTC(
    getPart("year"),
    getPart("month") - 1,
    getPart("day"),
    getPart("hour"),
    getPart("minute"),
    getPart("second")
  );

  return asUtc - date.getTime();
}

function toIsoFromDateTime(date: string, time: string) {
  const safeDate = date || getNowDateTimeInputValues().date;
  const safeTime = time || getNowDateTimeInputValues().time;
  const [year, month, day] = safeDate.split("-").map(Number);
  const [hour, minute] = safeTime.split(":").map(Number);

  if ([year, month, day, hour, minute].some((value) => Number.isNaN(value))) {
    return new Date().toISOString();
  }

  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  const offsetMs = getAmsterdamOffsetMs(utcGuess);
  const amsterdamDateTime = new Date(utcGuess.getTime() - offsetMs);
  return amsterdamDateTime.toISOString();
}


function toDateAndTimeFromIso(iso: string) {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return getNowDateTimeInputValues();

  return {
    date: parsed.toISOString().slice(0, 10),
    time: `${String(parsed.getHours()).padStart(2, "0")}:${String(parsed.getMinutes()).padStart(2, "0")}`
  };
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

  const [editMealId, setEditMealId] = useState<string | null>(null);
  const [editMealText, setEditMealText] = useState("");
  const [editMealDate, setEditMealDate] = useState(getNowDateTimeInputValues().date);
  const [editMealTime, setEditMealTime] = useState(getNowDateTimeInputValues().time);
  const [editMealTotals, setEditMealTotals] = useState({ calories: 0, protein: 0, carbs: 0, fat: 0 });
  const [editAsDailyMeal, setEditAsDailyMeal] = useState(false);
  const [editDailyMealDays, setEditDailyMealDays] = useState<MealWeekday[]>([...ALL_WEEKDAYS]);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [analysisModalOpen, setAnalysisModalOpen] = useState(false);
  const [analysisMeta, setAnalysisMeta] = useState<{ text: string; source: "text" | "image" } | null>(null);
  const [analysisResult, setAnalysisResult] = useState<CalorieResponse | null>(null);
  const [analysisDate, setAnalysisDate] = useState(getNowDateTimeInputValues().date);
  const [analysisTime, setAnalysisTime] = useState(getNowDateTimeInputValues().time);
  const [analysisTotals, setAnalysisTotals] = useState({ calories: 0, protein: 0, carbs: 0, fat: 0 });
  const [analysisAsDailyMeal, setAnalysisAsDailyMeal] = useState(false);
  const [analysisDailyMealDays, setAnalysisDailyMealDays] = useState<MealWeekday[]>([...ALL_WEEKDAYS]);
  const [userId, setUserId] = useState<string | null>(null);
  const [hasLoadedPersistedData, setHasLoadedPersistedData] = useState(false);
  const [popupNotice, setPopupNotice] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function hydrate() {
      try {
        const authUserId = await getCurrentUserId();
        if (!isMounted) return;
        setUserId(authUserId);

        const [savedMeals, savedTargets, savedQuickMeals, settings] = await Promise.all([
          loadMeals(authUserId),
          loadDailyTargets(authUserId),
          loadQuickMeals(authUserId),
          loadUserSettings(authUserId)
        ]);

        if (!isMounted) return;
        setHistory(savedMeals.map(normalizeHistoryEntry));
        if (savedTargets) setDailyTargets(savedTargets);
        setQuickMeals(savedQuickMeals.map(normalizeQuickMeal));
        setDisabledMacros(settings.disabledMacros ?? []);
      } catch (loadError) {
        if (!isMounted) return;
        const message = loadError instanceof Error ? loadError.message : "Unable to load your meal data.";
        setError(message);
      } finally {
        if (isMounted) setHasLoadedPersistedData(true);
      }
    }

    void hydrate();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!userId || !hasLoadedPersistedData) return;
    void replaceMeals(userId, history);
  }, [hasLoadedPersistedData, history, userId]);

  useEffect(() => {
    if (!userId || !hasLoadedPersistedData) return;
    void replaceQuickMeals(userId, quickMeals);
  }, [hasLoadedPersistedData, quickMeals, userId]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      const nextKey = getLocalDateKey();
      setTodayKey((prev) => (prev === nextKey ? prev : nextKey));
    }, 30_000);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const syncTargets = async () => {
      if (!userId) return;
      const [savedTargets, settings] = await Promise.all([loadDailyTargets(userId), loadUserSettings(userId)]);
      if (savedTargets) setDailyTargets(savedTargets);
      setDisabledMacros(settings.disabledMacros ?? []);
    };

    const onTargetsUpdated = (event: Event) => {
      const custom = event as CustomEvent<DailyTargets>;
      if (custom.detail) setDailyTargets(custom.detail);
    };

    const onFocus = () => void syncTargets();
    void syncTargets();
    window.addEventListener(TARGETS_UPDATED_EVENT, onTargetsUpdated as EventListener);
    window.addEventListener("focus", onFocus);

    return () => {
      window.removeEventListener(TARGETS_UPDATED_EVENT, onTargetsUpdated as EventListener);
      window.removeEventListener("focus", onFocus);
    };
  }, [userId]);


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

  function appendMealToHistory(entry: StoredMealLog) {
    setHistory((prev) => [entry, ...prev]);
  }

  function addMealFromAnalysis(
    result: CalorieResponse,
    meta: { text: string; source: "text" | "image" },
    date: string,
    time: string,
    options?: { sourceType?: MealSourceType; quickMealId?: string }
  ) {
    const createdAt = toIsoFromDateTime(date, time);
    const mealDate = date || getNowDateTimeInputValues().date;

    appendMealToHistory({
      id: crypto.randomUUID(),
      title: meta.text,
      text: meta.text,
      source: meta.source,
      sourceType: options?.sourceType ?? "ai",
      quickMealId: options?.quickMealId,
      mealDate,
      result,
      createdAt
    });

    const isToday = mealDate === todayKey;
    const confirmationMessage = isToday
      ? "Meal added to Meals Today."
      : `Meal saved for ${mealDate}. It is stored for insights and will not appear in Meals Today.`;
    setConfirmation(confirmationMessage);
  }


  function openAnalysisModal(result: CalorieResponse, meta: { text: string; source: "text" | "image" }) {
    const now = getNowDateTimeInputValues();
    setAnalysisMeta(meta);
    setAnalysisResult(result);
    setAnalysisDate(now.date);
    setAnalysisTime(now.time);
    setAnalysisTotals({
      calories: result.totals.calories,
      protein: result.totals.protein,
      carbs: result.totals.carbs,
      fat: result.totals.fat
    });
    setAnalysisAsDailyMeal(false);
    setAnalysisDailyMealDays([...ALL_WEEKDAYS]);
    setAnalysisModalOpen(true);
  }

  function toggleAnalysisDailyMealDay(day: MealWeekday) {
    setAnalysisDailyMealDays((prev) =>
      prev.includes(day) ? prev.filter((item) => item !== day) : [...prev, day]
    );
  }

  function addAnalyzedMealFromModal() {
    if (!analysisResult || !analysisMeta) return;

    const updatedResult: CalorieResponse = {
      ...analysisResult,
      totals: {
        calories: Math.max(0, Number(analysisTotals.calories) || 0),
        protein: Math.max(0, Number(analysisTotals.protein) || 0),
        carbs: Math.max(0, Number(analysisTotals.carbs) || 0),
        fat: Math.max(0, Number(analysisTotals.fat) || 0)
      }
    };

    let quickMealIdForMealLog: string | undefined;
    if (analysisAsDailyMeal) {
      const now = new Date().toISOString();
      const safeDays = analysisDailyMealDays.length ? analysisDailyMealDays : [...ALL_WEEKDAYS];
      const quickMealId = crypto.randomUUID();
      quickMealIdForMealLog = quickMealId;

      setQuickMeals((prev) => [
        {
          id: quickMealId,
          title: analysisMeta.text || "Daily Meal",
          calories: Math.max(0, Number(analysisTotals.calories) || 0),
          protein: Math.max(0, Number(analysisTotals.protein) || 0),
          carbs: Math.max(0, Number(analysisTotals.carbs) || 0),
          fat: Math.max(0, Number(analysisTotals.fat) || 0),
          isDailyMeal: true,
          dailyMealDays: safeDays,
          createdAt: now,
          updatedAt: now
        },
        ...prev
      ]);
    }

    addMealFromAnalysis(updatedResult, analysisMeta, analysisDate, analysisTime, {
      sourceType: analysisAsDailyMeal ? "daily" : "ai",
      quickMealId: quickMealIdForMealLog
    });
    setAnalysisModalOpen(false);
    setAnalysisMeta(null);
    setAnalysisResult(null);
    setAnalysisAsDailyMeal(false);
    setAnalysisDailyMealDays([...ALL_WEEKDAYS]);
    setMealDescription("");
    setPopupNotice("Meal added.");
  }

  useEffect(() => {
    if (!popupNotice) return;
    const timeoutId = window.setTimeout(() => setPopupNotice(null), 2200);
    return () => window.clearTimeout(timeoutId);
  }, [popupNotice]);

  async function analyzeMealText(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = mealDescription.trim();
    if (!trimmed) return setError("Please describe your meal before analyzing.");
    setIsTextLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/calories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mealDescription: trimmed })
      });
      const payload = (await response.json()) as { data?: CalorieResponse; error?: string };
      if (!response.ok || !payload.data) throw new Error(payload.error ?? "Unable to analyze meal right now.");

      openAnalysisModal(payload.data, { text: trimmed, source: "text" });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Something went wrong.";
      setError(msg);
    } finally {
      setIsTextLoading(false);
    }
  }

  async function analyzeMealImage(file: File) {
    setIsImageLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("image", file);
      const response = await fetch("/api/analyze-image", { method: "POST", body: formData });
      const payload = (await response.json()) as { data?: CalorieResponse; error?: string };
      if (!response.ok || !payload.data) throw new Error(payload.error ?? "Unable to analyze meal image right now.");

      openAnalysisModal(payload.data, { text: file.name || "Photo meal", source: "image" });
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Something went wrong.";
      setError(msg);
    } finally {
      setIsImageLoading(false);
    }
  }

  async function handleQuickAddClick() {
    const trimmed = mealDescription.trim();
    if (!trimmed) {
      setIsQuickMealsOpen(true);
      return;
    }

    setIsTextLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/calories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mealDescription: trimmed })
      });
      const payload = (await response.json()) as { data?: CalorieResponse; error?: string };
      if (!response.ok || !payload.data) throw new Error(payload.error ?? "Unable to analyze meal right now.");

      const now = getNowDateTimeInputValues();
      addMealFromAnalysis(payload.data, { text: trimmed, source: "text" }, now.date, now.time);
      setMealDescription("");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Something went wrong.";
      setError(msg);
    } finally {
      setIsTextLoading(false);
    }
  }

  function openEditMeal(meal: StoredMealLog) {
    setEditMealId(meal.id);
    setEditMealText(meal.text);
    const dateTime = toDateAndTimeFromIso(meal.createdAt);
    setEditMealDate(dateTime.date);
    setEditMealTime(dateTime.time);
    setEditMealTotals({
      calories: meal.result.totals.calories,
      protein: meal.result.totals.protein,
      carbs: meal.result.totals.carbs,
      fat: meal.result.totals.fat
    });

    const relatedQuickMeal = meal.quickMealId
      ? quickMeals.find((item) => item.id === meal.quickMealId)
      : quickMeals.find((item) => item.title.toLowerCase() === meal.text.toLowerCase() && item.isDailyMeal);

    setEditAsDailyMeal(Boolean(relatedQuickMeal?.isDailyMeal || meal.sourceType === "daily"));
    setEditDailyMealDays(relatedQuickMeal?.dailyMealDays?.length ? relatedQuickMeal.dailyMealDays : [...ALL_WEEKDAYS]);
  }

  function toggleEditDailyMealDay(day: MealWeekday) {
    setEditDailyMealDays((prev) =>
      prev.includes(day) ? prev.filter((item) => item !== day) : [...prev, day]
    );
  }

  function saveEditedMeal() {
    if (!editMealId) return;
    const createdAt = toIsoFromDateTime(editMealDate, editMealTime);
    const mealDate = editMealDate || getNowDateTimeInputValues().date;

    setHistory((prev) =>
      prev.map((entry) =>
        entry.id !== editMealId
          ? entry
          : {
              ...entry,
              text: editMealText.trim() || entry.text,
              title: editMealText.trim() || entry.title,
              sourceType: editAsDailyMeal ? "daily" : entry.sourceType,
              mealDate,
              createdAt,
              result: {
                ...entry.result,
                totals: {
                  calories: Math.max(0, Number(editMealTotals.calories) || 0),
                  protein: Math.max(0, Number(editMealTotals.protein) || 0),
                  carbs: Math.max(0, Number(editMealTotals.carbs) || 0),
                  fat: Math.max(0, Number(editMealTotals.fat) || 0)
                }
              }
            }
      )
    );

    if (editAsDailyMeal) {
      const now = new Date().toISOString();
      const safeDays = editDailyMealDays.length ? editDailyMealDays : [...ALL_WEEKDAYS];

      setQuickMeals((prev) => {
        const currentEntry = history.find((entry) => entry.id === editMealId);
        const existingId = currentEntry?.quickMealId;

        if (existingId && prev.some((item) => item.id === existingId)) {
          return prev.map((item) =>
            item.id === existingId
              ? {
                  ...item,
                  title: editMealText.trim() || item.title,
                  calories: Math.max(0, Number(editMealTotals.calories) || 0),
                  protein: Math.max(0, Number(editMealTotals.protein) || 0),
                  carbs: Math.max(0, Number(editMealTotals.carbs) || 0),
                  fat: Math.max(0, Number(editMealTotals.fat) || 0),
                  isDailyMeal: true,
                  dailyMealDays: safeDays,
                  updatedAt: now
                }
              : item
          );
        }

        return [
          {
            id: crypto.randomUUID(),
            title: editMealText.trim() || "Daily Meal",
            calories: Math.max(0, Number(editMealTotals.calories) || 0),
            protein: Math.max(0, Number(editMealTotals.protein) || 0),
            carbs: Math.max(0, Number(editMealTotals.carbs) || 0),
            fat: Math.max(0, Number(editMealTotals.fat) || 0),
            isDailyMeal: true,
            dailyMealDays: safeDays,
            createdAt: now,
            updatedAt: now
          },
          ...prev
        ];
      });
    }

    const confirmationMessage = mealDate === todayKey
      ? "Meal updated in Meals Today."
      : `Meal updated for ${mealDate}. It is stored for insights and not shown in Meals Today.`;
    setConfirmation(confirmationMessage);
    setEditMealId(null);
    setEditAsDailyMeal(false);
    setEditDailyMealDays([...ALL_WEEKDAYS]);
  }


  function handleAddQuickMealToDay(meal: QuickMeal, date: string, time: string) {
    const createdAt = toIsoFromDateTime(date, time);
    const mealDate = date || getNowDateTimeInputValues().date;

    appendMealToHistory({
      id: crypto.randomUUID(),
      title: meal.title,
      text: meal.title,
      source: "quick_meal",
      sourceType: "quick",
      quickMealId: meal.id,
      mealDate,
      result: toCalorieResponseFromQuickMeal(meal),
      createdAt
    });

    setIsQuickMealsOpen(false);

    const confirmationMessage = mealDate === todayKey
      ? "Quick meal added to Meals Today."
      : `Quick meal saved for ${mealDate}. It is stored for insights and will not appear in Meals Today.`;
    setConfirmation(confirmationMessage);
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

  function confirmDeleteMeal() {
    if (!deleteMealId) return;
    setHistory((prev) => prev.filter((entry) => entry.id !== deleteMealId));
    setDeleteMealId(null);
  }

  return (
    <>
      {deleteMealId ? (
        <AppModal
          title="Delete meal?"
          onClose={() => setDeleteMealId(null)}
          maxWidthClassName="sm:max-w-md"
          footer={(
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setDeleteMealId(null)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">Cancel</button>
              <button type="button" onClick={confirmDeleteMeal} className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-500">Delete</button>
            </div>
          )}
        >
            <p className="mt-2 text-sm text-slate-600">Are you sure you want to delete this meal?</p>
            {mealPendingDelete ? <p className="mt-2 text-xs text-slate-500">{mealPendingDelete.text}</p> : null}
        </AppModal>
      ) : null}
      {editMealId ? (
        <AppModal
          title="Edit meal"
          onClose={() => setEditMealId(null)}
          maxWidthClassName="sm:max-w-lg"
          footer={(
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setEditMealId(null)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">Cancel</button>
              <button type="button" onClick={saveEditedMeal} className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-400">Save changes</button>
            </div>
          )}
        >
            <div className="mt-4 space-y-3">
              <label className="block text-sm text-slate-700">Meal description
                <input type="text" value={editMealText} onChange={(event) => setEditMealText(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" />
              </label>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="text-sm text-slate-700">Meal date
                  <input type="date" value={editMealDate} onChange={(event) => setEditMealDate(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" />
                </label>
                <label className="text-sm text-slate-700">Meal time
                  <input type="time" value={editMealTime} onChange={(event) => setEditMealTime(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" />
                </label>
              </div>
              <label className="flex items-start gap-3 rounded-xl border border-slate-200 p-3 text-sm text-slate-700">
                <input type="checkbox" checked={editAsDailyMeal} onChange={(event) => setEditAsDailyMeal(event.target.checked)} className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-500 focus:ring-emerald-400" />
                <span>
                  <span className="font-medium text-slate-800">Save as Daily Meal</span>
                  <span className="mt-1 block text-xs text-slate-500">This meal can be auto-added on selected days.</span>
                </span>
              </label>

              {editAsDailyMeal ? (
                <div className="rounded-xl border border-slate-200 p-3">
                  <p className="text-sm font-medium text-slate-800">Auto-add days</p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {ALL_WEEKDAYS.map((day) => (
                      <label key={day} className="inline-flex items-center gap-2 text-sm text-slate-700">
                        <input type="checkbox" checked={editDailyMealDays.includes(day)} onChange={() => toggleEditDailyMealDay(day)} className="h-4 w-4 rounded border-slate-300 text-emerald-500 focus:ring-emerald-400" />
                        {day.charAt(0).toUpperCase() + day.slice(1)}
                      </label>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="grid gap-3 md:grid-cols-2">
                <label className="text-sm text-slate-700">Calories
                  <input type="number" min={0} value={editMealTotals.calories} onChange={(event) => setEditMealTotals((prev) => ({ ...prev, calories: Number(event.target.value) }))} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" />
                </label>
                <label className="text-sm text-slate-700">Protein (g)
                  <input type="number" min={0} value={editMealTotals.protein} onChange={(event) => setEditMealTotals((prev) => ({ ...prev, protein: Number(event.target.value) }))} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" />
                </label>
                <label className="text-sm text-slate-700">Carbs (g)
                  <input type="number" min={0} value={editMealTotals.carbs} onChange={(event) => setEditMealTotals((prev) => ({ ...prev, carbs: Number(event.target.value) }))} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" />
                </label>
                <label className="text-sm text-slate-700">Fat (g)
                  <input type="number" min={0} value={editMealTotals.fat} onChange={(event) => setEditMealTotals((prev) => ({ ...prev, fat: Number(event.target.value) }))} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" />
                </label>
              </div>
            </div>
        </AppModal>
      ) : null}


      {analysisModalOpen && analysisResult ? (
        <AppModal
          title="Analyzed meal macros"
          onClose={() => { setAnalysisModalOpen(false); setAnalysisMeta(null); setAnalysisResult(null); }}
          closeAriaLabel="Close analyzed meal modal"
          maxWidthClassName="sm:max-w-2xl"
          footer={(
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => { setAnalysisModalOpen(false); setAnalysisMeta(null); setAnalysisResult(null); }} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">Cancel</button>
              <button type="button" onClick={addAnalyzedMealFromModal} className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-400">Add meal</button>
            </div>
          )}
        >
            <p className="mt-1 text-sm text-slate-500">Review and edit macros before adding this meal.</p>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <label className="text-sm text-slate-700">Meal date
                <input type="date" value={analysisDate} onChange={(event) => setAnalysisDate(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" />
              </label>
              <label className="text-sm text-slate-700">Meal time
                <input type="time" value={analysisTime} onChange={(event) => setAnalysisTime(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" />
              </label>
            </div>

            <label className="mt-4 flex items-start gap-3 rounded-xl border border-slate-200 p-3 text-sm text-slate-700">
              <input type="checkbox" checked={analysisAsDailyMeal} onChange={(event) => setAnalysisAsDailyMeal(event.target.checked)} className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-500 focus:ring-emerald-400" />
              <span>
                <span className="font-medium text-slate-800">Save as Daily Meal</span>
                <span className="mt-1 block text-xs text-slate-500">This meal can be auto-added on selected days.</span>
              </span>
            </label>

            {analysisAsDailyMeal ? (
              <div className="mt-3 rounded-xl border border-slate-200 p-3">
                <p className="text-sm font-medium text-slate-800">Auto-add days</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {ALL_WEEKDAYS.map((day) => (
                    <label key={day} className="inline-flex items-center gap-2 text-sm text-slate-700">
                      <input type="checkbox" checked={analysisDailyMealDays.includes(day)} onChange={() => toggleAnalysisDailyMealDay(day)} className="h-4 w-4 rounded border-slate-300 text-emerald-500 focus:ring-emerald-400" />
                      {day.charAt(0).toUpperCase() + day.slice(1)}
                    </label>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <label className="text-sm text-slate-700">Calories
                <input type="number" min={0} value={analysisTotals.calories} onChange={(event) => setAnalysisTotals((prev) => ({ ...prev, calories: Number(event.target.value) }))} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" />
              </label>
              <label className="text-sm text-slate-700">Protein (g)
                <input type="number" min={0} value={analysisTotals.protein} onChange={(event) => setAnalysisTotals((prev) => ({ ...prev, protein: Number(event.target.value) }))} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" />
              </label>
              <label className="text-sm text-slate-700">Carbs (g)
                <input type="number" min={0} value={analysisTotals.carbs} onChange={(event) => setAnalysisTotals((prev) => ({ ...prev, carbs: Number(event.target.value) }))} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" />
              </label>
              <label className="text-sm text-slate-700">Fat (g)
                <input type="number" min={0} value={analysisTotals.fat} onChange={(event) => setAnalysisTotals((prev) => ({ ...prev, fat: Number(event.target.value) }))} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" />
              </label>
            </div>

            {analysisMeta ? <p className="mt-3 text-xs text-slate-500">Meal: {analysisMeta.text}</p> : null}

        </AppModal>
      ) : null}
      {popupNotice ? (
        <div className="fixed inset-x-4 bottom-4 z-[60] mx-auto w-full max-w-sm rounded-xl bg-slate-900 px-4 py-3 text-center text-sm font-medium text-white shadow-lg">
          {popupNotice}
        </div>
      ) : null}


      <QuickMealsModal
        isOpen={isQuickMealsOpen}
        quickMeals={quickMeals}
        onClose={() => setIsQuickMealsOpen(false)}
        onAddQuickMealToDay={handleAddQuickMealToDay}
        onCreateOrUpdateQuickMeal={handleCreateOrUpdateQuickMeal}
        onDeleteQuickMeal={handleDeleteQuickMeal}
      />

      <MobileSwipePage className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8 md:px-8">
        <AppHeaderNav />

        {confirmation ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            <div className="flex items-center justify-between gap-3">
              <p>{confirmation}</p>
              <button type="button" onClick={() => setConfirmation(null)} className="rounded-md border border-emerald-200 px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100">Dismiss</button>
            </div>
          </div>
        ) : null}

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
            <div className="relative">
              <textarea className="min-h-36 w-full rounded-2xl border border-slate-200 bg-white p-4 pr-14 text-slate-800 outline-none transition focus:border-emerald-400" placeholder="e.g., Two scrambled eggs with a slice of whole grain toast and half an avocado..." value={mealDescription} onChange={(event) => setMealDescription(event.target.value)} />
              {isImageLoading ? (
                <div className="pointer-events-none absolute right-4 top-4 inline-flex items-center gap-2 rounded-lg bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">
                  <Spinner /> Reading photo...
                </div>
              ) : null}
            </div>

            <input ref={fileInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void analyzeMealImage(file);
            }} />

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <button type="button" onClick={() => fileInputRef.current?.click()} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"><CameraIcon />Take Photo</button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void handleQuickAddClick()}
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
                <li key={entry.id} className="cursor-pointer rounded-xl border border-slate-200 p-4 hover:bg-slate-50" onClick={() => openEditMeal(entry)}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-slate-400"><p>{entry.sourceType === "daily" ? "Daily meal" : entry.source === "image" ? "Photo meal" : entry.source === "quick_meal" ? "Quick meal" : "Text meal"} · {new Date(entry.createdAt).toLocaleDateString()} {new Date(entry.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>{entry.sourceType === "daily" ? <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">Daily</span> : null}</div>
                      <p className="mt-1 text-sm text-slate-700">{entry.text}</p>
                      <p className="mt-1 text-xs text-slate-500">{entry.result.totals.calories} kcal • {entry.result.totals.protein}g protein • {entry.result.totals.carbs}g carbs • {entry.result.totals.fat}g fat</p>
                    </div>
                    <button
                      type="button"
                      onClick={(event) => { event.stopPropagation(); setDeleteMealId(entry.id); }}
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
      </MobileSwipePage>
    </>
  );
}
