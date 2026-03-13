import { DailyStepsRange, DailyTargets, Gender, ProfileInput, TrainingExperience } from "@/lib/types";

type ProfileFormProps = {
  profile: ProfileInput;
  onChange: (profile: ProfileInput) => void;
  targets: DailyTargets;
};

const trainingExperienceOptions: { value: TrainingExperience; label: string }[] = [
  { value: "beginner", label: "Beginner (0-1 year)" },
  { value: "intermediate", label: "Intermediate (1-3 years)" },
  { value: "advanced", label: "Advanced (3+ years)" }
];

const dailyStepOptions: { value: DailyStepsRange; label: string }[] = [
  { value: "1-5000", label: "1-5.000" },
  { value: "5000-10000", label: "5.000-10.000" },
  { value: "10000+", label: "10.000+" }
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

        <label className="text-sm text-slate-200">Training experience
          <select className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 p-2" value={profile.trainingExperience} onChange={(e)=>setField("trainingExperience", e.target.value as TrainingExperience)}>
            {trainingExperienceOptions.map((option)=><option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>

        <label className="text-sm text-slate-200">Average daily steps
          <select className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 p-2" value={profile.averageDailySteps} onChange={(e)=>setField("averageDailySteps", e.target.value as DailyStepsRange)}>
            {dailyStepOptions.map((option)=><option key={option.value} value={option.value}>{option.label}</option>)}
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
