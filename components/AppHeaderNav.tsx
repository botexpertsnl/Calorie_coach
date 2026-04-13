"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { logoutAction } from "@/app/auth/actions";
import { MAIN_NAV_ITEMS } from "@/lib/main-navigation";

export function AppHeaderNav() {
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (!isMobileMenuOpen) {
      return;
    }

    const scrollY = window.scrollY;
    const previousBodyOverflow = document.body.style.overflow;
    const previousBodyPosition = document.body.style.position;
    const previousBodyTop = document.body.style.top;
    const previousBodyWidth = document.body.style.width;

    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = "100%";

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.body.style.position = previousBodyPosition;
      document.body.style.top = previousBodyTop;
      document.body.style.width = previousBodyWidth;
      window.scrollTo(0, scrollY);
    };
  }, [isMobileMenuOpen]);

  return (
    <>
      <header className="sticky top-2 z-40 flex items-center justify-between gap-4 rounded-2xl bg-white/95 px-4 py-3 shadow-sm ring-1 ring-slate-200 backdrop-blur md:top-3 md:flex-row md:items-center md:p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">🥗</div>
          <div className="hidden md:block">
            <p className="text-lg font-semibold text-slate-900">AI Calorie Coach</p>
            <p className="text-sm text-slate-500">Smart nutrition tracking dashboard</p>
          </div>
        </div>

        <button
          type="button"
          aria-label="Open navigation menu"
          onClick={() => setIsMobileMenuOpen(true)}
          className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 md:hidden"
        >
          <span className="text-xl leading-none">☰</span>
        </button>

        <nav className="hidden flex-wrap items-center gap-2 md:flex">
          {MAIN_NAV_ITEMS.map((item) => {
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
          <form action={logoutAction}>
            <button
              type="submit"
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Log out
            </button>
          </form>
        </nav>
      </header>

      <div
        className={`fixed inset-0 z-50 bg-slate-900/45 transition-opacity duration-200 md:hidden ${
          isMobileMenuOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={() => setIsMobileMenuOpen(false)}
      >
        <aside
          className={`fixed right-0 top-0 flex h-[100dvh] w-80 max-w-[82vw] flex-col bg-white p-4 shadow-xl transition-transform duration-200 ${
            isMobileMenuOpen ? "translate-x-0" : "translate-x-full"
          }`}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="mb-5 flex items-center justify-between">
            <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Menu</p>
            <button
              type="button"
              aria-label="Close navigation menu"
              onClick={() => setIsMobileMenuOpen(false)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-lg text-slate-700"
            >
              ✕
            </button>
          </div>

          <nav className="space-y-2 overflow-y-auto">
            {MAIN_NAV_ITEMS.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={`block rounded-xl border px-4 py-3 text-base font-semibold ${
                    isActive
                      ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                      : "border-slate-200 bg-white text-slate-700"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
            <form action={logoutAction}>
              <button
                type="submit"
                className="mt-3 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-left text-base font-semibold text-slate-700"
              >
                Log out
              </button>
            </form>
          </nav>
        </aside>
      </div>
    </>
  );
}
