-- ==============================================================================
-- HAUNTINGS OF THE RIFT — CONSOLIDATED FRESH DATABASE BOOTSTRAP
-- Idempotent schema definition for a brand-new Supabase project.
-- Contains only tables, types, functions, and RLS policies used by live code.
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 1. ENUMS & SHARED TRIGGER FUNCTIONS
-- ==============================================================================
DO $$ BEGIN
  CREATE TYPE public.event_sales_status AS ENUM ('scheduled', 'on_sale', 'paused', 'sold_out', 'completed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'scanner');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ==============================================================================
-- 2. STAFF ROLES & RBAC HELPER FUNCTIONS (public.user_roles)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON public.user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role ON public.user_roles(role);

DROP TRIGGER IF EXISTS set_user_roles_updated_at ON public.user_roles;
CREATE TRIGGER set_user_roles_updated_at
  BEFORE UPDATE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  );
$$;

CREATE OR REPLACE FUNCTION public.is_admin(_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'admin'::public.app_role);
$$;

CREATE OR REPLACE FUNCTION public.is_staff(_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('admin'::public.app_role, 'scanner'::public.app_role)
  );
$$;

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;
CREATE POLICY "Users can view their own roles"
  ON public.user_roles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;
CREATE POLICY "Admins can view all roles"
  ON public.user_roles
  FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can insert roles" ON public.user_roles;
CREATE POLICY "Admins can insert roles"
  ON public.user_roles
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can update roles" ON public.user_roles;
CREATE POLICY "Admins can update roles"
  ON public.user_roles
  FOR UPDATE
  TO authenticated
  USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can delete roles" ON public.user_roles;
CREATE POLICY "Admins can delete roles"
  ON public.user_roles
  FOR DELETE
  TO authenticated
  USING (public.is_admin(auth.uid()));

-- ==============================================================================
-- 3. CATALOG TABLES: events, ticket_types, promotions
--    (Read by src/lib/services/event-service.ts)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  tagline TEXT,
  description TEXT,
  venue_name TEXT NOT NULL,
  venue_address TEXT NOT NULL,
  venue_directions TEXT,
  event_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME,
  age_requirement TEXT DEFAULT '18+',
  dress_code TEXT,
  capacity INTEGER CHECK (capacity IS NULL OR capacity >= 0),
  sales_status public.event_sales_status NOT NULL DEFAULT 'scheduled',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS set_events_updated_at ON public.events;
CREATE TRIGGER set_events_updated_at
  BEFORE UPDATE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view active events" ON public.events;
CREATE POLICY "Public can view active events"
  ON public.events
  FOR SELECT
  USING (is_active = true);

DROP POLICY IF EXISTS "Admins can manage events" ON public.events;
CREATE POLICY "Admins can manage events"
  ON public.events
  FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE TABLE IF NOT EXISTS public.ticket_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  admits_count INTEGER NOT NULL DEFAULT 1 CHECK (admits_count > 0),
  price_kes INTEGER NOT NULL CHECK (price_kes >= 0),
  total_inventory INTEGER CHECK (total_inventory IS NULL OR total_inventory >= 0),
  sold_count INTEGER NOT NULL DEFAULT 0 CHECK (sold_count >= 0),
  reserved_count INTEGER NOT NULL DEFAULT 0 CHECK (reserved_count >= 0),
  max_per_order INTEGER NOT NULL DEFAULT 4 CHECK (max_per_order > 0),
  sale_starts_at TIMESTAMPTZ,
  sale_ends_at TIMESTAMPTZ,
  is_configured BOOLEAN NOT NULL DEFAULT false,
  active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (event_id, slug),
  CONSTRAINT valid_inventory_bounds CHECK (
    total_inventory IS NULL OR (sold_count + reserved_count <= total_inventory)
  )
);

CREATE INDEX IF NOT EXISTS idx_ticket_types_event_id ON public.ticket_types(event_id);

DROP TRIGGER IF EXISTS set_ticket_types_updated_at ON public.ticket_types;
CREATE TRIGGER set_ticket_types_updated_at
  BEFORE UPDATE ON public.ticket_types
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.ticket_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view active ticket types" ON public.ticket_types;
CREATE POLICY "Public can view active ticket types"
  ON public.ticket_types
  FOR SELECT
  USING (active = true);

