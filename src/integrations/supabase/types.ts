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
          id: string
          intent: string | null
          organization_id: string
          origin: string | null
          reservation_id: string | null
          result: string | null
          sac_ticket_id: string | null
          started_at: string | null
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
          id?: string
          intent?: string | null
          organization_id: string
          origin?: string | null
          reservation_id?: string | null
          result?: string | null
          sac_ticket_id?: string | null
          started_at?: string | null
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
          id?: string
          intent?: string | null
          organization_id?: string
          origin?: string | null
          reservation_id?: string | null
          result?: string | null
          sac_ticket_id?: string | null
          started_at?: string | null
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
          cancelled_at: string | null
          confirmed_at: string | null
          created_at: string
          created_by: string | null
          customer_id: string
          external_ref: string | null
          id: string
          is_large_group: boolean
          notes: string | null
          organization_id: string
          origin: Database["public"]["Enums"]["reservation_origin"]
          party_size: number
          protocol: string
          reservation_date: string
          reservation_time: string
          status: Database["public"]["Enums"]["reservation_status"]
          table_id: string | null
          unit_id: string
          updated_at: string
        }
        Insert: {
          arrived_at?: string | null
          assigned_to?: string | null
          cancelled_at?: string | null
          confirmed_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_id: string
          external_ref?: string | null
          id?: string
          is_large_group?: boolean
          notes?: string | null
          organization_id: string
          origin?: Database["public"]["Enums"]["reservation_origin"]
          party_size: number
          protocol: string
          reservation_date: string
          reservation_time: string
          status?: Database["public"]["Enums"]["reservation_status"]
          table_id?: string | null
          unit_id: string
          updated_at?: string
        }
        Update: {
          arrived_at?: string | null
          assigned_to?: string | null
          cancelled_at?: string | null
          confirmed_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string
          external_ref?: string | null
          id?: string
          is_large_group?: boolean
          notes?: string | null
          organization_id?: string
          origin?: Database["public"]["Enums"]["reservation_origin"]
          party_size?: number
          protocol?: string
          reservation_date?: string
          reservation_time?: string
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
          auto_confirm: boolean
          city: string | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          large_group_threshold: number
          max_advance_days: number
          min_advance_minutes: number
          name: string
          organization_id: string
          phone: string | null
          photo_url: string | null
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          accepts_online_reservations?: boolean
          address?: string | null
          auto_confirm?: boolean
          city?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          large_group_threshold?: number
          max_advance_days?: number
          min_advance_minutes?: number
          name: string
          organization_id: string
          phone?: string | null
          photo_url?: string | null
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          accepts_online_reservations?: boolean
          address?: string | null
          auto_confirm?: boolean
          city?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          large_group_threshold?: number
          max_advance_days?: number
          min_advance_minutes?: number
          name?: string
          organization_id?: string
          phone?: string | null
          photo_url?: string | null
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
          is_active: boolean
          organization_id: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id: string
          is_active?: boolean
          organization_id?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
          is_active?: boolean
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
      can_access_unit: {
        Args: { _unit_id: string; _user_id: string }
        Returns: boolean
      }
      can_manage_unit: {
        Args: { _unit_id: string; _user_id: string }
        Returns: boolean
      }
      create_public_reservation: {
        Args: {
          _date: string
          _full_name: string
          _notes?: string
          _party_size: number
          _phone: string
          _privacy_accepted?: boolean
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
          slug: string
        }[]
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
