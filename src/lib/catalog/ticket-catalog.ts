/**
 * Centralized Event & Ticket Catalog
 * Authoritative organizer-approved data shared across landing page, checkout, digital tickets, and SEO.
 */

export interface TicketCatalogTier {
  id: string;
  slug: string;
  name: string;
  priceKes: number;
  admitsCount: number;
  peopleLabel: string;
  note: string;
  description: string;
  totalInventory?: number | null;
  active: boolean;
}

export interface EventDetails {
  name: string;
  presentedBy: string;
  date: string;
  time: string;
  ageRequirement: string;
  dressCode: string;
  venueName: string;
  venueAddress: string;
  venueCity: string;
  fullVenueString: string;
  directionsUrl: string;
  mapEmbedUrl: string;
  supportEmail: string;
}

export const EVENT_DETAILS: EventDetails = {
  name: "Hauntings of the Rift",
  presentedBy: "Verve & Co.",
  date: "Saturday, 31 October 2026",
  time: "4:00 PM till late",
  ageRequirement: "18+",
  dressCode: "Wickedly Fabulous",
  venueName: "The Lawns Restaurant",
  venueAddress: "Oyster-Shell Rd, opposite Sarova Woodlands",
  venueCity: "Nakuru, Kenya",
  fullVenueString: "The Lawns Restaurant, Oyster-Shell Rd, opposite Sarova Woodlands, Nakuru",
  directionsUrl:
    "https://www.google.com/maps/search/?api=1&query=The+Lawns+Restaurant+Oyster-Shell+Rd+opposite+Sarova+Woodlands+Nakuru",
  mapEmbedUrl:
    "https://maps.google.com/maps?q=The+Lawns+Restaurant,+Oyster-Shell+Rd,+Nakuru&t=&z=15&ie=UTF8&iwloc=&output=embed",
  supportEmail: "verve.n.co.ke@gmail.com",
};

export const ORGANIZER_APPROVED_TIERS: TicketCatalogTier[] = [
  {
    id: "early-bird",
    slug: "early-bird",
    name: "Early Bird",
    priceKes: 1000,
    admitsCount: 1,
    peopleLabel: "Single entry",
    note: "Limited release pricing",
    description: "Single entry pass",
    totalInventory: 300,
    active: true,
  },
  {
    id: "couple-pass",
    slug: "couple-pass",
    name: "Couple Pass",
    priceKes: 1800,
    admitsCount: 2,
    peopleLabel: "Entry for two",
    note: "Arrive together",
    description: "Admits 2 guests together (1 shared QR pass)",
    totalInventory: 150,
    active: true,
  },
  {
    id: "group-of-four",
    slug: "group-of-four",
    name: "Group of Four",
    priceKes: 3200,
    admitsCount: 4,
    peopleLabel: "Entry for four",
    note: "Bring the whole crew",
    description: "Admits 4 guests together (1 shared QR bundle)",
    totalInventory: 75,
    active: true,
  },
];

export async function fetchLiveTicketTiers(): Promise<{
  success: boolean;
  tiers: TicketCatalogTier[];
  error?: string;
}> {
  try {
    const res = await fetch("/api/ticket-tiers", {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });

    if (!res.ok) {
      return {
        success: false,
        tiers: [],
        error: `Server responded with status ${res.status}: ${res.statusText}`,
      };
    }

    const data = await res.json();
    if (!data || !data.success || !Array.isArray(data.tiers) || data.tiers.length === 0) {
      return {
        success: false,
        tiers: [],
        error: data?.error || "Invalid response format from live pricing service.",
      };
    }

    const mappedTiers: TicketCatalogTier[] = data.tiers
      .filter((t: { active?: boolean }) => t.active !== false)
      .map((t: { slug: string; name: string; priceKes: number; admitsCount: number; totalInventory?: number }) => {
        const fallback = ORGANIZER_APPROVED_TIERS.find((def) => def.slug === t.slug);
        return {
          id: t.slug,
          slug: t.slug,
          name: t.name || fallback?.name || "Pass",
          priceKes: Number(t.priceKes) || fallback?.priceKes || 1000,
          admitsCount: Number(t.admitsCount) || fallback?.admitsCount || 1,
          peopleLabel:
            fallback?.peopleLabel ||
            (t.admitsCount === 1 ? "Single entry" : `Entry for ${t.admitsCount}`),
          note: fallback?.note || "Official release pricing",
          description:
            fallback?.description ||
            (t.admitsCount === 1
              ? "Single entry pass"
              : `Admits ${t.admitsCount} guests together (1 QR bundle)`),
          totalInventory: t.totalInventory,
          active: true,
        };
      });

    return {
      success: true,
      tiers: mappedTiers.length > 0 ? mappedTiers : ORGANIZER_APPROVED_TIERS,
    };
  } catch (err) {
    return {
      success: false,
      tiers: [],
      error: err instanceof Error ? err.message : "Network error contacting ticket service.",
    };
  }
}
