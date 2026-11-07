export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      admin_invites: {
        Row: {
          business_id: string;
          created_at: string;
          created_by: string | null;
          email: string;
          expires_at: string;
          id: string;
          role: string;
          token: string;
          used_at: string | null;
        };
        ComputedFields: never;
        Insert: {
          business_id: string;
          created_at?: string;
          created_by?: string | null;
          email: string;
          expires_at?: string;
          id?: string;
          role?: string;
          token?: string;
          used_at?: string | null;
        };
        Update: {
          business_id?: string;
          created_at?: string;
          created_by?: string | null;
          email?: string;
          expires_at?: string;
          id?: string;
          role?: string;
          token?: string;
          used_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "admin_invites_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "admin_invites_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "admin_users";
            referencedColumns: ["id"];
          },
        ];
      };
      admin_users: {
        Row: {
          auth_user_id: string | null;
          business_id: string;
          created_at: string;
          email: string | null;
          id: string;
          invited_at: string | null;
          invited_by: string | null;
          last_login: string | null;
          name: string | null;
          phone: string | null;
          role: string;
          status: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          auth_user_id?: string | null;
          business_id: string;
          created_at?: string;
          email?: string | null;
          id?: string;
          invited_at?: string | null;
          invited_by?: string | null;
          last_login?: string | null;
          name?: string | null;
          phone?: string | null;
          role?: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          auth_user_id?: string | null;
          business_id?: string;
          created_at?: string;
          email?: string | null;
          id?: string;
          invited_at?: string | null;
          invited_by?: string | null;
          last_login?: string | null;
          name?: string | null;
          phone?: string | null;
          role?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "admin_users_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "admin_users_invited_by_fkey";
            columns: ["invited_by"];
            isOneToOne: false;
            referencedRelation: "admin_users";
            referencedColumns: ["id"];
          },
        ];
      };
      analytics_events: {
        Row: {
          business_id: string | null;
          created_at: string;
          event: string;
          id: number;
          ip_hash: string | null;
          path: string | null;
          referrer: string | null;
          session_id: string | null;
          ua_hash: string | null;
        };
        ComputedFields: never;
        Insert: {
          business_id?: string | null;
          created_at?: string;
          event: string;
          id?: number;
          ip_hash?: string | null;
          path?: string | null;
          referrer?: string | null;
          session_id?: string | null;
          ua_hash?: string | null;
        };
        Update: {
          business_id?: string | null;
          created_at?: string;
          event?: string;
          id?: number;
          ip_hash?: string | null;
          path?: string | null;
          referrer?: string | null;
          session_id?: string | null;
          ua_hash?: string | null;
        };
        Relationships: [];
      };
      analytics_events_2026_10: {
        Row: {
          business_id: string | null;
          created_at: string;
          event: string;
          id: number;
          ip_hash: string | null;
          path: string | null;
          referrer: string | null;
          session_id: string | null;
          ua_hash: string | null;
        };
        ComputedFields: never;
        Insert: {
          business_id?: string | null;
          created_at?: string;
          event: string;
          id?: number;
          ip_hash?: string | null;
          path?: string | null;
          referrer?: string | null;
          session_id?: string | null;
          ua_hash?: string | null;
        };
        Update: {
          business_id?: string | null;
          created_at?: string;
          event?: string;
          id?: number;
          ip_hash?: string | null;
          path?: string | null;
          referrer?: string | null;
          session_id?: string | null;
          ua_hash?: string | null;
        };
        Relationships: [];
      };
      analytics_events_2026_11: {
        Row: {
          business_id: string | null;
          created_at: string;
          event: string;
          id: number;
          ip_hash: string | null;
          path: string | null;
          referrer: string | null;
          session_id: string | null;
          ua_hash: string | null;
        };
        ComputedFields: never;
        Insert: {
          business_id?: string | null;
          created_at?: string;
          event: string;
          id?: number;
          ip_hash?: string | null;
          path?: string | null;
          referrer?: string | null;
          session_id?: string | null;
          ua_hash?: string | null;
        };
        Update: {
          business_id?: string | null;
          created_at?: string;
          event?: string;
          id?: number;
          ip_hash?: string | null;
          path?: string | null;
          referrer?: string | null;
          session_id?: string | null;
          ua_hash?: string | null;
        };
        Relationships: [];
      };
      analytics_events_2026_12: {
        Row: {
          business_id: string | null;
          created_at: string;
          event: string;
          id: number;
          ip_hash: string | null;
          path: string | null;
          referrer: string | null;
          session_id: string | null;
          ua_hash: string | null;
        };
        ComputedFields: never;
        Insert: {
          business_id?: string | null;
          created_at?: string;
          event: string;
          id?: number;
          ip_hash?: string | null;
          path?: string | null;
          referrer?: string | null;
          session_id?: string | null;
          ua_hash?: string | null;
        };
        Update: {
          business_id?: string | null;
          created_at?: string;
          event?: string;
          id?: number;
          ip_hash?: string | null;
          path?: string | null;
          referrer?: string | null;
          session_id?: string | null;
          ua_hash?: string | null;
        };
        Relationships: [];
      };
      analytics_events_2027_01: {
        Row: {
          business_id: string | null;
          created_at: string;
          event: string;
          id: number;
          ip_hash: string | null;
          path: string | null;
          referrer: string | null;
          session_id: string | null;
          ua_hash: string | null;
        };
        ComputedFields: never;
        Insert: {
          business_id?: string | null;
          created_at?: string;
          event: string;
          id?: number;
          ip_hash?: string | null;
          path?: string | null;
          referrer?: string | null;
          session_id?: string | null;
          ua_hash?: string | null;
        };
        Update: {
          business_id?: string | null;
          created_at?: string;
          event?: string;
          id?: number;
          ip_hash?: string | null;
          path?: string | null;
          referrer?: string | null;
          session_id?: string | null;
          ua_hash?: string | null;
        };
        Relationships: [];
      };
      analytics_events_default: {
        Row: {
          business_id: string | null;
          created_at: string;
          event: string;
          id: number;
          ip_hash: string | null;
          path: string | null;
          referrer: string | null;
          session_id: string | null;
          ua_hash: string | null;
        };
        ComputedFields: never;
        Insert: {
          business_id?: string | null;
          created_at?: string;
          event: string;
          id?: number;
          ip_hash?: string | null;
          path?: string | null;
          referrer?: string | null;
          session_id?: string | null;
          ua_hash?: string | null;
        };
        Update: {
          business_id?: string | null;
          created_at?: string;
          event?: string;
          id?: number;
          ip_hash?: string | null;
          path?: string | null;
          referrer?: string | null;
          session_id?: string | null;
          ua_hash?: string | null;
        };
        Relationships: [];
      };
      analytics_refresh_log: {
        Row: {
          id: number;
          refreshed_at: string;
        };
        ComputedFields: never;
        Insert: {
          id?: number;
          refreshed_at: string;
        };
        Update: {
          id?: number;
          refreshed_at?: string;
        };
        Relationships: [];
      };
      app_logs: {
        Row: {
          context: NonNullable<Json>;
          created_at: string;
          id: number;
          level: string;
          message: string | null;
        };
        ComputedFields: never;
        Insert: {
          context?: NonNullable<Json>;
          created_at?: string;
          id?: number;
          level?: string;
          message?: string | null;
        };
        Update: {
          context?: NonNullable<Json>;
          created_at?: string;
          id?: number;
          level?: string;
          message?: string | null;
        };
        Relationships: [];
      };
      app_logs_2026_10: {
        Row: {
          context: NonNullable<Json>;
          created_at: string;
          id: number;
          level: string;
          message: string | null;
        };
        ComputedFields: never;
        Insert: {
          context?: NonNullable<Json>;
          created_at?: string;
          id?: number;
          level?: string;
          message?: string | null;
        };
        Update: {
          context?: NonNullable<Json>;
          created_at?: string;
          id?: number;
          level?: string;
          message?: string | null;
        };
        Relationships: [];
      };
      app_logs_2026_11: {
        Row: {
          context: NonNullable<Json>;
          created_at: string;
          id: number;
          level: string;
          message: string | null;
        };
        ComputedFields: never;
        Insert: {
          context?: NonNullable<Json>;
          created_at?: string;
          id?: number;
          level?: string;
          message?: string | null;
        };
        Update: {
          context?: NonNullable<Json>;
          created_at?: string;
          id?: number;
          level?: string;
          message?: string | null;
        };
        Relationships: [];
      };
      app_logs_2026_12: {
        Row: {
          context: NonNullable<Json>;
          created_at: string;
          id: number;
          level: string;
          message: string | null;
        };
        ComputedFields: never;
        Insert: {
          context?: NonNullable<Json>;
          created_at?: string;
          id?: number;
          level?: string;
          message?: string | null;
        };
        Update: {
          context?: NonNullable<Json>;
          created_at?: string;
          id?: number;
          level?: string;
          message?: string | null;
        };
        Relationships: [];
      };
      app_logs_2027_01: {
        Row: {
          context: NonNullable<Json>;
          created_at: string;
          id: number;
          level: string;
          message: string | null;
        };
        ComputedFields: never;
        Insert: {
          context?: NonNullable<Json>;
          created_at?: string;
          id?: number;
          level?: string;
          message?: string | null;
        };
        Update: {
          context?: NonNullable<Json>;
          created_at?: string;
          id?: number;
          level?: string;
          message?: string | null;
        };
        Relationships: [];
      };
      app_logs_default: {
        Row: {
          context: NonNullable<Json>;
          created_at: string;
          id: number;
          level: string;
          message: string | null;
        };
        ComputedFields: never;
        Insert: {
          context?: NonNullable<Json>;
          created_at?: string;
          id?: number;
          level?: string;
          message?: string | null;
        };
        Update: {
          context?: NonNullable<Json>;
          created_at?: string;
          id?: number;
          level?: string;
          message?: string | null;
        };
        Relationships: [];
      };
      audit_log: {
        Row: {
          action: string;
          business_id: string | null;
          created_at: string;
          entity: string | null;
          entity_id: string | null;
          id: number;
          ip: string | null;
          payload: NonNullable<Json>;
          user_agent: string | null;
          user_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          action: string;
          business_id?: string | null;
          created_at?: string;
          entity?: string | null;
          entity_id?: string | null;
          id?: number;
          ip?: string | null;
          payload?: NonNullable<Json>;
          user_agent?: string | null;
          user_id?: string | null;
        };
        Update: {
          action?: string;
          business_id?: string | null;
          created_at?: string;
          entity?: string | null;
          entity_id?: string | null;
          id?: number;
          ip?: string | null;
          payload?: NonNullable<Json>;
          user_agent?: string | null;
          user_id?: string | null;
        };
        Relationships: [];
      };
      audit_log_2026_10: {
        Row: {
          action: string;
          business_id: string | null;
          created_at: string;
          entity: string | null;
          entity_id: string | null;
          id: number;
          ip: string | null;
          payload: NonNullable<Json>;
          user_agent: string | null;
          user_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          action: string;
          business_id?: string | null;
          created_at?: string;
          entity?: string | null;
          entity_id?: string | null;
          id?: number;
          ip?: string | null;
          payload?: NonNullable<Json>;
          user_agent?: string | null;
          user_id?: string | null;
        };
        Update: {
          action?: string;
          business_id?: string | null;
          created_at?: string;
          entity?: string | null;
          entity_id?: string | null;
          id?: number;
          ip?: string | null;
          payload?: NonNullable<Json>;
          user_agent?: string | null;
          user_id?: string | null;
        };
        Relationships: [];
      };
      audit_log_2026_11: {
        Row: {
          action: string;
          business_id: string | null;
          created_at: string;
          entity: string | null;
          entity_id: string | null;
          id: number;
          ip: string | null;
          payload: NonNullable<Json>;
          user_agent: string | null;
          user_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          action: string;
          business_id?: string | null;
          created_at?: string;
          entity?: string | null;
          entity_id?: string | null;
          id?: number;
          ip?: string | null;
          payload?: NonNullable<Json>;
          user_agent?: string | null;
          user_id?: string | null;
        };
        Update: {
          action?: string;
          business_id?: string | null;
          created_at?: string;
          entity?: string | null;
          entity_id?: string | null;
          id?: number;
          ip?: string | null;
          payload?: NonNullable<Json>;
          user_agent?: string | null;
          user_id?: string | null;
        };
        Relationships: [];
      };
      audit_log_2026_12: {
        Row: {
          action: string;
          business_id: string | null;
          created_at: string;
          entity: string | null;
          entity_id: string | null;
          id: number;
          ip: string | null;
          payload: NonNullable<Json>;
          user_agent: string | null;
          user_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          action: string;
          business_id?: string | null;
          created_at?: string;
          entity?: string | null;
          entity_id?: string | null;
          id?: number;
          ip?: string | null;
          payload?: NonNullable<Json>;
          user_agent?: string | null;
          user_id?: string | null;
        };
        Update: {
          action?: string;
          business_id?: string | null;
          created_at?: string;
          entity?: string | null;
          entity_id?: string | null;
          id?: number;
          ip?: string | null;
          payload?: NonNullable<Json>;
          user_agent?: string | null;
          user_id?: string | null;
        };
        Relationships: [];
      };
      audit_log_2027_01: {
        Row: {
          action: string;
          business_id: string | null;
          created_at: string;
          entity: string | null;
          entity_id: string | null;
          id: number;
          ip: string | null;
          payload: NonNullable<Json>;
          user_agent: string | null;
          user_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          action: string;
          business_id?: string | null;
          created_at?: string;
          entity?: string | null;
          entity_id?: string | null;
          id?: number;
          ip?: string | null;
          payload?: NonNullable<Json>;
          user_agent?: string | null;
          user_id?: string | null;
        };
        Update: {
          action?: string;
          business_id?: string | null;
          created_at?: string;
          entity?: string | null;
          entity_id?: string | null;
          id?: number;
          ip?: string | null;
          payload?: NonNullable<Json>;
          user_agent?: string | null;
          user_id?: string | null;
        };
        Relationships: [];
      };
      audit_log_default: {
        Row: {
          action: string;
          business_id: string | null;
          created_at: string;
          entity: string | null;
          entity_id: string | null;
          id: number;
          ip: string | null;
          payload: NonNullable<Json>;
          user_agent: string | null;
          user_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          action: string;
          business_id?: string | null;
          created_at?: string;
          entity?: string | null;
          entity_id?: string | null;
          id?: number;
          ip?: string | null;
          payload?: NonNullable<Json>;
          user_agent?: string | null;
          user_id?: string | null;
        };
        Update: {
          action?: string;
          business_id?: string | null;
          created_at?: string;
          entity?: string | null;
          entity_id?: string | null;
          id?: number;
          ip?: string | null;
          payload?: NonNullable<Json>;
          user_agent?: string | null;
          user_id?: string | null;
        };
        Relationships: [];
      };
      bookings: {
        Row: {
          admin_comment: string | null;
          business_id: string;
          cancel_token: string | null;
          cancelled_at: string | null;
          cancelled_by: string | null;
          client_email: string | null;
          client_name: string | null;
          client_phone: string | null;
          client_telegram: string | null;
          client_telegram_chat_id: string | null;
          comment: string | null;
          completed_at: string | null;
          confirmed_at: string | null;
          created_at: string;
          custom_fields: NonNullable<Json>;
          duration_at_booking: number;
          id: string;
          price_at_booking: number | null;
          privacy_accepted_at: string | null;
          privacy_ip: string | null;
          privacy_version: string | null;
          reminder_24h_sent_at: string | null;
          reminder_2h_sent_at: string | null;
          reschedule_count: number;
          rescheduled_from: string | null;
          rescheduled_to: string | null;
          scheduled_at: string;
          service_id: string | null;
          source: string;
          status: string;
          timezone: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          admin_comment?: string | null;
          business_id: string;
          cancel_token?: string | null;
          cancelled_at?: string | null;
          cancelled_by?: string | null;
          client_email?: string | null;
          client_name?: string | null;
          client_phone?: string | null;
          client_telegram?: string | null;
          client_telegram_chat_id?: string | null;
          comment?: string | null;
          completed_at?: string | null;
          confirmed_at?: string | null;
          created_at?: string;
          custom_fields?: NonNullable<Json>;
          duration_at_booking: number;
          id?: string;
          price_at_booking?: number | null;
          privacy_accepted_at?: string | null;
          privacy_ip?: string | null;
          privacy_version?: string | null;
          reminder_24h_sent_at?: string | null;
          reminder_2h_sent_at?: string | null;
          reschedule_count?: number;
          rescheduled_from?: string | null;
          rescheduled_to?: string | null;
          scheduled_at: string;
          service_id?: string | null;
          source?: string;
          status?: string;
          timezone: string;
          updated_at?: string;
        };
        Update: {
          admin_comment?: string | null;
          business_id?: string;
          cancel_token?: string | null;
          cancelled_at?: string | null;
          cancelled_by?: string | null;
          client_email?: string | null;
          client_name?: string | null;
          client_phone?: string | null;
          client_telegram?: string | null;
          client_telegram_chat_id?: string | null;
          comment?: string | null;
          completed_at?: string | null;
          confirmed_at?: string | null;
          created_at?: string;
          custom_fields?: NonNullable<Json>;
          duration_at_booking?: number;
          id?: string;
          price_at_booking?: number | null;
          privacy_accepted_at?: string | null;
          privacy_ip?: string | null;
          privacy_version?: string | null;
          reminder_24h_sent_at?: string | null;
          reminder_2h_sent_at?: string | null;
          reschedule_count?: number;
          rescheduled_from?: string | null;
          rescheduled_to?: string | null;
          scheduled_at?: string;
          service_id?: string | null;
          source?: string;
          status?: string;
          timezone?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "bookings_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bookings_rescheduled_from_fkey";
            columns: ["rescheduled_from"];
            isOneToOne: false;
            referencedRelation: "bookings";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bookings_rescheduled_to_fkey";
            columns: ["rescheduled_to"];
            isOneToOne: false;
            referencedRelation: "bookings";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bookings_service_id_fkey";
            columns: ["service_id"];
            isOneToOne: false;
            referencedRelation: "services";
            referencedColumns: ["id"];
          },
        ];
      };
      business_holidays: {
        Row: {
          business_id: string;
          created_at: string;
          date: string;
          id: string;
          reason: string | null;
        };
        ComputedFields: never;
        Insert: {
          business_id: string;
          created_at?: string;
          date: string;
          id?: string;
          reason?: string | null;
        };
        Update: {
          business_id?: string;
          created_at?: string;
          date?: string;
          id?: string;
          reason?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "business_holidays_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
        ];
      };
      business_requisites: {
        Row: {
          bank_account: string | null;
          bank_name: string | null;
          business_id: string;
          card_number: string | null;
          contact_email: string | null;
          contact_phone: string | null;
          inn: string | null;
          legal_address: string | null;
          legal_name: string | null;
          sbp_phone: string | null;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          bank_account?: string | null;
          bank_name?: string | null;
          business_id: string;
          card_number?: string | null;
          contact_email?: string | null;
          contact_phone?: string | null;
          inn?: string | null;
          legal_address?: string | null;
          legal_name?: string | null;
          sbp_phone?: string | null;
          updated_at?: string;
        };
        Update: {
          bank_account?: string | null;
          bank_name?: string | null;
          business_id?: string;
          card_number?: string | null;
          contact_email?: string | null;
          contact_phone?: string | null;
          inn?: string | null;
          legal_address?: string | null;
          legal_name?: string | null;
          sbp_phone?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "business_requisites_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: true;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
        ];
      };
      business_telegram_codes: {
        Row: {
          business_id: string;
          code: string;
          created_at: string;
          expires_at: string;
          used_at: string | null;
        };
        ComputedFields: never;
        Insert: {
          business_id: string;
          code: string;
          created_at?: string;
          expires_at?: string;
          used_at?: string | null;
        };
        Update: {
          business_id?: string;
          code?: string;
          created_at?: string;
          expires_at?: string;
          used_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "business_telegram_codes_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
        ];
      };
      businesses: {
        Row: {
          address: string | null;
          auto_confirm: boolean;
          brand_color: string;
          cancel_hours_before: number;
          category: string | null;
          city: string | null;
          code_transferred_at: string | null;
          created_at: string;
          custom_blocks: Json | null;
          custom_domain: string | null;
          custom_texts: Json | null;
          deletion_scheduled_at: string | null;
          description: string | null;
          emails: string[];
          favicon_url: string | null;
          generation_attempts: number;
          generation_error: string | null;
          generation_status: string;
          id: string;
          lat: number | null;
          license_id: string | null;
          lng: number | null;
          logo_url: string | null;
          max_days_ahead: number;
          max_reschedules: number;
          min_hours_before: number;
          name: string;
          notes: string | null;
          oferta_accepted_at: string | null;
          oferta_accepted_ip: string | null;
          onboarding_completed_at: string | null;
          paid_initial_at: string | null;
          phones: string[];
          plan: string;
          plan_type: string | null;
          postal_code: string | null;
          preview_token: string | null;
          preview_url: string | null;
          rating: number | null;
          refused_at: string | null;
          region: string | null;
          reply_received_at: string | null;
          reply_text: string | null;
          reviews_count: number | null;
          slot_step_minutes: number;
          slug: string;
          slug_history: string[];
          socials: Json | null;
          source_2gis_url: string | null;
          ssl_status: string;
          status: string;
          subscription_active: boolean;
          subscription_price: number | null;
          subscription_started_at: string | null;
          subscription_until: string | null;
          support_until: string | null;
          telegram_chat_id: string | null;
          telegram_connected_at: string | null;
          timezone: string;
          updated_at: string;
          vertical_template_id: string | null;
          websites: string[];
          working_hours: Json | null;
        };
        ComputedFields: never;
        Insert: {
          address?: string | null;
          auto_confirm?: boolean;
          brand_color?: string;
          cancel_hours_before?: number;
          category?: string | null;
          city?: string | null;
          code_transferred_at?: string | null;
          created_at?: string;
          custom_blocks?: Json | null;
          custom_domain?: string | null;
          custom_texts?: Json | null;
          deletion_scheduled_at?: string | null;
          description?: string | null;
          emails?: string[];
          favicon_url?: string | null;
          generation_attempts?: number;
          generation_error?: string | null;
          generation_status?: string;
          id?: string;
          lat?: number | null;
          license_id?: string | null;
          lng?: number | null;
          logo_url?: string | null;
          max_days_ahead?: number;
          max_reschedules?: number;
          min_hours_before?: number;
          name: string;
          notes?: string | null;
          oferta_accepted_at?: string | null;
          oferta_accepted_ip?: string | null;
          onboarding_completed_at?: string | null;
          paid_initial_at?: string | null;
          phones?: string[];
          plan?: string;
          plan_type?: string | null;
          postal_code?: string | null;
          preview_token?: string | null;
          preview_url?: string | null;
          rating?: number | null;
          refused_at?: string | null;
          region?: string | null;
          reply_received_at?: string | null;
          reply_text?: string | null;
          reviews_count?: number | null;
          slot_step_minutes?: number;
          slug: string;
          slug_history?: string[];
          socials?: Json | null;
          source_2gis_url?: string | null;
          ssl_status?: string;
          status?: string;
          subscription_active?: boolean;
          subscription_price?: number | null;
          subscription_started_at?: string | null;
          subscription_until?: string | null;
          support_until?: string | null;
          telegram_chat_id?: string | null;
          telegram_connected_at?: string | null;
          timezone?: string;
          updated_at?: string;
          vertical_template_id?: string | null;
          websites?: string[];
          working_hours?: Json | null;
        };
        Update: {
          address?: string | null;
          auto_confirm?: boolean;
          brand_color?: string;
          cancel_hours_before?: number;
          category?: string | null;
          city?: string | null;
          code_transferred_at?: string | null;
          created_at?: string;
          custom_blocks?: Json | null;
          custom_domain?: string | null;
          custom_texts?: Json | null;
          deletion_scheduled_at?: string | null;
          description?: string | null;
          emails?: string[];
          favicon_url?: string | null;
          generation_attempts?: number;
          generation_error?: string | null;
          generation_status?: string;
          id?: string;
          lat?: number | null;
          license_id?: string | null;
          lng?: number | null;
          logo_url?: string | null;
          max_days_ahead?: number;
          max_reschedules?: number;
          min_hours_before?: number;
          name?: string;
          notes?: string | null;
          oferta_accepted_at?: string | null;
          oferta_accepted_ip?: string | null;
          onboarding_completed_at?: string | null;
          paid_initial_at?: string | null;
          phones?: string[];
          plan?: string;
          plan_type?: string | null;
          postal_code?: string | null;
          preview_token?: string | null;
          preview_url?: string | null;
          rating?: number | null;
          refused_at?: string | null;
          region?: string | null;
          reply_received_at?: string | null;
          reply_text?: string | null;
          reviews_count?: number | null;
          slot_step_minutes?: number;
          slug?: string;
          slug_history?: string[];
          socials?: Json | null;
          source_2gis_url?: string | null;
          ssl_status?: string;
          status?: string;
          subscription_active?: boolean;
          subscription_price?: number | null;
          subscription_started_at?: string | null;
          subscription_until?: string | null;
          support_until?: string | null;
          telegram_chat_id?: string | null;
          telegram_connected_at?: string | null;
          timezone?: string;
          updated_at?: string;
          vertical_template_id?: string | null;
          websites?: string[];
          working_hours?: Json | null;
        };
        Relationships: [
          {
            foreignKeyName: "businesses_vertical_template_id_fkey";
            columns: ["vertical_template_id"];
            isOneToOne: false;
            referencedRelation: "vertical_templates";
            referencedColumns: ["id"];
          },
        ];
      };
      code_archives: {
        Row: {
          business_id: string;
          created_at: string;
          id: string;
          size_bytes: number | null;
          zip_path: string | null;
        };
        ComputedFields: never;
        Insert: {
          business_id: string;
          created_at?: string;
          id?: string;
          size_bytes?: number | null;
          zip_path?: string | null;
        };
        Update: {
          business_id?: string;
          created_at?: string;
          id?: string;
          size_bytes?: number | null;
          zip_path?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "code_archives_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
        ];
      };
      cookie_consents: {
        Row: {
          accepted: boolean;
          created_at: string;
          id: string;
          ip_hash: string | null;
          policy_version: string | null;
          ua_hash: string | null;
        };
        ComputedFields: never;
        Insert: {
          accepted: boolean;
          created_at?: string;
          id?: string;
          ip_hash?: string | null;
          policy_version?: string | null;
          ua_hash?: string | null;
        };
        Update: {
          accepted?: boolean;
          created_at?: string;
          id?: string;
          ip_hash?: string | null;
          policy_version?: string | null;
          ua_hash?: string | null;
        };
        Relationships: [];
      };
      cron_locks: {
        Row: {
          job: string;
          locked_at: string;
          locked_until: string;
          run_id: string;
        };
        ComputedFields: never;
        Insert: {
          job: string;
          locked_at?: string;
          locked_until: string;
          run_id: string;
        };
        Update: {
          job?: string;
          locked_at?: string;
          locked_until?: string;
          run_id?: string;
        };
        Relationships: [];
      };
      cron_marks: {
        Row: {
          created_at: string;
          job: string;
          key: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          job: string;
          key: string;
        };
        Update: {
          created_at?: string;
          job?: string;
          key?: string;
        };
        Relationships: [];
      };
      cron_registry: {
        Row: {
          command: string;
          enabled: boolean;
          kind: string;
          name: string;
          schedule: string;
          timeout_ms: number;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          command: string;
          enabled?: boolean;
          kind: string;
          name: string;
          schedule: string;
          timeout_ms?: number;
          updated_at?: string;
        };
        Update: {
          command?: string;
          enabled?: boolean;
          kind?: string;
          name?: string;
          schedule?: string;
          timeout_ms?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      cron_retention_policy: {
        Row: {
          batch_size: number;
          keep_days: number;
          max_batches: number;
          table_name: string;
          ts_column: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          batch_size?: number;
          keep_days: number;
          max_batches?: number;
          table_name: string;
          ts_column: string;
          updated_at?: string;
        };
        Update: {
          batch_size?: number;
          keep_days?: number;
          max_batches?: number;
          table_name?: string;
          ts_column?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      data_requests: {
        Row: {
          business_id: string | null;
          created_at: string;
          email: string;
          id: string;
          processed_at: string | null;
          processed_by: string | null;
          request_text: string | null;
          response_text: string | null;
          status: string;
          type: string;
        };
        ComputedFields: never;
        Insert: {
          business_id?: string | null;
          created_at?: string;
          email: string;
          id?: string;
          processed_at?: string | null;
          processed_by?: string | null;
          request_text?: string | null;
          response_text?: string | null;
          status?: string;
          type: string;
        };
        Update: {
          business_id?: string | null;
          created_at?: string;
          email?: string;
          id?: string;
          processed_at?: string | null;
          processed_by?: string | null;
          request_text?: string | null;
          response_text?: string | null;
          status?: string;
          type?: string;
        };
        Relationships: [];
      };
      email_accounts: {
        Row: {
          active: boolean;
          created_at: string;
          daily_limit: number;
          email: string;
          from_name: string | null;
          id: string;
          imap_host: string | null;
          imap_pass_encrypted: string | null;
          imap_port: number | null;
          imap_secure: string;
          imap_user: string | null;
          last_checked_at: string | null;
          last_error: string | null;
          last_reset: string | null;
          reply_to: string | null;
          sent_today: number;
          smtp_host: string | null;
          smtp_pass_encrypted: string | null;
          smtp_port: number | null;
          smtp_secure: string;
          smtp_user: string | null;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          active?: boolean;
          created_at?: string;
          daily_limit?: number;
          email: string;
          from_name?: string | null;
          id?: string;
          imap_host?: string | null;
          imap_pass_encrypted?: string | null;
          imap_port?: number | null;
          imap_secure?: string;
          imap_user?: string | null;
          last_checked_at?: string | null;
          last_error?: string | null;
          last_reset?: string | null;
          reply_to?: string | null;
          sent_today?: number;
          smtp_host?: string | null;
          smtp_pass_encrypted?: string | null;
          smtp_port?: number | null;
          smtp_secure?: string;
          smtp_user?: string | null;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          daily_limit?: number;
          email?: string;
          from_name?: string | null;
          id?: string;
          imap_host?: string | null;
          imap_pass_encrypted?: string | null;
          imap_port?: number | null;
          imap_secure?: string;
          imap_user?: string | null;
          last_checked_at?: string | null;
          last_error?: string | null;
          last_reset?: string | null;
          reply_to?: string | null;
          sent_today?: number;
          smtp_host?: string | null;
          smtp_pass_encrypted?: string | null;
          smtp_port?: number | null;
          smtp_secure?: string;
          smtp_user?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      email_attachments: {
        Row: {
          created_at: string;
          email_incoming_id: string;
          filename: string | null;
          id: string;
          mime_type: string | null;
          minio_path: string | null;
          size_bytes: number | null;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          email_incoming_id: string;
          filename?: string | null;
          id?: string;
          mime_type?: string | null;
          minio_path?: string | null;
          size_bytes?: number | null;
        };
        Update: {
          created_at?: string;
          email_incoming_id?: string;
          filename?: string | null;
          id?: string;
          mime_type?: string | null;
          minio_path?: string | null;
          size_bytes?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "email_attachments_email_incoming_id_fkey";
            columns: ["email_incoming_id"];
            isOneToOne: false;
            referencedRelation: "emails_incoming";
            referencedColumns: ["id"];
          },
        ];
      };
      email_bounces: {
        Row: {
          bounce_type: string | null;
          bounced_email: string | null;
          email_account_id: string | null;
          id: string;
          original_message_id: string | null;
          raw: string | null;
          reason: string | null;
          received_at: string;
        };
        ComputedFields: never;
        Insert: {
          bounce_type?: string | null;
          bounced_email?: string | null;
          email_account_id?: string | null;
          id?: string;
          original_message_id?: string | null;
          raw?: string | null;
          reason?: string | null;
          received_at?: string;
        };
        Update: {
          bounce_type?: string | null;
          bounced_email?: string | null;
          email_account_id?: string | null;
          id?: string;
          original_message_id?: string | null;
          raw?: string | null;
          reason?: string | null;
          received_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "email_bounces_email_account_id_fkey";
            columns: ["email_account_id"];
            isOneToOne: false;
            referencedRelation: "email_accounts";
            referencedColumns: ["id"];
          },
        ];
      };
      email_queue: {
        Row: {
          body_html: string | null;
          body_text: string | null;
          booking_id: string | null;
          business_id: string | null;
          created_at: string;
          email_account_id: string | null;
          error: string | null;
          id: string;
          in_reply_to: string | null;
          max_retries: number;
          message_id: string | null;
          next_retry_at: string;
          references: string | null;
          retry_count: number;
          sent_at: string | null;
          status: string;
          subject: string;
          template_id: string | null;
          to_email: string;
          tracking_token: string | null;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          body_html?: string | null;
          body_text?: string | null;
          booking_id?: string | null;
          business_id?: string | null;
          created_at?: string;
          email_account_id?: string | null;
          error?: string | null;
          id?: string;
          in_reply_to?: string | null;
          max_retries?: number;
          message_id?: string | null;
          next_retry_at?: string;
          references?: string | null;
          retry_count?: number;
          sent_at?: string | null;
          status?: string;
          subject: string;
          template_id?: string | null;
          to_email: string;
          tracking_token?: string | null;
          updated_at?: string;
        };
        Update: {
          body_html?: string | null;
          body_text?: string | null;
          booking_id?: string | null;
          business_id?: string | null;
          created_at?: string;
          email_account_id?: string | null;
          error?: string | null;
          id?: string;
          in_reply_to?: string | null;
          max_retries?: number;
          message_id?: string | null;
          next_retry_at?: string;
          references?: string | null;
          retry_count?: number;
          sent_at?: string | null;
          status?: string;
          subject?: string;
          template_id?: string | null;
          to_email?: string;
          tracking_token?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "email_queue_booking_id_fkey";
            columns: ["booking_id"];
            isOneToOne: false;
            referencedRelation: "bookings";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "email_queue_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "email_queue_email_account_id_fkey";
            columns: ["email_account_id"];
            isOneToOne: false;
            referencedRelation: "email_accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "email_queue_template_id_fkey";
            columns: ["template_id"];
            isOneToOne: false;
            referencedRelation: "templates";
            referencedColumns: ["id"];
          },
        ];
      };
      emails_incoming: {
        Row: {
          attachments: NonNullable<Json>;
          body_html: string | null;
          body_text: string | null;
          business_id: string | null;
          created_at: string;
          email_account_id: string | null;
          from_email: string | null;
          id: string;
          in_reply_to: string | null;
          is_read: boolean;
          message_id: string | null;
          received_at: string | null;
          references: string | null;
          subject: string | null;
          thread_id: string | null;
          to_email: string | null;
        };
        ComputedFields: never;
        Insert: {
          attachments?: NonNullable<Json>;
          body_html?: string | null;
          body_text?: string | null;
          business_id?: string | null;
          created_at?: string;
          email_account_id?: string | null;
          from_email?: string | null;
          id?: string;
          in_reply_to?: string | null;
          is_read?: boolean;
          message_id?: string | null;
          received_at?: string | null;
          references?: string | null;
          subject?: string | null;
          thread_id?: string | null;
          to_email?: string | null;
        };
        Update: {
          attachments?: NonNullable<Json>;
          body_html?: string | null;
          body_text?: string | null;
          business_id?: string | null;
          created_at?: string;
          email_account_id?: string | null;
          from_email?: string | null;
          id?: string;
          in_reply_to?: string | null;
          is_read?: boolean;
          message_id?: string | null;
          received_at?: string | null;
          references?: string | null;
          subject?: string | null;
          thread_id?: string | null;
          to_email?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "emails_incoming_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "emails_incoming_email_account_id_fkey";
            columns: ["email_account_id"];
            isOneToOne: false;
            referencedRelation: "email_accounts";
            referencedColumns: ["id"];
          },
        ];
      };
      emails_outgoing: {
        Row: {
          body_html: string | null;
          body_text: string | null;
          booking_id: string | null;
          business_id: string | null;
          clicked_at: string | null;
          created_at: string;
          email_account_id: string | null;
          error: string | null;
          from_email: string | null;
          id: string;
          message_id: string | null;
          opened_at: string | null;
          outreach_log_id: string | null;
          sent_at: string | null;
          status: string;
          subject: string | null;
          to_email: string | null;
        };
        ComputedFields: never;
        Insert: {
          body_html?: string | null;
          body_text?: string | null;
          booking_id?: string | null;
          business_id?: string | null;
          clicked_at?: string | null;
          created_at?: string;
          email_account_id?: string | null;
          error?: string | null;
          from_email?: string | null;
          id?: string;
          message_id?: string | null;
          opened_at?: string | null;
          outreach_log_id?: string | null;
          sent_at?: string | null;
          status?: string;
          subject?: string | null;
          to_email?: string | null;
        };
        Update: {
          body_html?: string | null;
          body_text?: string | null;
          booking_id?: string | null;
          business_id?: string | null;
          clicked_at?: string | null;
          created_at?: string;
          email_account_id?: string | null;
          error?: string | null;
          from_email?: string | null;
          id?: string;
          message_id?: string | null;
          opened_at?: string | null;
          outreach_log_id?: string | null;
          sent_at?: string | null;
          status?: string;
          subject?: string | null;
          to_email?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "emails_outgoing_booking_id_fkey";
            columns: ["booking_id"];
            isOneToOne: false;
            referencedRelation: "bookings";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "emails_outgoing_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "emails_outgoing_email_account_id_fkey";
            columns: ["email_account_id"];
            isOneToOne: false;
            referencedRelation: "email_accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "emails_outgoing_outreach_log_id_fkey";
            columns: ["outreach_log_id"];
            isOneToOne: false;
            referencedRelation: "outreach_log";
            referencedColumns: ["id"];
          },
        ];
      };
      feature_flags: {
        Row: {
          enabled: boolean;
          key: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          enabled?: boolean;
          key: string;
          updated_at?: string;
        };
        Update: {
          enabled?: boolean;
          key?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      imap_state: {
        Row: {
          email_account_id: string;
          last_check_at: string | null;
          uidnext: number;
          uidvalidity: number;
        };
        ComputedFields: never;
        Insert: {
          email_account_id: string;
          last_check_at?: string | null;
          uidnext?: number;
          uidvalidity: number;
        };
        Update: {
          email_account_id?: string;
          last_check_at?: string | null;
          uidnext?: number;
          uidvalidity?: number;
        };
        Relationships: [
          {
            foreignKeyName: "imap_state_email_account_id_fkey";
            columns: ["email_account_id"];
            isOneToOne: true;
            referencedRelation: "email_accounts";
            referencedColumns: ["id"];
          },
        ];
      };
      job_locks: {
        Row: {
          heartbeat_at: string | null;
          job_id: string;
          worker_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          heartbeat_at?: string | null;
          job_id: string;
          worker_id?: string | null;
        };
        Update: {
          heartbeat_at?: string | null;
          job_id?: string;
          worker_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "job_locks_job_id_fkey";
            columns: ["job_id"];
            isOneToOne: true;
            referencedRelation: "jobs";
            referencedColumns: ["id"];
          },
        ];
      };
      jobs: {
        Row: {
          attempts: number;
          created_at: string;
          error: string | null;
          finished_at: string | null;
          heartbeat_at: string | null;
          id: string;
          locked_at: string | null;
          locked_by: string | null;
          max_attempts: number;
          payload: NonNullable<Json>;
          result: Json | null;
          started_at: string | null;
          status: string;
          type: string;
        };
        ComputedFields: never;
        Insert: {
          attempts?: number;
          created_at?: string;
          error?: string | null;
          finished_at?: string | null;
          heartbeat_at?: string | null;
          id?: string;
          locked_at?: string | null;
          locked_by?: string | null;
          max_attempts?: number;
          payload?: NonNullable<Json>;
          result?: Json | null;
          started_at?: string | null;
          status?: string;
          type: string;
        };
        Update: {
          attempts?: number;
          created_at?: string;
          error?: string | null;
          finished_at?: string | null;
          heartbeat_at?: string | null;
          id?: string;
          locked_at?: string | null;
          locked_by?: string | null;
          max_attempts?: number;
          payload?: NonNullable<Json>;
          result?: Json | null;
          started_at?: string | null;
          status?: string;
          type?: string;
        };
        Relationships: [];
      };
      leads: {
        Row: {
          created_at: string;
          email: string | null;
          id: string;
          message: string | null;
          name: string | null;
          phone: string | null;
          source: string | null;
          status: string;
          telegram_sent_at: string | null;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          email?: string | null;
          id?: string;
          message?: string | null;
          name?: string | null;
          phone?: string | null;
          source?: string | null;
          status?: string;
          telegram_sent_at?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          email?: string | null;
          id?: string;
          message?: string | null;
          name?: string | null;
          phone?: string | null;
          source?: string | null;
          status?: string;
          telegram_sent_at?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      legacy_redirects: {
        Row: {
          created_at: string;
          from_domain: string;
          to_url: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          from_domain: string;
          to_url: string;
        };
        Update: {
          created_at?: string;
          from_domain?: string;
          to_url?: string;
        };
        Relationships: [];
      };
      license_pings: {
        Row: {
          domain: string | null;
          id: number;
          ip: string | null;
          license_id: string | null;
          pinged_at: string;
          status: string | null;
          user_agent: string | null;
          version: string | null;
        };
        ComputedFields: never;
        Insert: {
          domain?: string | null;
          id?: number;
          ip?: string | null;
          license_id?: string | null;
          pinged_at?: string;
          status?: string | null;
          user_agent?: string | null;
          version?: string | null;
        };
        Update: {
          domain?: string | null;
          id?: number;
          ip?: string | null;
          license_id?: string | null;
          pinged_at?: string;
          status?: string | null;
          user_agent?: string | null;
          version?: string | null;
        };
        Relationships: [];
      };
      license_pings_2026_10: {
        Row: {
          domain: string | null;
          id: number;
          ip: string | null;
          license_id: string | null;
          pinged_at: string;
          status: string | null;
          user_agent: string | null;
          version: string | null;
        };
        ComputedFields: never;
        Insert: {
          domain?: string | null;
          id?: number;
          ip?: string | null;
          license_id?: string | null;
          pinged_at?: string;
          status?: string | null;
          user_agent?: string | null;
          version?: string | null;
        };
        Update: {
          domain?: string | null;
          id?: number;
          ip?: string | null;
          license_id?: string | null;
          pinged_at?: string;
          status?: string | null;
          user_agent?: string | null;
          version?: string | null;
        };
        Relationships: [];
      };
      license_pings_2026_11: {
        Row: {
          domain: string | null;
          id: number;
          ip: string | null;
          license_id: string | null;
          pinged_at: string;
          status: string | null;
          user_agent: string | null;
          version: string | null;
        };
        ComputedFields: never;
        Insert: {
          domain?: string | null;
          id?: number;
          ip?: string | null;
          license_id?: string | null;
          pinged_at?: string;
          status?: string | null;
          user_agent?: string | null;
          version?: string | null;
        };
        Update: {
          domain?: string | null;
          id?: number;
          ip?: string | null;
          license_id?: string | null;
          pinged_at?: string;
          status?: string | null;
          user_agent?: string | null;
          version?: string | null;
        };
        Relationships: [];
      };
      license_pings_2026_12: {
        Row: {
          domain: string | null;
          id: number;
          ip: string | null;
          license_id: string | null;
          pinged_at: string;
          status: string | null;
          user_agent: string | null;
          version: string | null;
        };
        ComputedFields: never;
        Insert: {
          domain?: string | null;
          id?: number;
          ip?: string | null;
          license_id?: string | null;
          pinged_at?: string;
          status?: string | null;
          user_agent?: string | null;
          version?: string | null;
        };
        Update: {
          domain?: string | null;
          id?: number;
          ip?: string | null;
          license_id?: string | null;
          pinged_at?: string;
          status?: string | null;
          user_agent?: string | null;
          version?: string | null;
        };
        Relationships: [];
      };
      license_pings_2027_01: {
        Row: {
          domain: string | null;
          id: number;
          ip: string | null;
          license_id: string | null;
          pinged_at: string;
          status: string | null;
          user_agent: string | null;
          version: string | null;
        };
        ComputedFields: never;
        Insert: {
          domain?: string | null;
          id?: number;
          ip?: string | null;
          license_id?: string | null;
          pinged_at?: string;
          status?: string | null;
          user_agent?: string | null;
          version?: string | null;
        };
        Update: {
          domain?: string | null;
          id?: number;
          ip?: string | null;
          license_id?: string | null;
          pinged_at?: string;
          status?: string | null;
          user_agent?: string | null;
          version?: string | null;
        };
        Relationships: [];
      };
      license_pings_default: {
        Row: {
          domain: string | null;
          id: number;
          ip: string | null;
          license_id: string | null;
          pinged_at: string;
          status: string | null;
          user_agent: string | null;
          version: string | null;
        };
        ComputedFields: never;
        Insert: {
          domain?: string | null;
          id?: number;
          ip?: string | null;
          license_id?: string | null;
          pinged_at?: string;
          status?: string | null;
          user_agent?: string | null;
          version?: string | null;
        };
        Update: {
          domain?: string | null;
          id?: number;
          ip?: string | null;
          license_id?: string | null;
          pinged_at?: string;
          status?: string | null;
          user_agent?: string | null;
          version?: string | null;
        };
        Relationships: [];
      };
      licenses: {
        Row: {
          allowed_domains: string[];
          business_id: string | null;
          created_at: string;
          domain: string | null;
          id: string;
          issued_at: string;
          last_ping_at: string | null;
          last_ping_domain: string | null;
          last_ping_ip: string | null;
          license_id: string;
          notes: string | null;
          revoked: boolean;
          status: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          allowed_domains?: string[];
          business_id?: string | null;
          created_at?: string;
          domain?: string | null;
          id?: string;
          issued_at?: string;
          last_ping_at?: string | null;
          last_ping_domain?: string | null;
          last_ping_ip?: string | null;
          license_id?: string;
          notes?: string | null;
          revoked?: boolean;
          status?: string;
          updated_at?: string;
        };
        Update: {
          allowed_domains?: string[];
          business_id?: string | null;
          created_at?: string;
          domain?: string | null;
          id?: string;
          issued_at?: string;
          last_ping_at?: string | null;
          last_ping_domain?: string | null;
          last_ping_ip?: string | null;
          license_id?: string;
          notes?: string | null;
          revoked?: boolean;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "licenses_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
        ];
      };
      notifications: {
        Row: {
          business_id: string | null;
          channel: string;
          created_at: string;
          error: string | null;
          id: string;
          payload: NonNullable<Json>;
          sent_at: string | null;
          status: string;
          type: string;
        };
        ComputedFields: never;
        Insert: {
          business_id?: string | null;
          channel: string;
          created_at?: string;
          error?: string | null;
          id?: string;
          payload?: NonNullable<Json>;
          sent_at?: string | null;
          status?: string;
          type: string;
        };
        Update: {
          business_id?: string | null;
          channel?: string;
          created_at?: string;
          error?: string | null;
          id?: string;
          payload?: NonNullable<Json>;
          sent_at?: string | null;
          status?: string;
          type?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notifications_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
        ];
      };
      outreach_log: {
        Row: {
          business_id: string | null;
          channel: string | null;
          clicked_at: string | null;
          created_at: string;
          email_account_id: string | null;
          error: string | null;
          id: string;
          message: string | null;
          opened_at: string | null;
          retry_count: number;
          sent_at: string | null;
          status: string | null;
          subject: string | null;
          template_id: string | null;
          tracking_token: string | null;
        };
        ComputedFields: never;
        Insert: {
          business_id?: string | null;
          channel?: string | null;
          clicked_at?: string | null;
          created_at?: string;
          email_account_id?: string | null;
          error?: string | null;
          id?: string;
          message?: string | null;
          opened_at?: string | null;
          retry_count?: number;
          sent_at?: string | null;
          status?: string | null;
          subject?: string | null;
          template_id?: string | null;
          tracking_token?: string | null;
        };
        Update: {
          business_id?: string | null;
          channel?: string | null;
          clicked_at?: string | null;
          created_at?: string;
          email_account_id?: string | null;
          error?: string | null;
          id?: string;
          message?: string | null;
          opened_at?: string | null;
          retry_count?: number;
          sent_at?: string | null;
          status?: string | null;
          subject?: string | null;
          template_id?: string | null;
          tracking_token?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "outreach_log_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "outreach_log_email_account_id_fkey";
            columns: ["email_account_id"];
            isOneToOne: false;
            referencedRelation: "email_accounts";
            referencedColumns: ["id"];
          },
        ];
      };
      payments: {
        Row: {
          amount: number;
          business_id: string;
          created_at: string;
          id: string;
          note: string | null;
          paid_at: string;
          period_end: string | null;
          period_start: string | null;
          receipt_sent_at: string | null;
          receipt_url: string | null;
          type: string;
        };
        ComputedFields: never;
        Insert: {
          amount: number;
          business_id: string;
          created_at?: string;
          id?: string;
          note?: string | null;
          paid_at?: string;
          period_end?: string | null;
          period_start?: string | null;
          receipt_sent_at?: string | null;
          receipt_url?: string | null;
          type: string;
        };
        Update: {
          amount?: number;
          business_id?: string;
          created_at?: string;
          id?: string;
          note?: string | null;
          paid_at?: string;
          period_end?: string | null;
          period_start?: string | null;
          receipt_sent_at?: string | null;
          receipt_url?: string | null;
          type?: string;
        };
        Relationships: [
          {
            foreignKeyName: "payments_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
        ];
      };
      photos: {
        Row: {
          alt: string | null;
          business_id: string;
          created_at: string;
          height: number | null;
          id: string;
          is_main: boolean;
          mime_type: string | null;
          path: string | null;
          size_bytes: number | null;
          sort_order: number;
          url: string | null;
          width: number | null;
        };
        ComputedFields: never;
        Insert: {
          alt?: string | null;
          business_id: string;
          created_at?: string;
          height?: number | null;
          id?: string;
          is_main?: boolean;
          mime_type?: string | null;
          path?: string | null;
          size_bytes?: number | null;
          sort_order?: number;
          url?: string | null;
          width?: number | null;
        };
        Update: {
          alt?: string | null;
          business_id?: string;
          created_at?: string;
          height?: number | null;
          id?: string;
          is_main?: boolean;
          mime_type?: string | null;
          path?: string | null;
          size_bytes?: number | null;
          sort_order?: number;
          url?: string | null;
          width?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "photos_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
        ];
      };
      pricing_plans: {
        Row: {
          features: Json | null;
          id: string;
          is_active: boolean;
          name: string | null;
          price_monthly: number | null;
          price_yearly: number | null;
        };
        ComputedFields: never;
        Insert: {
          features?: Json | null;
          id?: string;
          is_active?: boolean;
          name?: string | null;
          price_monthly?: number | null;
          price_yearly?: number | null;
        };
        Update: {
          features?: Json | null;
          id?: string;
          is_active?: boolean;
          name?: string | null;
          price_monthly?: number | null;
          price_yearly?: number | null;
        };
        Relationships: [];
      };
      promo_codes: {
        Row: {
          code: string;
          discount_type: string | null;
          discount_value: number | null;
          id: string;
          is_active: boolean;
          max_uses: number | null;
          used_count: number;
          valid_until: string | null;
        };
        ComputedFields: never;
        Insert: {
          code: string;
          discount_type?: string | null;
          discount_value?: number | null;
          id?: string;
          is_active?: boolean;
          max_uses?: number | null;
          used_count?: number;
          valid_until?: string | null;
        };
        Update: {
          code?: string;
          discount_type?: string | null;
          discount_value?: number | null;
          id?: string;
          is_active?: boolean;
          max_uses?: number | null;
          used_count?: number;
          valid_until?: string | null;
        };
        Relationships: [];
      };
      rate_limits: {
        Row: {
          bucket: string;
          hits: number;
          window_start: string;
        };
        ComputedFields: never;
        Insert: {
          bucket: string;
          hits?: number;
          window_start: string;
        };
        Update: {
          bucket?: string;
          hits?: number;
          window_start?: string;
        };
        Relationships: [];
      };
      receipts: {
        Row: {
          amount: number | null;
          business_id: string;
          created_at: string;
          id: string;
          payment_id: string | null;
          receipt_url: string | null;
          sent_at: string | null;
        };
        ComputedFields: never;
        Insert: {
          amount?: number | null;
          business_id: string;
          created_at?: string;
          id?: string;
          payment_id?: string | null;
          receipt_url?: string | null;
          sent_at?: string | null;
        };
        Update: {
          amount?: number | null;
          business_id?: string;
          created_at?: string;
          id?: string;
          payment_id?: string | null;
          receipt_url?: string | null;
          sent_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "receipts_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "receipts_payment_id_fkey";
            columns: ["payment_id"];
            isOneToOne: false;
            referencedRelation: "payments";
            referencedColumns: ["id"];
          },
        ];
      };
      services: {
        Row: {
          buffer_after: number;
          buffer_before: number;
          business_id: string;
          category: string | null;
          created_at: string;
          description: string | null;
          duration_minutes: number;
          id: string;
          is_active: boolean;
          is_online: boolean;
          max_clients: number;
          name: string;
          price: number;
          sort_order: number;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          buffer_after?: number;
          buffer_before?: number;
          business_id: string;
          category?: string | null;
          created_at?: string;
          description?: string | null;
          duration_minutes?: number;
          id?: string;
          is_active?: boolean;
          is_online?: boolean;
          max_clients?: number;
          name: string;
          price?: number;
          sort_order?: number;
          updated_at?: string;
        };
        Update: {
          buffer_after?: number;
          buffer_before?: number;
          business_id?: string;
          category?: string | null;
          created_at?: string;
          description?: string | null;
          duration_minutes?: number;
          id?: string;
          is_active?: boolean;
          is_online?: boolean;
          max_clients?: number;
          name?: string;
          price?: number;
          sort_order?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "services_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
        ];
      };
      settings: {
        Row: {
          key: string;
          updated_at: string;
          value: NonNullable<Json>;
        };
        ComputedFields: never;
        Insert: {
          key: string;
          updated_at?: string;
          value?: NonNullable<Json>;
        };
        Update: {
          key?: string;
          updated_at?: string;
          value?: NonNullable<Json>;
        };
        Relationships: [];
      };
      slug_locks: {
        Row: {
          business_id: string | null;
          locked_at: string;
          slug: string;
        };
        ComputedFields: never;
        Insert: {
          business_id?: string | null;
          locked_at?: string;
          slug: string;
        };
        Update: {
          business_id?: string | null;
          locked_at?: string;
          slug?: string;
        };
        Relationships: [
          {
            foreignKeyName: "slug_locks_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
        ];
      };
      super_admins: {
        Row: {
          auth_user_id: string;
          created_at: string;
          email: string;
          id: string;
          name: string | null;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          auth_user_id: string;
          created_at?: string;
          email: string;
          id?: string;
          name?: string | null;
          updated_at?: string;
        };
        Update: {
          auth_user_id?: string;
          created_at?: string;
          email?: string;
          id?: string;
          name?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      support_tickets: {
        Row: {
          assigned_to: string | null;
          business_id: string | null;
          closed_at: string | null;
          created_at: string;
          email: string | null;
          id: string;
          message: string | null;
          priority: string;
          status: string;
          subject: string | null;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          assigned_to?: string | null;
          business_id?: string | null;
          closed_at?: string | null;
          created_at?: string;
          email?: string | null;
          id?: string;
          message?: string | null;
          priority?: string;
          status?: string;
          subject?: string | null;
          updated_at?: string;
        };
        Update: {
          assigned_to?: string | null;
          business_id?: string | null;
          closed_at?: string | null;
          created_at?: string;
          email?: string | null;
          id?: string;
          message?: string | null;
          priority?: string;
          status?: string;
          subject?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "support_tickets_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
        ];
      };
      telegram_messages: {
        Row: {
          business_id: string | null;
          chat_id: string | null;
          created_at: string;
          direction: string;
          id: number;
          message_id: string | null;
          payload: NonNullable<Json>;
          text: string | null;
        };
        ComputedFields: never;
        Insert: {
          business_id?: string | null;
          chat_id?: string | null;
          created_at?: string;
          direction: string;
          id?: number;
          message_id?: string | null;
          payload?: NonNullable<Json>;
          text?: string | null;
        };
        Update: {
          business_id?: string | null;
          chat_id?: string | null;
          created_at?: string;
          direction?: string;
          id?: number;
          message_id?: string | null;
          payload?: NonNullable<Json>;
          text?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "telegram_messages_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
        ];
      };
      templates: {
        Row: {
          active: boolean;
          body: string | null;
          body_html: string | null;
          body_text: string | null;
          channel: string | null;
          created_at: string;
          history: NonNullable<Json>;
          id: string;
          name: string | null;
          subject: string | null;
          type: string | null;
          updated_at: string;
          variables: NonNullable<Json>;
          version: number;
          vertical_template_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          active?: boolean;
          body?: string | null;
          body_html?: string | null;
          body_text?: string | null;
          channel?: string | null;
          created_at?: string;
          history?: NonNullable<Json>;
          id?: string;
          name?: string | null;
          subject?: string | null;
          type?: string | null;
          updated_at?: string;
          variables?: NonNullable<Json>;
          version?: number;
          vertical_template_id?: string | null;
        };
        Update: {
          active?: boolean;
          body?: string | null;
          body_html?: string | null;
          body_text?: string | null;
          channel?: string | null;
          created_at?: string;
          history?: NonNullable<Json>;
          id?: string;
          name?: string | null;
          subject?: string | null;
          type?: string | null;
          updated_at?: string;
          variables?: NonNullable<Json>;
          version?: number;
          vertical_template_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "templates_vertical_template_id_fkey";
            columns: ["vertical_template_id"];
            isOneToOne: false;
            referencedRelation: "vertical_templates";
            referencedColumns: ["id"];
          },
        ];
      };
      templates_versions: {
        Row: {
          body_html: string | null;
          body_text: string | null;
          created_at: string;
          id: string;
          subject: string | null;
          template_id: string;
          version: number;
        };
        ComputedFields: never;
        Insert: {
          body_html?: string | null;
          body_text?: string | null;
          created_at?: string;
          id?: string;
          subject?: string | null;
          template_id: string;
          version: number;
        };
        Update: {
          body_html?: string | null;
          body_text?: string | null;
          created_at?: string;
          id?: string;
          subject?: string | null;
          template_id?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "templates_versions_template_id_fkey";
            columns: ["template_id"];
            isOneToOne: false;
            referencedRelation: "templates";
            referencedColumns: ["id"];
          },
        ];
      };
      unsubscribes: {
        Row: {
          created_at: string;
          email: string;
          id: string;
          reason: string | null;
          token: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          email: string;
          id?: string;
          reason?: string | null;
          token?: string;
        };
        Update: {
          created_at?: string;
          email?: string;
          id?: string;
          reason?: string | null;
          token?: string;
        };
        Relationships: [];
      };
      vertical_templates: {
        Row: {
          blocks: NonNullable<Json>;
          created_at: string;
          default_colors: NonNullable<Json>;
          default_services: NonNullable<Json>;
          default_texts: NonNullable<Json>;
          description: string | null;
          fields: NonNullable<Json>;
          icon: string | null;
          id: string;
          is_active: boolean;
          name: string;
          show_demo_mode: boolean;
          slug: string;
          updated_at: string;
          url_prefix: string;
        };
        ComputedFields: never;
        Insert: {
          blocks?: NonNullable<Json>;
          created_at?: string;
          default_colors?: NonNullable<Json>;
          default_services?: NonNullable<Json>;
          default_texts?: NonNullable<Json>;
          description?: string | null;
          fields?: NonNullable<Json>;
          icon?: string | null;
          id?: string;
          is_active?: boolean;
          name: string;
          show_demo_mode?: boolean;
          slug: string;
          updated_at?: string;
          url_prefix: string;
        };
        Update: {
          blocks?: NonNullable<Json>;
          created_at?: string;
          default_colors?: NonNullable<Json>;
          default_services?: NonNullable<Json>;
          default_texts?: NonNullable<Json>;
          description?: string | null;
          fields?: NonNullable<Json>;
          icon?: string | null;
          id?: string;
          is_active?: boolean;
          name?: string;
          show_demo_mode?: boolean;
          slug?: string;
          updated_at?: string;
          url_prefix?: string;
        };
        Relationships: [];
      };
      webhook_events: {
        Row: {
          created_at: string;
          event_id: string;
          id: string;
          payload: NonNullable<Json>;
          processed_at: string | null;
          source: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          event_id: string;
          id?: string;
          payload?: NonNullable<Json>;
          processed_at?: string | null;
          source: string;
        };
        Update: {
          created_at?: string;
          event_id?: string;
          id?: string;
          payload?: NonNullable<Json>;
          processed_at?: string | null;
          source?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      analytics_daily: {
        Row: {
          business_id: string | null;
          day: string | null;
          event: string | null;
          events: number | null;
          sessions: number | null;
          visitors: number | null;
        };
        ComputedFields: never;
        Relationships: [];
      };
    };
    Functions: {
      accessible_business_ids: { Args: Record<PropertyKey, never>; Returns: string[] };
      analytics_business_summary: { Args: Record<PropertyKey, never>; Returns: Json };
      analytics_create_partition: { Args: { p_month: string }; Returns: string };
      analytics_drop_old_partitions: { Args: { p_keep_months?: number }; Returns: number };
      analytics_ensure_partitions: { Args: { p_ahead?: number }; Returns: number };
      analytics_outreach_summary: { Args: { p_from: string; p_to: string }; Returns: Json };
      analytics_purge_rate_limits: { Args: Record<PropertyKey, never>; Returns: number };
      analytics_rate_hit: {
        Args: { p_bucket: string; p_limit: number; p_window_seconds: number };
        Returns: boolean;
      };
      analytics_refresh: { Args: Record<PropertyKey, never>; Returns: string };
      analytics_refresh_if_stale: { Args: { p_max_age?: string }; Returns: string };
      analytics_secure_relation: { Args: { p_name: string }; Returns: undefined };
      analytics_series: {
        Args: { p_business_id?: string; p_from: string; p_group?: string; p_to: string };
        Returns: Json;
      };
      analytics_traffic_summary: {
        Args: { p_business_id?: string; p_from: string; p_to: string };
        Returns: Json;
      };
      booking_range: { Args: { p_minutes: number; p_start: string }; Returns: unknown };
      create_monthly_partitions: { Args: { p_months_ahead?: number }; Returns: number };
      create_monthly_partitions_for: {
        Args: { p_months_ahead?: number; p_table: string };
        Returns: number;
      };
      cron_apply_registry: { Args: Record<PropertyKey, never>; Returns: number };
      cron_assert_registry: { Args: Record<PropertyKey, never>; Returns: undefined };
      cron_claim: { Args: { p_job: string; p_keys: string[] }; Returns: string[] };
      cron_claim_follow_up: {
        Args: { p_limit?: number };
        Returns: {
          business_id: string;
          stage: string;
        }[];
      };
      cron_claim_unconfirmed: { Args: { p_limit?: number }; Returns: string[] };
      cron_drop_old_partitions: { Args: { p_cutoff: string; p_table: string }; Returns: number };
      cron_http_call: { Args: { p_job: string }; Returns: number };
      cron_keep_alive: { Args: Record<PropertyKey, never>; Returns: number };
      cron_log_error: { Args: { p_job: string; p_message: string }; Returns: undefined };
      cron_log_result: { Args: { p_job: string; p_payload: Json }; Returns: undefined };
      cron_release: { Args: { p_job: string; p_keys: string[] }; Returns: undefined };
      cron_retention: { Args: { p_table: string }; Returns: number };
      cron_setting: { Args: { p_name: string }; Returns: string };
      cron_try_lock: {
        Args: { p_job: string; p_run_id: string; p_ttl_seconds?: number };
        Returns: boolean;
      };
      cron_unlock: { Args: { p_job: string; p_run_id: string }; Returns: undefined };
      current_auth_uid: { Args: Record<PropertyKey, never>; Returns: string };
      current_business: { Args: Record<PropertyKey, never>; Returns: string };
      drop_old_partitions:
        | { Args: Record<PropertyKey, never>; Returns: number }
        | { Args: { p_months_to_keep: number; p_table: string }; Returns: number };
      ensure_check: {
        Args: { p_expr: string; p_name: string; p_table: string };
        Returns: undefined;
      };
      ensure_fk: {
        Args: { p_col: string; p_on_delete: string; p_ref: string; p_table: string };
        Returns: undefined;
      };
      ensure_month_partition: {
        Args: { p_key: string; p_month: string; p_table: string };
        Returns: boolean;
      };
      ensure_partitions_for_range: {
        Args: { p_from: string; p_key: string; p_table: string };
        Returns: undefined;
      };
      is_anon: { Args: Record<PropertyKey, never>; Returns: boolean };
      is_api_role: { Args: Record<PropertyKey, never>; Returns: boolean };
      is_business_member: { Args: { b: string }; Returns: boolean };
      is_partitioned: { Args: { p_table: string }; Returns: boolean };
      is_super_admin: { Args: Record<PropertyKey, never>; Returns: boolean };
      owned_business_ids: { Args: Record<PropertyKey, never>; Returns: string[] };
      partition_retention_months: { Args: { p_table: string }; Returns: number };
      public_business_ids: { Args: Record<PropertyKey, never>; Returns: string[] };
      rate_limit_hit: {
        Args: { p_bucket: string; p_limit: number; p_window_seconds: number };
        Returns: {
          allowed: boolean;
          hits: number;
          retry_after: number;
        }[];
      };
      secure_partition: { Args: { p_partition: string }; Returns: undefined };
      show_limit: { Args: Record<PropertyKey, never>; Returns: number };
      show_trgm: { Args: { "": string }; Returns: string[] };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
