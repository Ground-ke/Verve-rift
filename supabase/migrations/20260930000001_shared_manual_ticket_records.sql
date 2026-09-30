-- Durable authoritative records for manually reviewed M-Pesa ticket orders.
-- These tables intentionally avoid depending on the legacy `orders` columns,
-- which are incompatible with the current order service's customer/order model.
CREATE TABLE IF NOT EXISTS public.manual_ticket_orders (
  id TEXT PRIMARY KEY,
  order_number TEXT NOT NULL UNIQUE,
  idempotency_key TEXT UNIQUE,
  ticket_type_id TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  status TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  mpesa_code TEXT,
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS manual_ticket_orders_status_created_idx
  ON public.manual_ticket_orders (status, updated_at DESC);
CREATE INDEX IF NOT EXISTS manual_ticket_orders_inventory_idx
  ON public.manual_ticket_orders (ticket_type_id, status, expires_at);
CREATE INDEX IF NOT EXISTS manual_ticket_orders_mpesa_code_idx
  ON public.manual_ticket_orders (mpesa_code)
  WHERE mpesa_code IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.manual_ticket_reservations (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES public.manual_ticket_orders(id) ON DELETE RESTRICT,
  ticket_type_id TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  expires_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'completed', 'expired', 'released')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (order_id)
);

CREATE INDEX IF NOT EXISTS manual_ticket_reservations_inventory_idx
  ON public.manual_ticket_reservations (ticket_type_id, status, expires_at);

CREATE TABLE IF NOT EXISTS public.manual_ticket_records (
  ticket_number TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES public.manual_ticket_orders(id) ON DELETE RESTRICT,
  status TEXT NOT NULL CHECK (status IN ('valid', 'used', 'cancelled', 'refunded')),
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS manual_ticket_records_order_idx
  ON public.manual_ticket_records (order_id);

CREATE TABLE IF NOT EXISTS public.manual_ticket_issuance_keys (
  idempotency_key TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES public.manual_ticket_orders(id) ON DELETE RESTRICT,
  status TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'failed')),
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.manual_ticket_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manual_ticket_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manual_ticket_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manual_ticket_issuance_keys ENABLE ROW LEVEL SECURITY;
