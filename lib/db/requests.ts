import type { Pool, PoolClient } from "pg";
import { allowedActionsFor, type AllowedActions, type Reason, type Resolution, type Status } from "../domain";
import { SORTABLE, type ListQuery } from "../validation";

// Anything we can run SQL on: the pool, or a client inside a transaction.
export type Db = Pick<Pool | PoolClient, "query">;

interface RequestRow {
  id: number;
  reference: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string | null;
  order_ref: string;
  item_ref: string;
  item_name: string | null;
  quantity: number;
  reason: Reason;
  status: Status;
  resolution: Resolution | null;
  refund_amount: string | null;
  created_at: Date;
  updated_at: Date;
}

interface NoteRow {
  id: number;
  request_id: number;
  body: string;
  author: string;
  created_at: Date;
}

export interface RequestDto {
  id: number;
  reference: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string | null;
  orderRef: string;
  itemRef: string;
  itemName: string | null;
  quantity: number;
  reason: Reason;
  status: Status;
  resolution: Resolution | null;
  refundAmount: number | null;
  createdAt: string;
  updatedAt: string;
  allowedActions: AllowedActions;
}

export interface NoteDto {
  id: number;
  requestId: number;
  body: string;
  author: string;
  createdAt: string;
}

const COLUMNS = `r.id, r.reference, r.customer_name, r.customer_email, r.customer_phone,
  r.order_ref, r.item_ref, r.item_name, r.quantity, r.reason, r.status, r.resolution,
  r.refund_amount, r.created_at, r.updated_at`;

export function toRequestDto(row: RequestRow): RequestDto {
  return {
    id: row.id,
    reference: row.reference,
    customerName: row.customer_name,
    customerEmail: row.customer_email,
    customerPhone: row.customer_phone,
    orderRef: row.order_ref,
    itemRef: row.item_ref,
    itemName: row.item_name,
    quantity: row.quantity,
    reason: row.reason,
    status: row.status,
    resolution: row.resolution,
    refundAmount: row.refund_amount === null ? null : Number(row.refund_amount),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    allowedActions: allowedActionsFor(row.status),
  };
}

export function toNoteDto(row: NoteRow): NoteDto {
  return {
    id: row.id,
    requestId: row.request_id,
    body: row.body,
    author: row.author,
    createdAt: row.created_at.toISOString(),
  };
}

// Escape LIKE wildcards so a search for "100%" matches literally.
const likePattern = (term: string) => `%${term.replace(/[\\%_]/g, "\\$&")}%`;

