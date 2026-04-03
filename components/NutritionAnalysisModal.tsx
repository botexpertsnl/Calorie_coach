import { ALL_WEEKDAYS } from "@/lib/meals";
import { CalorieResponse, MealWeekday } from "@/lib/types";
import { Spinner } from "@/components/Spinner";

type NutritionAnalysisModalProps = {
  isOpen: boolean;
  status: "loading" | "success" | "error";
  result: CalorieResponse | null;
  errorMessage?: string | null;
  onClose: () => void;
  onAddMeal: () => void;
  isAddingMeal?: boolean;
  mealDate: string;
  mealTime: string;
  onMealDateChange: (value: string) => void;
  onMealTimeChange: (value: string) => void;
  isDailyMeal: boolean;
  dailyMealDays: MealWeekday[];
  onDailyMealToggle: (checked: boolean) => void;
  onDailyMealDayToggle: (day: MealWeekday) => void;
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

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-100">
      {children}
    </span>
  );
}

export function NutritionAnalysisModal({
  isOpen,
  status,
  result,
  errorMessage,
  onClose,
  onAddMeal,
  isAddingMeal = false,
  mealDate,
  mealTime,
  onMealDateChange,
  onMealTimeChange,
  isDailyMeal,
  dailyMealDays,
  onDailyMealToggle,
  onDailyMealDayToggle
}: NutritionAnalysisModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-0 sm:p-4">
      <div className="mobile-popup-panel w-full max-w-4xl rounded-3xl bg-white shadow-2xl ring-1 ring-slate-200">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="text-xl font-semibold text-slate-900">Nutrition Analysis</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700" aria-label="Close nutrition analysis">✕</button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto px-6 py-5">
          {status === "loading" ? (
            <div className="flex min-h-64 flex-col items-center justify-center text-center">
              <Spinner />
              <p className="mt-4 text-base font-medium text-slate-800">Please wait, we are checking the details of your meal.</p>
              <p className="mt-2 text-sm text-slate-500">Analyzing ingredients, portions, calories and macros...</p>
            </div>
          ) : null}

          {status === "error" ? <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{errorMessage ?? "We could not analyze this meal. Please try again."}</div> : null}

          {status === "success" && result ? (
            <div className="space-y-4">
              <div className="grid gap-3 rounded-2xl border border-slate-200 p-4 md:grid-cols-2">
                <label className="text-sm text-slate-700">Meal date
                  <input type="date" value={mealDate} onChange={(event) => onMealDateChange(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" />
                </label>
                <label className="text-sm text-slate-700">Meal time
                  <input type="time" value={mealTime} onChange={(event) => onMealTimeChange(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" />
                </label>
              </div>

              <label className="flex items-start gap-3 rounded-xl border border-slate-200 p-3 text-sm text-slate-700">
                <input type="checkbox" checked={isDailyMeal} onChange={(event) => onDailyMealToggle(event.target.checked)} className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-500 focus:ring-emerald-400" />
                <span>
                  <span className="font-medium text-slate-800">Add as Daily Meal</span>
                  <span className="mt-1 block text-xs text-slate-500">Save this analyzed meal as a Quick Meal that can auto-add on selected days.</span>
                </span>
              </label>

              {isDailyMeal ? (
                <div className="rounded-xl border border-slate-200 p-3">
                  <p className="text-sm font-medium text-slate-800">Days of the week</p>
                  <p className="mt-1 text-xs text-slate-500">Choose on which days this meal should be added automatically.</p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {ALL_WEEKDAYS.map((day) => (
                      <label key={day} className="inline-flex items-center gap-2 text-sm text-slate-700">
                        <input type="checkbox" checked={dailyMealDays.includes(day)} onChange={() => onDailyMealDayToggle(day)} className="h-4 w-4 rounded border-slate-300 text-emerald-500 focus:ring-emerald-400" />
                        {weekdayLabel[day]}
                      </label>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="flex flex-wrap gap-2">
                <Badge>{result.totals.calories} kcal</Badge>
                <Badge>{result.totals.protein}g Protein</Badge>
                <Badge>{result.totals.carbs}g Carbs</Badge>
                <Badge>{result.totals.fat}g Fat</Badge>
              </div>

              <div className="overflow-hidden rounded-2xl border border-slate-200">
                <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                  <thead className="bg-slate-50 text-slate-700"><tr><th className="px-4 py-3 font-semibold">Food Item</th><th className="px-4 py-3 text-right font-semibold">Protein</th><th className="px-4 py-3 text-right font-semibold">Carbs</th><th className="px-4 py-3 text-right font-semibold">Fat</th><th className="px-4 py-3 text-right font-semibold">Calories</th></tr></thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {result.items.map((item, index) => (
                      <tr key={`${item.food}-${index}`}>
                        <td className="px-4 py-3 align-top"><p className="font-medium text-slate-800">{item.food}</p><p className="mt-1 text-xs text-slate-500">{item.quantity}</p></td>
                        <td className="px-4 py-3 text-right">{item.protein}g</td>
                        <td className="px-4 py-3 text-right">{item.carbs}g</td>
                        <td className="px-4 py-3 text-right">{item.fat}g</td>
                        <td className="px-4 py-3 text-right">{item.calories}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {result.notes ? <p className="text-sm italic text-slate-500">{result.notes}</p> : <p className="text-sm italic text-slate-500">AI estimate based on visible ingredients and likely portions.</p>}
            </div>
          ) : null}
        </div>

        <div className="flex justify-end gap-3 border-t border-slate-100 px-6 py-4">
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancel / Close</button>
          <button type="button" onClick={onAddMeal} disabled={status !== "success" || !result || isAddingMeal} className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50">Add Meal</button>
        </div>
      </div>
    </div>
  );
}
