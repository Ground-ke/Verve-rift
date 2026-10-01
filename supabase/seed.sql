-- ==============================================================================
-- HAUNTINGS OF THE RIFT — INITIAL SEED DATA (GATE 2)
-- Strict Rule: No invented inventory, capacity, or promotional quantities.
-- ==============================================================================

DO $$
DECLARE
  v_event_id UUID;
BEGIN
  -- Insert official Event entity
  INSERT INTO public.events (
    slug,
    name,
    tagline,
    description,
    venue_name,
    venue_address,
    venue_directions,
    event_date,
    start_time,
    age_requirement,
    dress_code,
    capacity, -- Set to NULL: not invented
    sales_status,
    is_active
  ) VALUES (
    'hauntings-of-the-rift-2026',
    'Hauntings of the Rift',
    'Presented by Serve & Co.',
    'A premier Halloween nightlife experience in Nakuru. High-energy electronic atmosphere, curated signature cocktails, and immersive soundscapes.',
    'Top Cliff Lodge',
    'Nakuru-Nairobi Highway, Free Area, Nakuru, Kenya',
    'Nakuru-Nairobi Highway, Free Area, Nakuru',
    '2026-10-31',
    '16:00:00',
    '18+',
    'Wickedly Fabulous',
    NULL, -- Capacity not yet configured by organizer
    'scheduled',
    true
  )
  ON CONFLICT (slug) DO UPDATE
  SET name = EXCLUDED.name,
      venue_name = EXCLUDED.venue_name,
      venue_address = EXCLUDED.venue_address
  RETURNING id INTO v_event_id;

  -- 1. Early Bird — KES 1,000 (Admits 1)
  INSERT INTO public.ticket_types (
    event_id,
    slug,
    name,
    description,
    admits_count,
    price_kes,
    total_inventory, -- NULL: Not yet configured
    is_configured, -- false: Must be configured in admin before public checkout
    active,
    sort_order
  ) VALUES (
    v_event_id,
    'early-bird',
    'Early Bird',
    'General admission for one guest. Access to all stages, main floor, and themed experiences.',
    1,
    1000,
    NULL,
    false,
    true,
    1
  )
  ON CONFLICT (event_id, slug) DO UPDATE
  SET price_kes = EXCLUDED.price_kes,
      admits_count = EXCLUDED.admits_count;

  -- 2. Couple Ticket — KES 1,800 (Admits 2)
  INSERT INTO public.ticket_types (
    event_id,
    slug,
    name,
    description,
    admits_count,
    price_kes,
    total_inventory, -- NULL: Not yet configured
    is_configured, -- false: Must be configured in admin before public checkout
    active,
    sort_order
  ) VALUES (
    v_event_id,
    'couple-pass',
    'Couple Pass',
    'Dual admission pass admitting two guests on a single entry token. Ideal for duos and partners.',
    2,
    1800,
    NULL,
    false,
    true,
    2
  )
  ON CONFLICT (event_id, slug) DO UPDATE
  SET price_kes = EXCLUDED.price_kes,
      admits_count = EXCLUDED.admits_count;

  -- 3. Group of Four — KES 3,200 (Admits 4)
  INSERT INTO public.ticket_types (
    event_id,
    slug,
    name,
    description,
    admits_count,
    price_kes,
    total_inventory, -- NULL: Not yet configured
    is_configured, -- false: Must be configured in admin before public checkout
    active,
    sort_order
  ) VALUES (
    v_event_id,
    'group-of-four',
    'Group of Four',
    'Squad bundle admitting four guests. Fast-track entry together with dedicated group wristbands.',
    4,
    3200,
    NULL,
    false,
    true,
    3
  )
  ON CONFLICT (event_id, slug) DO UPDATE
  SET price_kes = EXCLUDED.price_kes,
      admits_count = EXCLUDED.admits_count;

END $$;
