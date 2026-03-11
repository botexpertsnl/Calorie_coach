"use client";

import { FormEvent, useMemo, useState } from "react";
import { ProfileForm } from "@/components/ProfileForm";
import { ProgressBars } from "@/components/ProgressBars";
import { ResultsTable } from "@/components/ResultsTable";
import { Spinner } from "@/components/Spinner";
import { calculateDailyTargets } from "@/lib/nutrition";
import { CalorieResponse, MacroTotals, ProfileInput } from "@/lib/types";

const defaultProfile: ProfileInput = {
  age: 30,
  gender: "female",
  heightCm: 165,
  weightKg: 68,
  waistCm: 78,
  activityLevel: "moderate",
  goalText: "I want to lose fat while preserving muscle."
};

const emptyTotals: MacroTotals = {
  calories: 0,
  protein: 0,
  carbs: 0,
  fat: 0
};

export default function HomePage() {
  const [profile, setProfile] = useState(defaultProfile);
  const [mealDescription, setMealDescription] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<CalorieResponse | null>(null);

  const targets = useMemo(() => calculateDailyTargets(profile), [profile]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!mealDescription.trim()) {
      setError("Please describe what you ate.");
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
        throw new Error(payload.error ?? "Unable to calculate nutrition right now.");
      }

      setResults(payload.data);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Something went wrong.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl space-y-6 px-4 py-8 md:px-8">
      <header>
        <h1 className="text-4xl font-bold text-white">AI Macro Coach</h1>
        <p className="mt-2 text-slate-300">
          Personalized calories and macro targets, then track meal progress against your daily goal.
        </p>
      </header>

      <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6 shadow-soft">
        <h2 className="mb-4 text-xl font-semibold text-white">Daily progress dashboard</h2>
        <ProgressBars
          consumed={results?.totals ?? emptyTotals}
          targets={{
            calories: targets.calories,
            protein: targets.protein,
            carbs: targets.carbs,
            fat: targets.fat
          }}
        />
      </section>

      <ProfileForm profile={profile} onChange={setProfile} targets={targets} />

      <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6 shadow-soft">
        <h2 className="text-xl font-semibold text-white">Meal input</h2>
        <p className="mt-1 text-sm text-slate-400">
          Describe your meal. AI will estimate calories, protein, carbs, and fat.
        </p>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <textarea
            className="min-h-36 w-full rounded-2xl border border-slate-700 bg-slate-950/60 p-4 text-slate-100 outline-none focus:border-blue-400"
            placeholder="Example: grilled chicken bowl with rice, avocado, and black beans"
            value={mealDescription}
            onChange={(event) => setMealDescription(event.target.value)}
          />
          <button
            type="submit"
            disabled={isLoading}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-500 px-5 py-3 font-semibold text-white hover:bg-blue-400 disabled:opacity-60"
          >
            {isLoading ? <Spinner /> : null}
            Calculate macros
          </button>
        </form>

        {error ? (
          <p className="mt-4 rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</p>
        ) : null}
      </section>

      {results ? (
        <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6 shadow-soft">
          <h2 className="mb-3 text-xl font-semibold text-white">Nutrition overview</h2>
          <ResultsTable results={results} />
        </section>
      ) : null}
    </main>
  );
}
