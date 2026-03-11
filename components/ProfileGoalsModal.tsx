import { useEffect, useState } from "react";
import { ActivityLevel, Gender, ProfileInput } from "@/lib/types";

type ProfileGoalsModalProps = {
  isOpen: boolean;
  initialProfile: ProfileInput;
  onClose: () => void;
  onSave: (profile: ProfileInput) => void | Promise<void>;
};

const activityOptions: Array<{ value: ActivityLevel; label: string }> = [
  { value: "sedentary", label: "Sedentary" },
  { value: "light", label: "Light" },
  { value: "moderate", label: "Moderate" },
  { value: "very_active", label: "Very Active" },
  { value: "athlete", label: "Athlete" }
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
            Activity Level
            <select
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-emerald-400"
              value={form.activityLevel}
              onChange={(event) => setField("activityLevel", event.target.value as ActivityLevel)}
            >
              {activityOptions.map((option) => (
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
