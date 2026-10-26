// Thin fetch wrapper used by every component. It turns the server's single
// error shape into an ApiError so screens can show the real reason.

export interface FieldIssue {
  field: string;
  message: string;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }

  get fieldIssues(): FieldIssue[] {
    return Array.isArray(this.details)
      ? this.details.filter((d): d is FieldIssue => typeof d?.field === "string" && typeof d?.message === "string")
      : [];
  }
}

export async function api<T>(path: string, init?: RequestInit & { json?: unknown }) {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: { "content-type": "application/json", ...init?.headers },
      body: init?.json === undefined ? init?.body : JSON.stringify(init.json),
      signal: init?.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new ApiError(0, "NETWORK_ERROR", "Could not reach the server. Check your connection and try again.");
  }

  if (res.status === 204) return { data: undefined as T, meta: undefined };

  let body: ResponseBody;
  try {
    body = (await res.json()) as ResponseBody;
  } catch {
    throw new ApiError(res.status, "INVALID_RESPONSE", `The server returned an unexpected response (${res.status}).`);
  }
  if (!res.ok) {
    const e = body?.error;
    throw new ApiError(res.status, e?.code ?? "UNKNOWN", e?.message ?? "Something went wrong", e?.details);
  }
  return { data: body.data as T, meta: body.meta as PageMeta | undefined };
}

interface ResponseBody {
  data?: unknown;
  meta?: PageMeta;
  error?: { code?: string; message?: string; details?: unknown };
}

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}
