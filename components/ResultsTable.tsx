import { CalorieResponse } from "@/lib/types";

type ResultsTableProps = {
  results: CalorieResponse;
};

export function ResultsTable({ results }: ResultsTableProps) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-700 bg-slate-900/70">
      <table className="min-w-full divide-y divide-slate-700 text-left text-sm">
        <thead className="bg-slate-800/70 text-slate-200">
          <tr>
            <th className="px-4 py-3 font-semibold">Food</th>
            <th className="px-4 py-3 font-semibold">Qty</th>
            <th className="px-4 py-3 text-right font-semibold">Calories</th>
            <th className="px-4 py-3 text-right font-semibold">Protein</th>
            <th className="px-4 py-3 text-right font-semibold">Carbs</th>
            <th className="px-4 py-3 text-right font-semibold">Fat</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800 text-slate-300">
          {results.items.map((item, index) => (
            <tr key={`${item.food}-${index}`}>
              <td className="px-4 py-3">{item.food}</td>
              <td className="px-4 py-3">{item.quantity}</td>
              <td className="px-4 py-3 text-right">{item.calories}</td>
              <td className="px-4 py-3 text-right">{item.protein}g</td>
              <td className="px-4 py-3 text-right">{item.carbs}g</td>
              <td className="px-4 py-3 text-right">{item.fat}g</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="grid gap-2 border-t border-slate-700 bg-slate-800/60 px-4 py-3 text-sm md:grid-cols-4">
        <p className="font-semibold text-emerald-300">Calories: {results.totals.calories}</p>
        <p className="font-semibold text-blue-300">Protein: {results.totals.protein}g</p>
        <p className="font-semibold text-amber-300">Carbs: {results.totals.carbs}g</p>
        <p className="font-semibold text-pink-300">Fat: {results.totals.fat}g</p>
      </div>
      {results.notes ? <p className="px-4 pb-3 text-xs text-slate-400">Note: {results.notes}</p> : null}
    </div>
  );
}
