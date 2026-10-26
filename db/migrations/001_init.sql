-- ReturnDesk initial schema.
-- Business invariants are enforced here as the last line of defence;
-- the service layer checks the same rules first to give friendly errors.

CREATE TYPE request_status AS ENUM ('open', 'in_review', 'approved', 'rejected', 'completed');
CREATE TYPE request_reason AS ENUM ('damaged', 'wrong_item', 'size_issue', 'not_as_described', 'changed_mind');
CREATE TYPE request_resolution AS ENUM ('refund', 'replacement', 'store_credit');

-- Human-readable references (RD-000042) come from a sequence, never from user input.
CREATE SEQUENCE request_ref_seq START 1;

CREATE TABLE requests (
  id              BIGSERIAL PRIMARY KEY,
  reference       TEXT NOT NULL UNIQUE
                  DEFAULT ('RD-' || lpad(nextval('request_ref_seq')::text, 6, '0')),
  customer_name   TEXT NOT NULL CHECK (length(btrim(customer_name)) > 0),
  customer_email  TEXT NOT NULL CHECK (length(btrim(customer_email)) > 0),
  customer_phone  TEXT,
  order_ref       TEXT NOT NULL CHECK (length(btrim(order_ref)) > 0),
  item_ref        TEXT NOT NULL CHECK (length(btrim(item_ref)) > 0),
  item_name       TEXT,
  quantity        INTEGER NOT NULL CHECK (quantity > 0),
  reason          request_reason NOT NULL,
  status          request_status NOT NULL DEFAULT 'open',
  resolution      request_resolution,
  refund_amount   NUMERIC(10, 2),
  deleted_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Rule 2: a resolution exists exactly when the request is Approved or Completed.
  CONSTRAINT resolution_matches_status
    CHECK ((status IN ('approved', 'completed')) = (resolution IS NOT NULL)),

  -- Rule 2: refund amount > 0 for Refund, and absent for every other resolution.
  CONSTRAINT refund_amount_matches_resolution
    CHECK (
      (resolution = 'refund' AND refund_amount IS NOT NULL AND refund_amount > 0)
      OR ((resolution IS NULL OR resolution <> 'refund') AND refund_amount IS NULL)
    )
);

-- Rule 3: one live request per (order, item). Partial unique index = race-proof.
-- Rejected/Completed free the slot, and so does a removed (soft-deleted) request.
CREATE UNIQUE INDEX uq_requests_one_live_per_item
  ON requests (order_ref, item_ref)
  WHERE status NOT IN ('rejected', 'completed') AND deleted_at IS NULL;

CREATE INDEX idx_requests_status     ON requests (status)     WHERE deleted_at IS NULL;
CREATE INDEX idx_requests_reason     ON requests (reason)     WHERE deleted_at IS NULL;
CREATE INDEX idx_requests_created_at ON requests (created_at DESC, id DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_requests_order_ref  ON requests (order_ref);

CREATE TABLE notes (
  id          BIGSERIAL PRIMARY KEY,
  request_id  BIGINT NOT NULL REFERENCES requests (id),
  body        TEXT NOT NULL CHECK (length(btrim(body)) > 0),
  author      TEXT NOT NULL DEFAULT 'agent',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notes_request ON notes (request_id, created_at, id);

-- Notes are append-only: block UPDATE and DELETE at the database level.
CREATE FUNCTION notes_are_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'notes are append-only and cannot be % ', lower(TG_OP);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_notes_immutable
  BEFORE UPDATE OR DELETE ON notes
  FOR EACH ROW EXECUTE FUNCTION notes_are_immutable();
