import { z } from "zod";
import { REASONS, RESOLUTIONS, STATUSES } from "./domain";

const text = (max: number) => z.string().trim().min(1, "Required").max(max);

// Money: positive, at most two decimals, within NUMERIC(10,2).
const money = z
  .number({ error: "Must be a number" })
  .positive("Must be greater than zero")
  .max(99999999.99, "Too large")
  .refine((n) => Math.round(n * 100) / 100 === n, "At most two decimal places");

export const createRequestSchema = z.object({
  customerName: text(120),
  customerEmail: z.string().trim().max(200).email("Must be a valid email"),
  customerPhone: z.string().trim().max(40).optional().nullable(),
  orderRef: text(60),
  itemRef: text(60),
  itemName: z.string().trim().max(160).optional().nullable(),
  quantity: z.number({ error: "Must be a number" }).int("Must be a whole number").min(1, "Must be at least 1").max(1000),
  reason: z.enum(REASONS),
});

// Editing: any subset of the create fields, but never an empty patch.
export const updateRequestSchema = createRequestSchema
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, "Provide at least one field to update");

export const transitionSchema = z.object({
  to: z.enum(STATUSES),
  resolution: z.enum(RESOLUTIONS).optional(),
  refundAmount: money.optional(),
});

export const noteSchema = z.object({
  body: text(2000),
  author: z.string().trim().min(1).max(80).optional(),
});

export const SORTABLE = {
  created_at: "r.created_at",
  updated_at: "r.updated_at",
  reference: "r.reference",
  customer_name: "r.customer_name",
  order_ref: "r.order_ref",
  status: "r.status",
  reason: "r.reason",
} as const;

export const listQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.enum(STATUSES).optional(),
  reason: z.enum(REASONS).optional(),
  sort: z.enum(Object.keys(SORTABLE) as [keyof typeof SORTABLE, ...(keyof typeof SORTABLE)[]]).default("created_at"),
  order: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
});

export type CreateRequestInput = z.infer<typeof createRequestSchema>;
export type UpdateRequestInput = z.infer<typeof updateRequestSchema>;
export type TransitionInput = z.infer<typeof transitionSchema>;
export type ListQuery = z.infer<typeof listQuerySchema>;
