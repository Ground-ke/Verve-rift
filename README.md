# Rift's Embrace

HAUNTINGS OF THE RIFT — FRONTEND & UX DESIGN FOUNDATION

I am building a premium event website for Hauntings of the Rift, presented by Serve & Co., targeting a young adult audience in Nakuru, Kenya.

I have attached the official event poster.

Use the attached poster as the primary visual source of truth for the event's identity.

Do NOT simply reproduce the poster as a webpage.

Instead, translate its visual identity into a modern, immersive, mobile-first event website designed to:

Market and create excitement around the event

Convert visitors into ticket buyers

Encourage WhatsApp/social sharing

Create urgency around limited tickets and promotions

Establish a visual foundation that can later be connected to a real M-Pesa ticketing backend

1. EVENT INFORMATION

Use the information visible on the poster.

Current known information:

Event: Hauntings of the Rift
Presented by: Serve & Co.
Date: Saturday, October 31, 2026
Time: 4 PM till late
Venue: Top Cliff Lodge, Nakuru-Nairobi Highway, Free Area, Nakuru
Age: 18+
Dress Code: Wickedly Fabulous

Current ticket tiers shown on the poster:

Early Bird — KES 1,000

Couple — KES 1,800

Group of Four — KES 3,200

Do not invent additional event information.

If information is missing, use a tasteful placeholder or clearly mark it as content that will be configurable later.

2. DESIGN DIRECTION

Analyze the attached poster before designing.

Extract its:

Color palette

Typography character

Visual hierarchy

Gothic/horror elements

Image treatment

Decorative motifs

Brand personality

Overall emotional atmosphere

The existing visual language appears to communicate:

dark + mysterious + premium + playful + gothic + nightlife + Halloween

The website should preserve that personality.

Core visual direction

Think:

"Premium Halloween nightlife experience in Nakuru."

NOT:

Generic Halloween website

Generic AI-generated landing page

Corporate event website

SaaS dashboard

Children's Halloween site

Overly scary/gory horror site

The aesthetic should feel wickedly sophisticated rather than childish.

3. DESIGN PRINCIPLES

Prioritize:

Visual impact

The first screen should immediately make someone think:

"I need to know more about this event."

Clarity

The user should understand:

What the event is

When it is

Where it is

How much tickets cost

How to buy

within seconds.

Conversion

The primary action throughout the website is:

BUY TICKETS

This CTA should be visually dominant without becoming annoying.

Shareability

Design the experience around people discovering the event through:

WhatsApp

Instagram

TikTok

Facebook

Direct links

WhatsApp is especially important because this event targets the Kenyan market.

Mobile-first

Assume a significant percentage of visitors will arrive from a WhatsApp or Instagram link on an Android phone.

Design for:

360px width and above

Touch interaction

Small screens

Mobile data

Fast loading

Desktop should be an enhancement of the mobile experience, not the other way around.

4. LANDING PAGE EXPERIENCE

Create a polished long-form event landing page.

The page should have the following structure.

SECTION 1 — HERO

This is the most important section.

Use the poster imagery and visual identity without simply placing the poster in the background.

Include:

HAUNTINGS OF THE RIFT

A strong supporting line inspired by the poster:

Something is stirring beneath Nakuru.

Then clearly display:

31 OCTOBER 2026

TOP CLIFF LODGE • NAKURU

4 PM — LATE

Include a live countdown to the event.

Primary CTA:

BUY TICKETS

Secondary action:

SHARE EVENT

The hero should feel immersive and cinematic.

Use subtle atmospheric motion such as:

drifting particles

subtle grain

smoke/fog

slow background movement

gentle glow

restrained parallax

Do NOT use heavy video backgrounds or animations that hurt performance.

5. HERO MOBILE PRIORITY

On mobile, the hierarchy should be extremely clear:

Event name

Date

Location

Countdown

BUY TICKETS

Do not make the user hunt for the ticket button.

Consider a subtle sticky mobile CTA:

🎟 BUY TICKETS

that appears after the user scrolls beyond the hero.

6. EVENT EXPERIENCE SECTION

Create a visually compelling section answering:

"What awaits?"

Use 3–4 experience cards.

Examples of categories rather than invented promises:

Atmosphere

Music

Costumes

Nightlife

Social experience

Do not invent performers, DJs, food, drinks, prizes, or activities unless they are actually present in the supplied material.

Use placeholders where necessary.

Each card should feel visually connected to the poster.

7. TICKETS SECTION

Create a highly polished ticket selection section.

Heading:

CHOOSE YOUR TICKET

Display:

EARLY BIRD

KES 1,000

COUPLE

KES 1,800

GROUP OF FOUR

KES 3,200

Make the pricing hierarchy obvious.

Use visual emphasis for the recommended/high-value option where appropriate, but do not falsely claim that a ticket is "most popular" unless we have actual data.

Each card should have:

GET TICKET

The frontend should be designed so these cards can later connect to a real ticketing backend.

Do NOT implement fake payment functionality.

Use realistic interaction states:

