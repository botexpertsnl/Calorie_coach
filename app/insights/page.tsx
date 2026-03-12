"use client";

import { useEffect, useMemo, useState } from "react";
import { AppHeaderNav } from "@/components/AppHeaderNav";
import { InsightsLineChart } from "@/components/InsightsLineChart";
import { STORAGE_KEYS, readJson } from "@/lib/local-data";
import { MacroKey, MacroTotals, StoredMealLog } from "@/lib/types";

type RangePreset = "7d" | "1m" | "3m" | "6m" | "custom";

function startDateFromPreset(preset: Exclude<RangePreset, "custom">) {
  const now = new Date();
  const start = new Date(now);
  if (preset === "7d") start.setDate(now.getDate() - 6);
  if (preset === "1m") start.setMonth(now.getMonth() - 1);
  if (preset === "3m") start.setMonth(now.getMonth() - 3);
  if (preset === "6m") start.setMonth(now.getMonth() - 6);
  start.setHours(0, 0, 0, 0);
  return start;
}

export default function InsightsPage() {
  const [rangePreset, setRangePreset] = useState<RangePreset>("7d");
  const [metric, setMetric] = useState<keyof MacroTotals>("calories");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [disabledMacros, setDisabledMacros] = useState<MacroKey[]>([]);

  const meals = useMemo(() => readJson<StoredMealLog[]>(STORAGE_KEYS.meals) ?? [], []);

  useEffect(() => {
    const savedDisabled = readJson<MacroKey[]>(STORAGE_KEYS.disabledMacros) ?? [];
    setDisabledMacros(savedDisabled);
  }, []);

  const availableMetrics = useMemo(
    () => (["calories", "protein", "carbs", "fat"] as const).filter((item) => !disabledMacros.includes(item)),
    [disabledMacros]
  );

  useEffect(() => {
    if (!availableMetrics.length) return;
    if (!availableMetrics.includes(metric)) setMetric(availableMetrics[0]);
  }, [availableMetrics, metric]);

  const filteredMeals = useMemo(() => {
    const now = new Date();
    const end = rangePreset === "custom" && customEnd ? new Date(customEnd) : now;
    end.setHours(23, 59, 59, 999);

    const start =
      rangePreset === "custom"
        ? customStart
          ? new Date(customStart)
          : new Date(0)
        : startDateFromPreset(rangePreset);

    return meals.filter((meal) => {
      const createdAt = new Date(meal.createdAt || new Date().toISOString());
      return createdAt >= start && createdAt <= end;
    });
  }, [customEnd, customStart, meals, rangePreset]);

  const points = useMemo(() => {
    const bucket = new Map<string, MacroTotals>();

    filteredMeals.forEach((meal) => {
      const day = new Date(meal.createdAt || new Date().toISOString()).toISOString().slice(0, 10);
      const existing = bucket.get(day) ?? { calories: 0, protein: 0, carbs: 0, fat: 0 };
      bucket.set(day, {
        calories: existing.calories + meal.result.totals.calories,
        protein: existing.protein + meal.result.totals.protein,
        carbs: existing.carbs + meal.result.totals.carbs,
        fat: existing.fat + meal.result.totals.fat
      });
    });

    return Array.from(bucket.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, totals]) => ({ date, totals }));
  }, [filteredMeals]);

  const summary = useMemo(() => {
    const totals = filteredMeals.reduce(
      (sum, meal) => ({
        calories: sum.calories + meal.result.totals.calories,
        protein: sum.protein + meal.result.totals.protein,
        carbs: sum.carbs + meal.result.totals.carbs,
        fat: sum.fat + meal.result.totals.fat
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0 }
    );

    const days = Math.max(points.length, 1);
    return {
      totals,
      averages: {
        calories: Math.round(totals.calories / days),
        protein: Math.round(totals.protein / days),
        carbs: Math.round(totals.carbs / days),
        fat: Math.round(totals.fat / days)
      }
    };
  }, [filteredMeals, points.length]);

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8 md:px-8">
      <AppHeaderNav />

      <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <h1 className="text-3xl font-semibold text-slate-900">Insights</h1>

          <div className="flex flex-wrap gap-2">
            {([
              ["7d", "7 days"],
              ["1m", "1 month"],
              ["3m", "3 months"],
              ["6m", "6 months"],
              ["custom", "Custom"]
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setRangePreset(value)}
                className={`rounded-xl border px-3 py-2 text-sm ${rangePreset === value ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-slate-200 text-slate-700 hover:bg-slate-50"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {rangePreset === "custom" ? (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <label className="text-sm text-slate-700">Start date
              <input type="date" value={customStart} onChange={(e)=>setCustomStart(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" />
            </label>
            <label className="text-sm text-slate-700">End date
              <input type="date" value={customEnd} onChange={(e)=>setCustomEnd(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" />
            </label>
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-2">
          {availableMetrics.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setMetric(key)}
              className={`rounded-xl border px-3 py-2 text-sm capitalize ${metric === key ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 text-slate-700 hover:bg-slate-50"}`}
            >
              {key}
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        {availableMetrics.length ? <InsightsLineChart points={points} metric={metric} /> : <p className="text-sm text-slate-500">All macros are disabled in Profile. Re-enable at least one macro to show insights.</p>}
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        {!disabledMacros.includes("calories") ? <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200"><p className="text-xs text-slate-500">Avg Calories</p><p className="text-2xl font-semibold text-slate-900">{summary.averages.calories}</p></div> : null}
        {!disabledMacros.includes("protein") ? <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200"><p className="text-xs text-slate-500">Avg Protein</p><p className="text-2xl font-semibold text-slate-900">{summary.averages.protein}g</p></div> : null}
        {!disabledMacros.includes("carbs") ? <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200"><p className="text-xs text-slate-500">Avg Carbs</p><p className="text-2xl font-semibold text-slate-900">{summary.averages.carbs}g</p></div> : null}
        {!disabledMacros.includes("fat") ? <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200"><p className="text-xs text-slate-500">Avg Fat</p><p className="text-2xl font-semibold text-slate-900">{summary.averages.fat}g</p></div> : null}
      </section>
    </main>
  );
}
