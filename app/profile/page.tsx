"use client";

import { useEffect, useMemo, useState } from "react";
import { AppHeaderNav } from "@/components/AppHeaderNav";
import { STORAGE_KEYS, readJson, writeJson } from "@/lib/local-data";
import { TARGETS_UPDATED_EVENT, getDailyMacroTargets, recalculateAndPersistTodayTargets } from "@/lib/daily-targets";
import { ensureDemoSeedData } from "@/lib/demo-seed";
import { calculateDailyTargets } from "@/lib/nutrition";
import { getCurrentWeekDateKeys } from "@/lib/workout-execution";
import { BodyMetricProgressEntry, BodyProgressHistory, DailyTargets, MacroKey, ProfileInput, WorkoutDay, WorkoutException, WorkoutWeekPlan } from "@/lib/types";

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

const goalIntensityOptionsByMainGoal: Record<(typeof primaryGoalOptions)[number], Array<{ value: "slow" | "medium" | "medium_fast" | "fast"; label: string }>> = {
  "Fat Loss": [
    { value: "slow", label: "Slow — Fat loss with muscle gain" },
    { value: "medium", label: "Medium — Fat loss with muscle maintenance" },
    { value: "medium_fast", label: "Medium/Fast — Faster fat loss with light muscle loss" },
    { value: "fast", label: "Fast — Fast fat loss with muscle loss" }
  ],
  "Muscle Gain": [
    { value: "slow", label: "Slow — Lean muscle gain with minimal fat gain" },
    { value: "medium", label: "Medium — Muscle gain with light fat gain" },
    { value: "medium_fast", label: "Medium/Fast — Faster muscle gain with moderate fat gain" },
    { value: "fast", label: "Fast — Aggressive muscle gain with clear fat gain" }
  ],
  Strength: [
    { value: "slow", label: "Slow — Gradual strength gain with balanced recovery" },
    { value: "medium", label: "Medium — Steady strength gain with moderate load" },
    { value: "medium_fast", label: "Medium/Fast — Faster strength gain with higher fatigue" },
    { value: "fast", label: "Fast — Aggressive strength progression with high recovery demand" }
  ],
  Endurance: [
    { value: "slow", label: "Slow — Build endurance gradually with low fatigue" },
    { value: "medium", label: "Medium — Improve endurance with balanced load" },
    { value: "medium_fast", label: "Medium/Fast — Faster endurance progress with moderate fatigue" },
    { value: "fast", label: "Fast — Aggressive endurance progression with high fatigue" }
  ],
  "General Health & Longevity": [
    { value: "slow", label: "Slow — Easy sustainable health improvement" },
    { value: "medium", label: "Medium — Balanced lifestyle improvement" },
    { value: "medium_fast", label: "Medium/Fast — Stronger health focus with more structure" },
    { value: "fast", label: "Fast — Highly disciplined health optimization" }
  ]
};

const weekDayOrder: WorkoutDay[] = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

const weekDayLabels: Record<WorkoutDay, string> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday"
};

function dayFromDateKey(dateKey: string): WorkoutDay {
  const d = new Date(`${dateKey}T00:00:00`);
  const day = d.getDay();
  const map: Record<number, WorkoutDay> = {
    0: "sunday",
    1: "monday",
    2: "tuesday",
    3: "wednesday",
    4: "thursday",
    5: "friday",
    6: "saturday"
  };
  return map[day];
}

function createDefaultWeekMacroScheme(targets: DailyTargets): Record<WorkoutDay, Record<MacroKey, number>> {
  return weekDayOrder.reduce((acc, day) => {
    acc[day] = {
      calories: targets.calories,
      protein: targets.protein,
      carbs: targets.carbs,
      fat: targets.fat
    };
    return acc;
  }, {} as Record<WorkoutDay, Record<MacroKey, number>>);
}

