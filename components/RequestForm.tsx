"use client";

import { useState } from "react";
import { REASONS, REASON_LABELS, type Reason } from "@/lib/domain";
import { ErrorBanner } from "./ErrorBanner";
import { inputClass, primaryButton, secondaryButton } from "./ui";

export interface RequestFormValues {
  customerName: string;
  customerEmail: string;
  customerPhone: string | null;
  orderRef: string;
  itemRef: string;
  itemName: string | null;
  quantity: number;
  reason: Reason;
}

interface Props {
  initial?: Partial<RequestFormValues>;
  submitLabel: string;
  onSubmit: (values: RequestFormValues) => Promise<void>;
  onCancel?: () => void;
}

// Used for both raising and editing. Only light checks happen here (required,
// number ranges); the server owns the real validation and its message is shown as-is.
export function RequestForm({ initial, submitLabel, onSubmit, onCancel }: Props) {
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const optional = (key: string) => String(form.get(key) ?? "").trim() || null;
    setBusy(true);
    setError(null);
    try {
      await onSubmit({
        customerName: String(form.get("customerName") ?? ""),
        customerEmail: String(form.get("customerEmail") ?? ""),
        customerPhone: optional("customerPhone"),
        orderRef: String(form.get("orderRef") ?? ""),
        itemRef: String(form.get("itemRef") ?? ""),
        itemName: optional("itemName"),
        quantity: Number(form.get("quantity")),
        reason: String(form.get("reason")) as Reason,
      });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <ErrorBanner error={error} />
      <fieldset className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Customer name" required>
          <input name="customerName" defaultValue={initial?.customerName} required maxLength={120} className={inputClass} />
        </Field>
        <Field label="Customer email" required>
          <input name="customerEmail" type="email" defaultValue={initial?.customerEmail} required className={inputClass} />
        </Field>
        <Field label="Phone">
          <input name="customerPhone" type="tel" defaultValue={initial?.customerPhone ?? ""} className={inputClass} />
        </Field>
        <Field label="Order reference" required>
          <input name="orderRef" defaultValue={initial?.orderRef} required placeholder="ORD-1234" className={inputClass} />
        </Field>
        <Field label="Item reference" required>
          <input name="itemRef" defaultValue={initial?.itemRef} required placeholder="SKU-1001" className={inputClass} />
        </Field>
        <Field label="Item name">
          <input name="itemName" defaultValue={initial?.itemName ?? ""} className={inputClass} />
        </Field>
        <Field label="Quantity" required>
          <input name="quantity" type="number" min={1} step={1} defaultValue={initial?.quantity ?? 1} required className={inputClass} />
        </Field>
        <Field label="Reason" required>
          <select name="reason" defaultValue={initial?.reason ?? "damaged"} className={inputClass}>
            {REASONS.map((r) => (
              <option key={r} value={r}>
                {REASON_LABELS[r]}
              </option>
            ))}
          </select>
        </Field>
      </fieldset>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {onCancel && (
          <button type="button" onClick={onCancel} className={secondaryButton} disabled={busy}>
            Cancel
          </button>
        )}
        <button type="submit" className={primaryButton} disabled={busy}>
          {busy ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block space-y-1 text-sm">
      <span className="font-medium text-slate-700">
        {label}
        {required && <span className="text-red-600"> *</span>}
      </span>
      {children}
    </label>
  );
}
