CREATE TABLE IF NOT EXISTS public.manual_payment_receipts (
  id UUID PRIMARY KEY,
  order_id TEXT NOT NULL UNIQUE REFERENCES public.manual_ticket_orders(id) ON DELETE RESTRICT,
  receipt_reference TEXT NOT NULL UNIQUE,
  amount_kes INTEGER NOT NULL CHECK (amount_kes > 0),
  received_at TIMESTAMPTZ NOT NULL,
  recorded_by TEXT NOT NULL,
  evidence_note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.manual_payment_receipt_reviews (
  id UUID PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES public.manual_ticket_orders(id) ON DELETE RESTRICT,
  submitted_reference TEXT NOT NULL,
  receipt_reference TEXT NOT NULL,
  expected_amount_kes INTEGER NOT NULL CHECK (expected_amount_kes > 0),
  received_amount_kes INTEGER NOT NULL CHECK (received_amount_kes >= 0),
  status TEXT NOT NULL CHECK (status IN ('accepted', 'amount_mismatch', 'duplicate_reference')),
  recorded_by TEXT NOT NULL,
  evidence_note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS manual_payment_receipt_reviews_order_idx
  ON public.manual_payment_receipt_reviews (order_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.manual_payment_settlements (
  id UUID PRIMARY KEY,
  settlement_reference TEXT NOT NULL UNIQUE,
  amount_kes INTEGER NOT NULL CHECK (amount_kes > 0),
  settled_at TIMESTAMPTZ NOT NULL,
  recorded_by TEXT NOT NULL,
  evidence_note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS manual_payment_settlements_settled_at_idx
  ON public.manual_payment_settlements (settled_at DESC);

CREATE TABLE IF NOT EXISTS public.manual_ticket_refunds (
  id UUID PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES public.manual_ticket_orders(id) ON DELETE RESTRICT,
  ticket_number TEXT NOT NULL REFERENCES public.manual_ticket_records(ticket_number) ON DELETE RESTRICT,
  amount_kes INTEGER NOT NULL CHECK (amount_kes > 0),
  original_amount_kes INTEGER NOT NULL CHECK (original_amount_kes > 0),
  reason TEXT NOT NULL,
  refund_type TEXT NOT NULL CHECK (refund_type IN ('full', 'partial')),
  reversal_reference TEXT NOT NULL UNIQUE,
  processed_by TEXT NOT NULL,
  external_reversal_processed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (amount_kes <= original_amount_kes),
  CHECK (
    (refund_type = 'full' AND amount_kes = original_amount_kes)
    OR (refund_type = 'partial' AND amount_kes < original_amount_kes)
  )
);

CREATE INDEX IF NOT EXISTS manual_ticket_refunds_ticket_idx
  ON public.manual_ticket_refunds (ticket_number, created_at DESC);

CREATE TABLE IF NOT EXISTS public.manual_payment_audit_events (
  id UUID PRIMARY KEY,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  target_table TEXT NOT NULL,
  target_id TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS manual_payment_audit_events_target_idx
  ON public.manual_payment_audit_events (target_table, target_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.notification_outbox (
  id UUID PRIMARY KEY,
  dedupe_key TEXT UNIQUE,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'whatsapp')),
  notification_type TEXT NOT NULL,
  recipient TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued', 'processing', 'accepted', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  provider_message_id TEXT,
  provider_status TEXT,
  provider_response JSONB,
  last_error TEXT,
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS notification_outbox_due_idx
  ON public.notification_outbox (status, available_at, created_at);
CREATE INDEX IF NOT EXISTS notification_outbox_recipient_idx
  ON public.notification_outbox (recipient, created_at DESC);

ALTER TABLE public.manual_payment_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manual_payment_receipt_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manual_payment_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manual_ticket_refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manual_payment_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_outbox ENABLE ROW LEVEL SECURITY;