export async function listRequests(db: Db, query: ListQuery) {
  const where: string[] = ["r.deleted_at IS NULL"];
  const params: unknown[] = [];

  if (query.q) {
    params.push(likePattern(query.q));
    const p = `$${params.length}`;
    where.push(
      `(r.customer_name ILIKE ${p} OR r.customer_email ILIKE ${p} OR r.order_ref ILIKE ${p} OR r.reference ILIKE ${p})`,
    );
  }
  if (query.status) {
    params.push(query.status);
    where.push(`r.status = $${params.length}`);
  }
  if (query.reason) {
    params.push(query.reason);
    where.push(`r.reason = $${params.length}`);
  }
  const whereSql = where.join(" AND ");

  // Sort column comes from a whitelist, never from raw user input.
  // `r.id` is a tie-breaker so paging is stable when sort values repeat.
  const direction = query.order === "asc" ? "ASC" : "DESC";
  const orderSql = `${SORTABLE[query.sort]} ${direction}, r.id ${direction}`;

  const limit = query.pageSize;
  const offset = (query.page - 1) * query.pageSize;

  const [rows, count] = await Promise.all([
    db.query<RequestRow>(
      `SELECT ${COLUMNS} FROM requests r WHERE ${whereSql}
       ORDER BY ${orderSql} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset],
    ),
    db.query<{ total: number }>(`SELECT count(*) AS total FROM requests r WHERE ${whereSql}`, params),
  ]);

  const total = count.rows[0].total;
  return {
    items: rows.rows.map(toRequestDto),
    meta: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    },
  };
}

// forUpdate locks the row for the rest of the transaction, so two agents
// cannot move or edit the same request at the same time.
export async function findRequest(db: Db, id: number, opts: { forUpdate?: boolean } = {}) {
  const { rows } = await db.query<RequestRow>(
    `SELECT ${COLUMNS} FROM requests r WHERE r.id = $1 AND r.deleted_at IS NULL ${opts.forUpdate ? "FOR UPDATE" : ""}`,
    [id],
  );
  return rows[0] ? toRequestDto(rows[0]) : null;
}

export async function findLiveReference(db: Db, orderRef: string, itemRef: string) {
  const { rows } = await db.query<{ reference: string }>(
    `SELECT reference FROM requests
     WHERE order_ref = $1 AND item_ref = $2 AND deleted_at IS NULL AND status NOT IN ('rejected', 'completed')`,
    [orderRef, itemRef],
  );
  return rows[0]?.reference ?? null;
}

export async function listNotes(db: Db, requestId: number) {
  const { rows } = await db.query<NoteRow>(
    "SELECT id, request_id, body, author, created_at FROM notes WHERE request_id = $1 ORDER BY created_at ASC, id ASC",
    [requestId],
  );
  return rows.map(toNoteDto);
}

export async function insertRequest(
  db: Db,
  v: {
    customerName: string;
    customerEmail: string;
    customerPhone?: string | null;
    orderRef: string;
    itemRef: string;
    itemName?: string | null;
    quantity: number;
    reason: Reason;
  },
) {
  const { rows } = await db.query<RequestRow>(
    `INSERT INTO requests AS r
       (customer_name, customer_email, customer_phone, order_ref, item_ref, item_name, quantity, reason)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING ${COLUMNS}`,
    [v.customerName, v.customerEmail, v.customerPhone ?? null, v.orderRef, v.itemRef, v.itemName ?? null, v.quantity, v.reason],
  );
  return toRequestDto(rows[0]);
}

// Whitelist: API field name -> column. Only these can ever appear in the SET clause.
const EDITABLE_COLUMNS = {
  customerName: "customer_name",
  customerEmail: "customer_email",
  customerPhone: "customer_phone",
  orderRef: "order_ref",
  itemRef: "item_ref",
  itemName: "item_name",
  quantity: "quantity",
  reason: "reason",
} as const;

export async function updateDetails(db: Db, id: number, patch: Partial<Record<keyof typeof EDITABLE_COLUMNS, unknown>>) {
  const sets: string[] = [];
  const params: unknown[] = [];
  for (const [field, column] of Object.entries(EDITABLE_COLUMNS)) {
    if (field in patch) {
      params.push(patch[field as keyof typeof EDITABLE_COLUMNS]);
      sets.push(`${column} = $${params.length}`);
    }
  }
  params.push(id);
  const { rows } = await db.query<RequestRow>(
    `UPDATE requests AS r SET ${sets.join(", ")}, updated_at = now()
     WHERE r.id = $${params.length} RETURNING ${COLUMNS}`,
    params,
  );
  return toRequestDto(rows[0]);
}

export async function updateStatus(
  db: Db,
  id: number,
  v: { status: Status; resolution: Resolution | null; refundAmount: number | null },
) {
  const { rows } = await db.query<RequestRow>(
    `UPDATE requests AS r
     SET status = $2, resolution = $3, refund_amount = $4, updated_at = now()
     WHERE r.id = $1 RETURNING ${COLUMNS}`,
    [id, v.status, v.resolution, v.refundAmount],
  );
  return toRequestDto(rows[0]);
}

// Soft delete: the row stays in the database, it just stops being visible.
export async function markDeleted(db: Db, id: number) {
  await db.query("UPDATE requests SET deleted_at = now(), updated_at = now() WHERE id = $1", [id]);
}

// Single atomic statement: inserts only if the request exists and is not removed.
export async function insertNote(db: Db, requestId: number, body: string, author: string) {
  const { rows } = await db.query<NoteRow>(
    `INSERT INTO notes (request_id, body, author)
     SELECT r.id, $2, $3 FROM requests r WHERE r.id = $1 AND r.deleted_at IS NULL
     RETURNING id, request_id, body, author, created_at`,
    [requestId, body, author],
  );
  return rows[0] ? toNoteDto(rows[0]) : null;
}
