export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type SalesStatus = "scheduled" | "active" | "paused" | "ended" | "sold_out";
export type OrderStatus =
  | "pending"
  | "processing"
  | "paid"
  | "completed"
  | "pending_approval"
  | "approved"
  | "rejected"
  | "failed"
  | "cancelled"
  | "refunded";
export type ReservationStatus = "active" | "completed" | "expired" | "released";
export type PaymentStatus = "initiated" | "success" | "failed" | "timed_out";
export type TicketStatus = "valid" | "used" | "cancelled" | "refunded";
export type CheckinResult = "success" | "already_used" | "invalid" | "cancelled";

export interface Database {
  public: {
    Tables: {
      events: {
        Row: {
          id: string;
          slug: string;
          name: string;
          tagline: string | null;
          description: string | null;
          venue_name: string;
          venue_address: string;
          venue_directions: string | null;
          event_date: string;
          start_time: string;
          end_time: string | null;
          age_requirement: string | null;
          dress_code: string | null;
          capacity: number | null;
          sales_status: SalesStatus;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["events"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["events"]["Row"]>;
        Relationships: [];
      };
      ticket_types: {
        Row: {
          id: string;
          event_id: string;
          slug: string;
          name: string;
          description: string | null;
          admits_count: number;
          price_kes: number;
          total_inventory: number | null;
          reserved_count: number;
          sold_count: number;
          purchase_limit: number;
          sales_start: string | null;
          sales_end: string | null;
          is_configured: boolean;
          active: boolean;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["ticket_types"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["ticket_types"]["Row"]>;
        Relationships: [];
      };
      promotions: {
        Row: {
          id: string;
          event_id: string | null;
          ticket_type_id: string | null;
          code: string;
          name: string | null;
          discount_type: "percentage" | "fixed";
          discount_value: number;
          max_uses: number;
          current_uses: number;
          expires_at: string | null;
          is_active: boolean;
          promotional_price_kes?: number;
          quantity_limit?: number | null;
          quantity_sold?: number;
          starts_at?: string;
          ends_at?: string;
          active?: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["promotions"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["promotions"]["Row"]>;
        Relationships: [];
      };
      user_roles: {
        Row: {
          id: string;
          user_id: string;
          role: "admin" | "scanner" | "customer";
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["user_roles"]["Row"],
          "id" | "created_at" | "updated_at"
        > & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["user_roles"]["Insert"]>;
      };
      orders: {
        Row: {
          id: string;
          event_id: string;
          order_number: string;
          buyer_name: string;
          buyer_phone: string;
          subtotal_kes: number;
          discount_kes: number;
          total_kes: number;
          currency: string;
          status: OrderStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["orders"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["orders"]["Row"]>;
        Relationships: [];
      };
      order_items: {
        Row: {
          id: string;
          order_id: string;
          ticket_type_id: string;
          promotion_id: string | null;
          quantity: number;
          unit_price_kes: number;
          discount_kes: number;
          subtotal_kes: number;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["order_items"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["order_items"]["Row"]>;
        Relationships: [];
      };
      inventory_reservations: {
        Row: {
          id: string;
          ticket_type_id: string;
          order_id: string | null;
          quantity: number;
          expires_at: string;
          status: ReservationStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["inventory_reservations"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["inventory_reservations"]["Row"]>;
        Relationships: [];
      };
      payments: {
        Row: {
          id: string;
          order_id: string;
          provider: string;
          merchant_request_id: string | null;
          checkout_request_id: string | null;
          mpesa_receipt_number: string | null;
          phone_number: string;
          amount_kes: number;
          status: PaymentStatus;
          result_code: number | null;
          result_description: string | null;
          raw_callback_payload: Json | null;
          paid_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["payments"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["payments"]["Row"]>;
        Relationships: [];
      };
      tickets: {
        Row: {
          id: string;
          order_id: string;
          order_item_id: string;
          ticket_type_id: string;
          ticket_number: string;
          secure_token: string;
          attendee_name: string;
          status: TicketStatus;
          issued_at: string;
          used_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["tickets"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["tickets"]["Row"]>;
        Relationships: [];
      };
      checkins: {
        Row: {
          id: string;
          ticket_id: string;
          scanned_by: string | null;
          scanned_at: string;
          device_metadata: Json | null;
          result: CheckinResult;
        };
        Insert: Partial<Database["public"]["Tables"]["checkins"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["checkins"]["Row"]>;
        Relationships: [];
      };
      audit_logs: {
        Row: {
          id: string;
          actor_id: string | null;
          action: string;
          target_table: string;
          target_id: string | null;
          metadata: Json | null;
          ip_address: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["audit_logs"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["audit_logs"]["Row"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Enums: {
      sales_status: SalesStatus;
      order_status: OrderStatus;
      reservation_status: ReservationStatus;
      payment_status: PaymentStatus;
      ticket_status: TicketStatus;
      checkin_result: CheckinResult;
    };
    CompositeTypes: Record<string, never>;
    Functions: {
      reserve_ticket_inventory: {
        Args: {
          p_ticket_type_id: string;
          p_quantity: number;
          p_ttl_minutes?: number;
        };
        Returns: Json;
      };
      is_admin: {
        Args: {
          p_user_id?: string;
        };
        Returns: boolean;
      };
      is_scanner: {
        Args: {
          p_user_id?: string;
        };
        Returns: boolean;
      };
    };
  };
}
