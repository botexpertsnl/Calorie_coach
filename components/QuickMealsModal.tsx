import { useEffect, useMemo, useState } from "react";
import { QuickMeal } from "@/lib/types";
import { QuickMealForm } from "@/components/QuickMealForm";

type QuickMealsModalProps = {
  isOpen: boolean;
  quickMeals: QuickMeal[];
  onClose: () => void;
  onAddQuickMealToDay: (meal: QuickMeal, date: string, time: string) => void;
  onCreateOrUpdateQuickMeal: (meal: Omit<QuickMeal, "id" | "createdAt" | "updatedAt">, mealId?: string) => void;
  onDeleteQuickMeal: (mealId: string) => void;
};

function getNowDateTimeInputValues() {
  const now = new Date();
  const amsterdamDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Amsterdam",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(now);
  const amsterdamTime = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Amsterdam",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(now);

  return { date: amsterdamDate, time: amsterdamTime };
}

export function QuickMealsModal({
  isOpen,
  quickMeals,
  onClose,
  onAddQuickMealToDay,
  onCreateOrUpdateQuickMeal,
  onDeleteQuickMeal
}: QuickMealsModalProps) {
  const [editingMealId, setEditingMealId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmDailyAddMealId, setConfirmDailyAddMealId] = useState<string | null>(null);
  const [{ date, time }, setDateTime] = useState(getNowDateTimeInputValues());

  const editingMeal = useMemo(
    () => quickMeals.find((meal) => meal.id === editingMealId) ?? null,
    [editingMealId, quickMeals]
  );

  useEffect(() => {
    if (isOpen) {
      setDateTime(getNowDateTimeInputValues());
      return;
    }

    setIsCreating(false);
    setEditingMealId(null);
    setConfirmDeleteId(null);
    setConfirmDailyAddMealId(null);
  }, [isOpen]);

  if (!isOpen) return null;

  const isFormView = isCreating || Boolean(editingMeal);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-3xl rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-2xl font-semibold text-slate-900">Quick Add</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100">✕</button>
        </div>

        {isFormView ? (
          <QuickMealForm
            initialMeal={editingMeal}
            onCancel={() => {
              setIsCreating(false);
              setEditingMealId(null);
            }}
            onSave={(meal, mealId) => {
              onCreateOrUpdateQuickMeal(meal, mealId);
              setIsCreating(false);
              setEditingMealId(null);
            }}
          />
        ) : (
          <div className="space-y-3">
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setIsCreating(true)}
                className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-400"
              >
                New Quick Add
              </button>
            </div>

            <div className="grid gap-3 rounded-xl border border-slate-200 p-3 md:grid-cols-2">
              <label className="text-sm text-slate-700">Meal date
                <input type="date" value={date} onChange={(event) => setDateTime((prev) => ({ ...prev, date: event.target.value }))} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" />
              </label>
              <label className="text-sm text-slate-700">Meal time
                <input type="time" value={time} onChange={(event) => setDateTime((prev) => ({ ...prev, time: event.target.value }))} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" />
              </label>
            </div>

            {quickMeals.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">No quick add meals saved yet.</p>
            ) : (
              <ul className="space-y-3">
                {quickMeals.map((meal) => (
                  <li key={meal.id} className="cursor-pointer rounded-xl border border-slate-200 p-4 hover:bg-slate-50" onClick={() => setEditingMealId(meal.id)}>
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-slate-900">{meal.title}</p>
                          {meal.isDailyMeal ? <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">Daily</span> : null}
                        </div>
                        <p className="mt-1 text-xs text-slate-500">{meal.calories} kcal • {meal.protein}g protein • {meal.carbs}g carbs • {meal.fat}g fat</p>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={(event) => { event.stopPropagation(); if (meal.isDailyMeal) { setConfirmDailyAddMealId(meal.id); return; } onAddQuickMealToDay(meal, date, time); }} className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-400">Add</button>
                        <button type="button" onClick={(event) => { event.stopPropagation(); setConfirmDeleteId(meal.id); }} className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-700">Delete</button>
                      </div>
                    </div>

                    {confirmDailyAddMealId === meal.id ? (
                      <div className="mt-3 flex items-center gap-2 rounded-lg bg-amber-50 p-2 text-xs">
                        <p className="text-amber-800">This is a Daily Meal and may already be auto-added today. Add it again manually?</p>
                        <button type="button" onClick={(event) => { event.stopPropagation(); onAddQuickMealToDay(meal, date, time); setConfirmDailyAddMealId(null); }} className="rounded bg-amber-600 px-2 py-1 text-white">Add anyway</button>
                        <button type="button" onClick={(event) => { event.stopPropagation(); setConfirmDailyAddMealId(null); }} className="rounded border border-slate-200 px-2 py-1">Cancel</button>
                      </div>
                    ) : null}

                    {confirmDeleteId === meal.id ? (
                      <div className="mt-3 flex items-center gap-2 rounded-lg bg-rose-50 p-2 text-xs">
                        <p className="text-rose-700">Delete this quick add meal?</p>
                        <button type="button" onClick={(event) => { event.stopPropagation(); onDeleteQuickMeal(meal.id); setConfirmDeleteId(null); }} className="rounded bg-rose-600 px-2 py-1 text-white">Confirm</button>
                        <button type="button" onClick={(event) => { event.stopPropagation(); setConfirmDeleteId(null); }} className="rounded border border-slate-200 px-2 py-1">Cancel</button>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
