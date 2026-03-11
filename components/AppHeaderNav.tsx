"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

type AppHeaderNavProps = {
  onProfileClick?: () => void;
};

const navItems = [
  { label: "Meals", href: "/" },
  { label: "Insights", href: "/insights" }
];

export function AppHeaderNav({ onProfileClick }: AppHeaderNavProps) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <header className="sticky top-3 z-40 flex flex-col items-start justify-between gap-4 rounded-2xl bg-white/95 p-5 shadow-sm ring-1 ring-slate-200 backdrop-blur md:flex-row md:items-center">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">🥗</div>
        <div>
          <p className="text-lg font-semibold text-slate-900">AI Calorie Coach</p>
          <p className="text-sm text-slate-500">Smart nutrition tracking dashboard</p>
        </div>
      </div>

      <nav className="flex flex-wrap items-center gap-2">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-xl border px-4 py-2 text-sm font-medium transition ${
                isActive
                  ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              {item.label}
            </Link>
          );
        })}

        <button
          type="button"
          onClick={() => {
            if (onProfileClick) {
              onProfileClick();
              return;
            }
            router.push("/?openProfile=1");
          }}
          className={`rounded-xl border px-4 py-2 text-sm font-medium transition ${
            pathname === "/profile"
              ? "border-emerald-500 bg-emerald-50 text-emerald-700"
              : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
          }`}
        >
          Profile
        </button>
      </nav>
    </header>
  );
}
