import type { PoolClient } from "pg";
import { pool } from "../db/pool";
import * as repo from "../db/requests";
import { EDITABLE_STATUSES, REMOVABLE_STATUSES, STATUS_LABELS, TRANSITIONS } from "../domain";
import { conflict, notFound, validationError } from "../http/errors";
import type {
  CreateRequestInput,
  ListQuery,
  TransitionInput,
  UpdateRequestInput,
} from "../validation";

const UNIQUE_VIOLATION = "23505"; // Postgres SQLSTATE for unique_violation
const LIVE_INDEX = "uq_requests_one_live_per_item";

async function inTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// Rule 3. The partial unique index is the real guard (race-proof); this turns
// its violation into a helpful 409 that points at the blocking request.
async function translateDuplicate(err: unknown, orderRef?: string, itemRef?: string): Promise<never> {
  const e = err as { code?: string; constraint?: string };
  if (e.code === UNIQUE_VIOLATION && e.constraint === LIVE_INDEX) {
    const existing = orderRef && itemRef ? await repo.findLiveReference(pool, orderRef, itemRef) : null;
    throw conflict(
      "DUPLICATE_LIVE_REQUEST",
      "A live request already exists for this item on this order. Close it out (Rejected or Completed) first.",
      existing ? { existingReference: existing } : undefined,
    );
  }
  throw err;
}

export function listRequests(query: ListQuery) {
  return repo.listRequests(pool, query);
}

export async function getRequest(id: number) {
  const request = await repo.findRequest(pool, id);
  if (!request) throw notFound();
  const notes = await repo.listNotes(pool, id);
  return { ...request, notes };
}

export async function createRequest(input: CreateRequestInput) {
  try {
    return await repo.insertRequest(pool, input);
  } catch (err) {
    return translateDuplicate(err, input.orderRef, input.itemRef);
  }
}

// Rule 4: locked once decided.
export async function updateRequest(id: number, patch: UpdateRequestInput) {
  try {
    return await inTransaction(async (client) => {
      const current = await repo.findRequest(client, id, { forUpdate: true });
      if (!current) throw notFound();
      if (!EDITABLE_STATUSES.includes(current.status)) {
        throw conflict(
          "REQUEST_LOCKED",
          `A request that is ${STATUS_LABELS[current.status]} can no longer be edited. You can still add notes.`,
          { status: current.status },
        );
      }
      return repo.updateDetails(client, id, patch);
    });
  } catch (err) {
    return translateDuplicate(err, patch.orderRef, patch.itemRef);
  }
}

// Rules 1 and 2: legal transitions only, and Approved needs a valid resolution.
export async function transitionRequest(id: number, input: TransitionInput) {
  return inTransaction(async (client) => {
    const current = await repo.findRequest(client, id, { forUpdate: true });
    if (!current) throw notFound();

    const allowed = TRANSITIONS[current.status];
    if (!allowed.includes(input.to)) {
      throw conflict(
        "ILLEGAL_TRANSITION",
        allowed.length === 0
          ? `${STATUS_LABELS[current.status]} is a final status; the request cannot move any further.`
          : `Cannot move from ${STATUS_LABELS[current.status]} to ${STATUS_LABELS[input.to]}.`,
        { from: current.status, to: input.to, allowed },
      );
    }

    if (input.to === "approved") {
      if (!input.resolution) {
        throw validationError("Approval needs a resolution: refund, replacement or store_credit", [
          { field: "resolution", message: "Required when approving" },
        ]);
      }
      if (input.resolution === "refund" && input.refundAmount === undefined) {
        throw validationError("A refund needs a refund amount greater than zero", [
          { field: "refundAmount", message: "Required for a refund" },
        ]);
      }
      if (input.resolution !== "refund" && input.refundAmount !== undefined) {
        throw validationError("A refund amount can only be recorded for a refund", [
          { field: "refundAmount", message: "Not allowed unless the resolution is refund" },
        ]);
      }
      return repo.updateStatus(client, id, {
        status: "approved",
        resolution: input.resolution,
        refundAmount: input.resolution === "refund" ? input.refundAmount ?? null : null,
      });
    }

    if (input.resolution !== undefined || input.refundAmount !== undefined) {
      throw validationError("Resolution and refund amount can only be set when approving", [
        { field: input.resolution !== undefined ? "resolution" : "refundAmount", message: "Only allowed when approving" },
      ]);
    }
    // Completing keeps the resolution decided at approval; every other target has none.
    const keep = input.to === "completed";
    return repo.updateStatus(client, id, {
      status: input.to,
      resolution: keep ? current.resolution : null,
      refundAmount: keep ? current.refundAmount : null,
    });
  });
}

// Rule 5: soft delete, only for Open or Rejected.
export async function removeRequest(id: number) {
  await inTransaction(async (client) => {
    const current = await repo.findRequest(client, id, { forUpdate: true });
    if (!current) throw notFound();
    if (!REMOVABLE_STATUSES.includes(current.status)) {
      throw conflict(
        "NOT_REMOVABLE",
        `Only Open or Rejected requests can be removed; this one is ${STATUS_LABELS[current.status]}.`,
        { status: current.status },
      );
    }
    await repo.markDeleted(client, id);
  });
}

// Notes are always allowed, in any status, and are append-only.
export async function addNote(id: number, body: string, author = "agent") {
  const note = await repo.insertNote(pool, id, body, author);
  if (!note) throw notFound();
  return note;
}
