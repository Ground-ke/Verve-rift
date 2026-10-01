/**
 * JSON-LD Structured Data generator for Google Rich Results (Event Schema)
 */

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
      "Hauntings of the Rift, presented by Serve & Co., takes place on 31 October 2026 from 4 PM at Top Cliff Lodge in Nakuru.",
    image: [posterImage],
    startDate: "2026-10-31T16:00:00+03:00",
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    location: {
      "@type": "Place",
      name: "Top Cliff Lodge",
      address: {
        "@type": "PostalAddress",
        streetAddress: "Nakuru-Nairobi Highway, Free Area",
        addressLocality: "Nakuru",
        addressCountry: "KE",
      },
    },
    offers: {
      "@type": "AggregateOffer",
      url: `${siteUrl}/#tickets`,
      priceCurrency: "KES",
      lowPrice: "1000",
      highPrice: "3600",
      offerCount: "3",
      offers: [
        {
          "@type": "Offer",
          name: "Early Bird",
          price: "1000",
          priceCurrency: "KES",
          url: `${siteUrl}/checkout?tier=early-bird`,
        },
        {
          "@type": "Offer",
          "@type": "Offer",
          name: "Couple Pass",
          price: "1800",
          priceCurrency: "KES",
          url: `${siteUrl}/checkout?tier=couple-pass`,
        },
        {
          "@type": "Offer",
          name: "Group of Four",
          price: "3600",
          priceCurrency: "KES",
          url: `${siteUrl}/checkout?tier=group-of-four`,
        },
      ],
    },
    organizer: {
      "@type": "Organization",
      name: "Serve & Co.",
      url: "https://verve.co.ke",
      logo: `${siteUrl}/favicon.svg`,
    },
    typicalAgeRange: "18+",
  };
}
