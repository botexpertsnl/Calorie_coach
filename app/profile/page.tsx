"use client";

import { useEffect, useMemo, useState } from "react";
import { AppHeaderNav } from "@/components/AppHeaderNav";
import { STORAGE_KEYS, readJson, writeJson } from "@/lib/local-data";
import { TARGETS_UPDATED_EVENT, recalculateAndPersistTodayTargets } from "@/lib/daily-targets";
import { calculateDailyTargets } from "@/lib/nutrition";
import { DailyTargets, MacroKey, ProfileInput } from "@/lib/types";

const defaultProfile: ProfileInput = {
  heightCm: 170,
  weightKg: 70,
  waistCm: 80,
  age: 30,
  gender: "female",
  trainingExperience: "beginner",
  averageDailySteps: "5000-10000",
  workType: "sedentary",
  goalText: "I want to improve body composition and feel more energetic."
};

const defaultTargets: DailyTargets = calculateDailyTargets(defaultProfile);

const macroConfig: Array<{ key: MacroKey; label: string; unit: string }> = [
  { key: "calories", label: "Calories", unit: "kcal" },
  { key: "protein", label: "Protein", unit: "g" },
  { key: "carbs", label: "Carbs", unit: "g" },
  { key: "fat", label: "Fat", unit: "g" }
];

const primaryGoalOptions = [
  "Fat Loss",
  "Muscle Gain",
  "Strength",
  "Endurance",
  "General Health & Longevity"
] as const;

const secondaryGoalOptionsByPrimary: Record<(typeof primaryGoalOptions)[number], string[]> = {
  "Fat Loss": ["Improve Energy", "Better Sleep", "Build Healthy Habits", "Maintain Muscle"],
  "Muscle Gain": ["Strength", "Improve Recovery", "Maintain Leanness", "Improve Energy"],
  Strength: ["Muscle Gain", "Power", "Injury Prevention", "Mobility"],
  Endurance: ["Improve Cardiovascular Fitness", "Fat Loss", "Build Consistency", "Recovery"],
  "General Health & Longevity": ["Improve Energy", "Weight Maintenance", "Mobility", "Stress Management"]
};

function composeGoalText(mainGoal: string, secondaryGoal: string, goalDescription: string) {
  const parts: string[] = [];

  if (mainGoal) parts.push(`Main goal: ${mainGoal}.`);
  if (secondaryGoal) parts.push(`Secondary goal: ${secondaryGoal}.`);
  if (goalDescription.trim()) parts.push(`Goal details: ${goalDescription.trim()}.`);

  if (!parts.length) {
    return "I want to improve body composition and feel more energetic.";
  }

  return parts.join(" ");
}

