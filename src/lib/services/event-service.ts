import { supabaseClient } from "../supabase/client";
import type { Database } from "../database.types";

export type EventRecord = Database["public"]["Tables"]["events"]["Row"];
export type TicketTypeRecord = Database["public"]["Tables"]["ticket_types"]["Row"];
export type PromotionRecord = Database["public"]["Tables"]["promotions"]["Row"];

export interface EventData {
  event: EventRecord;
  ticketTypes: TicketTypeRecord[];
  activePromotions: PromotionRecord[];
  isConfiguredFromDatabase: boolean;
}

// Baseline known configuration (strictly NO invented inventory or capacity)
export const DEFAULT_EVENT: EventRecord = {
  id: "00000000-0000-0000-0000-000000000001",
  slug: "hauntings-of-the-rift-2026",
  name: "Hauntings of the Rift",
  tagline: "Presented by Verve & Co.",
  description:
    "A premier Halloween nightlife experience in Nakuru. High-energy electronic atmosphere, curated music, and immersive soundscapes.",
  venue_name: "The Lawns Restaurant",
  venue_address: "Oyster-Shell Rd, opposite Sarova Woodlands, Nakuru",
  venue_directions: "Oyster-Shell Rd, opposite Sarova Woodlands, Nakuru",
  event_date: "2026-10-31",
  start_time: "16:00:00",
  end_time: null,
  age_requirement: "18+",
  dress_code: "Wickedly Fabulous",
  capacity: null, // NOT INVENTED
  sales_status: "scheduled",
  is_active: true,
  created_at: "2026-08-31T00:00:00Z",
  updated_at: "2026-08-31T00:00:00Z",
};

export const DEFAULT_TICKET_TYPES: TicketTypeRecord[] = [
  {
    id: "00000000-0000-0000-0000-000000000011",
    event_id: "00000000-0000-0000-0000-000000000001",
    slug: "early-bird",
    name: "Early Bird",
    description:
      "General admission for one guest. Access to all stages, main floor, and themed experiences.",
    admits_count: 1,
    price_kes: 1000,
    total_inventory: null, // NOT INVENTED
    reserved_count: 0,
    sold_count: 0,
    purchase_limit: 10,
    sales_start: null,
    sales_end: null,
    is_configured: false,
    active: true,
    sort_order: 1,
    created_at: "2026-08-31T00:00:00Z",
    updated_at: "2026-08-31T00:00:00Z",
  },
  {
    id: "00000000-0000-0000-0000-000000000012",
    event_id: "00000000-0000-0000-0000-000000000001",
    slug: "couple-pass",
    name: "Couple Pass",
    description:
      "Dual admission pass admitting two guests on a single entry token. Ideal for duos and partners.",
    admits_count: 2,
    price_kes: 1800,
    total_inventory: null, // NOT INVENTED
    reserved_count: 0,
    sold_count: 0,
    purchase_limit: 5,
    sales_start: null,
    sales_end: null,
    is_configured: false,
    active: true,
    sort_order: 2,
    created_at: "2026-08-31T00:00:00Z",
    updated_at: "2026-08-31T00:00:00Z",
  },
  {
    id: "00000000-0000-0000-0000-000000000013",
    event_id: "00000000-0000-0000-0000-000000000001",
    slug: "group-of-four",
    name: "Group of Four",
    description:
      "Squad bundle admitting four guests. Fast-track entry together with dedicated group wristbands.",
    admits_count: 4,
    price_kes: 3200,
    total_inventory: null, // NOT INVENTED
    reserved_count: 0,
    sold_count: 0,
    purchase_limit: 3,
    sales_start: null,
    sales_end: null,
    is_configured: false,
    active: true,
    sort_order: 3,
    created_at: "2026-08-31T00:00:00Z",
    updated_at: "2026-08-31T00:00:00Z",
  },
];

export async function fetchEventData(eventSlug = "hauntings-of-the-rift-2026"): Promise<EventData> {
  if (!supabaseClient) {
    return {
      event: DEFAULT_EVENT,
      ticketTypes: DEFAULT_TICKET_TYPES,
      activePromotions: [],
      isConfiguredFromDatabase: false,
    };
  }

  try {
    const { data: eventData, error: eventError } = await supabaseClient
      .from("events")
      .select("*")
      .eq("slug", eventSlug)
      .maybeSingle();

    if (eventError || !eventData) {
      return {
        event: DEFAULT_EVENT,
        ticketTypes: DEFAULT_TICKET_TYPES,
        activePromotions: [],
        isConfiguredFromDatabase: false,
      };
    }

    const { data: ticketTypesData, error: ticketError } = await supabaseClient
      .from("ticket_types")
      .select("*")
      .eq("event_id", eventData.id)
      .eq("active", true)
      .order("sort_order", { ascending: true });

    const { data: promotionsData } = await supabaseClient
      .from("promotions")
      .select("*")
      .eq("event_id", eventData.id)
      .eq("active", true);

    return {
      event: eventData,
      ticketTypes:
        ticketError || !ticketTypesData || ticketTypesData.length === 0
          ? DEFAULT_TICKET_TYPES
          : ticketTypesData,
      activePromotions: promotionsData ?? [],
      isConfiguredFromDatabase: true,
    };
  } catch {
    return {
      event: DEFAULT_EVENT,
      ticketTypes: DEFAULT_TICKET_TYPES,
      activePromotions: [],
      isConfiguredFromDatabase: false,
    };
  }
}
