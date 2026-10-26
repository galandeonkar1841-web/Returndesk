"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { RequestDto } from "@/lib/db/requests";
import { REASONS, REASON_LABELS, STATUSES, STATUS_LABELS } from "@/lib/domain";
import { api, type PageMeta } from "@/lib/client/api";
import { ErrorBanner } from "./ErrorBanner";
import { StatusBadge } from "./StatusBadge";
import { formatDate, inputClass, secondaryButton } from "./ui";

const SEARCH_DEBOUNCE_MS = 300;

const SORT_OPTIONS = [
  { value: "created_at", label: "Date created" },
  { value: "updated_at", label: "Last updated" },
  { value: "reference", label: "Reference" },
  { value: "customer_name", label: "Customer" },
  { value: "order_ref", label: "Order" },
  { value: "status", label: "Status" },
  { value: "reason", label: "Reason" },
];

// A finished fetch, tagged with the query it answered. While the URL is ahead of
// the result we are "loading", and the previous rows stay visible (dimmed).
interface Result {
  key: string;
  items: RequestDto[];
  meta?: PageMeta;
  error?: unknown;
}

export function RequestsList() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // The URL is the single source of truth for filters, so links are shareable and refresh-safe.
  const q = searchParams.get("q") ?? "";
  const status = searchParams.get("status") ?? "";
  const reason = searchParams.get("reason") ?? "";
  const sort = searchParams.get("sort") ?? "created_at";
  const order = searchParams.get("order") ?? "desc";
  const page = Number(searchParams.get("page") ?? "1") || 1;

  const [search, setSearch] = useState(q);
  const [result, setResult] = useState<Result | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const updateParams = useCallback(
    (changes: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(changes)) {
        if (value) next.set(key, value);
        else next.delete(key);
      }
      const qs = next.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  // Debounce: wait until the agent pauses typing before touching the URL (and so the server).
  useEffect(() => {
    if (search === q) return;
    const timer = setTimeout(() => updateParams({ q: search.trim() || null, page: null }), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search, q, updateParams]);

  // Keep the box in sync when the URL changes from outside (back button, clear filters).
  const [syncedQ, setSyncedQ] = useState(q);
  if (q !== syncedQ) {
    setSyncedQ(q);
    setSearch(q);
  }

  const queryString = searchParams.toString();
  const requestKey = `${queryString}#${reloadKey}`;
  useEffect(() => {
    const controller = new AbortController();
    api<RequestDto[]>(`/api/requests?${queryString}`, { signal: controller.signal })
      .then(({ data, meta }) => setResult({ key: requestKey, items: data, meta }))
      .catch((error) => {
        if (error?.name === "AbortError") return;
        setResult((prev) => ({ key: requestKey, items: [], meta: prev?.meta, error }));
      });
    return () => controller.abort();
  }, [queryString, requestKey]);

  const loading = !result || result.key !== requestKey;
  const items = result?.items ?? [];
  const meta = result?.meta;
  const error = loading ? undefined : result?.error;

  function toggleSort(column: string) {
    if (sort === column) updateParams({ order: order === "asc" ? "desc" : "asc", page: null });
    else updateParams({ sort: column, order: "asc", page: null });
  }

  const hasFilters = Boolean(q || status || reason);
  const clearFilters = () => router.push(pathname, { scroll: false });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search customer, order or reference"
          aria-label="Search requests"
          className={`${inputClass} sm:col-span-2`}
        />
        <select aria-label="Filter by status" value={status} onChange={(e) => updateParams({ status: e.target.value || null, page: null })} className={inputClass}>
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <select aria-label="Filter by reason" value={reason} onChange={(e) => updateParams({ reason: e.target.value || null, page: null })} className={inputClass}>
          <option value="">All reasons</option>
          {REASONS.map((r) => (
            <option key={r} value={r}>
              {REASON_LABELS[r]}
            </option>
          ))}
        </select>
      </div>

      {/* Table headers are the sort controls on desktop; phones get a select instead. */}
      <div className="flex items-center gap-2 md:hidden">
        <select aria-label="Sort by" value={sort} onChange={(e) => updateParams({ sort: e.target.value, page: null })} className={inputClass}>
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              Sort: {o.label}
            </option>
          ))}
        </select>
        <button className={`${secondaryButton} shrink-0`} onClick={() => updateParams({ order: order === "asc" ? "desc" : "asc", page: null })} aria-label="Toggle sort direction">
          {order === "asc" ? "Asc ↑" : "Desc ↓"}
        </button>
      </div>

      {Boolean(error) && <ErrorBanner error={error} onRetry={() => setReloadKey((k) => k + 1)} />}

      {loading && items.length === 0 ? (
        <LoadingRows />
      ) : !loading && !error && items.length === 0 ? (
        <EmptyState hasFilters={hasFilters} onClear={clearFilters} />
      ) : (
        items.length > 0 && (
          <div className={loading ? "opacity-60 transition-opacity" : "transition-opacity"} aria-busy={loading}>
            <DesktopTable items={items} sort={sort} order={order} onSort={toggleSort} />
            <MobileCards items={items} />
          </div>
        )
      )}

      {meta && meta.total > 0 && (
        <nav className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600" aria-label="Pagination">
          <span>
            {meta.total} request{meta.total === 1 ? "" : "s"} · page {meta.page} of {meta.totalPages}
          </span>
          <div className="flex gap-2">
            <button className={secondaryButton} disabled={page <= 1} onClick={() => updateParams({ page: String(page - 1) })}>
              Previous
            </button>
            <button className={secondaryButton} disabled={page >= meta.totalPages} onClick={() => updateParams({ page: String(page + 1) })}>
              Next
            </button>
          </div>
        </nav>
      )}
    </div>
  );
}

