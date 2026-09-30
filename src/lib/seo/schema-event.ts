/**
 * JSON-LD Structured Data generator for Google Rich Results (Event Schema)
 * Uses authoritative organizer-approved event catalog and verified location data.
 */

import { EVENT_DETAILS, ORGANIZER_APPROVED_TIERS } from "@/lib/catalog/ticket-catalog";

export interface EventSchemaOptions {
  url?: string;
  imageUrl?: string;
}

export function generateEventJsonLd(options: EventSchemaOptions = {}) {
  const siteUrl = options.url || "https://hauntingsoftherift.co.ke";
  const posterImage = options.imageUrl || `${siteUrl}/rift-night.jpg`;

  return {
    "@context": "https://schema.org",
    "@type": "Event",
    name: "Hauntings of the Rift — Halloween Nightlife 2026",
    description:
      "A premium Halloween nightlife and sensory masquerade experience in Nakuru, presented by Verve & Co. at The Lawns Restaurant.",
    image: [posterImage],
    startDate: "2026-10-31T16:00:00+03:00",
    endDate: "2026-11-01T04:00:00+03:00",
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    location: {
      "@type": "Place",
      name: EVENT_DETAILS.venueName,
      address: {
        "@type": "PostalAddress",
        streetAddress: EVENT_DETAILS.venueAddress,
        addressLocality: "Nakuru",
        addressRegion: "Rift Valley",
        postalCode: "20100",
        addressCountry: "KE",
      },
      geo: {
        "@type": "GeoCoordinates",
        latitude: -0.2929,
        longitude: 36.0898,
      },
    },
    offers: {
      "@type": "AggregateOffer",
      url: `${siteUrl}/#tickets`,
      priceCurrency: "KES",
      lowPrice: "1000",
      highPrice: "3200",
      offerCount: String(ORGANIZER_APPROVED_TIERS.length),
      availability: "https://schema.org/InStock",
      validFrom: "2026-08-01T00:00:00+03:00",
      offers: ORGANIZER_APPROVED_TIERS.map((tier) => ({
        "@type": "Offer",
        name: tier.name,
        price: String(tier.priceKes),
        priceCurrency: "KES",
        availability: "https://schema.org/InStock",
        url: `${siteUrl}/checkout?ticket=${tier.slug}`,
      })),
    },
    organizer: {
      "@type": "Organization",
      name: EVENT_DETAILS.presentedBy,
      url: "https://verve.co.ke",
      logo: `${siteUrl}/favicon.svg`,
      email: EVENT_DETAILS.supportEmail,
    },
    typicalAgeRange: EVENT_DETAILS.ageRequirement,
  };
}
