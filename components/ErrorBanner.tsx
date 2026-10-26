import { ApiError } from "@/lib/client/api";

// Shows exactly what the server said, including per-field problems.
export function ErrorBanner({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  if (!error) return null;
  const message = error instanceof Error ? error.message : "Something went wrong";
  const issues = error instanceof ApiError ? error.fieldIssues : [];

  return (
    <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
      <p className="font-medium">{message}</p>
      {issues.length > 0 && (
        <ul className="mt-1 list-disc pl-5">
          {issues.map((i, n) => (
            <li key={n}>
              <span className="font-mono text-xs">{i.field}</span>: {i.message}
            </li>
          ))}
        </ul>
      )}
      {onRetry && (
        <button onClick={onRetry} className="mt-2 rounded-md border border-red-300 bg-white px-3 py-1 text-red-800 hover:bg-red-100">
          Try again
        </button>
      )}
    </div>
  );
}
