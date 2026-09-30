import fs from "fs";
import path from "path";
import type { StoredOrder, StoredReservation, TicketTypeConfig } from "./order-service";
import type { DigitalTicketRecord } from "./tickets.server";

const DATA_DIR = path.resolve(process.cwd(), "src/server/data");
const ORDERS_FILE = path.join(DATA_DIR, "orders-store.json");
const RESERVATIONS_FILE = path.join(DATA_DIR, "reservations-store.json");
const TICKETS_FILE = path.join(DATA_DIR, "tickets-store.json");
const TIERS_FILE = path.join(DATA_DIR, "tiers-store.json");
const REFUNDS_FILE = path.join(DATA_DIR, "refunds-store.json");
const AUDIT_FILE = path.join(DATA_DIR, "audit-store.json");

function ensureDirectoryExists() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

/**
 * Atomically writes data to a target file using a temporary file and rename.
 * Throws on failure to ensure record-write failures are immediately detectable.
 */
function atomicWriteFileSync(filePath: string, content: string): void {
  ensureDirectoryExists();
  const tmpPath = `${filePath}.tmp.${Date.now()}.${Math.random().toString(36).slice(2, 6)}`;
  try {
    fs.writeFileSync(tmpPath, content, { encoding: "utf-8", flag: "w" });
    fs.renameSync(tmpPath, filePath);
  } catch (err) {
    try {
      if (fs.existsSync(tmpPath)) {
        fs.unlinkSync(tmpPath);
      }
    } catch {
      // ignore cleanup errors
    }
    throw new Error(
      `Failed to atomically persist record to ${path.basename(filePath)}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

export class PersistentStore {
  /**
   * Load stored orders from disk
   */
  static loadOrders(): Map<string, StoredOrder> {
    ensureDirectoryExists();
    const map = new Map<string, StoredOrder>();

    if (fs.existsSync(ORDERS_FILE)) {
      try {
        const raw = fs.readFileSync(ORDERS_FILE, "utf-8");
        const list = JSON.parse(raw);
        if (Array.isArray(list)) {
          for (const item of list) {
            if (item && item.id) {
              map.set(item.id, item);
            }
          }
        }
      } catch (err) {
        console.error("[PersistentStore] Could not load orders file:", err);
      }
    }

    return map;
  }

  /**
   * Persist orders to disk. Throws on error to prevent fictitious success reporting.
   */
  static saveOrders(orders: Map<string, StoredOrder>): void {
    const list = Array.from(orders.values());
    atomicWriteFileSync(ORDERS_FILE, JSON.stringify(list, null, 2));
  }

  /**
   * Load stored reservations from disk
   */
  static loadReservations(): Map<string, StoredReservation> {
    ensureDirectoryExists();
    const map = new Map<string, StoredReservation>();

    if (fs.existsSync(RESERVATIONS_FILE)) {
      try {
        const raw = fs.readFileSync(RESERVATIONS_FILE, "utf-8");
        const list = JSON.parse(raw);
        if (Array.isArray(list)) {
          for (const item of list) {
            if (item && item.id) {
              map.set(item.id, item);
            }
          }
        }
      } catch (err) {
        console.error("[PersistentStore] Could not load reservations file:", err);
      }
    }

    return map;
  }

  /**
   * Persist reservations to disk. Throws on error.
   */
  static saveReservations(reservations: Map<string, StoredReservation>): void {
    const list = Array.from(reservations.values());
    atomicWriteFileSync(RESERVATIONS_FILE, JSON.stringify(list, null, 2));
  }

  /**
   * Load stored tickets from disk
   */
  static loadTickets(): Map<string, DigitalTicketRecord> {
    ensureDirectoryExists();
    const map = new Map<string, DigitalTicketRecord>();

    if (fs.existsSync(TICKETS_FILE)) {
      try {
        const raw = fs.readFileSync(TICKETS_FILE, "utf-8");
        const list = JSON.parse(raw);
        if (Array.isArray(list)) {
          for (const item of list) {
            if (item && item.ticketNumber) {
              map.set(item.ticketNumber, item);
            }
          }
        }
      } catch (err) {
        console.error("[PersistentStore] Could not load tickets file:", err);
      }
    }

    return map;
  }

  /**
   * Persist tickets to disk. Throws on error.
   */
  static saveTickets(tickets: Map<string, DigitalTicketRecord>): void {
    const list = Array.from(tickets.values());
    atomicWriteFileSync(TICKETS_FILE, JSON.stringify(list, null, 2));
  }

  /**
   * Load stored ticket tier configurations with organizer ground truth
   */
  static loadTiers(
    fallbackTiers: Record<string, TicketTypeConfig>,
  ): Record<string, TicketTypeConfig> {
    ensureDirectoryExists();
    if (fs.existsSync(TIERS_FILE)) {
      try {
        const raw = fs.readFileSync(TIERS_FILE, "utf-8");
        const list = JSON.parse(raw) as TicketTypeConfig[];
        if (Array.isArray(list) && list.length > 0) {
          const map: Record<string, TicketTypeConfig> = {};
          for (const tier of list) {
            if (tier && tier.slug) {
              map[tier.slug] = tier;
            }
          }
          return map;
        }
      } catch (err) {
        console.error("[PersistentStore] Could not load tiers file:", err);
      }
    }

    // First run: persist ground truth organizer tiers
    try {
      PersistentStore.saveTiers(fallbackTiers);
    } catch {
      // non-fatal on init
    }
    return fallbackTiers;
  }

  /**
   * Persist ticket tier configurations to disk
   */
  static saveTiers(tiers: Record<string, TicketTypeConfig>): void {
    const list = Object.values(tiers);
    atomicWriteFileSync(TIERS_FILE, JSON.stringify(list, null, 2));
  }
}
