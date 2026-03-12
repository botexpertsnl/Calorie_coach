import { FormEvent, useMemo, useState } from "react";
import { MealWeekday, QuickMeal } from "@/lib/types";
import { ALL_WEEKDAYS } from "@/lib/meals";

type QuickMealFormValues = {
  title: string;
  calories: string;
  protein: string;
  carbs: string;
  fat: string;
  isDailyMeal: boolean;
  dailyMealDays: MealWeekday[];
};

type QuickMealFormProps = {
  initialMeal?: QuickMeal | null;
  onCancel: () => void;
  onSave: (meal: Omit<QuickMeal, "id" | "createdAt" | "updatedAt">, mealId?: string) => void;
};

const weekdayLabel: Record<MealWeekday, string> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday"
};

function toValues(meal?: QuickMeal | null): QuickMealFormValues {
  return {
    title: meal?.title ?? "",
    calories: meal ? String(meal.calories) : "",
    protein: meal ? String(meal.protein) : "",
    carbs: meal ? String(meal.carbs) : "",
    fat: meal ? String(meal.fat) : "",
    isDailyMeal: meal?.isDailyMeal ?? false,
    dailyMealDays: meal?.dailyMealDays?.length ? meal.dailyMealDays : [...ALL_WEEKDAYS]
  };
}

export function QuickMealForm({ initialMeal, onCancel, onSave }: QuickMealFormProps) {
  const [values, setValues] = useState<QuickMealFormValues>(toValues(initialMeal));
  const [error, setError] = useState<string | null>(null);

  const isEditing = useMemo(() => Boolean(initialMeal), [initialMeal]);

  function updateField<K extends keyof QuickMealFormValues>(key: K, value: QuickMealFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function toggleWeekday(day: MealWeekday) {
    setValues((prev) => {
      const exists = prev.dailyMealDays.includes(day);
      const nextDays = exists
        ? prev.dailyMealDays.filter((item) => item !== day)
        : [...prev.dailyMealDays, day];

      return {
        ...prev,
        dailyMealDays: nextDays
      };
    });
  }

  function toggleDailyMeal(checked: boolean) {
    setValues((prev) => ({
      ...prev,
      isDailyMeal: checked,
      dailyMealDays: checked
        ? (prev.dailyMealDays.length ? prev.dailyMealDays : [...ALL_WEEKDAYS])
        : prev.dailyMealDays
    }));
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

    if (values.isDailyMeal && values.dailyMealDays.length === 0) {
      return setError("Choose at least one day for Daily Meal.");
    }

    setError(null);

    onSave(
      {
        title: values.title.trim(),
        calories: Math.round(parsed.calories),
        protein: Math.round(parsed.protein),
        carbs: Math.round(parsed.carbs),
        fat: Math.round(parsed.fat),
        isDailyMeal: values.isDailyMeal,
        dailyMealDays: values.isDailyMeal ? values.dailyMealDays : [...ALL_WEEKDAYS]
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

      <label className="flex items-start gap-3 rounded-xl border border-slate-200 p-3 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={values.isDailyMeal}
          onChange={(event) => toggleDailyMeal(event.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-500 focus:ring-emerald-400"
        />
        <span>
          <span className="font-medium text-slate-800">Daily Meal</span>
          <span className="mt-1 block text-xs text-slate-500">Daily meals are automatically added to each new day.</span>
        </span>
      </label>

      {values.isDailyMeal ? (
        <div className="rounded-xl border border-slate-200 p-3">
          <p className="text-sm font-medium text-slate-800">Days of the week</p>
          <p className="mt-1 text-xs text-slate-500">Choose on which days this meal should be added automatically.</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {ALL_WEEKDAYS.map((day) => (
              <label key={day} className="inline-flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={values.dailyMealDays.includes(day)}
                  onChange={() => toggleWeekday(day)}
                  className="h-4 w-4 rounded border-slate-300 text-emerald-500 focus:ring-emerald-400"
                />
                {weekdayLabel[day]}
              </label>
            ))}
          </div>
        </div>
      ) : null}

      {error ? <p className="text-sm text-rose-600">{error}</p> : null}

      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700">Cancel</button>
        <button type="submit" className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-400">{isEditing ? "Save Changes" : "Save Quick Meal"}</button>
      </div>
    </form>
  );
}
