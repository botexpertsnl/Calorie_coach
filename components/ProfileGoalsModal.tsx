import { useEffect, useState } from "react";
import { DailyStepsRange, Gender, ProfileInput, TrainingExperience } from "@/lib/types";

type ProfileGoalsModalProps = {
  isOpen: boolean;
  initialProfile: ProfileInput;
  onClose: () => void;
  onSave: (profile: ProfileInput) => void | Promise<void>;
};

const trainingExperienceOptions: Array<{ value: TrainingExperience; label: string }> = [
  { value: "beginner", label: "Beginner (0-1 year)" },
  { value: "intermediate", label: "Intermediate (1-3 years)" },
  { value: "advanced", label: "Advanced (3+ years)" }
];

const dailyStepOptions: Array<{ value: DailyStepsRange; label: string }> = [
  { value: "1-5000", label: "1-5.000" },
  { value: "5000-10000", label: "5.000-10.000" },
  { value: "10000+", label: "10.000+" }
];

const genderOptions: Gender[] = ["female", "male", "other"];

export function ProfileGoalsModal({ isOpen, initialProfile, onClose, onSave }: ProfileGoalsModalProps) {
  const [form, setForm] = useState<ProfileInput>(initialProfile);

  useEffect(() => {
    if (isOpen) {
      setForm(initialProfile);
    }
  }, [initialProfile, isOpen]);

  const [isSaving, setIsSaving] = useState(false);

  if (!isOpen) return null;

  function setField<K extends keyof ProfileInput>(key: K, value: ProfileInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    setIsSaving(true);
    await onSave(form);
    setIsSaving(false);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-3xl rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-2xl font-semibold text-slate-900">User Profile &amp; Goals</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close profile modal"
          >
            ✕
          </button>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-sm text-slate-700">
            Height (cm)
            <input
              type="number"
              min={1}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-emerald-400"
              value={form.heightCm}
              onChange={(event) => setField("heightCm", Number(event.target.value))}
            />
          </label>

          <label className="text-sm text-slate-700">
            Weight (kg)
            <input
              type="number"
              min={1}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-emerald-400"
              value={form.weightKg}
              onChange={(event) => setField("weightKg", Number(event.target.value))}
            />
          </label>

          <label className="text-sm text-slate-700">
            Waist (cm)
            <input
              type="number"
              min={1}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-emerald-400"
              value={form.waistCm}
              onChange={(event) => setField("waistCm", Number(event.target.value))}
            />
          </label>

          <label className="text-sm text-slate-700">
            Age
            <input
              type="number"
              min={1}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-emerald-400"
              value={form.age}
              onChange={(event) => setField("age", Number(event.target.value))}
            />
          </label>

          <label className="text-sm text-slate-700">
            Gender
            <select
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-emerald-400"
              value={form.gender}
              onChange={(event) => setField("gender", event.target.value as Gender)}
            >
              {genderOptions.map((gender) => (
                <option key={gender} value={gender}>
                  {gender}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm text-slate-700">
            Training Experience
            <select
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-emerald-400"
              value={form.trainingExperience}
              onChange={(event) => setField("trainingExperience", event.target.value as TrainingExperience)}
            >
              {trainingExperienceOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm text-slate-700">
            Average Daily Steps
            <select
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-emerald-400"
              value={form.averageDailySteps}
              onChange={(event) => setField("averageDailySteps", event.target.value as DailyStepsRange)}
            >
              {dailyStepOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm text-slate-700 md:col-span-2">
            Your Goal
            <textarea
              className="mt-1 min-h-28 w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-emerald-400"
              value={form.goalText}
              onChange={(event) => setField("goalText", event.target.value)}
            />
          </label>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="rounded-xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-400 disabled:opacity-60"
          >
            {isSaving ? "Calculating..." : "Save &amp; Calculate Goals"}
          </button>
        </div>
      </div>
    </div>
  );
}