function composeGoalText(mainGoal: string, goalIntensity: string, goalDescription: string) {
  const parts: string[] = [];

  if (mainGoal) parts.push(`Main goal: ${mainGoal}.`);
  if (goalIntensity) parts.push(`Goal intensity: ${goalIntensity}.`);
  if (goalDescription.trim()) parts.push(`Goal details: ${goalDescription.trim()}.`);

  if (!parts.length) {
    return "I want to improve body composition and feel more energetic.";
  }

  return parts.join(" ");
}

function parseGoalsFromText(goalText: string) {
  const mainMatch = goalText.match(/Main goal:\s*([^\.]+)\.?/i);
  const intensityMatch = goalText.match(/Goal intensity:\s*([^\.]+)\.?/i);
  const detailsMatch = goalText.match(/Goal details:\s*([^\.]+)\.?/i);

  return {
    mainGoal: mainMatch?.[1]?.trim() ?? "",
    goalIntensity: intensityMatch?.[1]?.trim() ?? "",
    goalDescription: detailsMatch?.[1]?.trim() ?? ""
  };
}

function getAmsterdamNowInputValues() {
  const now = new Date();
  const date = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Amsterdam",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(now);
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Amsterdam",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(now);
  return { date, time };
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

function toIsoFromAmsterdamDateTime(date: string, time: string) {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  if ([year, month, day, hour, minute].some((value) => Number.isNaN(value))) return new Date().toISOString();

  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  const offsetMs = getAmsterdamOffsetMs(utcGuess);
  return new Date(utcGuess.getTime() - offsetMs).toISOString();
}

function formatAmsterdamDateTime(iso?: string) {
  if (!iso) return "n/a";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "n/a";
  const formatted = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Amsterdam",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
  return `${formatted} (CEST/CET)`;
}

function getLatestProgressEntry(entries: BodyMetricProgressEntry[]) {
  return [...entries].sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime())[0] ?? null;
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<ProfileInput>(defaultProfile);
  const [targets, setTargets] = useState<DailyTargets>(defaultTargets);
  const [disabledMacros, setDisabledMacros] = useState<MacroKey[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [mainGoal, setMainGoal] = useState("");
  const [goalIntensity, setGoalIntensity] = useState("");
  const [goalDescription, setGoalDescription] = useState("");
  const [isManualMode, setIsManualMode] = useState(false);
  const [saveConfirmation, setSaveConfirmation] = useState<string | null>(null);
  const [workouts, setWorkouts] = useState<WorkoutWeekPlan | null>(null);
  const [exceptions, setExceptions] = useState<WorkoutException[]>([]);
  const [manualWeekScheme, setManualWeekScheme] = useState<Record<WorkoutDay, Record<MacroKey, number>>>(
    createDefaultWeekMacroScheme(defaultTargets)
  );
  const [bodyProgress, setBodyProgress] = useState<BodyProgressHistory>({ weight: [], waist: [] });
  const [isWeightModalOpen, setIsWeightModalOpen] = useState(false);
  const [isWaistModalOpen, setIsWaistModalOpen] = useState(false);
  const [weightEntry, setWeightEntry] = useState({ value: 0, ...getAmsterdamNowInputValues() });
  const [waistEntry, setWaistEntry] = useState({ value: 0, ...getAmsterdamNowInputValues() });

  useEffect(() => {
    ensureDemoSeedData();

    const savedProfile = readJson<ProfileInput>(STORAGE_KEYS.profile);
    const savedTargets = readJson<DailyTargets>(STORAGE_KEYS.targets);
    const savedDisabled = readJson<MacroKey[]>(STORAGE_KEYS.disabledMacros);
    const savedManualMode = readJson<boolean>(STORAGE_KEYS.macroManualMode);
    const savedWorkouts = readJson<WorkoutWeekPlan>(STORAGE_KEYS.workouts);
    const savedExceptions = readJson<WorkoutException[]>(STORAGE_KEYS.workoutExceptions) ?? [];
    const savedWeekScheme = readJson<Record<WorkoutDay, Record<MacroKey, number>>>(STORAGE_KEYS.weeklyMacroScheme);
    const savedBodyProgress = readJson<BodyProgressHistory>(STORAGE_KEYS.bodyProgress);

    if (savedProfile) {
      setProfile({ ...defaultProfile, ...savedProfile });
      const parsedGoals = parseGoalsFromText(savedProfile.goalText ?? "");
      setMainGoal(parsedGoals.mainGoal);
      setGoalIntensity(parsedGoals.goalIntensity || (savedProfile.goalIntensity ?? ""));
      setGoalDescription(parsedGoals.goalDescription);
    }

    if (savedTargets) setTargets(savedTargets);
    if (savedDisabled) setDisabledMacros(savedDisabled);
    if (typeof savedManualMode === "boolean") setIsManualMode(savedManualMode);
    if (savedWorkouts) setWorkouts(savedWorkouts);
    setExceptions(savedExceptions);
    if (savedWeekScheme) setManualWeekScheme(savedWeekScheme);

    const initialProgress = savedBodyProgress ?? {
      weight: [{ id: crypto.randomUUID(), value: (savedProfile?.weightKg ?? defaultProfile.weightKg), recordedAt: new Date().toISOString(), createdAt: new Date().toISOString() }],
      waist: [{ id: crypto.randomUUID(), value: (savedProfile?.waistCm ?? defaultProfile.waistCm), recordedAt: new Date().toISOString(), createdAt: new Date().toISOString() }]
    };
    setBodyProgress(initialProgress);
    setWeightEntry({ value: (savedProfile?.weightKg ?? defaultProfile.weightKg), ...getAmsterdamNowInputValues() });
    setWaistEntry({ value: (savedProfile?.waistCm ?? defaultProfile.waistCm), ...getAmsterdamNowInputValues() });
  }, []);


  useEffect(() => {
    const syncWorkouts = () => {
      const savedWorkouts = readJson<WorkoutWeekPlan>(STORAGE_KEYS.workouts);
      const savedExceptions = readJson<WorkoutException[]>(STORAGE_KEYS.workoutExceptions) ?? [];
      setWorkouts(savedWorkouts);
      setExceptions(savedExceptions);
    };

    const onStorage = (event: StorageEvent) => {
      if (!event.key || event.key === STORAGE_KEYS.workouts || event.key === STORAGE_KEYS.workoutExceptions) {
        syncWorkouts();
      }
    };

    const onFocus = () => syncWorkouts();

    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", onFocus);

    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  const builtGoalText = useMemo(
    () => composeGoalText(mainGoal.trim(), goalIntensity.trim(), goalDescription.trim()),
    [mainGoal, goalIntensity, goalDescription]
  );

  const goalIntensityOptions = useMemo(() => {
    if (!mainGoal || !primaryGoalOptions.includes(mainGoal as (typeof primaryGoalOptions)[number])) return [];
    return goalIntensityOptionsByMainGoal[mainGoal as (typeof primaryGoalOptions)[number]];
  }, [mainGoal]);

  useEffect(() => {
    if (!goalIntensity) return;
    if (goalIntensityOptions.length && !goalIntensityOptions.some((option) => option.value === goalIntensity)) {
      setGoalIntensity("");
    }
  }, [goalIntensity, goalIntensityOptions]);

  const calculatedWeekScheme = useMemo(() => {
    const weekKeys = getCurrentWeekDateKeys();

    return weekKeys.reduce((acc, dateKey) => {
      const day = dayFromDateKey(dateKey);
      const dayTargets = getDailyMacroTargets(dateKey, profile, workouts, exceptions);
      acc[day] = {
        calories: dayTargets.calories,
        protein: dayTargets.protein,
        carbs: dayTargets.carbs,
        fat: dayTargets.fat
      };
      return acc;
    }, {} as Record<WorkoutDay, Record<MacroKey, number>>);
  }, [exceptions, profile, workouts]);

  const visibleWeekScheme = isManualMode ? manualWeekScheme : calculatedWeekScheme;

  const averageWeekMacros = useMemo(() => {
    const count = weekDayOrder.length;
    return macroConfig.reduce((acc, { key }) => {
      const total = weekDayOrder.reduce((sum, day) => sum + (visibleWeekScheme[day]?.[key] ?? 0), 0);
      acc[key] = Math.round(total / count);
      return acc;
    }, {} as Record<MacroKey, number>);
  }, [visibleWeekScheme]);

  function updateWeekMacro(day: WorkoutDay, key: MacroKey, value: number) {
    setManualWeekScheme((prev) => {
      const next = {
        ...prev,
        [day]: {
          ...prev[day],
          [key]: Math.max(0, value)
        }
      };
      writeJson(STORAGE_KEYS.weeklyMacroScheme, next);
      return next;
    });

    const todayDay = dayFromDateKey(new Date().toISOString().slice(0, 10));
    if (day === todayDay) {
      setTargets((prev) => ({ ...prev, [key]: Math.max(0, value) }));
    }
  }


  const latestWeightEntry = useMemo(() => getLatestProgressEntry(bodyProgress.weight), [bodyProgress.weight]);
  const latestWaistEntry = useMemo(() => getLatestProgressEntry(bodyProgress.waist), [bodyProgress.waist]);

  function openWeightModal() {
    setWeightEntry({ value: profile.weightKg, ...getAmsterdamNowInputValues() });
    setIsWeightModalOpen(true);
  }

  function openWaistModal() {
    setWaistEntry({ value: profile.waistCm, ...getAmsterdamNowInputValues() });
    setIsWaistModalOpen(true);
  }

  function saveWeightProgress() {
    const recordedAt = toIsoFromAmsterdamDateTime(weightEntry.date, weightEntry.time);
    const createdAt = new Date().toISOString();
    const entry: BodyMetricProgressEntry = { id: crypto.randomUUID(), value: Number(weightEntry.value), recordedAt, createdAt };
    const next = { ...bodyProgress, weight: [...bodyProgress.weight, entry] };
    setBodyProgress(next);
    writeJson(STORAGE_KEYS.bodyProgress, next);
    updateProfile("weightKg", Number(weightEntry.value));
    setIsWeightModalOpen(false);
  }

  function saveWaistProgress() {
    const recordedAt = toIsoFromAmsterdamDateTime(waistEntry.date, waistEntry.time);
    const createdAt = new Date().toISOString();
    const entry: BodyMetricProgressEntry = { id: crypto.randomUUID(), value: Number(waistEntry.value), recordedAt, createdAt };
    const next = { ...bodyProgress, waist: [...bodyProgress.waist, entry] };
    setBodyProgress(next);
    writeJson(STORAGE_KEYS.bodyProgress, next);
    updateProfile("waistCm", Number(waistEntry.value));
    setIsWaistModalOpen(false);
  }

  function updateProfile<K extends keyof ProfileInput>(key: K, value: ProfileInput[K]) {
    setProfile((prev) => ({ ...prev, [key]: value }));
  }

  function disableMacro(key: MacroKey) {
    if (disabledMacros.includes(key)) return;
    setDisabledMacros((prev) => [...prev, key]);
  }

  function enableMacro(key: MacroKey) {
    setDisabledMacros((prev) => prev.filter((macro) => macro !== key));
  }

  function saveProfile() {
    if (!mainGoal.trim()) {
      setMessage("Please select a Main goal before saving.");
      return;
    }

    if (!goalIntensity.trim()) {
      setMessage("Please select a Goal intensity before saving.");
      return;
    }

    const profileToSave = {
      ...profile,
      primaryGoal: mainGoal,
      goalIntensity: goalIntensity as ProfileInput["goalIntensity"],
      goalDescription,
      goalText: builtGoalText
    };

    setProfile(profileToSave);
    writeJson(STORAGE_KEYS.profile, profileToSave);
    writeJson(STORAGE_KEYS.disabledMacros, disabledMacros);
    writeJson(STORAGE_KEYS.macroManualMode, isManualMode);
    writeJson(STORAGE_KEYS.weeklyMacroScheme, manualWeekScheme);
    writeJson(STORAGE_KEYS.bodyProgress, bodyProgress);

    if (!isManualMode) {
      const nextTargets = recalculateAndPersistTodayTargets({ profile: profileToSave, workouts, exceptions, disabledMacros, force: true });
      if (nextTargets) setTargets(nextTargets);
      const confirmationMessage = "Profile saved successfully. Daily macros were recalculated from your profile, daily activity, and today's workout plan.";
      setMessage(confirmationMessage);
      setSaveConfirmation(confirmationMessage);
    } else {
      const todayDay = dayFromDateKey(new Date().toISOString().slice(0, 10));
      const todayManual = manualWeekScheme[todayDay] ?? createDefaultWeekMacroScheme(targets)[todayDay];
      const manualTargets = { ...targets, ...todayManual, disabledMacros };
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
        <h1 className="text-2xl font-semibold text-slate-900">Progress Metrics</h1>
        <p className="mt-1 text-sm text-slate-500">Track body changes over time (Europe/Amsterdam timezone).</p>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-slate-200 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Current Weight</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">{profile.weightKg} kg</p>
            <p className="mt-1 text-xs text-slate-500">Last updated: {formatAmsterdamDateTime(latestWeightEntry?.recordedAt ?? latestWeightEntry?.createdAt)}</p>
            <button type="button" onClick={openWeightModal} className="mt-3 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Register Weight Progress</button>
          </div>

          <div className="rounded-xl border border-slate-200 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Current Waist</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">{profile.waistCm} cm</p>
            <p className="mt-1 text-xs text-slate-500">Last updated: {formatAmsterdamDateTime(latestWaistEntry?.recordedAt ?? latestWaistEntry?.createdAt)}</p>
            <button type="button" onClick={openWaistModal} className="mt-3 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Register Waist Progress</button>
          </div>
        </div>
      </section>

      <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <h1 className="text-2xl font-semibold text-slate-900">Body Profile</h1>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="text-sm text-slate-700">Height (cm)
            <input type="number" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" value={profile.heightCm} onChange={(e) => updateProfile("heightCm", Number(e.target.value))} />
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
        <p className="mt-1 text-sm text-slate-500">Select your main goal and intensity to personalize nutrition, workouts, and insights.</p>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="text-sm text-slate-700">Main goal
            <select
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
              value={mainGoal}
              onChange={(e) => {
                setMainGoal(e.target.value);
                setGoalIntensity("");
              }}
            >
              <option value="">Select main goal</option>
              {primaryGoalOptions.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>

          <label className="text-sm text-slate-700">Goal intensity
            <select
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
              value={goalIntensity}
              onChange={(e) => setGoalIntensity(e.target.value)}
              disabled={!mainGoal}
            >
              <option value="">Select goal intensity</option>
              {goalIntensityOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
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
                if (next) {
                  setManualWeekScheme(calculatedWeekScheme);
                  writeJson(STORAGE_KEYS.weeklyMacroScheme, calculatedWeekScheme);
                  return;
                }

                const recalculated = recalculateAndPersistTodayTargets({ profile, workouts, exceptions, disabledMacros, force: true });
                if (recalculated) setTargets(recalculated);
              }}
            />
            <span className="font-medium text-slate-800">input manual</span>
          </label>
        </div>

        <p className="mb-4 text-sm text-slate-500">
          Daily macros are calculated from your body profile, goals, and today&apos;s planned workout load. They are recalculated when you save your profile.
        </p>

        <div className="overflow-hidden rounded-xl border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-3 py-2 text-left font-semibold text-slate-700">Day</th>
                {macroConfig.filter((macro) => !disabledMacros.includes(macro.key)).map(({ key, label, unit }) => (
                  <th key={key} className="px-3 py-2 text-left font-semibold text-slate-700">
                    <div className="flex items-center gap-2">
                      <span>{label}</span>
                      <span className="text-xs font-normal text-slate-500">({unit})</span>
                      <button type="button" onClick={() => disableMacro(key)} className="rounded-md px-1.5 py-0.5 text-xs text-slate-500 hover:bg-slate-100">✕</button>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {weekDayOrder.map((day) => (
                <tr key={day}>
                  <td className="px-3 py-2 font-medium text-slate-700">{weekDayLabels[day]}</td>
                  {macroConfig.filter((macro) => !disabledMacros.includes(macro.key)).map(({ key }) => (
                    <td key={`${day}-${key}`} className="px-3 py-2">
                      <input
                        type="number"
                        min={0}
                        disabled={!isManualMode}
                        className="w-full rounded-lg border border-slate-200 px-2 py-1.5 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                        value={visibleWeekScheme[day]?.[key] ?? 0}
                        onChange={(e) => updateWeekMacro(day, key, Number(e.target.value))}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t border-slate-200 bg-slate-50">
              <tr>
                <td className="px-3 py-2 font-semibold text-slate-800">Weekly average</td>
                {macroConfig.filter((macro) => !disabledMacros.includes(macro.key)).map(({ key }) => (
                  <td key={`avg-${key}`} className="px-3 py-2 font-semibold text-slate-700">{averageWeekMacros[key]}</td>
                ))}
              </tr>
            </tfoot>
          </table>
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


      {isWeightModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl ring-1 ring-slate-200">
            <h3 className="text-lg font-semibold text-slate-900">Register Weight Progress</h3>
            <p className="mt-2 text-sm text-slate-600">Previous value: <span className="font-semibold text-slate-900">{latestWeightEntry?.value ?? profile.weightKg} kg</span></p>
            <p className="text-xs text-slate-500">Saved on: {formatAmsterdamDateTime(latestWeightEntry?.recordedAt ?? latestWeightEntry?.createdAt)}</p>
            <div className="mt-4 space-y-3">
              <label className="block text-sm text-slate-700">New Weight value
                <input type="number" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" value={weightEntry.value} onChange={(e) => setWeightEntry((prev) => ({ ...prev, value: Number(e.target.value) }))} />
              </label>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="text-sm text-slate-700">Date
                  <input type="date" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" value={weightEntry.date} onChange={(e) => setWeightEntry((prev) => ({ ...prev, date: e.target.value }))} />
                </label>
                <label className="text-sm text-slate-700">Time
                  <input type="time" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" value={weightEntry.time} onChange={(e) => setWeightEntry((prev) => ({ ...prev, time: e.target.value }))} />
                </label>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setIsWeightModalOpen(false)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">Cancel</button>
              <button type="button" onClick={saveWeightProgress} className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-400">Save Weight Progress</button>
            </div>
          </div>
        </div>
      ) : null}

      {isWaistModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl ring-1 ring-slate-200">
            <h3 className="text-lg font-semibold text-slate-900">Register Waist Progress</h3>
            <p className="mt-2 text-sm text-slate-600">Previous value: <span className="font-semibold text-slate-900">{latestWaistEntry?.value ?? profile.waistCm} cm</span></p>
            <p className="text-xs text-slate-500">Saved on: {formatAmsterdamDateTime(latestWaistEntry?.recordedAt ?? latestWaistEntry?.createdAt)}</p>
            <div className="mt-4 space-y-3">
              <label className="block text-sm text-slate-700">New Waist value
                <input type="number" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" value={waistEntry.value} onChange={(e) => setWaistEntry((prev) => ({ ...prev, value: Number(e.target.value) }))} />
              </label>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="text-sm text-slate-700">Date
                  <input type="date" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" value={waistEntry.date} onChange={(e) => setWaistEntry((prev) => ({ ...prev, date: e.target.value }))} />
                </label>
                <label className="text-sm text-slate-700">Time
                  <input type="time" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" value={waistEntry.time} onChange={(e) => setWaistEntry((prev) => ({ ...prev, time: e.target.value }))} />
                </label>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setIsWaistModalOpen(false)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">Cancel</button>
              <button type="button" onClick={saveWaistProgress} className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-400">Save Waist Progress</button>
            </div>
          </div>
        </div>
      ) : null}


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
