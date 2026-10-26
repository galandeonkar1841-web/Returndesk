"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { NoteDto, RequestDto } from "@/lib/db/requests";
import { REASON_LABELS, RESOLUTIONS, RESOLUTION_LABELS, STATUS_LABELS, type Resolution, type Status } from "@/lib/domain";
import { api, ApiError } from "@/lib/client/api";
import { ErrorBanner } from "./ErrorBanner";
import { RequestForm } from "./RequestForm";
import { StatusBadge } from "./StatusBadge";
import { dangerButton, formatDate, formatMoney, inputClass, primaryButton, secondaryButton } from "./ui";

type Detail = RequestDto & { notes: NoteDto[] };

// Button labels for each move. Which moves are *offered* comes from the server (allowedActions).
const TRANSITION_LABELS: Partial<Record<Status, string>> = {
  in_review: "Start review",
  approved: "Approve…",
  rejected: "Reject",
  completed: "Mark completed",
};

const fetchDetail = (id: string) => api<Detail>(`/api/requests/${id}`).then((res) => res.data);

export function RequestDetail({ id }: { id: string }) {
  const router = useRouter();
  const [request, setRequest] = useState<Detail | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [actionError, setActionError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [approving, setApproving] = useState(false);

  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let stale = false;
    fetchDetail(id).then(
      (data) => {
        if (stale) return;
        setRequest(data);
        setLoadError(null);
      },
      (err) => {
        if (!stale) setLoadError(err);
      },
    );
    return () => {
      stale = true;
    };
  }, [id, retryKey]);

  async function reload() {
    try {
      setRequest(await fetchDetail(id));
      setLoadError(null);
    } catch (err) {
      setLoadError(err);
    }
  }

  // Runs a server action, shows the server's refusal if there is one, and refreshes on success.
  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setActionError(null);
    try {
      await action();
      await reload();
      return true;
    } catch (err) {
      setActionError(err);
      // The record may have changed under us (e.g. another agent moved it), so refresh what we show.
      if (err instanceof ApiError && err.status === 409) await reload();
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (loadError instanceof ApiError && loadError.status === 404) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
        <p className="font-medium text-slate-900">This request doesn&apos;t exist (or was removed)</p>
        <Link href="/" className={`${secondaryButton} mt-4`}>
          Back to the desk
        </Link>
      </div>
    );
  }
  if (loadError && !request) return <ErrorBanner error={loadError} onRetry={() => setRetryKey((k) => k + 1)} />;
  if (!request) return <div className="h-64 animate-pulse rounded-xl bg-slate-200/70" role="status" aria-label="Loading request" />;

  const { allowedActions: actions } = request;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/" className="text-sm text-indigo-700 hover:underline">
          ← All requests
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="font-mono text-xl font-semibold text-slate-900">{request.reference}</h1>
          <StatusBadge status={request.status} />
        </div>
      </div>

      <ErrorBanner error={actionError} />

      <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
        {editing ? (
          <RequestForm
            initial={request}
            submitLabel="Save changes"
            onCancel={() => setEditing(false)}
            onSubmit={async (values) => {
              await api(`/api/requests/${id}`, { method: "PATCH", json: values });
              setEditing(false);
              await reload();
            }}
          />
        ) : (
          <>
            <dl className="grid grid-cols-1 gap-x-8 gap-y-4 text-sm sm:grid-cols-2">
              <Item label="Customer" value={request.customerName} />
              <Item label="Email" value={request.customerEmail} />
              <Item label="Phone" value={request.customerPhone ?? "—"} />
              <Item label="Order" value={request.orderRef} />
              <Item label="Item" value={`${request.itemName ?? request.itemRef} (${request.itemRef}) × ${request.quantity}`} />
              <Item label="Reason" value={REASON_LABELS[request.reason]} />
              <Item
                label="Resolution"
                value={
                  request.resolution
                    ? `${RESOLUTION_LABELS[request.resolution]}${request.refundAmount !== null ? ` · ${formatMoney(request.refundAmount)}` : ""}`
                    : "Not decided yet"
                }
              />
              <Item label="Raised" value={formatDate(request.createdAt)} />
            </dl>

            {!actions.canEdit && (
              <p className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
                This request has been decided, so its customer and item details are locked. You can still add notes.
              </p>
            )}

            <div className="mt-6 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
              {actions.transitions.map((to) =>
                to === "approved" ? (
                  <button key={to} className={primaryButton} disabled={busy} onClick={() => setApproving((v) => !v)}>
                    {TRANSITION_LABELS[to] ?? STATUS_LABELS[to]}
                  </button>
                ) : (
                  <button
                    key={to}
                    className={to === "rejected" ? dangerButton : primaryButton}
                    disabled={busy}
                    onClick={() => run(() => api(`/api/requests/${id}/transition`, { method: "POST", json: { to } }))}
                  >
                    {TRANSITION_LABELS[to] ?? STATUS_LABELS[to]}
                  </button>
                ),
              )}
              {actions.canEdit && (
                <button className={secondaryButton} disabled={busy} onClick={() => setEditing(true)}>
                  Edit details
                </button>
              )}
              {actions.canRemove && (
                <button
                  className={dangerButton}
                  disabled={busy}
                  onClick={async () => {
                    if (!window.confirm(`Remove ${request.reference} from the desk? The record is kept, but it will no longer be listed.`)) return;
                    setBusy(true);
                    setActionError(null);
                    try {
                      await api(`/api/requests/${id}`, { method: "DELETE" });
                      router.push("/");
                    } catch (err) {
                      setActionError(err);
                      setBusy(false);
                    }
                  }}
                >
                  Remove from desk
                </button>
              )}
              {actions.transitions.length === 0 && !actions.canEdit && !actions.canRemove && (
                <p className="text-sm text-slate-500">No further actions: this request is closed.</p>
              )}
            </div>

            {approving && actions.transitions.includes("approved") && (
              <ApproveForm
                busy={busy}
                onCancel={() => setApproving(false)}
                onConfirm={async (resolution, refundAmount) => {
                  const done = await run(() =>
                    api(`/api/requests/${id}/transition`, { method: "POST", json: { to: "approved", resolution, refundAmount } }),
                  );
                  if (done) setApproving(false);
                }}
              />
            )}
          </>
        )}
      </section>

      <NotesSection
        notes={request.notes}
        onAdd={(body, author) => run(() => api(`/api/requests/${id}/notes`, { method: "POST", json: { body, author } }))}
        busy={busy}
      />
    </div>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-0.5 break-words text-slate-900">{value}</dd>
    </div>
  );
}

