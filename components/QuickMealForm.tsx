import { FormEvent, useMemo, useState } from "react";
import { QuickMeal } from "@/lib/types";

type QuickMealFormValues = {
  title: string;
  calories: string;
  protein: string;
  carbs: string;
  fat: string;
};

type QuickMealFormProps = {
  initialMeal?: QuickMeal | null;
  onCancel: () => void;
  onSave: (meal: Omit<QuickMeal, "id" | "createdAt" | "updatedAt">, mealId?: string) => void;
};

function toValues(meal?: QuickMeal | null): QuickMealFormValues {
  return {
    title: meal?.title ?? "",
    calories: meal ? String(meal.calories) : "",
    protein: meal ? String(meal.protein) : "",
    carbs: meal ? String(meal.carbs) : "",
    fat: meal ? String(meal.fat) : ""
  };
}

export function QuickMealForm({ initialMeal, onCancel, onSave }: QuickMealFormProps) {
  const [values, setValues] = useState<QuickMealFormValues>(toValues(initialMeal));
  const [error, setError] = useState<string | null>(null);

  const isEditing = useMemo(() => Boolean(initialMeal), [initialMeal]);

  function updateField<K extends keyof QuickMealFormValues>(key: K, value: QuickMealFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();

    if (!values.title.trim()) return setError("Title is required.");

    const parsed = {
      calories: Number(values.calories),
      protein: Number(values.protein),
      carbs: Number(values.carbs),
      fat: Number(values.fat)
    };

    if (Object.values(parsed).some((value) => !Number.isFinite(value) || value < 0)) {
      return setError("All macro fields must be valid numbers (0 or higher).");
    }

    setError(null);

    onSave(
      {
        title: values.title.trim(),
        calories: Math.round(parsed.calories),
        protein: Math.round(parsed.protein),
        carbs: Math.round(parsed.carbs),
        fat: Math.round(parsed.fat)
      },
      initialMeal?.id
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <h3 className="text-lg font-semibold text-slate-900">{isEditing ? "Edit Quick Meal" : "New Quick Meal"}</h3>

      <label className="block text-sm text-slate-700">
        Title
        <input
          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
          value={values.title}
          onChange={(event) => updateField("title", event.target.value)}
          required
        />
      </label>

      <div className="grid gap-3 md:grid-cols-2">
        {([
          ["calories", "Calories"],
          ["protein", "Protein"],
          ["carbs", "Carbs"],
          ["fat", "Fat"]
        ] as const).map(([key, label]) => (
          <label key={key} className="text-sm text-slate-700">
            {label}
            <input
              type="number"
              min={0}
              step="1"
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
              value={values[key]}
              onChange={(event) => updateField(key, event.target.value)}
              required
            />
          </label>
        ))}
      </div>

      {error ? <p className="text-sm text-rose-600">{error}</p> : null}

      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700">Cancel</button>
        <button type="submit" className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-400">{isEditing ? "Save changes" : "Save quick meal"}</button>
      </div>
    </form>
  );
}
