import { Suspense } from "react";
import { RequestDetail } from "@/components/RequestDetail";

export const metadata = { title: "Request · ReturnDesk" };

export default function RequestPage({ params }: PageProps<"/requests/[id]">) {
  // Reading `params` is runtime data, so it sits behind Suspense and the shell can still prerender.
  return (
    <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-slate-200/70" role="status" aria-label="Loading request" />}>
      <Detail params={params} />
    </Suspense>
  );
}

async function Detail({ params }: { params: PageProps<"/requests/[id]">["params"] }) {
  const { id } = await params;
  return <RequestDetail id={id} />;
}