function ApproveForm({
  busy,
  onConfirm,
  onCancel,
}: {
  busy: boolean;
  onConfirm: (resolution: Resolution | undefined, refundAmount: number | undefined) => void;
  onCancel: () => void;
}) {
  const [resolution, setResolution] = useState<Resolution | "">("");
  const [amount, setAmount] = useState("");

  return (
    <form
      className="mt-4 space-y-3 rounded-lg border border-emerald-200 bg-emerald-50/50 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        // Unfilled values are sent as-is on purpose: the server decides and explains.
        onConfirm(resolution || undefined, amount.trim() === "" ? undefined : Number(amount));
      }}
    >
      <p className="text-sm font-medium text-slate-800">How should this be resolved?</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <select aria-label="Resolution" value={resolution} onChange={(e) => setResolution(e.target.value as Resolution | "")} className={inputClass}>
          <option value="">Choose a resolution…</option>
          {RESOLUTIONS.map((r) => (
            <option key={r} value={r}>
              {RESOLUTION_LABELS[r]}
            </option>
          ))}
        </select>
        {resolution === "refund" && (
          <input
            aria-label="Refund amount"
            type="number"
            inputMode="decimal"
            min="0.01"
            step="0.01"
            placeholder="Refund amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className={inputClass}
          />
        )}
      </div>
      <div className="flex gap-2">
        <button type="submit" className={primaryButton} disabled={busy}>
          Confirm approval
        </button>
        <button type="button" className={secondaryButton} onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function NotesSection({ notes, onAdd, busy }: { notes: NoteDto[]; onAdd: (body: string, author: string) => Promise<boolean>; busy: boolean }) {
  const [body, setBody] = useState("");
  const [author, setAuthor] = useState("Support agent");

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
      <h2 className="text-base font-semibold text-slate-900">Notes</h2>

      {notes.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">No notes yet.</p>
      ) : (
        <ol className="mt-4 space-y-4 border-l-2 border-slate-100 pl-4">
          {notes.map((n) => (
            <li key={n.id}>
              <p className="whitespace-pre-wrap break-words text-sm text-slate-900">{n.body}</p>
              <p className="mt-1 text-xs text-slate-500">
                {n.author} · {formatDate(n.createdAt)}
              </p>
            </li>
          ))}
        </ol>
      )}

      <form
        className="mt-6 space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await onAdd(body, author)) setBody("");
        }}
      >
        <textarea
          aria-label="New note"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          placeholder="Add a note. Notes can't be edited or deleted once saved."
          className={inputClass}
        />
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <input aria-label="Note author" value={author} onChange={(e) => setAuthor(e.target.value)} className={`${inputClass} sm:max-w-xs`} />
          <button type="submit" className={primaryButton} disabled={busy || body.trim() === ""}>
            Add note
          </button>
        </div>
      </form>
    </section>
  );
}
