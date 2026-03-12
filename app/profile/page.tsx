"use client";

import { useEffect, useMemo, useState } from "react";
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

function composeGoalText(mainGoal: string, secondaryGoal: string) {
  if (mainGoal && secondaryGoal) {
    return `Main goal: ${mainGoal}. Secondary goal: ${secondaryGoal}.`;
  }

  if (mainGoal) {
    return `Main goal: ${mainGoal}.`;
  }

  if (secondaryGoal) {
    return `Secondary goal: ${secondaryGoal}.`;
  }

  return "I want to improve body composition and feel more energetic.";
}

function parseGoalsFromText(goalText: string) {
  const mainMatch = goalText.match(/Main goal:\s*([^\.]+)\.?/i);
  const secondaryMatch = goalText.match(/Secondary goal:\s*([^\.]+)\.?/i);

  return {
    mainGoal: mainMatch?.[1]?.trim() ?? "",
    secondaryGoal: secondaryMatch?.[1]?.trim() ?? ""
  };
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<ProfileInput>(defaultProfile);
  const [targets, setTargets] = useState<DailyTargets>(defaultTargets);
  const [disabledMacros, setDisabledMacros] = useState<MacroKey[]>([]);
  const [isCalculating, setIsCalculating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [mainGoal, setMainGoal] = useState("");
  const [secondaryGoal, setSecondaryGoal] = useState("");

  useEffect(() => {
    const savedProfile = readJson<ProfileInput>(STORAGE_KEYS.profile);
    const savedTargets = readJson<DailyTargets>(STORAGE_KEYS.targets);
    const savedDisabled = readJson<MacroKey[]>(STORAGE_KEYS.disabledMacros);

    if (savedProfile) {
      setProfile(savedProfile);
      const parsedGoals = parseGoalsFromText(savedProfile.goalText ?? "");
      setMainGoal(parsedGoals.mainGoal);
      setSecondaryGoal(parsedGoals.secondaryGoal);
    }

    if (savedTargets) setTargets(savedTargets);
    if (savedDisabled) setDisabledMacros(savedDisabled);
  }, []);

  const builtGoalText = useMemo(() => composeGoalText(mainGoal.trim(), secondaryGoal.trim()), [mainGoal, secondaryGoal]);

  function updateProfile<K extends keyof ProfileInput>(key: K, value: ProfileInput[K]) {
    setProfile((prev) => ({ ...prev, [key]: value }));
  }

  function updateTarget<K extends MacroKey>(key: K, value: number) {
    setTargets((prev) => ({ ...prev, [key]: Math.max(0, value) }));
  }

  function disableMacro(key: MacroKey) {
    if (disabledMacros.includes(key)) return;
    setDisabledMacros((prev) => [...prev, key]);
  }

  function enableMacro(key: MacroKey) {
    setDisabledMacros((prev) => prev.filter((macro) => macro !== key));
  }

  function saveProfile() {
    if (!mainGoal.trim() && !secondaryGoal.trim()) {
      setMessage("Please add at least a Main goal or Secondary goal before saving.");
      return;
    }

    const profileToSave = {
      ...profile,
      goalText: builtGoalText
    };

    setProfile(profileToSave);
    writeJson(STORAGE_KEYS.profile, profileToSave);
    writeJson(STORAGE_KEYS.targets, { ...targets, disabledMacros });
    writeJson(STORAGE_KEYS.disabledMacros, disabledMacros);
    setMessage("Profile saved successfully.");
  }

  async function calculateGoals() {
    if (!mainGoal.trim() && !secondaryGoal.trim()) {
      setMessage("Please add at least a Main goal or Secondary goal before calculating.");
      return;
    }

    setIsCalculating(true);
    setMessage(null);

    const profileForCalculation = {
      ...profile,
      goalText: builtGoalText
    };

    try {
      const response = await fetch("/api/targets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile: profileForCalculation })
      });
      const payload = (await response.json()) as { data?: DailyTargets; error?: string };

      if (!response.ok || !payload.data) throw new Error(payload.error ?? "Could not calculate goals.");

      setTargets({ ...payload.data, disabledMacros });
      setMessage("Macro targets calculated.");
    } catch {
      const fallback = calculateDailyTargets(profileForCalculation);
      setTargets({ ...fallback, disabledMacros });
      setMessage("Macro targets calculated.");
    } finally {
      setIsCalculating(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8 md:px-8">
      <AppHeaderNav />

      <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <h1 className="text-2xl font-semibold text-slate-900">Body Profile</h1>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="text-sm text-slate-700">Height (cm)
            <input type="number" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" value={profile.heightCm} onChange={(e) => updateProfile("heightCm", Number(e.target.value))} />
          </label>
          <label className="text-sm text-slate-700">Weight (kg)
            <input type="number" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" value={profile.weightKg} onChange={(e) => updateProfile("weightKg", Number(e.target.value))} />
          </label>
          <label className="text-sm text-slate-700">Waist (cm)
            <input type="number" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" value={profile.waistCm} onChange={(e) => updateProfile("waistCm", Number(e.target.value))} />
          </label>
          <label className="text-sm text-slate-700">Age
            <input type="number" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" value={profile.age} onChange={(e) => updateProfile("age", Number(e.target.value))} />
          </label>
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
        </div>
      </section>

      <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <h2 className="text-2xl font-semibold text-slate-900">Goals</h2>
        <p className="mt-1 text-sm text-slate-500">Main goal is recommended. At least one of the two goals is required.</p>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="text-sm text-slate-700">Main goal (required if no secondary goal)
            <input
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
              value={mainGoal}
              onChange={(e) => setMainGoal(e.target.value)}
              placeholder="e.g., Lose weight"
            />
          </label>

          <label className="text-sm text-slate-700">Secondary goal (optional)
            <input
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
              value={secondaryGoal}
              onChange={(e) => setSecondaryGoal(e.target.value)}
              placeholder="e.g., Improve energy"
            />
          </label>
        </div>
      </section>

      <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-2xl font-semibold text-slate-900">Daily Macro Goals</h2>
          <button
            onClick={calculateGoals}
            disabled={isCalculating}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            {isCalculating ? "Calculating..." : "Calculate Macro Targets"}
          </button>
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

        {disabledMacros.length ? (
          <div className="mt-4 rounded-xl border border-slate-200 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Disabled macros</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {disabledMacros.map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => enableMacro(key)}
                  className="rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                >
                  {key} • Enable
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <p className="text-sm text-slate-500">Save Profile stores body profile, goals, and macro targets together.</p>
        <button onClick={saveProfile} className="rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-400">Save Profile</button>
      </section>

      {message ? <p className="text-sm text-slate-600">{message}</p> : null}
    </main>
  );
}
