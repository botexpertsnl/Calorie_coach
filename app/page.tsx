import { Suspense } from "react";
import { HomePageClient } from "@/components/HomePageClient";

export default function HomePage() {
  return (
    // useSearchParams() is inside HomePageClient, so we wrap it in Suspense for safe prerendering.
    <Suspense fallback={<div className="p-6 text-sm text-slate-500">Loading homepage...</div>}>
      <HomePageClient />
    </Suspense>
  );
}