function DesktopTable({ items, sort, order, onSort }: { items: RequestDto[]; sort: string; order: string; onSort: (c: string) => void }) {
  const columns = [
    { key: "reference", label: "Reference" },
    { key: "customer_name", label: "Customer" },
    { key: "order_ref", label: "Order / item" },
    { key: "reason", label: "Reason" },
    { key: "status", label: "Status" },
    { key: "created_at", label: "Created" },
  ];
  return (
    <div className="hidden overflow-hidden rounded-xl border border-slate-200 bg-white md:block">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" aria-sort={sort === c.key ? (order === "asc" ? "ascending" : "descending") : "none"} className="px-4 py-3 font-medium">
                <button onClick={() => onSort(c.key)} className="inline-flex items-center gap-1 uppercase tracking-wide hover:text-slate-900">
                  {c.label}
                  <span aria-hidden className={sort === c.key ? "text-indigo-600" : "text-slate-300"}>
                    {sort === c.key ? (order === "asc" ? "↑" : "↓") : "↕"}
                  </span>
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {items.map((r) => (
            <tr key={r.id} className="hover:bg-slate-50">
              <td className="px-4 py-3 font-mono text-xs">
                <Link href={`/requests/${r.id}`} className="font-medium text-indigo-700 hover:underline">
                  {r.reference}
                </Link>
              </td>
              <td className="px-4 py-3">
                <div className="font-medium text-slate-900">{r.customerName}</div>
                <div className="text-xs text-slate-500">{r.customerEmail}</div>
              </td>
              <td className="px-4 py-3">
                <div>{r.orderRef}</div>
                <div className="text-xs text-slate-500">
                  {r.itemName ?? r.itemRef} × {r.quantity}
                </div>
              </td>
              <td className="px-4 py-3">{REASON_LABELS[r.reason]}</td>
              <td className="px-4 py-3">
                <StatusBadge status={r.status} />
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatDate(r.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MobileCards({ items }: { items: RequestDto[] }) {
  return (
    <ul className="space-y-3 md:hidden">
      {items.map((r) => (
        <li key={r.id}>
          <Link href={`/requests/${r.id}`} className="block rounded-xl border border-slate-200 bg-white p-4 active:bg-slate-50">
            <div className="flex items-start justify-between gap-2">
              <span className="font-mono text-xs font-medium text-indigo-700">{r.reference}</span>
              <StatusBadge status={r.status} />
            </div>
            <div className="mt-2 font-medium text-slate-900">{r.customerName}</div>
            <div className="text-sm text-slate-600">
              {r.orderRef} · {r.itemName ?? r.itemRef} × {r.quantity}
            </div>
            <div className="mt-1 flex justify-between text-xs text-slate-500">
              <span>{REASON_LABELS[r.reason]}</span>
              <span>{formatDate(r.createdAt)}</span>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function LoadingRows() {
  return (
    <div className="space-y-2" role="status" aria-label="Loading requests">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-14 animate-pulse rounded-lg bg-slate-200/70" />
      ))}
    </div>
  );
}

function EmptyState({ hasFilters, onClear }: { hasFilters: boolean; onClear: () => void }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
      <p className="font-medium text-slate-900">{hasFilters ? "No requests match your search" : "No return requests yet"}</p>
      <p className="mt-1 text-sm text-slate-500">
        {hasFilters ? "Try a different search term or clear the filters." : "Raise the first request to get started."}
      </p>
      <div className="mt-4">
        {hasFilters ? (
          <button className={secondaryButton} onClick={onClear}>
            Clear filters
          </button>
        ) : (
          <Link href="/requests/new" className={secondaryButton}>
            New request
          </Link>
        )}
      </div>
    </div>
  );
}
