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
  venueName: "Top Cliff Lodge",
  venueAddress: "Nakuru-Nairobi Highway, Free Area",
  venueCity: "Nakuru, Kenya",
  fullVenueString: "Top Cliff Lodge, Nakuru-Nairobi Highway, Free Area, Nakuru",
  directionsUrl: "https://www.google.com/maps/search/?api=1&query=Top+Cliff+Lodge+Nakuru",
  mapEmbedUrl:
    "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d17142.074061299183!2d36.14178365044336!3d-0.29953316327871576!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x18299230cc8c9a8f%3A0xaee91de6af909e81!2sTop%20Cliff%20Lodge!5e0!3m2!1sen!2ske!4v1790188374041!5m2!1sen!2ske",
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
    note: "Single entry",
    description: "Single entry pass",
    totalInventory: null,
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
    totalInventory: null,
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
    totalInventory: null,
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
      .map(
        (t: {
          slug: string;
          name: string;
          priceKes: number;
          admitsCount: number;
          totalInventory?: number;
        }) => {
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
        },
      );

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
