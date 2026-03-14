import { MacroTotals } from "@/lib/types";

type ProgressBarsProps = {
  consumed: MacroTotals;
  targets: MacroTotals;
};

const rows: Array<{ key: keyof MacroTotals; label: string; unit: string; color: string }> = [
  { key: "calories", label: "Calories", unit: "kcal", color: "bg-blue-400" },
  { key: "protein", label: "Protein", unit: "g", color: "bg-emerald-400" },
  { key: "carbs", label: "Carbs", unit: "g", color: "bg-amber-400" },
  { key: "fat", label: "Fat", unit: "g", color: "bg-pink-400" }
];

export function ProgressBars({ consumed, targets }: ProgressBarsProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {rows.map((row) => {
        const total = targets[row.key] || 1;
        const value = consumed[row.key] || 0;
        const percent = Math.min(Math.round((value / total) * 100), 100);

        return (
          <div key={row.key} className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
            <div className="mb-2 flex items-center justify-between text-sm">
              <p className="font-medium text-slate-100">{row.label}</p>
              <p className="text-slate-300">
                {value} / {total} {row.unit} ({percent}%)
              </p>
            </div>
            <div className="h-2 rounded-full bg-slate-800">
              <div
                className={`h-2 rounded-full ${row.color}`}
                style={{ width: `${percent}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
