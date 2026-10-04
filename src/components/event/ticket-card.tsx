import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Users } from "lucide-react";
import { Button } from "@/components/ui/button";

export type Ticket = {
  name: string;
  price: number;
  people: string;
  note: string;
  slug?: string;
  soldOut?: boolean;
};

export function TicketCard({ ticket, featured = false }: { ticket: Ticket; featured?: boolean }) {
  const ticketParam = ticket.slug || ticket.name.toLowerCase().replaceAll(" ", "-");
  const isSoldOut = Boolean(ticket.soldOut);

  return (
    <article
      className={`group relative flex min-h-80 flex-col justify-between overflow-hidden border p-6 transition-transform ${
        isSoldOut
          ? "border-border/60 bg-card/50 opacity-65"
          : featured
            ? "border-primary bg-oxblood hover:-translate-y-1"
            : "border-border bg-card hover:-translate-y-1"
      }`}
    >
      {isSoldOut ? (
        <span className="absolute right-0 top-0 bg-muted px-3 py-1 text-xs font-bold uppercase tracking-widest text-muted-foreground">
          Sold out
        </span>
      ) : (
        featured && (
          <span className="absolute right-0 top-0 bg-primary px-3 py-1 text-xs font-bold uppercase tracking-widest text-primary-foreground">
            Best crew value
          </span>
        )
      )}
      <div>
        <Users className="mb-8 size-5 text-lavender" aria-hidden="true" />
        <h3 className="text-3xl font-semibold text-bone">{ticket.name}</h3>
        <p className="mt-2 text-sm uppercase tracking-widest text-muted-foreground">
          {ticket.people}
        </p>
      </div>
      <div>
        <div className="mb-5 border-t border-bone/15 pt-5">
          <span className="text-sm text-bone-muted">KES</span>{" "}
          <strong className="font-display text-4xl text-bone">
            {ticket.price.toLocaleString()}
          </strong>
          <p className="mt-2 text-sm text-muted-foreground">{ticket.note}</p>
        </div>
        {isSoldOut ? (
          <Button variant="spectral" size="xl" className="w-full cursor-not-allowed" disabled>
            Sold out
          </Button>
        ) : (
          <Button asChild variant={featured ? "bone" : "event"} size="xl" className="w-full">
            <Link to="/checkout" search={{ ticket: ticketParam }}>
              Get ticket <ArrowUpRight />
            </Link>
          </Button>
        )}
      </div>
    </article>
  );
}
