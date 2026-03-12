import { ActivityLevel, DailyTargets, Gender, ProfileInput } from "@/lib/types";

type ProfileFormProps = {
  profile: ProfileInput;
  onChange: (profile: ProfileInput) => void;
  targets: DailyTargets;
};

const activityOptions: { value: ActivityLevel; label: string }[] = [
  { value: "sedentary", label: "Sedentary" },
  { value: "light", label: "Light activity" },
  { value: "moderate", label: "Moderate activity" },
  { value: "very_active", label: "Very active" },
  { value: "athlete", label: "Athlete level" }
];

const genders: Gender[] = ["female", "male", "other"];

export function ProfileForm({ profile, onChange, targets }: ProfileFormProps) {
  function setField<K extends keyof ProfileInput>(key: K, value: ProfileInput[K]) {
    onChange({ ...profile, [key]: value });
  }

  return (
    <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6">
      <h2 className="text-xl font-semibold text-white">Personal profile</h2>
      <p className="mt-1 text-sm text-slate-400">Used to calculate personalized daily targets.</p>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <label className="text-sm text-slate-200">Age
          <input className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 p-2" type="number" value={profile.age} onChange={(e)=>setField("age", Number(e.target.value))} />
        </label>

        <label className="text-sm text-slate-200">Gender
          <select className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 p-2" value={profile.gender} onChange={(e)=>setField("gender", e.target.value as Gender)}>
            {genders.map((g)=><option key={g} value={g}>{g}</option>)}
          </select>
        </label>

        <label className="text-sm text-slate-200">Height (cm)
          <input className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 p-2" type="number" value={profile.heightCm} onChange={(e)=>setField("heightCm", Number(e.target.value))} />
        </label>

        <label className="text-sm text-slate-200">Weight (kg)
          <input className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 p-2" type="number" value={profile.weightKg} onChange={(e)=>setField("weightKg", Number(e.target.value))} />
        </label>

        <label className="text-sm text-slate-200">Waist circumference (cm)
          <input className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 p-2" type="number" value={profile.waistCm} onChange={(e)=>setField("waistCm", Number(e.target.value))} />
        </label>

        <label className="text-sm text-slate-200">Activity level
          <select className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 p-2" value={profile.activityLevel} onChange={(e)=>setField("activityLevel", e.target.value as ActivityLevel)}>
            {activityOptions.map((option)=><option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
      </div>

      <label className="mt-4 block text-sm text-slate-200">Goal description
        <textarea className="mt-1 min-h-24 w-full rounded-xl border border-slate-700 bg-slate-950 p-3" value={profile.goalText} onChange={(e)=>setField("goalText", e.target.value)} placeholder="Example: I want to lose body fat while keeping muscle and improving energy."/>
      </label>

      <p className="mt-3 text-xs text-slate-400">{targets.explanation}</p>
    </section>
  );
}
