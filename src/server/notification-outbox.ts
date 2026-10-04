import { randomUUID } from "crypto";
import type { PoolClient } from "pg";
import { getSharedPool } from "../db/index.ts";
import {
  sendMpesaReceivedAcknowledgmentEmail,
  sendOrganizerNewMpesaNotification,
  sendBroadcastEmail,
  sendRefundNoticeEmail,
  sendRecoveryEmail,
  sendTicketConfirmationEmail,
} from "./email.server";
import { sendRecoveryEmail as sendRecoveryLinksEmail } from "../lib/email.server";
import { WhatsAppNotificationService, type WhatsAppNotificationPayload } from "./whatsapp-service";

type EmailTask =
  | {
      channel: "email";
      type: "mpesa_ack";
      recipient: string;
      payload: Parameters<typeof sendMpesaReceivedAcknowledgmentEmail>[0];
    }
  | {
      channel: "email";
      type: "organizer_mpesa";
      recipient: string;
      payload: Parameters<typeof sendOrganizerNewMpesaNotification>[0];
    }
  | {
      channel: "email";
      type: "ticket_confirmation";
      recipient: string;
      payload: Parameters<typeof sendTicketConfirmationEmail>[0];
    }
  | {
      channel: "email";
      type: "refund_notice";
      recipient: string;
      payload: Parameters<typeof sendRefundNoticeEmail>[0];
    }
  | {
      channel: "email";
      type: "recovery";
      recipient: string;
      payload: Parameters<typeof sendRecoveryEmail>[0];
    }
  | {
      channel: "email";
      type: "recovery_links";
      recipient: string;
      payload: Parameters<typeof sendRecoveryLinksEmail>[0];
    }
  | {
      channel: "email";
      type: "broadcast";
      recipient: string;
      payload: Omit<Parameters<typeof sendBroadcastEmail>[0], "to">;
    };

export type NotificationOutboxTask =
  | EmailTask
  | {
      channel: "whatsapp";
      type: "whatsapp";
      recipient: string;
      payload: WhatsAppNotificationPayload;
    };

export interface NotificationOutboxRecord {
  id: string;
  channel: "email" | "whatsapp";
  notificationType: string;
  recipient: string;
  status: "queued" | "processing" | "accepted" | "failed";
  attempts: number;
  providerMessageId: string | null;
  providerStatus: string | null;
  lastError: string | null;
  availableAt: string;
  createdAt: string;
  updatedAt: string;
}

interface ClaimedTask {
  id: string;
  task: NotificationOutboxTask;
  attempts: number;
}

interface DispatchOutcome {
  accepted: boolean;
  providerMessageId?: string;
  providerStatus: string;
  error?: string;
}

const MAX_ATTEMPTS = 5;

export function notificationRetryDelaySeconds(attempt: number): number {
  return Math.min(3600, 30 * 2 ** Math.min(7, Math.max(0, attempt - 1)));
}

