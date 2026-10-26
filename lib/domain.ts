// Single source of truth for the request lifecycle. Imported by the server
// (to enforce) and by the UI (only for labels), so the rules live in one place.

export const STATUSES = ["open", "in_review", "approved", "rejected", "completed"] as const;
export const REASONS = ["damaged", "wrong_item", "size_issue", "not_as_described", "changed_mind"] as const;
export const RESOLUTIONS = ["refund", "replacement", "store_credit"] as const;

export type Status = (typeof STATUSES)[number];
export type Reason = (typeof REASONS)[number];
export type Resolution = (typeof RESOLUTIONS)[number];

// Rule 1: the only legal transitions. Rejected and Completed are final.
export const TRANSITIONS: Record<Status, readonly Status[]> = {
  open: ["in_review"],
  in_review: ["approved", "rejected"],
  approved: ["completed"],
  rejected: [],
  completed: [],
};

// Rule 4: customer and item details can only be edited before a decision.
export const EDITABLE_STATUSES: readonly Status[] = ["open", "in_review"];

// Rule 5: only these can be removed from the desk.
export const REMOVABLE_STATUSES: readonly Status[] = ["open", "rejected"];

export const STATUS_LABELS: Record<Status, string> = {
  open: "Open",
  in_review: "In Review",
  approved: "Approved",
  rejected: "Rejected",
  completed: "Completed",
};

export const REASON_LABELS: Record<Reason, string> = {
  damaged: "Damaged",
  wrong_item: "Wrong Item",
  size_issue: "Size Issue",
  not_as_described: "Not As Described",
  changed_mind: "Changed Mind",
};

export const RESOLUTION_LABELS: Record<Resolution, string> = {
  refund: "Refund",
  replacement: "Replacement",
  store_credit: "Store Credit",
};

export interface AllowedActions {
  transitions: Status[];
  canEdit: boolean;
  canRemove: boolean;
}

export function allowedActionsFor(status: Status): AllowedActions {
  return {
    transitions: [...TRANSITIONS[status]],
    canEdit: EDITABLE_STATUSES.includes(status),
    canRemove: REMOVABLE_STATUSES.includes(status),
  };
}