function parseGoalsFromText(goalText: string) {
  const mainMatch = goalText.match(/Main goal:\s*([^\.]+)\.?/i);
  const secondaryMatch = goalText.match(/Secondary goal:\s*([^\.]+)\.?/i);
  const detailsMatch = goalText.match(/Goal details:\s*([^\.]+)\.?/i);

  return {
    mainGoal: mainMatch?.[1]?.trim() ?? "",
    secondaryGoal: secondaryMatch?.[1]?.trim() ?? "",
    goalDescription: detailsMatch?.[1]?.trim() ?? ""
  };
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<ProfileInput>(defaultProfile);
  const [targets, setTargets] = useState<DailyTargets>(defaultTargets);
  const [disabledMacros, setDisabledMacros] = useState<MacroKey[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [mainGoal, setMainGoal] = useState("");
  const [secondaryGoal, setSecondaryGoal] = useState("");
  const [goalDescription, setGoalDescription] = useState("");
  const [isManualMode, setIsManualMode] = useState(false);
  const [saveConfirmation, setSaveConfirmation] = useState<string | null>(null);

  useEffect(() => {
    const savedProfile = readJson<ProfileInput>(STORAGE_KEYS.profile);
    const savedTargets = readJson<DailyTargets>(STORAGE_KEYS.targets);
    const savedDisabled = readJson<MacroKey[]>(STORAGE_KEYS.disabledMacros);
    const savedManualMode = readJson<boolean>(STORAGE_KEYS.macroManualMode);

    if (savedProfile) {
      setProfile({ ...defaultProfile, ...savedProfile });
      const parsedGoals = parseGoalsFromText(savedProfile.goalText ?? "");
      setMainGoal(parsedGoals.mainGoal);
      setSecondaryGoal(parsedGoals.secondaryGoal);
      setGoalDescription(parsedGoals.goalDescription);
    }

    if (savedTargets) setTargets(savedTargets);
    if (savedDisabled) setDisabledMacros(savedDisabled);
    if (typeof savedManualMode === "boolean") setIsManualMode(savedManualMode);
  }, []);

  const builtGoalText = useMemo(
    () => composeGoalText(mainGoal.trim(), secondaryGoal.trim(), goalDescription.trim()),
    [mainGoal, secondaryGoal, goalDescription]
  );

  const secondaryOptions = useMemo(() => {
    if (!mainGoal || !primaryGoalOptions.includes(mainGoal as (typeof primaryGoalOptions)[number])) return [];
    return secondaryGoalOptionsByPrimary[mainGoal as (typeof primaryGoalOptions)[number]];
  }, [mainGoal]);

  useEffect(() => {
    if (!secondaryGoal) return;
    if (secondaryOptions.length && !secondaryOptions.includes(secondaryGoal)) {
      setSecondaryGoal("");
    }
  }, [secondaryGoal, secondaryOptions]);

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
      primaryGoal: mainGoal,
      secondaryGoal,
      goalDescription,
      goalText: builtGoalText
    };

    setProfile(profileToSave);
    writeJson(STORAGE_KEYS.profile, profileToSave);
    writeJson(STORAGE_KEYS.disabledMacros, disabledMacros);
    writeJson(STORAGE_KEYS.macroManualMode, isManualMode);

    if (!isManualMode) {
      const nextTargets = recalculateAndPersistTodayTargets({ profile: profileToSave, disabledMacros, force: true });
      if (nextTargets) setTargets(nextTargets);
      const confirmationMessage = "Profile saved successfully. Daily macros were recalculated from your profile, daily activity, and today's workout plan.";
      setMessage(confirmationMessage);
      setSaveConfirmation(confirmationMessage);
    } else {
      const manualTargets = { ...targets, disabledMacros };
      writeJson(STORAGE_KEYS.targets, manualTargets);
      window.dispatchEvent(new CustomEvent(TARGETS_UPDATED_EVENT, { detail: manualTargets }));
      const confirmationMessage = "Profile saved successfully. Manual daily macros were kept.";
      setMessage(confirmationMessage);
      setSaveConfirmation(confirmationMessage);
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
          <label className="text-sm text-slate-700">Training Experience
            <select className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" value={profile.trainingExperience} onChange={(e) => updateProfile("trainingExperience", e.target.value as ProfileInput["trainingExperience"])}>
              <option value="beginner">Beginner (0-1 year)</option>
              <option value="intermediate">Intermediate (1-3 years)</option>
              <option value="advanced">Advanced (3+ years)</option>
            </select>
            <p className="mt-1 text-xs text-slate-500">Used to personalize workout load, recovery, and strength targets.</p>
          </label>
        </div>
      </section>

      <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <h2 className="text-2xl font-semibold text-slate-900">Daily Activity</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="text-sm text-slate-700">Average Daily Steps
            <select className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" value={profile.averageDailySteps} onChange={(e) => updateProfile("averageDailySteps", e.target.value as ProfileInput["averageDailySteps"])}>
              <option value="1-5000">1-5.000</option>
              <option value="5000-10000">5.000-10.000</option>
              <option value="10000+">10.000+</option>
            </select>
          </label>

          <label className="text-sm text-slate-700">Work Type
            <select className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" value={profile.workType} onChange={(e) => updateProfile("workType", e.target.value as ProfileInput["workType"])}>
              <option value="sedentary">Sedentary (Desk Job)</option>
              <option value="light">Light Activity (Standing Job)</option>
              <option value="moderate">Moderate Physical Work</option>
              <option value="heavy">Heavy Physical Work</option>
            </select>
          </label>
        </div>
        <p className="mt-3 text-sm text-slate-500">This information helps improve calorie and macro calculations.</p>
      </section>

      <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <h2 className="text-2xl font-semibold text-slate-900">Goals</h2>
        <p className="mt-1 text-sm text-slate-500">Main goal is recommended. At least one of the two goals is required.</p>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="text-sm text-slate-700">Main goal (required if no secondary goal)
            <select
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
              value={mainGoal}
              onChange={(e) => {
                setMainGoal(e.target.value);
                setSecondaryGoal("");
              }}
            >
              <option value="">Select main goal</option>
              {primaryGoalOptions.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>

          <label className="text-sm text-slate-700">Secondary goal (optional)
            <select
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
              value={secondaryGoal}
              onChange={(e) => setSecondaryGoal(e.target.value)}
              disabled={!mainGoal}
            >
              <option value="">Select secondary goal</option>
              {secondaryOptions.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>
        </div>

        <label className="mt-4 block text-sm text-slate-700">Goal description
          <textarea
            className="mt-1 min-h-24 w-full rounded-xl border border-slate-200 px-3 py-2"
            value={goalDescription}
            onChange={(e) => setGoalDescription(e.target.value)}
            placeholder="Describe your specific goal in your own words."
          />
        </label>
      </section>

      <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-2xl font-semibold text-slate-900">Daily Macro Goals</h2>
          <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={isManualMode}
              onChange={(e) => {
                const next = e.target.checked;
                setIsManualMode(next);
                writeJson(STORAGE_KEYS.macroManualMode, next);
                if (!next) {
                  const recalculated = recalculateAndPersistTodayTargets({ profile, disabledMacros, force: true });
                  if (recalculated) setTargets(recalculated);
                }
              }}
            />
            <span className="font-medium text-slate-800">input manual</span>
          </label>
        </div>

        <p className="mb-4 text-sm text-slate-500">
          Daily macros are calculated from your body profile, goals, and today&apos;s planned workout load. They are recalculated when you save your profile.
        </p>

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
                <input
                  type="number"
                  min={0}
                  disabled={!isManualMode}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                  value={targets[key]}
                  onChange={(e) => updateTarget(key, Number(e.target.value))}
                />
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


      {saveConfirmation ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl ring-1 ring-slate-200">
            <h3 className="text-lg font-semibold text-slate-900">Profile saved</h3>
            <p className="mt-2 text-sm text-slate-600">{saveConfirmation}</p>
            <div className="mt-5 flex justify-end">
              <button type="button" onClick={() => setSaveConfirmation(null)} className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-400">OK</button>
            </div>
          </div>
        </div>
      ) : null}

      {message ? <p className="text-sm text-slate-600">{message}</p> : null}
    </main>
  );
}
