"use client";

import { useEffect, useState } from "react";
import { AppHeaderNav } from "@/components/AppHeaderNav";
import { STORAGE_KEYS, readJson, writeJson } from "@/lib/local-data";
import { calculateDailyTargets } from "@/lib/nutrition";
import { DailyTargets, MacroKey, ProfileInput } from "@/lib/types";

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

const macroConfig: Array<{ key: MacroKey; label: string; unit: string }> = [
  { key: "calories", label: "Calories", unit: "kcal" },
  { key: "protein", label: "Protein", unit: "g" },
  { key: "carbs", label: "Carbs", unit: "g" },
  { key: "fat", label: "Fat", unit: "g" }
];

export default function ProfilePage() {
  const [profile, setProfile] = useState<ProfileInput>(defaultProfile);
  const [targets, setTargets] = useState<DailyTargets>(defaultTargets);
  const [disabledMacros, setDisabledMacros] = useState<MacroKey[]>([]);
  const [calculatedTargets, setCalculatedTargets] = useState<DailyTargets | null>(null);
  const [isCalculatorOpen, setIsCalculatorOpen] = useState(false);
  const [isCalculating, setIsCalculating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const savedProfile = readJson<ProfileInput>(STORAGE_KEYS.profile);
    const savedTargets = readJson<DailyTargets>(STORAGE_KEYS.targets);
    const savedDisabled = readJson<MacroKey[]>(STORAGE_KEYS.disabledMacros);

    if (savedProfile) setProfile(savedProfile);
    if (savedTargets) setTargets(savedTargets);
    if (savedDisabled) setDisabledMacros(savedDisabled);
  }, []);

  function updateProfile<K extends keyof ProfileInput>(key: K, value: ProfileInput[K]) {
    setProfile((prev) => ({ ...prev, [key]: value }));
  }

  function updateTarget<K extends MacroKey>(key: K, value: number) {
    setTargets((prev) => ({ ...prev, [key]: Math.max(0, value) }));
  }

  function saveTargets() {
    writeJson(STORAGE_KEYS.targets, { ...targets, disabledMacros });
    writeJson(STORAGE_KEYS.disabledMacros, disabledMacros);
    setMessage("Daily macro goals saved.");
  }

  function saveProfile() {
    writeJson(STORAGE_KEYS.profile, profile);
    setMessage("Profile saved.");
  }

  async function calculateGoals() {
    setIsCalculating(true);
    setCalculatedTargets(null);

    try {
      const response = await fetch("/api/targets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile })
      });
      const payload = (await response.json()) as { data?: DailyTargets; error?: string };

      if (!response.ok || !payload.data) throw new Error(payload.error ?? "Could not calculate goals.");

      setCalculatedTargets(payload.data);
    } catch {
      const fallback = calculateDailyTargets(profile);
      setCalculatedTargets(fallback);
    } finally {
      setIsCalculating(false);
    }
  }

  function openCalculator() {
    setMessage(null);
    setIsCalculatorOpen(true);
    void calculateGoals();
  }

  function saveCalculatedGoals() {
    if (!calculatedTargets) return;
    const mergedTargets = { ...calculatedTargets, disabledMacros };
    setTargets(mergedTargets);
    writeJson(STORAGE_KEYS.targets, mergedTargets);
    writeJson(STORAGE_KEYS.disabledMacros, disabledMacros);
    setIsCalculatorOpen(false);
    setMessage("Calculated goals saved and synced.");
  }

  function disableMacro(key: MacroKey) {
    if (disabledMacros.includes(key)) return;
    const next = [...disabledMacros, key];
    setDisabledMacros(next);
    writeJson(STORAGE_KEYS.disabledMacros, next);
  }

  function enableMacro(key: MacroKey) {
    const next = disabledMacros.filter((macro) => macro !== key);
    setDisabledMacros(next);
    writeJson(STORAGE_KEYS.disabledMacros, next);
  }

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8 md:px-8">
      <AppHeaderNav />

      <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-semibold text-slate-900">Daily Macro Goals</h1>
          <div className="flex gap-2">
            <button onClick={openCalculator} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Calculate Macro Targets</button>
            <button onClick={saveTargets} className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-400">Save Macro Targets</button>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          {macroConfig
            .filter((macro) => !disabledMacros.includes(macro.key))
            .map(({ key, label, unit }) => (
              <label key={key} className="text-sm text-slate-700">
                <span className="flex items-center justify-between">
                  {label}
                  <button
                    type="button"
                    onClick={() => disableMacro(key)}
                    className="rounded-md px-2 py-0.5 text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                    aria-label={`Disable ${label}`}
                  >
                    ✕
                  </button>
                </span>
                <input type="number" min={0} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" value={targets[key]} onChange={(e) => updateTarget(key, Number(e.target.value))} />
                <p className="mt-1 text-xs text-slate-500">{unit}</p>
              </label>
            ))}
        </div>

        {disabledMacros.length > 0 ? (
          <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
            <span className="text-slate-500">Disabled macros:</span>
            {disabledMacros.map((key) => (
              <button key={key} type="button" onClick={() => enableMacro(key)} className="rounded-full border border-slate-200 px-3 py-1 text-slate-600 hover:bg-slate-50">
                {key} +
              </button>
            ))}
          </div>
        ) : null}

        {message ? <p className="mt-3 text-sm text-slate-600">{message}</p> : null}
      </section>

      {isCalculatorOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl ring-1 ring-slate-200">
            <div className="flex items-start justify-between gap-4">
              <h3 className="text-xl font-semibold text-slate-900">Macro Target Calculator</h3>
              <button type="button" onClick={() => setIsCalculatorOpen(false)} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close calculator">✕</button>
            </div>

            <div className="mt-4 rounded-xl border border-slate-200 p-4">
              <div className="mb-4 flex items-center justify-between">
                <h4 className="text-base font-semibold text-slate-900">Body Profile & Goal</h4>
                <button onClick={saveProfile} className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">Save Profile</button>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="text-sm text-slate-700">Height (cm)<input type="number" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" value={profile.heightCm} onChange={(e) => updateProfile("heightCm", Number(e.target.value))} /></label>
                <label className="text-sm text-slate-700">Weight (kg)<input type="number" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" value={profile.weightKg} onChange={(e) => updateProfile("weightKg", Number(e.target.value))} /></label>
                <label className="text-sm text-slate-700">Waist (cm)<input type="number" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" value={profile.waistCm} onChange={(e) => updateProfile("waistCm", Number(e.target.value))} /></label>
                <label className="text-sm text-slate-700">Age<input type="number" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" value={profile.age} onChange={(e) => updateProfile("age", Number(e.target.value))} /></label>
                <label className="text-sm text-slate-700">Gender
                  <select className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" value={profile.gender} onChange={(e) => updateProfile("gender", e.target.value as ProfileInput["gender"])}>
                    <option value="female">female</option>
                    <option value="male">male</option>
                    <option value="other">other</option>
                  </select>
                </label>
                <label className="text-sm text-slate-700">Activity Level
                  <select className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" value={profile.activityLevel} onChange={(e) => updateProfile("activityLevel", e.target.value as ProfileInput["activityLevel"])}>
                    <option value="sedentary">Sedentary</option>
                    <option value="light">Light</option>
                    <option value="moderate">Moderate</option>
                    <option value="very_active">Active</option>
                    <option value="athlete">Very Active</option>
                  </select>
                </label>
                <label className="text-sm text-slate-700 md:col-span-2">Goal text
                  <textarea className="mt-1 min-h-24 w-full rounded-xl border border-slate-200 px-3 py-2" value={profile.goalText} onChange={(e) => updateProfile("goalText", e.target.value)} />
                </label>
              </div>
            </div>

            {isCalculating ? (
              <p className="mt-4 text-sm text-slate-600">Calculating targets from your current profile...</p>
            ) : calculatedTargets ? (
              <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                <p className="font-semibold">{calculatedTargets.calories} kcal • {calculatedTargets.protein}g protein • {calculatedTargets.carbs}g carbs • {calculatedTargets.fat}g fat</p>
                <p className="mt-2 text-xs">{calculatedTargets.explanation}</p>
                <p className="mt-1 text-xs">{calculatedTargets.macroReasoning}</p>
              </div>
            ) : (
              <p className="mt-4 text-sm text-rose-600">Unable to calculate macro targets. Please retry.</p>
            )}

            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={calculateGoals} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Recalculate</button>
              <button type="button" onClick={saveCalculatedGoals} disabled={!calculatedTargets || isCalculating} className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-400 disabled:opacity-60">Save Calculated Goals</button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