Available

Almost sold out

Sold out

Flash sale

Sale ended

but only show those states when they are backed by data later.

For now, create the visual system/components needed to support them.

8. URGENCY / COUNTDOWN COMPONENT

Create a reusable promotional component that can later support:

FLASH SALE

KES 1,000

KES 750

Only 50 available

Sale ends in:

02 : 14 : 37

Include:

countdown

progress/remaining indicator

clear CTA

However, do not hardcode fake scarcity into the live experience.

Build the component as a reusable frontend component that can later receive real data from the backend.

9. WHY ATTEND / SOCIAL ENERGY

Create a section that communicates the social nature of the event.

Use concise, high-energy copy.

The design should encourage visitors to imagine:

"Who am I going with?"

Create a prominent share CTA:

BRING YOUR CREW

Then:

Share this event

with WhatsApp as the primary share option.

Also provide:

Copy link

Instagram

Facebook

X where appropriate

Do not require users to log in to share the event.

10. VENUE SECTION

Create a clean venue section containing:

Top Cliff Lodge

Nakuru-Nairobi Highway, Free Area, Nakuru

Include:

GET DIRECTIONS

This should later be able to open Google Maps.

Do not require a Google Maps API at this stage.

Use a visually interesting location treatment consistent with the event aesthetic.

11. FAQ SECTION

Create an expandable FAQ accordion.

Include only questions that can be answered from known information or clearly mark answers as configurable.

Initial questions can include:

Who can attend?

What is the dress code?

Where is the event?

What time does it start?

How much are tickets?

How do I buy a ticket?

What happens after payment?

Can I get a refund?

For unknown policies, use:

"This information will be updated by the organizers."

Do not invent refund or entry policies.

12. FINAL CTA

End the public page with a dramatic final conversion section.

Example direction:

NAKURU. ARE YOU READY?

Something is stirring beneath the Rift.

[ BUY TICKETS ]

[ SHARE WITH FRIENDS ]

Keep this visually powerful but not cluttered.

13. NAVIGATION

Create a simple navigation.

Desktop:

Home

Experience

Tickets

Venue

FAQ

Primary button:

BUY TICKETS

Mobile:

Use a compact navigation/menu.

Do not create a large complicated navigation.

The user should always be able to reach tickets quickly.

14. STICKY MOBILE TICKET CTA

Create a mobile-only sticky bottom CTA after the user leaves the hero.

Example:

🎟 BUY TICKETS — FROM KES 1,000

It should:

be highly visible

remain unobtrusive

respect mobile safe areas

not cover important content

disappear when the user is already inside the checkout experience

15. SOCIAL SHARING DESIGN

Build reusable sharing components.

Primary:

WhatsApp

Secondary:

Copy Link

The share message should be dynamically generated later.

Example:

👻 I'm going to Hauntings of the Rift!

31 October • Top Cliff Lodge, Nakuru

Are you coming?

Do not hardcode a fake URL.

Use a configurable event URL placeholder.

16. TICKET CHECKOUT FRONTEND — DESIGN ONLY

Create the frontend screens/components for:

Ticket selection

Buyer details

Full name

M-Pesa phone number

Payment

Show a future-ready M-Pesa experience:

Pay with M-Pesa

Enter your M-Pesa number and we'll send a payment request to your phone.

Then a payment state:

Waiting for payment...

Check your phone and enter your M-Pesa PIN.

Then:

Payment successful ✓

Then:

Your ticket is ready.

Do NOT implement real M-Pesa integration yet.

Do NOT simulate successful payments as if they were real.

Use clearly separated frontend states that can later be connected to the backend.

17. DIGITAL TICKET DESIGN

Design a beautiful digital ticket component.

It should eventually contain:

Event name

Event branding

Attendee name

Ticket type

Ticket ID

Date

Venue

QR code

Entry instructions

Create a realistic QR placeholder for design purposes only.

The final QR will later come from the backend.

Design states for:

Valid ticket

Used ticket

Cancelled ticket

Invalid ticket

18. ADMIN DESIGN FOUNDATION

Do NOT build the backend yet.

However, create the visual design system and basic frontend shell for an admin dashboard so the entire product has a consistent design language.

The admin should eventually support:

Dashboard

Tickets sold

Revenue

Tickets remaining

Today's sales

Check-ins

Tickets

Ticket types

Prices

Inventory

Sales windows

Promotions

Flash sales

Limited offers

Countdown

Discounts

Orders

Buyer

Phone

Amount

Payment status

Ticket status

Check-in

QR scanner

Valid

Used

Invalid

Event control

Sales active/paused

Event capacity

Settings

Event details

Admin accounts

Payment configuration

The frontend should make these sections feel simple enough for a non-technical event organizer.

19. DO NOT BUILD THESE YET

This is a frontend/design phase.

Do NOT implement:

Real M-Pesa

Daraja credentials

Real payment processing

Production authentication

Real admin authorization

Database logic

Real QR validation

Real ticket issuance

Real payment callbacks

Production webhooks

