"use client";

import { useEffect, useState } from "react";
import { AppHeaderNav } from "@/components/AppHeaderNav";
import { STORAGE_KEYS, readJson, writeJson } from "@/lib/local-data";
import { calculateDailyTargets } from "@/lib/nutrition";
import { DailyTargets, ProfileInput } from "@/lib/types";

const defaultProfile: ProfileInput = {
  heightCm: 170,
  weightKg: 70,
  waistCm: 80,
  age: 30,
  gender: "female",
  activityLevel: "moderate",
  goalText: "I want to improve body composition and feel more energetic."
};

const defaultTargets: DailyTargets = calculateDailyTargets(defaultProfile);

export default function ProfilePage() {
  const [profile, setProfile] = useState<ProfileInput>(defaultProfile);
  const [targets, setTargets] = useState<DailyTargets>(defaultTargets);
  const [calculatedTargets, setCalculatedTargets] = useState<DailyTargets | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const savedProfile = readJson<ProfileInput>(STORAGE_KEYS.profile);
    const savedTargets = readJson<DailyTargets>(STORAGE_KEYS.targets);

    if (savedProfile) setProfile(savedProfile);
    if (savedTargets) setTargets(savedTargets);
  }, []);

  function updateProfile<K extends keyof ProfileInput>(key: K, value: ProfileInput[K]) {
    setProfile((prev) => ({ ...prev, [key]: value }));
  }

  function updateTarget<K extends "calories" | "protein" | "carbs" | "fat">(key: K, value: number) {
    setTargets((prev) => ({ ...prev, [key]: Math.max(0, value) }));
  }

  function saveTargets() {
    writeJson(STORAGE_KEYS.targets, targets);
    setMessage("Macro targets saved.");
  }

  function saveProfile() {
    writeJson(STORAGE_KEYS.profile, profile);
    setMessage("Profile saved.");
  }

  async function calculateGoals() {
    try {
      const response = await fetch("/api/targets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile })
      });
      const payload = (await response.json()) as { data?: DailyTargets; error?: string };

      if (!response.ok || !payload.data) throw new Error(payload.error ?? "Could not calculate goals.");

      setCalculatedTargets(payload.data);
      setMessage("Goals calculated. Review and save below.");
    } catch {
      const fallback = calculateDailyTargets(profile);
      setCalculatedTargets(fallback);
      setMessage("Using local fallback calculator. Add OPENAI_API_KEY for AI goal interpretation.");
    }
  }

  function saveCalculatedGoals() {
    if (!calculatedTargets) return;
    setTargets(calculatedTargets);
    writeJson(STORAGE_KEYS.targets, calculatedTargets);
    setMessage("Calculated goals saved and synced.");
  }

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8 md:px-8">
      <AppHeaderNav />

      <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-slate-900">Profile</h1>
          <button onClick={saveTargets} className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-400">Save Macro Targets</button>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          {([
            ["calories", "Calories", "kcal"],
            ["protein", "Protein", "g"],
            ["carbs", "Carbs", "g"],
            ["fat", "Fat", "g"]
          ] as const).map(([key, label, unit]) => (
            <label key={key} className="text-sm text-slate-700">
              {label}
              <input type="number" min={0} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" value={targets[key]} onChange={(e)=>updateTarget(key, Number(e.target.value))} />
              <p className="mt-1 text-xs text-slate-500">{unit}</p>
            </label>
          ))}
        </div>
      </section>

      <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-slate-900">Body Profile & Goal</h2>
          <button onClick={saveProfile} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Save Profile</button>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-sm text-slate-700">Height (cm)<input type="number" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" value={profile.heightCm} onChange={(e)=>updateProfile("heightCm", Number(e.target.value))} /></label>
          <label className="text-sm text-slate-700">Weight (kg)<input type="number" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" value={profile.weightKg} onChange={(e)=>updateProfile("weightKg", Number(e.target.value))} /></label>
          <label className="text-sm text-slate-700">Waist (cm)<input type="number" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" value={profile.waistCm} onChange={(e)=>updateProfile("waistCm", Number(e.target.value))} /></label>
          <label className="text-sm text-slate-700">Age<input type="number" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" value={profile.age} onChange={(e)=>updateProfile("age", Number(e.target.value))} /></label>
          <label className="text-sm text-slate-700">Gender
            <select className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" value={profile.gender} onChange={(e)=>updateProfile("gender", e.target.value as ProfileInput["gender"])}>
              <option value="female">female</option>
              <option value="male">male</option>
              <option value="other">other</option>
            </select>
          </label>
          <label className="text-sm text-slate-700">Activity Level
            <select className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" value={profile.activityLevel} onChange={(e)=>updateProfile("activityLevel", e.target.value as ProfileInput["activityLevel"])}>
              <option value="sedentary">Sedentary</option>
              <option value="light">Light</option>
              <option value="moderate">Moderate</option>
              <option value="very_active">Active</option>
              <option value="athlete">Very Active</option>
            </select>
          </label>
          <label className="text-sm text-slate-700 md:col-span-2">Goal text
            <textarea className="mt-1 min-h-24 w-full rounded-xl border border-slate-200 px-3 py-2" value={profile.goalText} onChange={(e)=>updateProfile("goalText", e.target.value)} />
          </label>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button onClick={calculateGoals} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700">Calculate Goals</button>
          {calculatedTargets ? (
            <button onClick={saveCalculatedGoals} className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-400">Save Calculated Goals</button>
          ) : null}
        </div>

        {calculatedTargets ? (
          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
            <p className="font-semibold">Calculated: {calculatedTargets.calories} kcal • {calculatedTargets.protein}g protein • {calculatedTargets.carbs}g carbs • {calculatedTargets.fat}g fat</p>
            <p className="mt-1 text-xs">{calculatedTargets.explanation}</p>
          </div>
        ) : null}

        {message ? <p className="mt-3 text-sm text-slate-600">{message}</p> : null}
      </section>
    </main>
  );
}
