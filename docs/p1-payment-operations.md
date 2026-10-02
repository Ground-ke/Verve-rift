# P1 payment operations handoff

This workflow records organizer-provided evidence. It does not connect to Safaricom, initiate payments or reversals, confirm a funds transfer, or prove that an accepted notification reached its recipient.

## Database deployment

1. Back up the target PostgreSQL database and verify that the backup can be read before applying schema changes.
2. Apply `supabase/migrations/20261101000001_p1_payment_operations.sql` after `20260930000001_shared_manual_ticket_records.sql`. The payment and outbox tables have row-level security enabled; application access uses the configured server database connection.
3. Check that the new tables and indexes exist, then verify application read/write permissions with a non-production organizer account before enabling sales operations.
4. Record the migration identifier, deployment timestamp, operator, and restore point in the deployment record.

## Receipt review and settlement records

- Require the organizer to compare the buyer's submitted claim with the merchant statement. Record the exact receipt reference, statement amount, receipt timestamp, and a note identifying the evidence reviewed. This records a human review and is not provider verification.
- A receipt can be attached to only one order. Amount mismatches and duplicate references are preserved as receipt review exceptions and do not approve or issue tickets.
- Record settlement amounts and references from an organizer-held statement. Settlement totals are not reconciled automatically to receipts; no fees or net payout are calculated unless a future trusted statement source provides them.

## External reversals

- Process any reversal through the organizer's external M-Pesa channel; do not use this application to record it.
- The application does not currently record refunds: the admin route and UI are disabled until there is a supported method to independently verify reversal references. A syntactically valid organizer-entered reference is not verification.
- The migration reserves durable refund and audit tables, but the application must not write them until that verification is implemented and tested. The application never initiates a reversal.

## Notifications and reminders

- Review the protected `/api/admin/notifications/outbox` endpoint from the admin notification view. Ticket confirmations and recovery messages are persisted there. `accepted` means only that the configured provider accepted a request; it is not a delivery receipt.
- The protected `/api/admin/notifications/outbox/process` endpoint processes due retries with capped exponential backoff (up to five attempts). No scheduler is configured by this change; an operator or separately configured deployment scheduler must invoke it. Configure and monitor that scheduler before relying on retries.
- Confirm SMTP or WhatsApp provider credentials and template configuration in a non-production environment. Missing/failed provider configuration is shown as a failed attempt, never as simulated success.
- Recovery requests do not expose a preview token or promise email delivery; use a real provider and the outbox status for operational follow-up.
- Bulk reminders remain disabled until event timing and verified eligible ticket records are available.

## Backup, restore, and operational readiness

- Configure PostgreSQL automated backups and point-in-time recovery according to the database host's supported retention and recovery controls; this repository cannot verify that those controls are enabled.
- Before each deployment, create a recoverable backup. Periodically restore it into an isolated database and verify receipt, settlement, reversal, audit, and outbox records before returning the environment to service.
- Monitor `/api/health`, database connectivity, outbox failed-attempt volume, and provider credential expiry. A healthy configuration response does not independently establish payment, settlement, or notification delivery.
- No live provider credentials or production database access were supplied for this work. Successful migration, restore, and delivery behavior must be confirmed in the target environment before production use.
- Ticket pricing/inventory, promotions, scanner records, audit history outside the payment workflow, and rate limits still include process-memory state; this change does not make those systems horizontally durable on Vercel.

## Validation commands

- `bun run lint`
- `bun run test:auth`
- `bun run test:postgres` (requires `TEST_DATABASE_URL` to point to a dedicated database whose name includes `test`)
- `bun run build`

The repository-wide TypeScript check currently reports pre-existing errors in unrelated code, so this change does not make it a required CI gate. The P1 modules are compiled by the production build.
