export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      api_idempotency: {
        Row: {
          api_key_id: string
          created_at: string
          expires_at: string
          id: string
          idem_key: string
          request_hash: string
          response: Json | null
          status_code: number | null
          updated_at: string
        }
        Insert: {
          api_key_id: string
          created_at?: string
          expires_at?: string
          id?: string
          idem_key: string
          request_hash: string
          response?: Json | null
          status_code?: number | null
          updated_at?: string
        }
        Update: {
          api_key_id?: string
          created_at?: string
          expires_at?: string
          id?: string
          idem_key?: string
          request_hash?: string
          response?: Json | null
          status_code?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "api_idempotency_api_key_id_fkey"
            columns: ["api_key_id"]
            isOneToOne: false
            referencedRelation: "api_keys"
            referencedColumns: ["id"]
          },
        ]
      }
      api_key_units: {
        Row: {
          api_key_id: string
          unit_id: string
        }
        Insert: {
          api_key_id: string
          unit_id: string
        }
        Update: {
          api_key_id?: string
          unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "api_key_units_api_key_id_fkey"
            columns: ["api_key_id"]
            isOneToOne: false
            referencedRelation: "api_keys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "api_key_units_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      api_keys: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          key_hash: string
          last_used_at: string | null
          name: string
          organization_id: string
          prefix: string
          revoked_at: string | null
          scopes: string[]
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          key_hash: string
          last_used_at?: string | null
          name: string
          organization_id: string
          prefix: string
          revoked_at?: string | null
          scopes?: string[]
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          key_hash?: string
          last_used_at?: string | null
          name?: string
          organization_id?: string
          prefix?: string
          revoked_at?: string | null
          scopes?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "api_keys_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      app_private_config: {
        Row: {
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          actor_name: string | null
          actor_role: string | null
          actor_user_id: string | null
          after: Json | null
          before: Json | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          note: string | null
          source: string
          unit_id: string | null
        }
        Insert: {
          action: string
          actor_name?: string | null
          actor_role?: string | null
          actor_user_id?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          note?: string | null
          source: string
          unit_id?: string | null
        }
        Update: {
          action?: string
          actor_name?: string | null
          actor_role?: string | null
          actor_user_id?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          note?: string | null
          source?: string
          unit_id?: string | null
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          id: string
          new_data: Json | null
          old_data: Json | null
          record_id: string | null
          table_name: string
          updated_at: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name: string
          updated_at?: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      crm_contacts: {
        Row: {
          created_at: string
          customer_id: string | null
          display_name: string | null
          external_id: string
          id: string
          organization_id: string
          phone_e164: string | null
          raw: Json | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_id?: string | null
          display_name?: string | null
          external_id: string
          id?: string
          organization_id: string
          phone_e164?: string | null
          raw?: Json | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_id?: string | null
          display_name?: string | null
          external_id?: string
          id?: string
          organization_id?: string
          phone_e164?: string | null
          raw?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_contacts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_contacts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_conversations: {
        Row: {
          channel: string
          classification:
            | Database["public"]["Enums"]["crm_classification"]
            | null
          completed_at: string | null
          contact_id: string | null
          created_at: string
          external_id: string
          handoff_at: string | null
          id: string
          inbox_external_id: string | null
          intent: string | null
          last_message_at: string | null
          message_count: number
          organization_id: string
          origin: string | null
          reservation_id: string | null
          result: string | null
          sac_ticket_id: string | null
          started_at: string | null
          status: string | null
          summary: string | null
          tags: string[]
          unit_id: string | null
          updated_at: string
        }
        Insert: {
          channel?: string
          classification?:
            | Database["public"]["Enums"]["crm_classification"]
            | null
          completed_at?: string | null
          contact_id?: string | null
          created_at?: string
          external_id: string
          handoff_at?: string | null
          id?: string
          inbox_external_id?: string | null
          intent?: string | null
          last_message_at?: string | null
          message_count?: number
          organization_id: string
          origin?: string | null
          reservation_id?: string | null
          result?: string | null
          sac_ticket_id?: string | null
          started_at?: string | null
          status?: string | null
          summary?: string | null
          tags?: string[]
          unit_id?: string | null
          updated_at?: string
        }
        Update: {
          channel?: string
          classification?:
            | Database["public"]["Enums"]["crm_classification"]
            | null
          completed_at?: string | null
          contact_id?: string | null
          created_at?: string
          external_id?: string
          handoff_at?: string | null
          id?: string
          inbox_external_id?: string | null
          intent?: string | null
          last_message_at?: string | null
          message_count?: number
          organization_id?: string
          origin?: string | null
          reservation_id?: string | null
          result?: string | null
          sac_ticket_id?: string | null
          started_at?: string | null
          status?: string | null
          summary?: string | null
          tags?: string[]
          unit_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_conversations_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_conversations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_conversations_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_conversations_sac_ticket_id_fkey"
            columns: ["sac_ticket_id"]
            isOneToOne: false
            referencedRelation: "sac_tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_conversations_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_events: {
        Row: {
          attempts: number
          created_at: string
          direction: string
          event_id: string
          event_type: string
          id: string
          last_error: string | null
          next_attempt_at: string
          organization_id: string | null
          payload: Json
          processed_at: string | null
          status: Database["public"]["Enums"]["queue_status"]
          updated_at: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          direction: string
          event_id: string
          event_type: string
          id?: string
          last_error?: string | null
          next_attempt_at?: string
          organization_id?: string | null
          payload: Json
          processed_at?: string | null
          status?: Database["public"]["Enums"]["queue_status"]
          updated_at?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          direction?: string
          event_id?: string
          event_type?: string
          id?: string
          last_error?: string | null
          next_attempt_at?: string
          organization_id?: string | null
          payload?: Json
          processed_at?: string | null
          status?: Database["public"]["Enums"]["queue_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_inbox_units: {
        Row: {
          created_at: string
          id: string
          inbox_external_id: string
          organization_id: string
          unit_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          inbox_external_id: string
          organization_id: string
          unit_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          inbox_external_id?: string
          organization_id?: string
          unit_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_inbox_units_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_inbox_units_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_consents: {
        Row: {
          consent_type: string
          created_at: string
          customer_id: string
          granted: boolean
          id: string
          policy_version: string | null
          source: string
          updated_at: string
        }
        Insert: {
          consent_type: string
          created_at?: string
          customer_id: string
          granted: boolean
          id?: string
          policy_version?: string | null
          source: string
          updated_at?: string
        }
        Update: {
          consent_type?: string
          created_at?: string
          customer_id?: string
          granted?: boolean
          id?: string
          policy_version?: string | null
          source?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_consents_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          created_at: string
          email: string | null
          full_name: string
          id: string
          notes: string | null
          organization_id: string
          phone_e164: string
          updated_at: string
          whatsapp_opt_in: boolean
          whatsapp_opt_out_at: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          notes?: string | null
          organization_id: string
          phone_e164: string
          updated_at?: string
          whatsapp_opt_in?: boolean
          whatsapp_opt_out_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          notes?: string | null
          organization_id?: string
          phone_e164?: string
          updated_at?: string
          whatsapp_opt_in?: boolean
          whatsapp_opt_out_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_orders: {
        Row: {
          address: string
          address_reference: string | null
          change_for: number | null
          conversation_external_id: string | null
          created_at: string
          customer_id: string
          id: string
          items_text: string
          neighborhood: string | null
          notes: string | null
          organization_id: string
          origin: string
          payment_method: string | null
          protocol: string
          status: string
          unit_id: string
          updated_at: string
        }
        Insert: {
          address: string
          address_reference?: string | null
          change_for?: number | null
          conversation_external_id?: string | null
          created_at?: string
          customer_id: string
          id?: string
          items_text: string
          neighborhood?: string | null
          notes?: string | null
          organization_id: string
          origin?: string
          payment_method?: string | null
          protocol: string
          status?: string
          unit_id: string
          updated_at?: string
        }
        Update: {
          address?: string
          address_reference?: string | null
          change_for?: number | null
          conversation_external_id?: string | null
          created_at?: string
          customer_id?: string
          id?: string
          items_text?: string
          neighborhood?: string | null
          notes?: string | null
          organization_id?: string
          origin?: string
          payment_method?: string | null
          protocol?: string
          status?: string
          unit_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_orders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_orders_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      holidays: {
        Row: {
          created_at: string
          holiday_date: string
          id: string
          name: string
          organization_id: string
        }
        Insert: {
          created_at?: string
          holiday_date: string
          id?: string
          name: string
          organization_id: string
        }
        Update: {
          created_at?: string
          holiday_date?: string
          id?: string
          name?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "holidays_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_event_logs: {
        Row: {
          created_at: string
          direction: string
          endpoint: string | null
          error: string | null
          id: string
          organization_id: string | null
          provider: string
          request: Json | null
          response: Json | null
          status_code: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          direction: string
          endpoint?: string | null
          error?: string | null
          id?: string
          organization_id?: string | null
          provider: string
          request?: Json | null
          response?: Json | null
          status_code?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          direction?: string
          endpoint?: string | null
          error?: string | null
          id?: string
          organization_id?: string | null
          provider?: string
          request?: Json | null
          response?: Json | null
          status_code?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_event_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_settings: {
        Row: {
          base_url: string | null
          config: Json
          created_at: string
          id: string
          is_enabled: boolean
          organization_id: string
          provider: string
          secret_name: string | null
          updated_at: string
        }
        Insert: {
          base_url?: string | null
          config?: Json
          created_at?: string
          id?: string
          is_enabled?: boolean
          organization_id: string
          provider: string
          secret_name?: string | null
          updated_at?: string
        }
        Update: {
          base_url?: string | null
          config?: Json
          created_at?: string
          id?: string
          is_enabled?: boolean
          organization_id?: string
          provider?: string
          secret_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      message_outbox: {
        Row: {
          attempts: number
          created_at: string
          customer_id: string | null
          dedupe_key: string
          delivered_at: string | null
          error: string | null
          event_key: string
          external_id: string | null
          id: string
          organization_id: string
          reservation_id: string | null
          sac_ticket_id: string | null
          scheduled_for: string
          sent_at: string | null
          status: Database["public"]["Enums"]["queue_status"]
          template_id: string | null
          updated_at: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          customer_id?: string | null
          dedupe_key: string
          delivered_at?: string | null
          error?: string | null
          event_key: string
          external_id?: string | null
          id?: string
          organization_id: string
          reservation_id?: string | null
          sac_ticket_id?: string | null
          scheduled_for?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["queue_status"]
          template_id?: string | null
          updated_at?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          customer_id?: string | null
          dedupe_key?: string
          delivered_at?: string | null
          error?: string | null
          event_key?: string
          external_id?: string | null
          id?: string
          organization_id?: string
          reservation_id?: string | null
          sac_ticket_id?: string | null
          scheduled_for?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["queue_status"]
          template_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_outbox_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_outbox_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_outbox_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_outbox_sac_ticket_id_fkey"
            columns: ["sac_ticket_id"]
            isOneToOne: false
            referencedRelation: "sac_tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_outbox_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "message_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      message_templates: {
        Row: {
          body_preview: string | null
          created_at: string
          event_key: string
          id: string
          is_active: boolean
          is_approved: boolean
          language: string
          organization_id: string
          provider_template_name: string | null
          updated_at: string
        }
        Insert: {
          body_preview?: string | null
          created_at?: string
          event_key: string
          id?: string
          is_active?: boolean
          is_approved?: boolean
          language?: string
          organization_id: string
          provider_template_name?: string | null
          updated_at?: string
        }
        Update: {
          body_preview?: string | null
          created_at?: string
          event_key?: string
          id?: string
          is_active?: boolean
          is_approved?: boolean
          language?: string
          organization_id?: string
          provider_template_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          name: string
          slug: string
          timezone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          slug: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          slug?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      price_child_policies: {
        Row: {
          child_amount: number | null
          child_from_age: number | null
          child_to_age: number | null
          created_at: string
          free_until_age: number | null
          full_from_age: number | null
          id: string
          service: string
          table_id: string
          updated_at: string
        }
        Insert: {
          child_amount?: number | null
          child_from_age?: number | null
          child_to_age?: number | null
          created_at?: string
          free_until_age?: number | null
          full_from_age?: number | null
          id?: string
          service: string
          table_id: string
          updated_at?: string
        }
        Update: {
          child_amount?: number | null
          child_from_age?: number | null
          child_to_age?: number | null
          created_at?: string
          free_until_age?: number | null
          full_from_age?: number | null
          id?: string
          service?: string
          table_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "price_child_policies_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "price_tables"
            referencedColumns: ["id"]
          },
        ]
      }
      price_rules: {
        Row: {
          amount: number
          created_at: string
          id: string
          on_holidays: boolean
          service: string
          sort_order: number
          table_id: string
          updated_at: string
          weekdays: number[]
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          on_holidays?: boolean
          service: string
          sort_order?: number
          table_id: string
          updated_at?: string
          weekdays?: number[]
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          on_holidays?: boolean
          service?: string
          sort_order?: number
          table_id?: string
          updated_at?: string
          weekdays?: number[]
        }
        Relationships: [
          {
            foreignKeyName: "price_rules_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "price_tables"
            referencedColumns: ["id"]
          },
        ]
      }
      price_tables: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          notes: string | null
          priority: number
          unit_id: string
          updated_at: string
          valid_from: string | null
          valid_until: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          priority?: number
          unit_id: string
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          priority?: number
          unit_id?: string
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "price_tables_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      public_rate_limits: {
        Row: {
          hits: number
          key: string
          window_start: string
        }
        Insert: {
          hits?: number
          key: string
          window_start: string
        }
        Update: {
          hits?: number
          key?: string
          window_start?: string
        }
        Relationships: []
      }
      reservation_blocks: {
        Row: {
          block_date: string
          created_at: string
          created_by: string | null
          end_time: string | null
          id: string
          kind: Database["public"]["Enums"]["block_kind"]
          reason: string | null
          start_time: string | null
          unit_id: string
          updated_at: string
        }
        Insert: {
          block_date: string
          created_at?: string
          created_by?: string | null
          end_time?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["block_kind"]
          reason?: string | null
          start_time?: string | null
          unit_id: string
          updated_at?: string
        }
        Update: {
          block_date?: string
          created_at?: string
          created_by?: string | null
          end_time?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["block_kind"]
          reason?: string | null
          start_time?: string | null
          unit_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reservation_blocks_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      reservation_capacity_rules: {
        Row: {
          created_at: string
          end_time: string
          id: string
          is_active: boolean
          max_guests_per_slot: number
          max_party_size: number
          shift_label: string | null
          slot_interval_minutes: number
          start_time: string
          unit_id: string
          updated_at: string
          weekday: number
        }
        Insert: {
          created_at?: string
          end_time: string
          id?: string
          is_active?: boolean
          max_guests_per_slot: number
          max_party_size?: number
          shift_label?: string | null
          slot_interval_minutes?: number
          start_time: string
          unit_id: string
          updated_at?: string
          weekday: number
        }
        Update: {
          created_at?: string
          end_time?: string
          id?: string
          is_active?: boolean
          max_guests_per_slot?: number
          max_party_size?: number
          shift_label?: string | null
          slot_interval_minutes?: number
          start_time?: string
          unit_id?: string
          updated_at?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "reservation_capacity_rules_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      reservation_followups: {
        Row: {
          attempts: number
          created_at: string
          id: string
          kind: string
          last_error: string | null
          reservation_id: string
          sent_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          id?: string
          kind: string
          last_error?: string | null
          reservation_id: string
          sent_at?: string | null
          status: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          id?: string
          kind?: string
          last_error?: string | null
          reservation_id?: string
          sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reservation_followups_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["id"]
          },
        ]
      }
      reservation_leads: {
        Row: {
          campaign: string | null
          created_at: string
          full_name: string
          id: string
          organization_id: string
          phone_e164: string
          reservation_id: string | null
          service: string | null
          status: string
          unit_id: string | null
          updated_at: string
          whatsapp_opt_in: boolean
        }
        Insert: {
          campaign?: string | null
          created_at?: string
          full_name: string
          id?: string
          organization_id: string
          phone_e164: string
          reservation_id?: string | null
          service?: string | null
          status?: string
          unit_id?: string | null
          updated_at?: string
          whatsapp_opt_in?: boolean
        }
        Update: {
          campaign?: string | null
          created_at?: string
          full_name?: string
          id?: string
          organization_id?: string
          phone_e164?: string
          reservation_id?: string | null
          service?: string | null
          status?: string
          unit_id?: string | null
          updated_at?: string
          whatsapp_opt_in?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "reservation_leads_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservation_leads_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservation_leads_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      reservation_status_history: {
        Row: {
          changed_by: string | null
          created_at: string
          from_status: Database["public"]["Enums"]["reservation_status"] | null
          id: string
          note: string | null
          reservation_id: string
          to_status: Database["public"]["Enums"]["reservation_status"]
          updated_at: string
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          from_status?: Database["public"]["Enums"]["reservation_status"] | null
          id?: string
          note?: string | null
          reservation_id: string
          to_status: Database["public"]["Enums"]["reservation_status"]
          updated_at?: string
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          from_status?: Database["public"]["Enums"]["reservation_status"] | null
          id?: string
          note?: string | null
          reservation_id?: string
          to_status?: Database["public"]["Enums"]["reservation_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reservation_status_history_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["id"]
          },
        ]
      }
      reservations: {
        Row: {
          arrived_at: string | null
          assigned_to: string | null
          campaign: string | null
          cancelled_at: string | null
          celebrant_name: string | null
          confirmed_at: string | null
          created_at: string
          created_by: string | null
          customer_id: string
          external_ref: string | null
          id: string
          is_large_group: boolean
          notes: string | null
          occasion: string | null
          organization_id: string
          origin: Database["public"]["Enums"]["reservation_origin"]
          party_size: number
          protocol: string
          reservation_date: string
          reservation_time: string
          service: string | null
          status: Database["public"]["Enums"]["reservation_status"]
          table_id: string | null
          unit_id: string
          updated_at: string
        }
        Insert: {
          arrived_at?: string | null
          assigned_to?: string | null
          campaign?: string | null
          cancelled_at?: string | null
          celebrant_name?: string | null
          confirmed_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_id: string
          external_ref?: string | null
          id?: string
          is_large_group?: boolean
          notes?: string | null
          occasion?: string | null
          organization_id: string
          origin?: Database["public"]["Enums"]["reservation_origin"]
          party_size: number
          protocol: string
          reservation_date: string
          reservation_time: string
          service?: string | null
          status?: Database["public"]["Enums"]["reservation_status"]
          table_id?: string | null
          unit_id: string
          updated_at?: string
        }
        Update: {
          arrived_at?: string | null
          assigned_to?: string | null
          campaign?: string | null
          cancelled_at?: string | null
          celebrant_name?: string | null
          confirmed_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string
          external_ref?: string | null
          id?: string
          is_large_group?: boolean
          notes?: string | null
          occasion?: string | null
          organization_id?: string
          origin?: Database["public"]["Enums"]["reservation_origin"]
          party_size?: number
          protocol?: string
          reservation_date?: string
          reservation_time?: string
          service?: string | null
          status?: Database["public"]["Enums"]["reservation_status"]
          table_id?: string | null
          unit_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reservations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      sac_ticket_events: {
        Row: {
          author_id: string | null
          body: string | null
          created_at: string
          event_type: string
          from_status: Database["public"]["Enums"]["sac_status"] | null
          id: string
          ticket_id: string
          to_status: Database["public"]["Enums"]["sac_status"] | null
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          body?: string | null
          created_at?: string
          event_type: string
          from_status?: Database["public"]["Enums"]["sac_status"] | null
          id?: string
          ticket_id: string
          to_status?: Database["public"]["Enums"]["sac_status"] | null
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          body?: string | null
          created_at?: string
          event_type?: string
          from_status?: Database["public"]["Enums"]["sac_status"] | null
          id?: string
          ticket_id?: string
          to_status?: Database["public"]["Enums"]["sac_status"] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sac_ticket_events_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "sac_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      sac_tickets: {
        Row: {
          assigned_to: string | null
          category: Database["public"]["Enums"]["sac_category"]
          created_at: string
          customer_id: string | null
          description: string | null
          due_at: string | null
          first_response_at: string | null
          human_requested: boolean
          id: string
          opened_at: string
          organization_id: string
          origin: string
          priority: Database["public"]["Enums"]["sac_priority"]
          protocol: string
          reservation_id: string | null
          resolution: string | null
          resolved_at: string | null
          status: Database["public"]["Enums"]["sac_status"]
          subject: string
          unit_id: string | null
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          category: Database["public"]["Enums"]["sac_category"]
          created_at?: string
          customer_id?: string | null
          description?: string | null
          due_at?: string | null
          first_response_at?: string | null
          human_requested?: boolean
          id?: string
          opened_at?: string
          organization_id: string
          origin?: string
          priority?: Database["public"]["Enums"]["sac_priority"]
          protocol: string
          reservation_id?: string | null
          resolution?: string | null
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["sac_status"]
          subject: string
          unit_id?: string | null
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          category?: Database["public"]["Enums"]["sac_category"]
          created_at?: string
          customer_id?: string | null
          description?: string | null
          due_at?: string | null
          first_response_at?: string | null
          human_requested?: boolean
          id?: string
          opened_at?: string
          organization_id?: string
          origin?: string
          priority?: Database["public"]["Enums"]["sac_priority"]
          protocol?: string
          reservation_id?: string | null
          resolution?: string | null
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["sac_status"]
          subject?: string
          unit_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sac_tickets_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sac_tickets_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sac_tickets_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sac_tickets_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      units: {
        Row: {
          accepts_online_reservations: boolean
          address: string | null
          agent_notes: string | null
          auto_confirm: boolean
          city: string | null
          created_at: string
          description: string | null
          has_delivery: boolean
          id: string
          is_active: boolean
          large_group_threshold: number
          max_advance_days: number
          min_advance_minutes: number
          name: string
          organization_id: string
          phone: string | null
          photo_url: string | null
          services: string[]
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          accepts_online_reservations?: boolean
          address?: string | null
          agent_notes?: string | null
          auto_confirm?: boolean
          city?: string | null
          created_at?: string
          description?: string | null
          has_delivery?: boolean
          id?: string
          is_active?: boolean
          large_group_threshold?: number
          max_advance_days?: number
          min_advance_minutes?: number
          name: string
          organization_id: string
          phone?: string | null
          photo_url?: string | null
          services?: string[]
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          accepts_online_reservations?: boolean
          address?: string | null
          agent_notes?: string | null
          auto_confirm?: boolean
          city?: string | null
          created_at?: string
          description?: string | null
          has_delivery?: boolean
          id?: string
          is_active?: boolean
          large_group_threshold?: number
          max_advance_days?: number
          min_advance_minutes?: number
          name?: string
          organization_id?: string
          phone?: string | null
          photo_url?: string | null
          services?: string[]
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "units_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          created_at: string
          full_name: string | null
          id: string
          invited_at: string | null
          invited_by: string | null
          is_active: boolean
          needs_onboarding: boolean
          organization_id: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id: string
          invited_at?: string | null
          invited_by?: string | null
          is_active?: boolean
          needs_onboarding?: boolean
          organization_id?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
          invited_at?: string | null
          invited_by?: string | null
          is_active?: boolean
          needs_onboarding?: boolean
          organization_id?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_unit_access: {
        Row: {
          created_at: string
          id: string
          unit_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          unit_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          unit_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_unit_access_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _can_manage_user: {
        Args: { _target: string; _uid: string }
        Returns: boolean
      }
      _default_org: { Args: never; Returns: string }
      _rand_hex: { Args: { _len: number }; Returns: string }
      add_reservation_note: {
        Args: { _note: string; _reservation_id: string }
        Returns: undefined
      }
      admin_check_invite: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _unit_ids: string[]
        }
        Returns: boolean
      }
      admin_create_api_key:
        | { Args: { _name: string; _scopes?: string[] }; Returns: Json }
        | {
            Args: { _name: string; _scopes: string[]; _unit_ids: string[] }
            Returns: Json
          }
      admin_get_crm_settings: { Args: never; Returns: Json }
      admin_list_api_keys: { Args: never; Returns: Json }
      admin_list_team: {
        Args: never
        Returns: {
          created_at: string
          email: string
          full_name: string
          id: string
          invited_at: string
          is_active: boolean
          last_sign_in_at: string
          needs_onboarding: boolean
          roles: Database["public"]["Enums"]["app_role"][]
          unit_ids: string[]
        }[]
      }
      admin_list_users: {
        Args: never
        Returns: {
          created_at: string
          email: string
          full_name: string
          id: string
          is_active: boolean
          roles: Database["public"]["Enums"]["app_role"][]
          unit_ids: string[]
        }[]
      }
      admin_revoke_api_key: { Args: { _id: string }; Returns: undefined }
      admin_rotate_crm_webhook_token: { Args: never; Returns: string }
      admin_save_crm_settings: {
        Args: { _account_id: string; _base_url: string; _enabled: boolean }
        Returns: undefined
      }
      admin_set_user_access: {
        Args: {
          _full_name?: string
          _invited?: boolean
          _role: Database["public"]["Enums"]["app_role"]
          _unit_ids: string[]
          _user_id: string
        }
        Returns: undefined
      }
      admin_set_user_active: {
        Args: { _active: boolean; _user_id: string }
        Returns: undefined
      }
      anonymize_inactive_customers: {
        Args: { _months: number }
        Returns: number
      }
      auth_user_id_by_email: { Args: { _email: string }; Returns: string }
      can_access_unit: {
        Args: { _unit_id: string; _user_id: string }
        Returns: boolean
      }
      can_manage_unit: {
        Args: { _unit_id: string; _user_id: string }
        Returns: boolean
      }
      can_read_audit: {
        Args: {
          _actor: string
          _entity_id: string
          _entity_type: string
          _uid: string
          _unit_id: string
        }
        Returns: boolean
      }
      capture_reservation_lead: {
        Args: {
          _campaign?: string
          _full_name: string
          _phone: string
          _privacy_accepted?: boolean
          _service?: string
          _website?: string
          _whatsapp_opt_in?: boolean
        }
        Returns: undefined
      }
      complete_first_access: {
        Args: { _full_name: string }
        Returns: undefined
      }
      create_public_reservation: {
        Args: {
          _campaign?: string
          _celebrant_name?: string
          _date: string
          _full_name: string
          _notes?: string
          _occasion?: string
          _party_size: number
          _phone: string
          _privacy_accepted?: boolean
          _service?: string
          _time: string
          _unit_id: string
          _website?: string
          _whatsapp_opt_in?: boolean
        }
        Returns: {
          is_large_group: boolean
          party_size: number
          protocol: string
          reservation_date: string
          reservation_time: string
          status: Database["public"]["Enums"]["reservation_status"]
          unit_name: string
        }[]
      }
      create_staff_reservation: {
        Args: {
          _date: string
          _full_name: string
          _notes?: string
          _origin?: Database["public"]["Enums"]["reservation_origin"]
          _party_size: number
          _phone: string
          _status?: Database["public"]["Enums"]["reservation_status"]
          _time: string
          _unit_id: string
        }
        Returns: {
          id: string
          protocol: string
          status: Database["public"]["Enums"]["reservation_status"]
        }[]
      }
      crm_claim_outbound: {
        Args: { _limit?: number }
        Returns: {
          attempts: number
          created_at: string
          direction: string
          event_id: string
          event_type: string
          id: string
          last_error: string | null
          next_attempt_at: string
          organization_id: string | null
          payload: Json
          processed_at: string | null
          status: Database["public"]["Enums"]["queue_status"]
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "crm_events"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      crm_finish_outbound: {
        Args: { _error?: string; _id: string; _ok: boolean }
        Returns: undefined
      }
      crm_ingest_event: {
        Args: { _event_id: string; _event_type: string; _payload: Json }
        Returns: string
      }
      dispatch_reservation_confirmations: { Args: never; Returns: number }
      get_reservation_history: {
        Args: { _reservation_id: string }
        Returns: {
          changed_by_name: string
          created_at: string
          from_status: Database["public"]["Enums"]["reservation_status"]
          id: string
          note: string
          to_status: Database["public"]["Enums"]["reservation_status"]
        }[]
      }
      get_reservation_timeline: {
        Args: { _reservation_id: string }
        Returns: {
          action: string
          actor_name: string
          actor_role: string
          after: Json
          before: Json
          created_at: string
          id: string
          kind: string
          note: string
          source: string
        }[]
      }
      get_unit_available_dates: {
        Args: {
          _from: string
          _party_size?: number
          _to: string
          _unit_id: string
        }
        Returns: {
          available_date: string
        }[]
      }
      get_unit_prices: {
        Args: { _date: string; _unit_id: string }
        Returns: Json
      }
      get_unit_slots: {
        Args: { _date: string; _party_size?: number; _unit_id: string }
        Returns: {
          available: boolean
          remaining: number
          slot_time: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      hit_rate_limit: { Args: { _key: string; _max: number }; Returns: boolean }
      is_staff: { Args: { _user_id: string }; Returns: boolean }
      log_auth_event: { Args: { _action: string }; Returns: boolean }
      mark_reservation_arrived: {
        Args: { _reservation_id: string }
        Returns: string
      }
      normalize_br_phone: { Args: { _raw: string }; Returns: string }
      public_list_units: {
        Args: never
        Returns: {
          address: string
          city: string
          description: string
          id: string
          large_group_threshold: number
          max_advance_days: number
          name: string
          photo_url: string
          services: string[]
          slug: string
        }[]
      }
      resolve_unit_prices: {
        Args: { _date: string; _unit_id: string }
        Returns: Json
      }
      run_data_retention: { Args: never; Returns: Json }
      sac_sla_hours: {
        Args: { _category: Database["public"]["Enums"]["sac_category"] }
        Returns: number
      }
      sdr_auth: { Args: { _key_hash: string }; Returns: Json }
      sdr_cancel_reservation: {
        Args: { _phone: string; _protocol: string; _reason: string }
        Returns: Json
      }
      sdr_classify_conversation: {
        Args: {
          _channel?: string
          _classification: Database["public"]["Enums"]["crm_classification"]
          _completed_at?: string
          _contact_external_id?: string
          _contact_name?: string
          _external_id: string
          _intent?: string
          _phone?: string
          _reservation_protocol?: string
          _result?: string
          _sac_protocol?: string
          _started_at?: string
          _summary?: string
          _tags?: string[]
          _unit_id?: string
        }
        Returns: Json
      }
      sdr_create_delivery_order: {
        Args: {
          _address: string
          _address_reference?: string
          _change_for?: number
          _conversation_external_id?: string
          _full_name: string
          _items_text: string
          _neighborhood?: string
          _notes?: string
          _payment_method?: string
          _phone: string
          _unit_id: string
        }
        Returns: Json
      }
      sdr_create_reservation: {
        Args: {
          _celebrant_name?: string
          _contact_external_id?: string
          _conversation_external_id?: string
          _date: string
          _full_name: string
          _notes?: string
          _occasion?: string
          _party_size: number
          _phone: string
          _service?: string
          _time: string
          _unit_id: string
          _whatsapp_opt_in?: boolean
        }
        Returns: Json
      }
      sdr_create_sac: {
        Args: {
          _category: Database["public"]["Enums"]["sac_category"]
          _conversation_external_id?: string
          _description: string
          _full_name: string
          _human_requested?: boolean
          _phone: string
          _priority?: Database["public"]["Enums"]["sac_priority"]
          _subject: string
          _unit_id: string
        }
        Returns: Json
      }
      sdr_find_reservations: {
        Args: { _phone: string; _protocol?: string }
        Returns: Json
      }
      sdr_followups_due: {
        Args: { _limit?: number; _now?: string }
        Returns: Json
      }
      sdr_get_delivery_orders: {
        Args: { _phone: string; _protocol?: string }
        Returns: Json
      }
      sdr_handoff: {
        Args: {
          _conversation_external_id: string
          _full_name?: string
          _phone: string
          _reason?: string
          _unit_id?: string
        }
        Returns: Json
      }
      sdr_list_units: { Args: never; Returns: Json }
      sdr_mark_followup: {
        Args: {
          _error?: string
          _kind: string
          _ok: boolean
          _protocol: string
        }
        Returns: undefined
      }
      sdr_scoped_followups_due: {
        Args: { _limit?: number; _now?: string; _unit_ids: string[] }
        Returns: Json
      }
      sdr_unit_by_inbox: { Args: { _inbox: string }; Returns: string }
      sdr_update_reservation: {
        Args: {
          _date?: string
          _party_size?: number
          _phone: string
          _protocol: string
          _time?: string
        }
        Returns: Json
      }
      set_delivery_status: {
        Args: { _order_id: string; _status: string }
        Returns: string
      }
      set_reservation_status: {
        Args: {
          _note?: string
          _reservation_id: string
          _status: Database["public"]["Enums"]["reservation_status"]
        }
        Returns: Database["public"]["Enums"]["reservation_status"]
      }
      staff_unit_slots: {
        Args: { _date: string; _party_size?: number; _unit_id: string }
        Returns: {
          available: boolean
          remaining: number
          slot_time: string
        }[]
      }
      write_audit: {
        Args: {
          _action: string
          _after: Json
          _before: Json
          _entity_id: string
          _entity_type: string
          _note?: string
          _source: string
          _unit_id: string
        }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "super_admin" | "gestor" | "funcionario"
      block_kind: "manual" | "feriado" | "data_especial"
      crm_classification:
        | "interesse_reserva"
        | "reserva_realizada"
        | "consulta_reserva"
        | "alteracao_reserva"
        | "cancelamento"
        | "sac_reclamacao"
        | "elogio"
        | "sugestao"
        | "duvida_geral"
        | "outros"
        | "atendimento_humano"
      queue_status:
        | "pendente"
        | "processando"
        | "enviado"
        | "entregue"
        | "lido"
        | "falhou"
        | "cancelado"
      reservation_origin:
        | "landing_page"
        | "sdr_whatsapp"
        | "painel"
        | "telefone"
        | "outro"
      reservation_status:
        | "pendente"
        | "confirmada"
        | "cancelada"
        | "concluida"
        | "nao_compareceu"
      sac_category:
        | "reclamacao"
        | "elogio"
        | "sugestao"
        | "duvida"
        | "problema_reserva"
        | "atendimento"
        | "outros"
      sac_priority: "baixa" | "media" | "alta" | "urgente"
      sac_status:
        | "aberto"
        | "em_andamento"
        | "aguardando_cliente"
        | "resolvido"
        | "encerrado"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["super_admin", "gestor", "funcionario"],
      block_kind: ["manual", "feriado", "data_especial"],
      crm_classification: [
        "interesse_reserva",
        "reserva_realizada",
        "consulta_reserva",
        "alteracao_reserva",
        "cancelamento",
        "sac_reclamacao",
        "elogio",
        "sugestao",
        "duvida_geral",
        "outros",
        "atendimento_humano",
      ],
      queue_status: [
        "pendente",
        "processando",
        "enviado",
        "entregue",
        "lido",
        "falhou",
        "cancelado",
      ],
      reservation_origin: [
        "landing_page",
        "sdr_whatsapp",
        "painel",
        "telefone",
        "outro",
      ],
      reservation_status: [
        "pendente",
        "confirmada",
        "cancelada",
        "concluida",
        "nao_compareceu",
      ],
      sac_category: [
        "reclamacao",
        "elogio",
        "sugestao",
        "duvida",
        "problema_reserva",
        "atendimento",
        "outros",
      ],
      sac_priority: ["baixa", "media", "alta", "urgente"],
      sac_status: [
        "aberto",
        "em_andamento",
        "aguardando_cliente",
        "resolvido",
        "encerrado",
      ],
    },
  },
} as const
