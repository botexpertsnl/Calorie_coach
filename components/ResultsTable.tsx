import { CalorieResponse } from "@/lib/types";

type ResultsTableProps = {
  results: CalorieResponse;
};

export function ResultsTable({ results }: ResultsTableProps) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
        <thead className="bg-slate-50 text-slate-700">
          <tr>
            <th className="px-4 py-3 font-semibold">Food</th>
            <th className="px-4 py-3 font-semibold">Portion</th>
            <th className="px-4 py-3 text-right font-semibold">Calories</th>
            <th className="px-4 py-3 text-right font-semibold">Protein</th>
            <th className="px-4 py-3 text-right font-semibold">Carbs</th>
            <th className="px-4 py-3 text-right font-semibold">Fat</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 text-slate-700">
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

      <div className="grid gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3 text-sm md:grid-cols-4">
        <p className="font-semibold text-slate-700">Total Calories: {results.totals.calories}</p>
        <p className="font-semibold text-slate-700">Total Protein: {results.totals.protein}g</p>
        <p className="font-semibold text-slate-700">Total Carbs: {results.totals.carbs}g</p>
        <p className="font-semibold text-slate-700">Total Fat: {results.totals.fat}g</p>
      </div>
      {results.notes ? <p className="px-4 pb-3 text-xs text-slate-500">Note: {results.notes}</p> : null}
    </div>
  );
}
