import { NewRequestForm } from "@/components/NewRequestForm";

export const metadata = { title: "New request · ReturnDesk" };

export default function NewRequestPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Raise a return request</h1>
      <p className="text-sm text-slate-600">The reference number is generated automatically when you save.</p>
      <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
        <NewRequestForm />
      </div>
    </div>
  );
}