async function withTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getSharedPool().connect();
  try {
    await client.query("BEGIN");
    const value = await work(client);
    await client.query("COMMIT");
    return value;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export class NotificationOutbox {
  static async enqueue(task: NotificationOutboxTask, dedupeKey?: string): Promise<string> {
    const id = randomUUID();
    const result = await getSharedPool().query<{ id: string }>(
      `INSERT INTO public.notification_outbox
        (id, dedupe_key, channel, notification_type, recipient, payload, status)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, 'queued')
       ON CONFLICT (dedupe_key) DO UPDATE
       SET dedupe_key = EXCLUDED.dedupe_key
       RETURNING id`,
      [id, dedupeKey || null, task.channel, task.type, task.recipient, JSON.stringify(task)],
    );
    const storedId = result.rows[0]?.id;
    if (!storedId) throw new Error("Notification outbox enqueue did not return a record.");
    return storedId;
  }

  static async enqueueAndDispatch(
    task: NotificationOutboxTask,
    dedupeKey?: string,
  ): Promise<NotificationOutboxRecord> {
    let id: string;
    try {
      id = await this.enqueue(task, dedupeKey);
    } catch (err) {
      const pgCode = (err as { code?: string } | null)?.code;
      if (pgCode === "42P01") {
        const now = new Date().toISOString();
        const outcome = await this.deliver(task);
        return {
          id: randomUUID(),
          channel: task.channel,
          notificationType: task.type,
          recipient: task.recipient,
          status: outcome.accepted ? "accepted" : "failed",
          attempts: 1,
          providerMessageId: outcome.providerMessageId || null,
          providerStatus: outcome.providerStatus,
          lastError: outcome.error || null,
          availableAt: now,
          createdAt: now,
          updatedAt: now,
        };
      }
      throw err;
    }
    await this.dispatch(id);
    const record = await this.get(id);
    if (!record) throw new Error("Notification outbox record disappeared after dispatch.");
    return record;
  }

  static async dispatch(id: string): Promise<boolean> {
    const claimed = await withTransaction(async (client) => {
      const result = await client.query<{
        id: string;
        payload: NotificationOutboxTask;
        attempts: number;
      }>(
        `SELECT id, payload, attempts
         FROM public.notification_outbox
         WHERE id = $1
           AND attempts < $2
             AND status <> 'accepted'
             AND (
               ((status IN ('queued', 'failed') AND available_at <= NOW())
                 OR (status = 'processing' AND locked_at < NOW() - INTERVAL '2 minutes'))
             )
         FOR UPDATE SKIP LOCKED`,
        [id, MAX_ATTEMPTS],
      );
      const row = result.rows[0];
      if (!row) return undefined;
      const attempts = row.attempts + 1;
      await client.query(
        `UPDATE public.notification_outbox
         SET status = 'processing', attempts = $2, locked_at = NOW(), updated_at = NOW()
         WHERE id = $1`,
        [row.id, attempts],
      );
      return { id: row.id, task: row.payload, attempts } satisfies ClaimedTask;
    });
    if (!claimed) return false;

    let outcome: DispatchOutcome;
    try {
      outcome = await this.deliver(claimed.task);
    } catch (error) {
      outcome = {
        accepted: false,
        providerStatus: "dispatch_error",
        error: error instanceof Error ? error.message : "Notification dispatch failed.",
      };
    }

    if (outcome.accepted) {
      await getSharedPool().query(
        `UPDATE public.notification_outbox
         SET status = 'accepted', provider_message_id = $2, provider_status = $3,
             provider_response = $4::jsonb, last_error = NULL, locked_at = NULL, updated_at = NOW()
         WHERE id = $1 AND status = 'processing'`,
        [
          claimed.id,
          outcome.providerMessageId || null,
          outcome.providerStatus,
          JSON.stringify({ accepted: true }),
        ],
      );
      return true;
    }

    const retryDelay = notificationRetryDelaySeconds(claimed.attempts);
    await getSharedPool().query(
      `UPDATE public.notification_outbox
       SET status = 'failed', provider_status = $2, last_error = $3,
           provider_response = $4::jsonb, locked_at = NULL,
           available_at = CASE WHEN $5 < $6
             THEN NOW() + ($7 * INTERVAL '1 second') ELSE available_at END,
           updated_at = NOW()
       WHERE id = $1 AND status = 'processing'`,
      [
        claimed.id,
        outcome.providerStatus,
        outcome.error || "Provider did not accept the notification.",
        JSON.stringify({ accepted: false }),
        claimed.attempts,
        MAX_ATTEMPTS,
        retryDelay,
      ],
    );
    return true;
  }

  static async processDue(limit = 25): Promise<number> {
    const boundedLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
    const result = await getSharedPool().query<{ id: string }>(
      `SELECT id FROM public.notification_outbox
       WHERE attempts < $1
         AND ((status IN ('queued', 'failed') AND available_at <= NOW())
           OR (status = 'processing' AND locked_at < NOW() - INTERVAL '2 minutes'))
       ORDER BY created_at
       LIMIT $2`,
      [MAX_ATTEMPTS, boundedLimit],
    );
    let processed = 0;
    for (const row of result.rows) {
      if (await this.dispatch(row.id)) processed++;
    }
    return processed;
  }

  static async list(limit = 100): Promise<NotificationOutboxRecord[]> {
    const boundedLimit = Math.max(1, Math.min(250, Math.trunc(limit)));
    const result = await getSharedPool().query<NotificationOutboxRecord>(
      `SELECT id, channel, notification_type AS "notificationType", recipient, status, attempts,
              provider_message_id AS "providerMessageId", provider_status AS "providerStatus",
              last_error AS "lastError", available_at AS "availableAt",
              created_at AS "createdAt", updated_at AS "updatedAt"
       FROM public.notification_outbox
       ORDER BY created_at DESC
       LIMIT $1`,
      [boundedLimit],
    );
    return result.rows;
  }

  static async get(id: string): Promise<NotificationOutboxRecord | undefined> {
    const result = await getSharedPool().query<NotificationOutboxRecord>(
      `SELECT id, channel, notification_type AS "notificationType", recipient, status, attempts,
              provider_message_id AS "providerMessageId", provider_status AS "providerStatus",
              last_error AS "lastError", available_at AS "availableAt",
              created_at AS "createdAt", updated_at AS "updatedAt"
       FROM public.notification_outbox WHERE id = $1`,
      [id],
    );
    return result.rows[0];
  }

  private static async deliver(task: NotificationOutboxTask): Promise<DispatchOutcome> {
    if (task.channel === "whatsapp") {
      const result = await WhatsAppNotificationService.sendNotification(task.payload);
      return {
        accepted: result.success,
        ...(result.messageId ? { providerMessageId: result.messageId } : {}),
        providerStatus: result.providerStatus,
        ...(result.error ? { error: result.error } : {}),
      };
    }

    if (task.type === "mpesa_ack") {
      return this.emailOutcome(await sendMpesaReceivedAcknowledgmentEmail(task.payload));
    }
    if (task.type === "organizer_mpesa") {
      return this.emailOutcome(await sendOrganizerNewMpesaNotification(task.payload));
    }
    if (task.type === "ticket_confirmation") {
      return this.emailOutcome(await sendTicketConfirmationEmail(task.payload));
    }
    if (task.type === "recovery") {
      return this.emailOutcome(await sendRecoveryEmail(task.payload));
    }
    if (task.type === "recovery_links") {
      return this.emailOutcome(await sendRecoveryLinksEmail(task.payload));
    }
    if (task.type === "broadcast") {
      return this.emailOutcome(await sendBroadcastEmail({ ...task.payload, to: task.recipient }));
    }
    return this.emailOutcome(await sendRefundNoticeEmail(task.payload));
  }

  private static emailOutcome(result: {
    success: boolean;
    id?: string;
    simulated?: boolean;
    error?: string;
  }): DispatchOutcome {
    const accepted = result.success && !result.simulated;
    return {
      accepted,
      ...(accepted && result.id ? { providerMessageId: result.id } : {}),
      providerStatus: accepted
        ? "smtp_accepted"
        : result.simulated
          ? "not_configured"
          : "smtp_rejected",
      ...(!accepted
        ? { error: result.error || "SMTP did not accept the notification for delivery." }
        : {}),
    };
  }
}
