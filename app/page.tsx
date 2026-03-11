"use client";

import { FormEvent, useMemo, useState } from "react";
import { Spinner } from "@/components/Spinner";
import { CalorieResponse } from "@/lib/types";

type MealLog = {
  id: string;
  text: string;
  result: CalorieResponse;
};

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
        <p className="text-slate-500">
          {value} / {target ?? "--"} {unit}
        </p>
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
  const [mealDescription, setMealDescription] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [latestResult, setLatestResult] = useState<CalorieResponse | null>(null);
  const [history, setHistory] = useState<MealLog[]>([]);

  const consumed = useMemo(
    () =>
      latestResult?.totals ?? {
        calories: 0,
        protein: 0,
        carbs: 0,
        fat: 0
      },
    [latestResult]
  );

  async function analyzeMeal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!mealDescription.trim()) {
      setError("Please describe your meal before analyzing.");
      return;
    }

    setError(null);
    setIsLoading(true);

    try {
      const response = await fetch("/api/calories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mealDescription })
      });

      const payload = (await response.json()) as { data?: CalorieResponse; error?: string };
      if (!response.ok || !payload.data) {
        throw new Error(payload.error ?? "Unable to analyze meal right now.");
      }

      const data = payload.data;
      setLatestResult(data);
      setHistory((prev) => [
        { id: crypto.randomUUID(), text: mealDescription, result: data },
        ...prev
      ]);
      setMealDescription("");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Something went wrong.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8 md:px-8">
      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <div className="grid gap-4 md:grid-cols-2">
          <MacroProgressRow label="Calories" unit="kcal" value={consumed.calories} accent="bg-slate-700" />
          <MacroProgressRow label="Protein" unit="g" value={consumed.protein} accent="bg-emerald-500" />
          <MacroProgressRow label="Carbs" unit="g" value={consumed.carbs} accent="bg-amber-500" />
          <MacroProgressRow label="Fat" unit="g" value={consumed.fat} accent="bg-rose-500" />
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
          {[
            "Insights",
            "Profile",
            "Account"
          ].map((item) => (
            <button
              key={item}
              type="button"
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              {item}
            </button>
          ))}
        </div>
      </header>

      <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <h2 className="text-2xl font-semibold text-slate-900">What did you eat?</h2>
        <p className="mt-1 text-sm text-slate-500">
          Describe your meal in detail or take a photo for better accuracy.
        </p>

        <form onSubmit={analyzeMeal} className="mt-4 space-y-4">
          <textarea
            className="min-h-36 w-full rounded-2xl border border-slate-200 bg-white p-4 text-slate-800 outline-none transition focus:border-emerald-400"
            placeholder="e.g., Two scrambled eggs with a slice of whole grain toast and half an avocado..."
            value={mealDescription}
            onChange={(event) => setMealDescription(event.target.value)}
          />

          <div className="flex flex-col justify-between gap-3 sm:flex-row">
            <button
              type="button"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <CameraIcon />
              Take Photo
            </button>

            <button
              type="submit"
              disabled={isLoading}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-400 disabled:opacity-60"
            >
              {isLoading ? <Spinner /> : <BoltIcon />}
              Analyze Meal
            </button>
          </div>
        </form>

        {error ? (
          <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">{error}</p>
        ) : null}
      </section>

      <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <h2 className="text-xl font-semibold text-slate-900">Meal History</h2>

        {history.length === 0 ? (
          <div className="mt-8 rounded-xl border border-dashed border-slate-200 py-10 text-center text-slate-500">
            No meals logged yet.
          </div>
        ) : (
          <ul className="mt-4 space-y-3">
            {history.map((entry) => (
              <li key={entry.id} className="rounded-xl border border-slate-200 p-4">
                <p className="text-sm text-slate-700">{entry.text}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {entry.result.totals.calories} kcal • {entry.result.totals.protein}g protein • {entry.result.totals.carbs}g carbs • {entry.result.totals.fat}g fat
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