DROP POLICY IF EXISTS "Admins can manage ticket types" ON public.ticket_types;
CREATE POLICY "Admins can manage ticket types"
  ON public.ticket_types
  FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE TABLE IF NOT EXISTS public.promotions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  discount_type TEXT NOT NULL CHECK (discount_type IN ('percentage', 'fixed')),
  discount_value INTEGER NOT NULL CHECK (discount_value > 0),
  max_uses INTEGER CHECK (max_uses IS NULL OR max_uses > 0),
  current_uses INTEGER NOT NULL DEFAULT 0 CHECK (current_uses >= 0),
  min_order_amount_kes INTEGER NOT NULL DEFAULT 0 CHECK (min_order_amount_kes >= 0),
  valid_from TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT valid_percentage_discount CHECK (
    (discount_type = 'percentage' AND discount_value <= 100) OR (discount_type = 'fixed')
  ),
  CONSTRAINT valid_promo_usage CHECK (
    max_uses IS NULL OR current_uses <= max_uses
  )
);

CREATE INDEX IF NOT EXISTS idx_promotions_code ON public.promotions(code);
CREATE INDEX IF NOT EXISTS idx_promotions_active ON public.promotions(is_active);

DROP TRIGGER IF EXISTS set_promotions_updated_at ON public.promotions;
CREATE TRIGGER set_promotions_updated_at
  BEFORE UPDATE ON public.promotions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.promotions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view all promotions" ON public.promotions;
CREATE POLICY "Admins can view all promotions"
  ON public.promotions
  FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can insert promotions" ON public.promotions;
CREATE POLICY "Admins can insert promotions"
  ON public.promotions
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can update promotions" ON public.promotions;
CREATE POLICY "Admins can update promotions"
  ON public.promotions
  FOR UPDATE
  TO authenticated
  USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can delete promotions" ON public.promotions;
CREATE POLICY "Admins can delete promotions"
  ON public.promotions
  FOR DELETE
  TO authenticated
  USING (public.is_admin(auth.uid()));

-- ==============================================================================
-- 4. AUDIT LOGS & CHECK-IN LOGS
--    (audit_logs uses varchar/text id, actor_id, and target_id plus actor_email & actor_role)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id VARCHAR(128) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  actor_id VARCHAR(128),
  actor_email VARCHAR(255),
  actor_role VARCHAR(32) DEFAULT 'admin',
  action VARCHAR(128) NOT NULL,
  target_table VARCHAR(64) NOT NULL,
  target_id VARCHAR(128),
  metadata JSONB DEFAULT '{}'::jsonb,
  ip_address VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_id ON public.audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON public.audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at DESC);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view audit logs" ON public.audit_logs;
CREATE POLICY "Admins can view audit logs"
  ON public.audit_logs
  FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Staff can insert audit logs" ON public.audit_logs;
CREATE POLICY "Staff can insert audit logs"
  ON public.audit_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_staff(auth.uid()));

CREATE TABLE IF NOT EXISTS public.check_in_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id TEXT,
  ticket_code TEXT NOT NULL,
  event_id TEXT NOT NULL DEFAULT 'hauntings-of-the-rift-2026',
  scanned_by TEXT NOT NULL,
  gate_location TEXT DEFAULT 'Main Entrance',
  scan_status TEXT NOT NULL CHECK (scan_status IN ('valid', 'duplicate', 'invalid')),
  scanned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  device_info JSONB DEFAULT '{}'::jsonb,
  ip_address TEXT
);

CREATE INDEX IF NOT EXISTS idx_check_in_logs_ticket_code ON public.check_in_logs(ticket_code);
CREATE INDEX IF NOT EXISTS idx_check_in_logs_scanned_at ON public.check_in_logs(scanned_at DESC);

ALTER TABLE public.check_in_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can view check_in_logs" ON public.check_in_logs;
CREATE POLICY "Staff can view check_in_logs"
  ON public.check_in_logs
  FOR SELECT
  TO authenticated
  USING (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff can insert check_in_logs" ON public.check_in_logs;
CREATE POLICY "Staff can insert check_in_logs"
  ON public.check_in_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_staff(auth.uid()));

-- ==============================================================================
-- 5. SHARED MANUAL TICKET RECORDS (Verbatim from 20260930000001)
-- ==============================================================================
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

-- ==============================================================================
-- 6. P1 PAYMENT OPERATIONS & NOTIFICATION OUTBOX (Verbatim from 20261101000001)
-- ==============================================================================
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
