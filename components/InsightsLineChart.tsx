import { MacroTotals } from "@/lib/types";

type Point = {
  date: string;
  totals: MacroTotals;
};

type InsightsLineChartProps = {
  points: Point[];
  metric: keyof MacroTotals;
};

const metricColors: Record<keyof MacroTotals, string> = {
  calories: "#0f766e",
  protein: "#16a34a",
  carbs: "#f59e0b",
  fat: "#e11d48"
};

export function InsightsLineChart({ points, metric }: InsightsLineChartProps) {
  if (points.length === 0) {
    return <div className="flex h-80 items-center justify-center text-sm text-slate-500">No confirmed meals in this range.</div>;
  }

  const width = 900;
  const height = 280;
  const padding = 32;

  const values = points.map((point) => point.totals[metric]);
  const max = Math.max(...values, 1);

  const path = points
    .map((point, index) => {
      const x = padding + (index / Math.max(points.length - 1, 1)) * (width - padding * 2);
      const y = height - padding - (point.totals[metric] / max) * (height - padding * 2);
      return `${index === 0 ? "M" : "L"}${x},${y}`;
    })
    .join(" ");

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-80 w-full min-w-[700px]">
        <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="#cbd5e1" />
        <line x1={padding} y1={padding} x2={padding} y2={height - padding} stroke="#cbd5e1" />

        <path d={path} fill="none" stroke={metricColors[metric]} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />

        {points.map((point, index) => {
          const x = padding + (index / Math.max(points.length - 1, 1)) * (width - padding * 2);
          const y = height - padding - (point.totals[metric] / max) * (height - padding * 2);

          return (
            <g key={`${point.date}-${index}`}>
              <circle cx={x} cy={y} r="3.5" fill={metricColors[metric]} />
              <text x={x} y={height - 10} textAnchor="middle" className="fill-slate-500 text-[10px]">
                {new Date(point.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
