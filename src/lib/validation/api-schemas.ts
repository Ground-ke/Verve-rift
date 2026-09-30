import { z } from "zod";

/**
 * Zod Schemas for API Request Payload Validation & Defensive Hardening
 */

// 1. Ticket Check-in & Gate Validation Schema
export const validateTicketSchema = z.object({
  ticket_code: z
    .string()
    .min(5, "Ticket code too short")
    .max(50, "Ticket code too long")
    .regex(/^[A-Za-z0-9-_]+$/, "Invalid ticket code characters"),
  qr_hash: z.string().optional(),
  event_id: z.string().default("hauntings-of-the-rift-2026"),
  staff_name: z.string().max(100).default("Gate Security Staff"),
  gate_location: z.string().max(100).default("Main Gate Entrance, The Lawns Restaurant"),
});

// 2. Order Creation Schema
export const createOrderSchema = z.object({
  ticketTypeId: z.string().min(1, "Ticket type is required"),
  quantity: z.number().int().min(1).max(20, "Cannot purchase more than 20 tickets at once"),
  buyerName: z.string().min(2, "Name must be at least 2 characters").max(100),
  buyerPhone: z.string().min(9, "Valid Kenyan phone number required").max(15),
  buyerEmail: z.string().email("Valid email required").optional().or(z.literal("")),
  promoCode: z.string().max(30).optional().or(z.literal("")),
  idempotencyKey: z.string().max(100).optional(),
});

// 3. Payment Verification Schema
export const verifyPaymentSchema = z.object({
  idempotencyKey: z.string().min(5, "Idempotency key required"),
  orderId: z.string().min(5, "Order ID required"),
  token: z.string().min(10, "Checkout authorization token required"),
  mpesaReceipt: z.string().max(50).optional(),
});

// 4. Ticket Recovery Schema
export const recoverTicketSchema = z.object({
  email: z.string().email("Valid email required").optional().or(z.literal("")),
  phone: z.string().min(9).max(15).optional().or(z.literal("")),
});

// 5. Refund Processing Schema
export const processRefundSchema = z.object({
  orderId: z.string().min(1, "Order ID is required"),
  ticketNumber: z.string().optional(),
  amountKes: z.number().positive("Refund amount must be greater than zero"),
  reason: z.string().min(3, "Refund reason is required").max(255),
  refundType: z.enum(["full", "partial"]).default("full"),
  actorEmail: z.string().email().default("admin@verve.co.ke"),
  actorId: z.string().optional(),
});

// 6. WhatsApp Notification Schema
export const sendWhatsAppNotificationSchema = z.object({
  phone: z.string().min(9, "Phone number required").max(20),
  templateType: z.enum([
    "booking_confirmation",
    "event_reminder_24h",
    "refund_notice",
    "gate_alert",
  ]),
  customerName: z.string().optional(),
  passTierAndQuantity: z.string().optional(),
  orderId: z.string().optional(),
  ticketAccessUrl: z.string().optional(),
  venueNameOrLocation: z.string().optional(),
  gateOpeningTime: z.string().optional(),
  fastPassLink: z.string().optional(),
  refundAmountKes: z.union([z.number(), z.string()]).optional(),
  paymentProviderRef: z.string().optional(),
  reasonOrDetails: z.string().optional(),
  // Legacy aliases
  attendeeName: z.string().optional(),
  ticketCode: z.string().optional(),
  tierName: z.string().optional(),
  orderNumber: z.string().optional(),
  totalKes: z.number().optional(),
  directTicketUrl: z.string().optional(),
});

// 7. Email Notification Schema
export const sendEmailNotificationSchema = z.object({
  to: z.string().email("Valid email required"),
  templateType: z.enum(["booking_confirmation", "event_reminder_24h", "refund_notice"]),
  customer_name: z.string().optional(),
  ticket_tier: z.string().optional(),
  quantity: z.union([z.number(), z.string()]).optional(),
  total_amount: z.union([z.number(), z.string()]).optional(),
  order_id: z.string().optional(),
  event_date: z.string().optional(),
  ticket_url: z.string().optional(),
  venue_name: z.string().optional(),
  gate_opening_time: z.string().optional(),
  refund_amount: z.union([z.number(), z.string()]).optional(),
  payment_ref: z.string().optional(),
  refund_reason: z.string().optional(),
});

// 8. Promotion Creation Schema
export const createPromotionSchema = z.object({
  code: z
    .string()
    .min(3, "Code must be at least 3 characters")
    .max(25)
    .regex(/^[A-Z0-9_-]+$/, "Code must contain only uppercase alphanumeric characters"),
  name: z.string().max(100).optional(),
  discountType: z.enum(["percentage", "fixed"]),
  discountValue: z.number().positive("Discount value must be positive"),
  maxUses: z.number().int().positive().default(100),
  expiresAt: z.string().nullable().optional(),
  isActive: z.boolean().default(true),
});
