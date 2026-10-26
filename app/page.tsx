import { Suspense } from "react";
import { RequestsList } from "@/components/RequestsList";

export default function Home() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Return requests</h1>
      {/* useSearchParams needs a Suspense boundary so the rest of the page can prerender. */}
      <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-slate-200/70" />}>
        <RequestsList />
      </Suspense>
    </div>
  );
}
