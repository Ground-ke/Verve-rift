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
      lowPrice: "1500",
      highPrice: "6900",
      offerCount: "5",
      offers: [
        {
          "@type": "Offer",
          name: "Early Bird",
          price: "1000",
          priceCurrency: "KES",
          availability: "https://schema.org/SoldOut",
          url: `${siteUrl}/checkout?ticket=early-bird`,
        },
        {
          "@type": "Offer",
          name: "Revenant",
          price: "1500",
          priceCurrency: "KES",
          url: `${siteUrl}/checkout?ticket=revenant`,
        },
        {
          "@type": "Offer",
          name: "Soulbound",
          price: "2800",
          priceCurrency: "KES",
          url: `${siteUrl}/checkout?ticket=soulbound`,
        },
        {
          "@type": "Offer",
          name: "Coven",
          price: "5000",
          priceCurrency: "KES",
          url: `${siteUrl}/checkout?ticket=coven`,
        },
        {
          "@type": "Offer",
          name: "Outcasts",
          price: "6900",
          priceCurrency: "KES",
          url: `${siteUrl}/checkout?ticket=outcasts`,
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