Instead, build clean interfaces and components that can later connect to these systems.

20. TECHNICAL DIRECTION

Use a modern frontend architecture suitable for eventual migration/integration with:

Next.js

React

TypeScript

Tailwind CSS

Structure the code into reusable components.

Examples:

Hero

Countdown

TicketCard

TicketGrid

FlashSale

ShareButton

VenueSection

FAQ

CTA

MobileTicketBar

CheckoutStep

PaymentStatus

DigitalTicket

QRPlaceholder

AdminSidebar

AdminStatCard

SalesChart

CheckInResult

Do not duplicate UI unnecessarily.

21. DESIGN SYSTEM

Create reusable design tokens for:

Colors

Derived from the poster.

Likely directions include:

Near-black

Deep blood red

Bone/cream

Muted lavender

White

Dark neutral shades

Do not arbitrarily introduce unrelated colors.

Typography

Use:

distinctive display typography for major event headings

highly readable sans-serif typography for body/UI

The display font should evoke the poster without sacrificing readability.

Components

Create consistent:

buttons

cards

inputs

badges

pills

accordions

modals

countdowns

ticket cards

alerts

22. ACCESSIBILITY

Despite the dark/gothic aesthetic, maintain:

readable contrast

accessible font sizes

keyboard navigation

focus states

semantic HTML

accessible buttons

accessible forms

reduced-motion support

Do not sacrifice usability for aesthetics.

23. PERFORMANCE

This website will be accessed heavily through mobile devices.

Optimize for:

fast initial load

compressed images

responsive images

lazy loading

minimal JavaScript

minimal animation

efficient fonts

Do not use massive background assets unnecessarily.

The poster should be optimized rather than uploaded as an unnecessarily huge image.

24. SEO-FRIENDLY FRONTEND

Even though this is currently a design/frontend phase, structure the page for future SEO.

Use:

semantic headings

meaningful text content

accessible image alt text

crawlable event information

proper page structure

Do not put all important event information inside images.

The event name, date, location and ticket prices must exist as actual HTML text.

25. IMPORTANT: DO NOT OVERDESIGN

Avoid:

excessive glassmorphism

generic purple AI gradients

huge unnecessary animations

excessive rounded cards

cluttered dashboards

giant blocks of text

meaningless decorative UI

unnecessary popups

intrusive signup forms

The website should feel like a premium nightlife/event brand, not an AI template.

26. RESPONSIVE REQUIREMENT

Design and test the experience at:

360px

390px

430px

tablet

laptop

desktop

The 360–430px mobile experience is the priority.

Ensure:

no horizontal scrolling

no clipped content

no overlapping buttons

touch targets are comfortable

countdown remains readable

ticket cards remain usable

27. BUILD PHILOSOPHY

Before making significant implementation decisions:

Inspect the attached poster.

Establish the visual system.

Build the landing page.

Build reusable components.

Build the ticketing frontend states.

Build the digital ticket design.

Build the admin visual shell.

Test mobile responsiveness.

Refine visual hierarchy.

Only then prepare the frontend for backend integration.

Do not attempt to build the entire production ticketing infrastructure in this phase.

28. ACCEPTANCE CRITERIA

The result should feel like a real event website ready to market, even though payment/backend functionality is not yet connected.

A visitor should immediately understand:

WHAT: Hauntings of the Rift
WHEN: 31 October 2026
WHERE: Top Cliff Lodge, Nakuru
PRICE: From KES 1,000
ACTION: Buy Tickets

The visual hierarchy should make BUY TICKETS the dominant conversion action.

The website should feel:

immersive + premium + mysterious + youthful + social + Kenyan + Halloween

rather than generic.

29. BEFORE YOU FINISH

After implementing the first frontend version, provide:

A. What you built

Briefly list the pages/components created.

B. Design system

Summarize:

colors

fonts

spacing

button styles

card styles

C. Responsive testing

Confirm how the design behaves on mobile and desktop.

D. Future backend integration points

Identify exactly where the future systems will connect:

Supabase

M-Pesa Daraja

authentication

ticket generation

QR validation

admin functionality

E. Remaining content requirements

List information that the organizer still needs to provide, such as:

ticket quantities

event capacity

support WhatsApp number

refund policy

regular ticket pricing

social media handles

sponsor information

Do not invent missing information.

MOST IMPORTANT INSTRUCTION

Design first. Engineer second.

Create an exceptional frontend foundation that can later be connected to a secure production ticketing backend.

Do not sacrifice simplicity, performance, or conversion for visual effects.

The final experience should make someone in Nakuru see the website and immediately think:

"I NEED TO BE THERE."

This project was built with [Lovable](https://lovable.dev).

## Payment operations and deployment

The P1 operational handoff covers manual payment evidence, notification outbox operations, backups, restore drills, and current limitations: [Payment operations handoff](docs/p1-payment-operations.md). Refund recording remains disabled until external M-Pesa reversal references can be independently verified.

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/e1fd7563-b6ca-429d-8733-6cadad9935c1).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
