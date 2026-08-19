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
    PostgrestVersion: "14.15"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      account_change_counts: {
        Row: {
          change_type: string
          count: number
          period: string
          user_id: string
        }
        Insert: {
          change_type: string
          count?: number
          period: string
          user_id: string
        }
        Update: {
          change_type?: string
          count?: number
          period?: string
          user_id?: string
        }
        Relationships: []
      }
      ad_reports: {
        Row: {
          advertisement_id: string
          campaign_id: string
          created_at: string
          details: string | null
          id: string
          reason: string
          status: Database["public"]["Enums"]["ad_report_status"]
          user_id: string | null
        }
        Insert: {
          advertisement_id: string
          campaign_id: string
          created_at?: string
          details?: string | null
          id?: string
          reason: string
          status?: Database["public"]["Enums"]["ad_report_status"]
          user_id?: string | null
        }
        Update: {
          advertisement_id?: string
          campaign_id?: string
          created_at?: string
          details?: string | null
          id?: string
          reason?: string
          status?: Database["public"]["Enums"]["ad_report_status"]
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ad_reports_advertisement_id_fkey"
            columns: ["advertisement_id"]
            isOneToOne: false
            referencedRelation: "advertisements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_reports_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_audit_logs: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          created_at: string
          details: Json | null
          id: string
          target_id: string | null
          target_type: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          target_id?: string | null
          target_type?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          target_id?: string | null
          target_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_audit_logs_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      admin_biometric_credentials: {
        Row: {
          admin_id: string
          created_at: string
          enabled: boolean
          id: string
          model_version: string
          template: number[]
          threshold_override: number | null
          updated_at: string
          version: number
        }
        Insert: {
          admin_id: string
          created_at?: string
          enabled?: boolean
          id?: string
          model_version?: string
          template: number[]
          threshold_override?: number | null
          updated_at?: string
          version?: number
        }
        Update: {
          admin_id?: string
          created_at?: string
          enabled?: boolean
          id?: string
          model_version?: string
          template?: number[]
          threshold_override?: number | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "admin_biometric_credentials_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      admin_face_sessions: {
        Row: {
          admin_id: string
          challenge_id: string | null
          created_at: string
          expires_at: string
          factor: string
          grant_token_hash: string
          id: string
          revoked_at: string | null
        }
        Insert: {
          admin_id: string
          challenge_id?: string | null
          created_at?: string
          expires_at: string
          factor?: string
          grant_token_hash: string
          id?: string
          revoked_at?: string | null
        }
        Update: {
          admin_id?: string
          challenge_id?: string | null
          created_at?: string
          expires_at?: string
          factor?: string
          grant_token_hash?: string
          id?: string
          revoked_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_face_sessions_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "admin_face_sessions_challenge_id_fkey"
            columns: ["challenge_id"]
            isOneToOne: false
            referencedRelation: "verification_challenges"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_webauthn_credentials: {
        Row: {
          aaguid: string | null
          admin_id: string
          algorithm: number
          counter: number
          created_at: string
          credential_id: string
          device_name: string | null
          enabled: boolean
          id: string
          last_used_at: string | null
          public_key: string
          transports: Json | null
        }
        Insert: {
          aaguid?: string | null
          admin_id: string
          algorithm?: number
          counter?: number
          created_at?: string
          credential_id: string
          device_name?: string | null
          enabled?: boolean
          id?: string
          last_used_at?: string | null
          public_key: string
          transports?: Json | null
        }
        Update: {
          aaguid?: string | null
          admin_id?: string
          algorithm?: number
          counter?: number
          created_at?: string
          credential_id?: string
          device_name?: string | null
          enabled?: boolean
          id?: string
          last_used_at?: string | null
          public_key?: string
          transports?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_webauthn_credentials_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      advertisements: {
        Row: {
          campaign_id: string
          created_at: string
          cta: string | null
          description: string | null
          headline: string | null
          id: string
          post_id: string | null
          updated_at: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          cta?: string | null
          description?: string | null
          headline?: string | null
          id?: string
          post_id?: string | null
          updated_at?: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          cta?: string | null
          description?: string | null
          headline?: string | null
          id?: string
          post_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "advertisements_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: true
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "advertisements_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      advertiser_accounts: {
        Row: {
          account_type: Database["public"]["Enums"]["advertiser_account_type"]
          avatar_url: string | null
          category: string | null
          contact_email: string | null
          contact_phone: string | null
          cover_url: string | null
          created_at: string
          description: string | null
          id: string
          location: string | null
          name: string
          status: Database["public"]["Enums"]["advertiser_status"]
          updated_at: string
          user_id: string
          username: string
          website: string | null
        }
        Insert: {
          account_type?: Database["public"]["Enums"]["advertiser_account_type"]
          avatar_url?: string | null
          category?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          cover_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          location?: string | null
          name: string
          status?: Database["public"]["Enums"]["advertiser_status"]
          updated_at?: string
          user_id: string
          username: string
          website?: string | null
        }
        Update: {
          account_type?: Database["public"]["Enums"]["advertiser_account_type"]
          avatar_url?: string | null
          category?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          cover_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          location?: string | null
          name?: string
          status?: Database["public"]["Enums"]["advertiser_status"]
          updated_at?: string
          user_id?: string
          username?: string
          website?: string | null
        }
        Relationships: []
      }
      authentication_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          ip_hash: string | null
          metadata: Json | null
          success: boolean
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          ip_hash?: string | null
          metadata?: Json | null
          success?: boolean
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          ip_hash?: string | null
          metadata?: Json | null
          success?: boolean
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "authentication_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      author_earnings: {
        Row: {
          created_at: string
          id: string
          last_payout_at: string | null
          pending_payout: number
          total_author_earnings: number
          total_platform_fees: number
          total_revenue: number
          total_sales: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_payout_at?: string | null
          pending_payout?: number
          total_author_earnings?: number
          total_platform_fees?: number
          total_revenue?: number
          total_sales?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          last_payout_at?: string | null
          pending_payout?: number
          total_author_earnings?: number
          total_platform_fees?: number
          total_revenue?: number
          total_sales?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      author_stripe_accounts: {
        Row: {
          charges_enabled: boolean
          created_at: string
          id: string
          onboarding_complete: boolean
          payouts_enabled: boolean
          stripe_account_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          charges_enabled?: boolean
          created_at?: string
          id?: string
          onboarding_complete?: boolean
          payouts_enabled?: boolean
          stripe_account_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          charges_enabled?: boolean
          created_at?: string
          id?: string
          onboarding_complete?: boolean
          payouts_enabled?: boolean
          stripe_account_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      backup_archives: {
        Row: {
          checksum: string | null
          created_at: string
          data: Json | null
          id: string
          kind: string
          size_bytes: number | null
          storage_path: string | null
        }
        Insert: {
          checksum?: string | null
          created_at?: string
          data?: Json | null
          id?: string
          kind: string
          size_bytes?: number | null
          storage_path?: string | null
        }
        Update: {
          checksum?: string | null
          created_at?: string
          data?: Json | null
          id?: string
          kind?: string
          size_bytes?: number | null
          storage_path?: string | null
        }
        Relationships: []
      }
      blocked_attacks_log: {
        Row: {
          created_at: string
          id: string
          ip: unknown
          rule: string | null
          source: string
        }
        Insert: {
          created_at?: string
          id?: string
          ip?: unknown
          rule?: string | null
          source?: string
        }
        Update: {
          created_at?: string
          id?: string
          ip?: unknown
          rule?: string | null
          source?: string
        }
        Relationships: []
      }
      blocks: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string
          id: string
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string
          id?: string
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "blocks_blocked_id_fkey"
            columns: ["blocked_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "blocks_blocker_id_fkey"
            columns: ["blocker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      book_likes: {
        Row: {
          book_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          book_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          book_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "book_likes_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
        ]
      }
      book_purchases: {
        Row: {
          amount_paid: number
          author_earnings: number
          author_id: string
          book_id: string
          buyer_id: string
          created_at: string
          id: string
          platform_fee: number
          status: string
          stripe_payment_intent_id: string | null
          stripe_session_id: string | null
          updated_at: string
        }
        Insert: {
          amount_paid: number
          author_earnings: number
          author_id: string
          book_id: string
          buyer_id: string
          created_at?: string
          id?: string
          platform_fee: number
          status?: string
          stripe_payment_intent_id?: string | null
          stripe_session_id?: string | null
          updated_at?: string
        }
        Update: {
          amount_paid?: number
          author_earnings?: number
          author_id?: string
          book_id?: string
          buyer_id?: string
          created_at?: string
          id?: string
          platform_fee?: number
          status?: string
          stripe_payment_intent_id?: string | null
          stripe_session_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "book_purchases_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
        ]
      }
      books: {
        Row: {
          author_id: string
          cover_url: string | null
          created_at: string
          description: string | null
          genre: string | null
          hidden: boolean
          id: string
          is_free: boolean | null
          pdf_url: string | null
          price: number | null
          published_at: string | null
          status: Database["public"]["Enums"]["book_status"]
          tags: string[] | null
          title: string
          updated_at: string
          view_count: number | null
        }
        Insert: {
          author_id: string
          cover_url?: string | null
          created_at?: string
          description?: string | null
          genre?: string | null
          hidden?: boolean
          id?: string
          is_free?: boolean | null
          pdf_url?: string | null
          price?: number | null
          published_at?: string | null
          status?: Database["public"]["Enums"]["book_status"]
          tags?: string[] | null
          title: string
          updated_at?: string
          view_count?: number | null
        }
        Update: {
          author_id?: string
          cover_url?: string | null
          created_at?: string
          description?: string | null
          genre?: string | null
          hidden?: boolean
          id?: string
          is_free?: boolean | null
          pdf_url?: string | null
          price?: number | null
          published_at?: string | null
          status?: Database["public"]["Enums"]["book_status"]
          tags?: string[] | null
          title?: string
          updated_at?: string
          view_count?: number | null
        }
        Relationships: []
      }
      call_blocks: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string
          id: string
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string
          id?: string
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string
          id?: string
        }
        Relationships: []
      }
      call_sessions: {
        Row: {
          call_type: string
          caller_ice_candidates: Json | null
          caller_id: string
          conversation_id: string
          created_at: string
          ended_at: string | null
          id: string
          receiver_ice_candidates: Json | null
          receiver_id: string
          sdp_answer: string | null
          sdp_offer: string | null
          started_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          call_type: string
          caller_ice_candidates?: Json | null
          caller_id: string
          conversation_id: string
          created_at?: string
          ended_at?: string | null
          id?: string
          receiver_ice_candidates?: Json | null
          receiver_id: string
          sdp_answer?: string | null
          sdp_offer?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          call_type?: string
          caller_ice_candidates?: Json | null
          caller_id?: string
          conversation_id?: string
          created_at?: string
          ended_at?: string | null
          id?: string
          receiver_ice_candidates?: Json | null
          receiver_id?: string
          sdp_answer?: string | null
          sdp_offer?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "call_sessions_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_daily_stats: {
        Row: {
          campaign_id: string
          clicks: number
          comments: number
          conversions: number
          follows: number
          impressions: number
          likes: number
          profile_visits: number
          saves: number
          shares: number
          spend_cents: number
          stat_date: string
          website_clicks: number
        }
        Insert: {
          campaign_id: string
          clicks?: number
          comments?: number
          conversions?: number
          follows?: number
          impressions?: number
          likes?: number
          profile_visits?: number
          saves?: number
          shares?: number
          spend_cents?: number
          stat_date: string
          website_clicks?: number
        }
        Update: {
          campaign_id?: string
          clicks?: number
          comments?: number
          conversions?: number
          follows?: number
          impressions?: number
          likes?: number
          profile_visits?: number
          saves?: number
          shares?: number
          spend_cents?: number
          stat_date?: string
          website_clicks?: number
        }
        Relationships: [
          {
            foreignKeyName: "campaign_daily_stats_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_events: {
        Row: {
          advertisement_id: string | null
          campaign_id: string
          created_at: string
          event_id: string
          event_type: Database["public"]["Enums"]["ad_event_type"]
          id: string
          placement: Database["public"]["Enums"]["ad_placement"]
          viewer_user_id: string | null
        }
        Insert: {
          advertisement_id?: string | null
          campaign_id: string
          created_at?: string
          event_id: string
          event_type: Database["public"]["Enums"]["ad_event_type"]
          id?: string
          placement?: Database["public"]["Enums"]["ad_placement"]
          viewer_user_id?: string | null
        }
        Update: {
          advertisement_id?: string | null
          campaign_id?: string
          created_at?: string
          event_id?: string
          event_type?: Database["public"]["Enums"]["ad_event_type"]
          id?: string
          placement?: Database["public"]["Enums"]["ad_placement"]
          viewer_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_events_advertisement_id_fkey"
            columns: ["advertisement_id"]
            isOneToOne: false
            referencedRelation: "advertisements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_events_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_targeting: {
        Row: {
          automatic: boolean
          campaign_id: string
          created_at: string
          id: string
          interests: string[]
          languages: string[]
          locations: string[]
          max_age: number | null
          min_age: number | null
          updated_at: string
        }
        Insert: {
          automatic?: boolean
          campaign_id: string
          created_at?: string
          id?: string
          interests?: string[]
          languages?: string[]
          locations?: string[]
          max_age?: number | null
          min_age?: number | null
          updated_at?: string
        }
        Update: {
          automatic?: boolean
          campaign_id?: string
          created_at?: string
          id?: string
          interests?: string[]
          languages?: string[]
          locations?: string[]
          max_age?: number | null
          min_age?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_targeting_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: true
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          advertiser_id: string
          approved_at: string | null
          budget_type: Database["public"]["Enums"]["campaign_budget_type"]
          cost_per_impression_cents: number
          created_at: string
          cta: string | null
          cta_url: string | null
          currency: string
          daily_budget_cents: number | null
          description: string | null
          end_at: string
          ended_at: string | null
          estimated_impressions: number | null
          estimated_reach_max: number | null
          estimated_reach_min: number | null
          headline: string | null
          id: string
          impressions_delivered: number
          is_scheduled: boolean
          moderation_note: string | null
          name: string
          objective: Database["public"]["Enums"]["campaign_objective"]
          paid_at: string | null
          post_id: string | null
          rejection_reason: string | null
          spend_cents: number
          start_at: string
          status: Database["public"]["Enums"]["campaign_status"]
          total_budget_cents: number
          updated_at: string
          user_id: string
        }
        Insert: {
          advertiser_id: string
          approved_at?: string | null
          budget_type?: Database["public"]["Enums"]["campaign_budget_type"]
          cost_per_impression_cents?: number
          created_at?: string
          cta?: string | null
          cta_url?: string | null
          currency?: string
          daily_budget_cents?: number | null
          description?: string | null
          end_at: string
          ended_at?: string | null
          estimated_impressions?: number | null
          estimated_reach_max?: number | null
          estimated_reach_min?: number | null
          headline?: string | null
          id?: string
          impressions_delivered?: number
          is_scheduled?: boolean
          moderation_note?: string | null
          name: string
          objective: Database["public"]["Enums"]["campaign_objective"]
          paid_at?: string | null
          post_id?: string | null
          rejection_reason?: string | null
          spend_cents?: number
          start_at: string
          status?: Database["public"]["Enums"]["campaign_status"]
          total_budget_cents: number
          updated_at?: string
          user_id: string
        }
        Update: {
          advertiser_id?: string
          approved_at?: string | null
          budget_type?: Database["public"]["Enums"]["campaign_budget_type"]
          cost_per_impression_cents?: number
          created_at?: string
          cta?: string | null
          cta_url?: string | null
          currency?: string
          daily_budget_cents?: number | null
          description?: string | null
          end_at?: string
          ended_at?: string | null
          estimated_impressions?: number | null
          estimated_reach_max?: number | null
          estimated_reach_min?: number | null
          headline?: string | null
          id?: string
          impressions_delivered?: number
          is_scheduled?: boolean
          moderation_note?: string | null
          name?: string
          objective?: Database["public"]["Enums"]["campaign_objective"]
          paid_at?: string | null
          post_id?: string | null
          rejection_reason?: string | null
          spend_cents?: number
          start_at?: string
          status?: Database["public"]["Enums"]["campaign_status"]
          total_budget_cents?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_advertiser_id_fkey"
            columns: ["advertiser_id"]
            isOneToOne: false
            referencedRelation: "advertiser_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      chapters: {
        Row: {
          book_id: string
          content: string
          created_at: string
          id: string
          is_published: boolean | null
          position: number
          title: string
          updated_at: string
          word_count: number | null
        }
        Insert: {
          book_id: string
          content?: string
          created_at?: string
          id?: string
          is_published?: boolean | null
          position?: number
          title: string
          updated_at?: string
          word_count?: number | null
        }
        Update: {
          book_id?: string
          content?: string
          created_at?: string
          id?: string
          is_published?: boolean | null
          position?: number
          title?: string
          updated_at?: string
          word_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "chapters_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
        ]
      }
      collection_items: {
        Row: {
          added_at: string
          collection_id: string
          id: string
          item_id: string
        }
        Insert: {
          added_at?: string
          collection_id: string
          id?: string
          item_id: string
        }
        Update: {
          added_at?: string
          collection_id?: string
          id?: string
          item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "collection_items_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "collections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collection_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "library_items"
            referencedColumns: ["id"]
          },
        ]
      }
      collections: {
        Row: {
          cover_image: string | null
          created_at: string
          description: string | null
          id: string
          is_public: boolean
          item_count: number
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          cover_image?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_public?: boolean
          item_count?: number
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          cover_image?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_public?: boolean
          item_count?: number
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      comment_votes: {
        Row: {
          comment_id: string
          created_at: string
          id: string
          user_id: string
          vote_type: string
        }
        Insert: {
          comment_id: string
          created_at?: string
          id?: string
          user_id: string
          vote_type: string
        }
        Update: {
          comment_id?: string
          created_at?: string
          id?: string
          user_id?: string
          vote_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "comment_votes_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
        ]
      }
      comments: {
        Row: {
          content: string
          created_at: string
          downvote_count: number | null
          hidden: boolean
          id: string
          is_edited: boolean | null
          parent_id: string | null
          post_id: string
          updated_at: string
          upvote_count: number | null
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          downvote_count?: number | null
          hidden?: boolean
          id?: string
          is_edited?: boolean | null
          parent_id?: string | null
          post_id: string
          updated_at?: string
          upvote_count?: number | null
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          downvote_count?: number | null
          hidden?: boolean
          id?: string
          is_edited?: boolean | null
          parent_id?: string | null
          post_id?: string
          updated_at?: string
          upvote_count?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      confession_guesses: {
        Row: {
          confession_id: string
          created_at: string
          guessed_user_id: string
          guesser_id: string
          id: string
          is_correct: boolean
        }
        Insert: {
          confession_id: string
          created_at?: string
          guessed_user_id: string
          guesser_id: string
          id?: string
          is_correct?: boolean
        }
        Update: {
          confession_id?: string
          created_at?: string
          guessed_user_id?: string
          guesser_id?: string
          id?: string
          is_correct?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "confession_guesses_confession_id_fkey"
            columns: ["confession_id"]
            isOneToOne: false
            referencedRelation: "confessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "confession_guesses_confession_id_fkey"
            columns: ["confession_id"]
            isOneToOne: false
            referencedRelation: "confessions_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "confession_guesses_guessed_user_id_fkey"
            columns: ["guessed_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "confession_guesses_guesser_id_fkey"
            columns: ["guesser_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      confessions: {
        Row: {
          content: string
          created_at: string
          guess_count: number
          id: string
          revealed: boolean
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          guess_count?: number
          id?: string
          revealed?: boolean
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          guess_count?: number
          id?: string
          revealed?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "confessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      conversation_participants: {
        Row: {
          conversation_id: string
          id: string
          is_typing: boolean | null
          joined_at: string
          last_read_at: string | null
          muted: boolean
          role: string
          typing_updated_at: string | null
          user_id: string
        }
        Insert: {
          conversation_id: string
          id?: string
          is_typing?: boolean | null
          joined_at?: string
          last_read_at?: string | null
          muted?: boolean
          role?: string
          typing_updated_at?: string | null
          user_id: string
        }
        Update: {
          conversation_id?: string
          id?: string
          is_typing?: boolean | null
          joined_at?: string
          last_read_at?: string | null
          muted?: boolean
          role?: string
          typing_updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_participants_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_participants_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      conversations: {
        Row: {
          avatar_url: string | null
          chat_wallpaper: string | null
          created_at: string
          description: string | null
          id: string
          join_code: string | null
          name: string | null
          owner_id: string | null
          type: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          chat_wallpaper?: string | null
          created_at?: string
          description?: string | null
          id?: string
          join_code?: string | null
          name?: string | null
          owner_id?: string | null
          type?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          chat_wallpaper?: string | null
          created_at?: string
          description?: string | null
          id?: string
          join_code?: string | null
          name?: string | null
          owner_id?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      emergency_armings: {
        Row: {
          created_at: string
          expires_at: string
          phrase: string
          session_key: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          phrase: string
          session_key: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          phrase?: string
          session_key?: string
        }
        Relationships: []
      }
      emergency_firewall_rules: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          provider: string
          rule: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          provider: string
          rule: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          provider?: string
          rule?: string
        }
        Relationships: []
      }
      emergency_jobs: {
        Row: {
          created_at: string
          error_detail: string | null
          finished_at: string | null
          id: string
          locked_until: string | null
          status: string
          steps: Json
          triggered_by: string | null
          triggered_ip: string | null
        }
        Insert: {
          created_at?: string
          error_detail?: string | null
          finished_at?: string | null
          id?: string
          locked_until?: string | null
          status?: string
          steps: Json
          triggered_by?: string | null
          triggered_ip?: string | null
        }
        Update: {
          created_at?: string
          error_detail?: string | null
          finished_at?: string | null
          id?: string
          locked_until?: string | null
          status?: string
          steps?: Json
          triggered_by?: string | null
          triggered_ip?: string | null
        }
        Relationships: []
      }
      emergency_rate_limits: {
        Row: {
          key: string
          ts: string
        }
        Insert: {
          key: string
          ts?: string
        }
        Update: {
          key?: string
          ts?: string
        }
        Relationships: []
      }
      emergency_state: {
        Row: {
          active_job: string | null
          blocked_attacks: number
          id: number
          last_backup_at: string | null
          locked_down_until: string | null
          mode: Database["public"]["Enums"]["emergency_mode"]
          triggered_by: string | null
          updated_at: string
        }
        Insert: {
          active_job?: string | null
          blocked_attacks?: number
          id: number
          last_backup_at?: string | null
          locked_down_until?: string | null
          mode?: Database["public"]["Enums"]["emergency_mode"]
          triggered_by?: string | null
          updated_at?: string
        }
        Update: {
          active_job?: string | null
          blocked_attacks?: number
          id?: number
          last_backup_at?: string | null
          locked_down_until?: string | null
          mode?: Database["public"]["Enums"]["emergency_mode"]
          triggered_by?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      follows: {
        Row: {
          created_at: string
          follower_id: string
          following_id: string
          id: string
          status: Database["public"]["Enums"]["follow_status"] | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          follower_id: string
          following_id: string
          id?: string
          status?: Database["public"]["Enums"]["follow_status"] | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          follower_id?: string
          following_id?: string
          id?: string
          status?: Database["public"]["Enums"]["follow_status"] | null
          updated_at?: string
        }
        Relationships: []
      }
      group_join_requests: {
        Row: {
          created_at: string
          group_id: string
          handled_at: string | null
          handled_by: string | null
          id: string
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          group_id: string
          handled_at?: string | null
          handled_by?: string | null
          id?: string
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          group_id?: string
          handled_at?: string | null
          handled_by?: string | null
          id?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_join_requests_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_join_requests_handled_by_fkey"
            columns: ["handled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "group_join_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      group_members: {
        Row: {
          group_id: string
          id: string
          joined_at: string
          role: string
          user_id: string
        }
        Insert: {
          group_id: string
          id?: string
          joined_at?: string
          role?: string
          user_id: string
        }
        Update: {
          group_id?: string
          id?: string
          joined_at?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      group_post_comments: {
        Row: {
          content: string
          created_at: string
          hidden: boolean
          id: string
          like_count: number
          parent_id: string | null
          post_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          hidden?: boolean
          id?: string
          like_count?: number
          parent_id?: string | null
          post_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          hidden?: boolean
          id?: string
          like_count?: number
          parent_id?: string | null
          post_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_post_comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "group_post_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_post_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "group_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_post_comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      group_post_likes: {
        Row: {
          created_at: string
          id: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_post_likes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "group_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_post_likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      group_posts: {
        Row: {
          comment_count: number
          content: string
          created_at: string
          group_id: string
          hidden: boolean
          id: string
          like_count: number
          media_type: string | null
          media_url: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          comment_count?: number
          content: string
          created_at?: string
          group_id: string
          hidden?: boolean
          id?: string
          like_count?: number
          media_type?: string | null
          media_url?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          comment_count?: number
          content?: string
          created_at?: string
          group_id?: string
          hidden?: boolean
          id?: string
          like_count?: number
          media_type?: string | null
          media_url?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_posts_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_posts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      groups: {
        Row: {
          avatar_url: string | null
          cover_url: string | null
          created_at: string
          creator_id: string
          description: string
          id: string
          member_count: number
          name: string
          post_count: number
          privacy: string
          slug: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          cover_url?: string | null
          created_at?: string
          creator_id: string
          description?: string
          id?: string
          member_count?: number
          name: string
          post_count?: number
          privacy?: string
          slug: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          cover_url?: string | null
          created_at?: string
          creator_id?: string
          description?: string
          id?: string
          member_count?: number
          name?: string
          post_count?: number
          privacy?: string
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "groups_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      interest_categories: {
        Row: {
          color: string
          created_at: string
          icon: string
          id: string
          name: string
        }
        Insert: {
          color: string
          created_at?: string
          icon: string
          id?: string
          name: string
        }
        Update: {
          color?: string
          created_at?: string
          icon?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      interest_post_comments: {
        Row: {
          content: string
          created_at: string
          hidden: boolean
          id: string
          like_count: number
          parent_id: string | null
          post_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          hidden?: boolean
          id?: string
          like_count?: number
          parent_id?: string | null
          post_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          hidden?: boolean
          id?: string
          like_count?: number
          parent_id?: string | null
          post_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "interest_post_comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "interest_post_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interest_post_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "interest_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      interest_post_likes: {
        Row: {
          created_at: string
          id: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "interest_post_likes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "interest_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      interest_post_saves: {
        Row: {
          created_at: string
          id: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "interest_post_saves_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "interest_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      interest_posts: {
        Row: {
          category_id: string
          comment_count: number
          content: string
          created_at: string
          hidden: boolean
          id: string
          like_count: number
          media_type: string | null
          media_url: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          category_id: string
          comment_count?: number
          content: string
          created_at?: string
          hidden?: boolean
          id?: string
          like_count?: number
          media_type?: string | null
          media_url?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          category_id?: string
          comment_count?: number
          content?: string
          created_at?: string
          hidden?: boolean
          id?: string
          like_count?: number
          media_type?: string | null
          media_url?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "interest_posts_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "interest_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      library_comments: {
        Row: {
          content: string
          created_at: string
          id: string
          item_id: string
          like_count: number
          parent_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          item_id: string
          like_count?: number
          parent_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          item_id?: string
          like_count?: number
          parent_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "library_comments_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "library_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "library_comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "library_comments"
            referencedColumns: ["id"]
          },
        ]
      }
      library_items: {
        Row: {
          allow_comments: boolean
          allow_downloads: boolean
          comment_count: number
          created_at: string
          description: string | null
          download_count: number
          duration: number | null
          file_size: number | null
          file_url: string
          id: string
          like_count: number
          page_count: number | null
          tags: string[] | null
          thumbnail_url: string | null
          title: string
          type: string
          updated_at: string
          user_id: string
          view_count: number
          visibility: string
        }
        Insert: {
          allow_comments?: boolean
          allow_downloads?: boolean
          comment_count?: number
          created_at?: string
          description?: string | null
          download_count?: number
          duration?: number | null
          file_size?: number | null
          file_url: string
          id?: string
          like_count?: number
          page_count?: number | null
          tags?: string[] | null
          thumbnail_url?: string | null
          title: string
          type: string
          updated_at?: string
          user_id: string
          view_count?: number
          visibility?: string
        }
        Update: {
          allow_comments?: boolean
          allow_downloads?: boolean
          comment_count?: number
          created_at?: string
          description?: string | null
          download_count?: number
          duration?: number | null
          file_size?: number | null
          file_url?: string
          id?: string
          like_count?: number
          page_count?: number | null
          tags?: string[] | null
          thumbnail_url?: string | null
          title?: string
          type?: string
          updated_at?: string
          user_id?: string
          view_count?: number
          visibility?: string
        }
        Relationships: []
      }
      library_likes: {
        Row: {
          created_at: string
          id: string
          item_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          item_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          item_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "library_likes_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "library_items"
            referencedColumns: ["id"]
          },
        ]
      }
      live_location_sessions: {
        Row: {
          accuracy: number | null
          conversation_id: string
          current_lat: number | null
          current_lng: number | null
          ended_at: string | null
          expires_at: string
          id: string
          message_id: string | null
          started_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          accuracy?: number | null
          conversation_id: string
          current_lat?: number | null
          current_lng?: number | null
          ended_at?: string | null
          expires_at: string
          id?: string
          message_id?: string | null
          started_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          accuracy?: number | null
          conversation_id?: string
          current_lat?: number | null
          current_lng?: number | null
          ended_at?: string | null
          expires_at?: string
          id?: string
          message_id?: string | null
          started_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_location_sessions_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_location_sessions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_location_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      login_sessions: {
        Row: {
          created_at: string
          device_name: string | null
          device_type: string | null
          id: string
          ip_address: string | null
          is_current: boolean | null
          last_active_at: string | null
          location: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          device_name?: string | null
          device_type?: string | null
          id?: string
          ip_address?: string | null
          is_current?: boolean | null
          last_active_at?: string | null
          location?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          device_name?: string | null
          device_type?: string | null
          id?: string
          ip_address?: string | null
          is_current?: boolean | null
          last_active_at?: string | null
          location?: string | null
          user_id?: string
        }
        Relationships: []
      }
      message_attachments: {
        Row: {
          conversation_id: string
          created_at: string
          duration: number | null
          id: string
          message_id: string
          mime_type: string | null
          name: string | null
          size: number | null
          type: string
          url: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          duration?: number | null
          id?: string
          message_id: string
          mime_type?: string | null
          name?: string | null
          size?: number | null
          type: string
          url: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          duration?: number | null
          id?: string
          message_id?: string
          mime_type?: string | null
          name?: string | null
          size?: number | null
          type?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_attachments_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_attachments_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      message_reactions: {
        Row: {
          created_at: string
          emoji: string
          id: string
          message_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          emoji: string
          id?: string
          message_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          id?: string
          message_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_reactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      message_reads: {
        Row: {
          message_id: string
          read_at: string
          user_id: string
        }
        Insert: {
          message_id: string
          read_at?: string
          user_id: string
        }
        Update: {
          message_id?: string
          read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_reads_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          client_id: string | null
          content: string
          conversation_id: string
          created_at: string
          effect: string | null
          forwarded_from_message_id: string | null
          id: string
          is_edited: boolean | null
          is_pinned: boolean
          location_session_id: string | null
          pinned_at: string | null
          reply_to_message_id: string | null
          sender_id: string
          updated_at: string
        }
        Insert: {
          client_id?: string | null
          content: string
          conversation_id: string
          created_at?: string
          effect?: string | null
          forwarded_from_message_id?: string | null
          id?: string
          is_edited?: boolean | null
          is_pinned?: boolean
          location_session_id?: string | null
          pinned_at?: string | null
          reply_to_message_id?: string | null
          sender_id: string
          updated_at?: string
        }
        Update: {
          client_id?: string | null
          content?: string
          conversation_id?: string
          created_at?: string
          effect?: string | null
          forwarded_from_message_id?: string | null
          id?: string
          is_edited?: boolean | null
          is_pinned?: boolean
          location_session_id?: string | null
          pinned_at?: string | null
          reply_to_message_id?: string | null
          sender_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_forwarded_from_message_id_fkey"
            columns: ["forwarded_from_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_location_session_id_fkey"
            columns: ["location_session_id"]
            isOneToOne: false
            referencedRelation: "live_location_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_reply_to_message_id_fkey"
            columns: ["reply_to_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_profiles_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      mutes: {
        Row: {
          created_at: string
          id: string
          muted_id: string
          muter_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          muted_id: string
          muter_id: string
        }
        Update: {
          created_at?: string
          id?: string
          muted_id?: string
          muter_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mutes_muted_id_fkey"
            columns: ["muted_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "mutes_muter_id_fkey"
            columns: ["muter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      notifications: {
        Row: {
          actor_id: string | null
          body: string | null
          created_at: string
          id: string
          is_read: boolean | null
          message_id: string | null
          target_id: string | null
          target_type: string | null
          title: string
          type: Database["public"]["Enums"]["notification_type"]
          user_id: string
        }
        Insert: {
          actor_id?: string | null
          body?: string | null
          created_at?: string
          id?: string
          is_read?: boolean | null
          message_id?: string | null
          target_id?: string | null
          target_type?: string | null
          title: string
          type: Database["public"]["Enums"]["notification_type"]
          user_id: string
        }
        Update: {
          actor_id?: string | null
          body?: string | null
          created_at?: string
          id?: string
          is_read?: boolean | null
          message_id?: string | null
          target_id?: string | null
          target_type?: string | null
          title?: string
          type?: Database["public"]["Enums"]["notification_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount_cents: number
          campaign_id: string
          created_at: string
          currency: string
          id: string
          provider: Database["public"]["Enums"]["payment_provider"]
          provider_payment_id: string | null
          status: Database["public"]["Enums"]["payment_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_cents: number
          campaign_id: string
          created_at?: string
          currency?: string
          id?: string
          provider: Database["public"]["Enums"]["payment_provider"]
          provider_payment_id?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_cents?: number
          campaign_id?: string
          created_at?: string
          currency?: string
          id?: string
          provider?: Database["public"]["Enums"]["payment_provider"]
          provider_payment_id?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      post_media: {
        Row: {
          alt_text: string | null
          created_at: string
          height: number | null
          id: string
          position: number | null
          post_id: string
          type: string
          url: string
          width: number | null
        }
        Insert: {
          alt_text?: string | null
          created_at?: string
          height?: number | null
          id?: string
          position?: number | null
          post_id: string
          type: string
          url: string
          width?: number | null
        }
        Update: {
          alt_text?: string | null
          created_at?: string
          height?: number | null
          id?: string
          position?: number | null
          post_id?: string
          type?: string
          url?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "post_media_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      posts: {
        Row: {
          comment_count: number | null
          content: string
          created_at: string
          hidden: boolean
          id: string
          is_edited: boolean
          is_pinned: boolean | null
          repost_count: number
          star_count: number | null
          updated_at: string
          user_id: string
          visibility: Database["public"]["Enums"]["post_visibility"] | null
        }
        Insert: {
          comment_count?: number | null
          content: string
          created_at?: string
          hidden?: boolean
          id?: string
          is_edited?: boolean
          is_pinned?: boolean | null
          repost_count?: number
          star_count?: number | null
          updated_at?: string
          user_id: string
          visibility?: Database["public"]["Enums"]["post_visibility"] | null
        }
        Update: {
          comment_count?: number | null
          content?: string
          created_at?: string
          hidden?: boolean
          id?: string
          is_edited?: boolean
          is_pinned?: boolean | null
          repost_count?: number
          star_count?: number | null
          updated_at?: string
          user_id?: string
          visibility?: Database["public"]["Enums"]["post_visibility"] | null
        }
        Relationships: [
          {
            foreignKeyName: "posts_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          cover_url: string | null
          created_at: string
          deleted_at: string | null
          display_name: string
          email_notifications: boolean | null
          id: string
          is_verified: boolean | null
          last_seen_at: string | null
          location: string | null
          privacy: Database["public"]["Enums"]["account_privacy"] | null
          push_notifications: boolean | null
          updated_at: string
          user_id: string
          username: string
          website: string | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          cover_url?: string | null
          created_at?: string
          deleted_at?: string | null
          display_name: string
          email_notifications?: boolean | null
          id?: string
          is_verified?: boolean | null
          last_seen_at?: string | null
          location?: string | null
          privacy?: Database["public"]["Enums"]["account_privacy"] | null
          push_notifications?: boolean | null
          updated_at?: string
          user_id: string
          username: string
          website?: string | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          cover_url?: string | null
          created_at?: string
          deleted_at?: string | null
          display_name?: string
          email_notifications?: boolean | null
          id?: string
          is_verified?: boolean | null
          last_seen_at?: string | null
          location?: string | null
          privacy?: Database["public"]["Enums"]["account_privacy"] | null
          push_notifications?: boolean | null
          updated_at?: string
          user_id?: string
          username?: string
          website?: string | null
        }
        Relationships: []
      }
      reading_badges: {
        Row: {
          badge_name: string
          badge_type: string
          earned_at: string
          id: string
          user_id: string
        }
        Insert: {
          badge_name: string
          badge_type: string
          earned_at?: string
          id?: string
          user_id: string
        }
        Update: {
          badge_name?: string
          badge_type?: string
          earned_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      reading_logs: {
        Row: {
          chapters_read: number
          created_at: string
          id: string
          minutes_read: number
          read_date: string
          user_id: string
        }
        Insert: {
          chapters_read?: number
          created_at?: string
          id?: string
          minutes_read?: number
          read_date?: string
          user_id: string
        }
        Update: {
          chapters_read?: number
          created_at?: string
          id?: string
          minutes_read?: number
          read_date?: string
          user_id?: string
        }
        Relationships: []
      }
      reading_progress: {
        Row: {
          book_id: string
          completed_chapters: string[] | null
          created_at: string
          current_chapter_id: string | null
          id: string
          last_read_at: string | null
          scroll_position: number | null
          user_id: string
        }
        Insert: {
          book_id: string
          completed_chapters?: string[] | null
          created_at?: string
          current_chapter_id?: string | null
          id?: string
          last_read_at?: string | null
          scroll_position?: number | null
          user_id: string
        }
        Update: {
          book_id?: string
          completed_chapters?: string[] | null
          created_at?: string
          current_chapter_id?: string | null
          id?: string
          last_read_at?: string | null
          scroll_position?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reading_progress_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reading_progress_current_chapter_id_fkey"
            columns: ["current_chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
        ]
      }
      reading_streaks: {
        Row: {
          created_at: string
          current_streak: number
          id: string
          last_read_date: string | null
          longest_streak: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_streak?: number
          id?: string
          last_read_date?: string | null
          longest_streak?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_streak?: number
          id?: string
          last_read_date?: string | null
          longest_streak?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      reel_comment_likes: {
        Row: {
          comment_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          comment_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          comment_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reel_comment_likes_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "reel_comments"
            referencedColumns: ["id"]
          },
        ]
      }
      reel_comments: {
        Row: {
          content: string
          created_at: string
          id: string
          like_count: number | null
          parent_id: string | null
          reel_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          like_count?: number | null
          parent_id?: string | null
          reel_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          like_count?: number | null
          parent_id?: string | null
          reel_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reel_comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "reel_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reel_comments_reel_id_fkey"
            columns: ["reel_id"]
            isOneToOne: false
            referencedRelation: "reels"
            referencedColumns: ["id"]
          },
        ]
      }
      reel_likes: {
        Row: {
          created_at: string
          id: string
          reel_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          reel_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          reel_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reel_likes_reel_id_fkey"
            columns: ["reel_id"]
            isOneToOne: false
            referencedRelation: "reels"
            referencedColumns: ["id"]
          },
        ]
      }
      reels: {
        Row: {
          audio_name: string | null
          audio_url: string | null
          caption: string | null
          comment_count: number | null
          created_at: string
          duration: number | null
          hidden: boolean
          id: string
          is_published: boolean | null
          like_count: number | null
          share_count: number | null
          thumbnail_url: string | null
          updated_at: string
          user_id: string
          video_url: string
          view_count: number | null
        }
        Insert: {
          audio_name?: string | null
          audio_url?: string | null
          caption?: string | null
          comment_count?: number | null
          created_at?: string
          duration?: number | null
          hidden?: boolean
          id?: string
          is_published?: boolean | null
          like_count?: number | null
          share_count?: number | null
          thumbnail_url?: string | null
          updated_at?: string
          user_id: string
          video_url: string
          view_count?: number | null
        }
        Update: {
          audio_name?: string | null
          audio_url?: string | null
          caption?: string | null
          comment_count?: number | null
          created_at?: string
          duration?: number | null
          hidden?: boolean
          id?: string
          is_published?: boolean | null
          like_count?: number | null
          share_count?: number | null
          thumbnail_url?: string | null
          updated_at?: string
          user_id?: string
          video_url?: string
          view_count?: number | null
        }
        Relationships: []
      }
      reports: {
        Row: {
          created_at: string
          details: string | null
          handled_at: string | null
          handled_by: string | null
          id: string
          reason: string
          reporter_id: string
          status: string
          target_id: string
          target_type: string
        }
        Insert: {
          created_at?: string
          details?: string | null
          handled_at?: string | null
          handled_by?: string | null
          id?: string
          reason: string
          reporter_id: string
          status?: string
          target_id: string
          target_type: string
        }
        Update: {
          created_at?: string
          details?: string | null
          handled_at?: string | null
          handled_by?: string | null
          id?: string
          reason?: string
          reporter_id?: string
          status?: string
          target_id?: string
          target_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "reports_handled_by_fkey"
            columns: ["handled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      reposts: {
        Row: {
          created_at: string
          id: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reposts_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reposts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      saves: {
        Row: {
          created_at: string
          id: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saves_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saves_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      scheduled_messages: {
        Row: {
          attachments: Json | null
          content: string | null
          conversation_id: string
          created_at: string
          id: string
          reply_to_message_id: string | null
          send_at: string
          sender_id: string
          status: string
        }
        Insert: {
          attachments?: Json | null
          content?: string | null
          conversation_id: string
          created_at?: string
          id?: string
          reply_to_message_id?: string | null
          send_at: string
          sender_id: string
          status?: string
        }
        Update: {
          attachments?: Json | null
          content?: string | null
          conversation_id?: string
          created_at?: string
          id?: string
          reply_to_message_id?: string | null
          send_at?: string
          sender_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_messages_reply_to_message_id_fkey"
            columns: ["reply_to_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      stars: {
        Row: {
          created_at: string
          id: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stars_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      stories: {
        Row: {
          caption: string | null
          created_at: string
          duration: number | null
          expires_at: string
          id: string
          media_type: string
          media_url: string
          music_name: string | null
          music_url: string | null
          user_id: string
          view_count: number | null
        }
        Insert: {
          caption?: string | null
          created_at?: string
          duration?: number | null
          expires_at?: string
          id?: string
          media_type?: string
          media_url: string
          music_name?: string | null
          music_url?: string | null
          user_id: string
          view_count?: number | null
        }
        Update: {
          caption?: string | null
          created_at?: string
          duration?: number | null
          expires_at?: string
          id?: string
          media_type?: string
          media_url?: string
          music_name?: string | null
          music_url?: string | null
          user_id?: string
          view_count?: number | null
        }
        Relationships: []
      }
      story_views: {
        Row: {
          id: string
          story_id: string
          viewed_at: string
          viewer_id: string
        }
        Insert: {
          id?: string
          story_id: string
          viewed_at?: string
          viewer_id: string
        }
        Update: {
          id?: string
          story_id?: string
          viewed_at?: string
          viewer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "story_views_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "stories"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_plans: {
        Row: {
          created_at: string
          description: string | null
          features: Json | null
          id: string
          is_active: boolean
          name: string
          price_monthly: number
          price_yearly: number
          stripe_price_id_monthly: string | null
          stripe_price_id_yearly: string | null
          tier: Database["public"]["Enums"]["plan_tier"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          features?: Json | null
          id?: string
          is_active?: boolean
          name: string
          price_monthly?: number
          price_yearly?: number
          stripe_price_id_monthly?: string | null
          stripe_price_id_yearly?: string | null
          tier?: Database["public"]["Enums"]["plan_tier"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          features?: Json | null
          id?: string
          is_active?: boolean
          name?: string
          price_monthly?: number
          price_yearly?: number
          stripe_price_id_monthly?: string | null
          stripe_price_id_yearly?: string | null
          tier?: Database["public"]["Enums"]["plan_tier"]
          updated_at?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean | null
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          id: string
          plan_id: string | null
          status: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          cancel_at_period_end?: boolean | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          plan_id?: string | null
          status?: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          cancel_at_period_end?: boolean | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          plan_id?: string | null
          status?: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      system_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "system_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      threat_ips: {
        Row: {
          active: boolean
          blocked_by: string | null
          created_at: string
          ip: unknown
          reason: string | null
        }
        Insert: {
          active?: boolean
          blocked_by?: string | null
          created_at?: string
          ip: unknown
          reason?: string | null
        }
        Update: {
          active?: boolean
          blocked_by?: string | null
          created_at?: string
          ip?: unknown
          reason?: string | null
        }
        Relationships: []
      }
      user_bans: {
        Row: {
          banned_at: string
          banned_by: string
          created_at: string
          expires_at: string | null
          id: string
          is_active: boolean
          reason: string
          updated_at: string
          user_id: string
        }
        Insert: {
          banned_at?: string
          banned_by: string
          created_at?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          reason: string
          updated_at?: string
          user_id: string
        }
        Update: {
          banned_at?: string
          banned_by?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          reason?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_deletions: {
        Row: {
          deleted_at: string
          deleted_by: string | null
          display_name: string | null
          email: string | null
          id: string
          purge_due_at: string
          purged_at: string | null
          reason: string | null
          user_id: string
          username: string | null
        }
        Insert: {
          deleted_at?: string
          deleted_by?: string | null
          display_name?: string | null
          email?: string | null
          id?: string
          purge_due_at?: string
          purged_at?: string | null
          reason?: string | null
          user_id: string
          username?: string | null
        }
        Update: {
          deleted_at?: string
          deleted_by?: string | null
          display_name?: string | null
          email?: string | null
          id?: string
          purge_due_at?: string
          purged_at?: string | null
          reason?: string | null
          user_id?: string
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_deletions_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      user_interests: {
        Row: {
          category_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          category_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          category_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_interests_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "interest_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      user_library: {
        Row: {
          added_at: string
          book_id: string
          id: string
          user_id: string
        }
        Insert: {
          added_at?: string
          book_id: string
          id?: string
          user_id: string
        }
        Update: {
          added_at?: string
          book_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_library_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
        ]
      }
      user_preferences: {
        Row: {
          autoplay_videos: boolean | null
          color_accent: string | null
          content_filter: string | null
          created_at: string
          display_density: string | null
          do_not_disturb: boolean | null
          font_size: string | null
          high_contrast: boolean | null
          id: string
          language: string | null
          login_alerts: boolean | null
          message_bubble_color: string | null
          reduced_motion: boolean | null
          screen_reader_optimized: boolean | null
          show_sensitive_content: boolean | null
          theme: string | null
          two_factor_enabled: boolean | null
          updated_at: string
          user_id: string
        }
        Insert: {
          autoplay_videos?: boolean | null
          color_accent?: string | null
          content_filter?: string | null
          created_at?: string
          display_density?: string | null
          do_not_disturb?: boolean | null
          font_size?: string | null
          high_contrast?: boolean | null
          id?: string
          language?: string | null
          login_alerts?: boolean | null
          message_bubble_color?: string | null
          reduced_motion?: boolean | null
          screen_reader_optimized?: boolean | null
          show_sensitive_content?: boolean | null
          theme?: string | null
          two_factor_enabled?: boolean | null
          updated_at?: string
          user_id: string
        }
        Update: {
          autoplay_videos?: boolean | null
          color_accent?: string | null
          content_filter?: string | null
          created_at?: string
          display_density?: string | null
          do_not_disturb?: boolean | null
          font_size?: string | null
          high_contrast?: boolean | null
          id?: string
          language?: string | null
          login_alerts?: boolean | null
          message_bubble_color?: string | null
          reduced_motion?: boolean | null
          screen_reader_optimized?: boolean | null
          show_sensitive_content?: boolean | null
          theme?: string | null
          two_factor_enabled?: boolean | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
          role?: Database["public"]["Enums"]["app_role"]
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
      user_shadow_bans: {
        Row: {
          banned_by: string | null
          created_at: string
          id: string
          is_active: boolean
          reason: string | null
          user_id: string
        }
        Insert: {
          banned_by?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          reason?: string | null
          user_id: string
        }
        Update: {
          banned_by?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          reason?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_shadow_bans_banned_by_fkey"
            columns: ["banned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "user_shadow_bans_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      verification_challenges: {
        Row: {
          attempt_count: number
          challenge_hash: string
          created_at: string
          created_by: string | null
          expires_at: string
          id: string
          ip_hash: string | null
          purpose: string
          sequence: Json
          status: string
          used_at: string | null
          user_agent: string | null
        }
        Insert: {
          attempt_count?: number
          challenge_hash: string
          created_at?: string
          created_by?: string | null
          expires_at: string
          id?: string
          ip_hash?: string | null
          purpose?: string
          sequence: Json
          status?: string
          used_at?: string | null
          user_agent?: string | null
        }
        Update: {
          attempt_count?: number
          challenge_hash?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string
          id?: string
          ip_hash?: string | null
          purpose?: string
          sequence?: Json
          status?: string
          used_at?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "verification_challenges_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      verification_requests: {
        Row: {
          created_at: string
          handled_at: string | null
          handled_by: string | null
          id: string
          message: string | null
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          handled_at?: string | null
          handled_by?: string | null
          id?: string
          message?: string | null
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          handled_at?: string | null
          handled_by?: string | null
          id?: string
          message?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "verification_requests_handled_by_fkey"
            columns: ["handled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "verification_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
    }
    Views: {
      confessions_public: {
        Row: {
          author_id: string | null
          content: string | null
          created_at: string | null
          guess_count: number | null
          id: string | null
          revealed: boolean | null
        }
        Insert: {
          author_id?: never
          content?: string | null
          created_at?: string | null
          guess_count?: number | null
          id?: string | null
          revealed?: boolean | null
        }
        Update: {
          author_id?: never
          content?: string | null
          created_at?: string | null
          guess_count?: number | null
          id?: string | null
          revealed?: boolean | null
        }
        Relationships: []
      }
    }
    Functions: {
      add_conversation_members: {
        Args: { conv_id: string; member_ids: string[] }
        Returns: undefined
      }
      admin_delete_content: {
        Args: { p_target_id: string; p_target_type: string }
        Returns: undefined
      }
      admin_delete_user: {
        Args: { target_user_id: string }
        Returns: undefined
      }
      admin_get_user_activity: { Args: { p_user_id: string }; Returns: Json }
      admin_get_user_data: { Args: { p_user_id: string }; Returns: Json }
      admin_get_user_emails: {
        Args: { p_user_ids: string[] }
        Returns: {
          email: string
          user_id: string
        }[]
      }
      admin_get_user_sessions: {
        Args: { p_user_id: string }
        Returns: {
          created_at: string
          device_name: string | null
          device_type: string | null
          id: string
          ip_address: string | null
          is_current: boolean | null
          last_active_at: string | null
          location: string | null
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "login_sessions"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      admin_logout_all_sessions: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      admin_moderate_campaign: {
        Args: { p_action: string; p_campaign_id: string; p_reason?: string }
        Returns: {
          advertiser_id: string
          approved_at: string | null
          budget_type: Database["public"]["Enums"]["campaign_budget_type"]
          cost_per_impression_cents: number
          created_at: string
          cta: string | null
          cta_url: string | null
          currency: string
          daily_budget_cents: number | null
          description: string | null
          end_at: string
          ended_at: string | null
          estimated_impressions: number | null
          estimated_reach_max: number | null
          estimated_reach_min: number | null
          headline: string | null
          id: string
          impressions_delivered: number
          is_scheduled: boolean
          moderation_note: string | null
          name: string
          objective: Database["public"]["Enums"]["campaign_objective"]
          paid_at: string | null
          post_id: string | null
          rejection_reason: string | null
          spend_cents: number
          start_at: string
          status: Database["public"]["Enums"]["campaign_status"]
          total_budget_cents: number
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "campaigns"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_purge_all_users: {
        Args: { keep_user_id?: string }
        Returns: number
      }
      admin_purge_user_data: { Args: { p_user_id: string }; Returns: undefined }
      admin_red_button_begin_arming: { Args: never; Returns: Json }
      admin_red_button_resume: { Args: never; Returns: undefined }
      admin_red_button_rollback: { Args: never; Returns: undefined }
      admin_red_button_status: { Args: never; Returns: Json }
      admin_red_button_trigger: {
        Args: { p_phrase: string; p_pin: string }
        Returns: Json
      }
      admin_set_user_role: {
        Args: {
          p_role: Database["public"]["Enums"]["app_role"]
          p_user_id: string
        }
        Returns: undefined
      }
      admin_shadow_ban: {
        Args: { p_active: boolean; p_reason?: string; p_user_id: string }
        Returns: undefined
      }
      admin_toggle_content_hidden: {
        Args: { p_hidden: boolean; p_target_id: string; p_target_type: string }
        Returns: undefined
      }
      append_call_ice_candidate: {
        Args: { p_candidate: Json; p_is_caller: boolean; p_session_id: string }
        Returns: undefined
      }
      approve_group_join_request: {
        Args: { request_id: string }
        Returns: undefined
      }
      audit_action: {
        Args: {
          p_action: string
          p_details?: Json
          p_target_id?: string
          p_target_type?: string
        }
        Returns: undefined
      }
      block_user: { Args: { target_user_id: string }; Returns: undefined }
      cancel_campaign: {
        Args: { p_campaign_id: string }
        Returns: {
          advertiser_id: string
          approved_at: string | null
          budget_type: Database["public"]["Enums"]["campaign_budget_type"]
          cost_per_impression_cents: number
          created_at: string
          cta: string | null
          cta_url: string | null
          currency: string
          daily_budget_cents: number | null
          description: string | null
          end_at: string
          ended_at: string | null
          estimated_impressions: number | null
          estimated_reach_max: number | null
          estimated_reach_min: number | null
          headline: string | null
          id: string
          impressions_delivered: number
          is_scheduled: boolean
          moderation_note: string | null
          name: string
          objective: Database["public"]["Enums"]["campaign_objective"]
          paid_at: string | null
          post_id: string | null
          rejection_reason: string | null
          spend_cents: number
          start_at: string
          status: Database["public"]["Enums"]["campaign_status"]
          total_budget_cents: number
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "campaigns"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      cancel_group_join_request: {
        Args: { request_id: string }
        Returns: undefined
      }
      cleanup_face_security: { Args: never; Returns: number }
      complete_expired_campaigns: { Args: never; Returns: number }
      confession_guess: {
        Args: { p_confession_id: string; p_guessed_user_id: string }
        Returns: Json
      }
      confirm_campaign_payment: {
        Args: {
          p_campaign_id: string
          p_provider: Database["public"]["Enums"]["payment_provider"]
          p_provider_payment_id?: string
        }
        Returns: {
          advertiser_id: string
          approved_at: string | null
          budget_type: Database["public"]["Enums"]["campaign_budget_type"]
          cost_per_impression_cents: number
          created_at: string
          cta: string | null
          cta_url: string | null
          currency: string
          daily_budget_cents: number | null
          description: string | null
          end_at: string
          ended_at: string | null
          estimated_impressions: number | null
          estimated_reach_max: number | null
          estimated_reach_min: number | null
          headline: string | null
          id: string
          impressions_delivered: number
          is_scheduled: boolean
          moderation_note: string | null
          name: string
          objective: Database["public"]["Enums"]["campaign_objective"]
          paid_at: string | null
          post_id: string | null
          rejection_reason: string | null
          spend_cents: number
          start_at: string
          status: Database["public"]["Enums"]["campaign_status"]
          total_budget_cents: number
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "campaigns"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_advertiser_account: {
        Args: {
          p_account_type: Database["public"]["Enums"]["advertiser_account_type"]
          p_avatar_url?: string
          p_category?: string
          p_contact_email?: string
          p_contact_phone?: string
          p_cover_url?: string
          p_description?: string
          p_location?: string
          p_name: string
          p_username: string
          p_website?: string
        }
        Returns: {
          account_type: Database["public"]["Enums"]["advertiser_account_type"]
          avatar_url: string | null
          category: string | null
          contact_email: string | null
          contact_phone: string | null
          cover_url: string | null
          created_at: string
          description: string | null
          id: string
          location: string | null
          name: string
          status: Database["public"]["Enums"]["advertiser_status"]
          updated_at: string
          user_id: string
          username: string
          website: string | null
        }
        SetofOptions: {
          from: "*"
          to: "advertiser_accounts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_campaign: {
        Args: {
          p_advertiser_id: string
          p_budget_type?: Database["public"]["Enums"]["campaign_budget_type"]
          p_cta?: string
          p_cta_url?: string
          p_currency?: string
          p_daily_budget_cents?: number
          p_description?: string
          p_end_at?: string
          p_headline?: string
          p_is_scheduled?: boolean
          p_name: string
          p_objective: Database["public"]["Enums"]["campaign_objective"]
          p_post_id?: string
          p_start_at?: string
          p_targeting?: Json
          p_total_budget_cents: number
        }
        Returns: {
          advertiser_id: string
          approved_at: string | null
          budget_type: Database["public"]["Enums"]["campaign_budget_type"]
          cost_per_impression_cents: number
          created_at: string
          cta: string | null
          cta_url: string | null
          currency: string
          daily_budget_cents: number | null
          description: string | null
          end_at: string
          ended_at: string | null
          estimated_impressions: number | null
          estimated_reach_max: number | null
          estimated_reach_min: number | null
          headline: string | null
          id: string
          impressions_delivered: number
          is_scheduled: boolean
          moderation_note: string | null
          name: string
          objective: Database["public"]["Enums"]["campaign_objective"]
          paid_at: string | null
          post_id: string | null
          rejection_reason: string | null
          spend_cents: number
          start_at: string
          status: Database["public"]["Enums"]["campaign_status"]
          total_budget_cents: number
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "campaigns"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_community: {
        Args: {
          community_avatar_url?: string
          community_description?: string
          community_name: string
        }
        Returns: string
      }
      create_group: {
        Args: {
          group_avatar_url?: string
          group_cover_url?: string
          group_description?: string
          group_name: string
          group_privacy?: string
        }
        Returns: {
          avatar_url: string | null
          cover_url: string | null
          created_at: string
          creator_id: string
          description: string
          id: string
          member_count: number
          name: string
          post_count: number
          privacy: string
          slug: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "groups"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_group_conversation: {
        Args: {
          group_avatar_url?: string
          group_name: string
          member_ids: string[]
        }
        Returns: string
      }
      decline_group_join_request: {
        Args: { request_id: string }
        Returns: undefined
      }
      delete_advertiser_account: {
        Args: { p_account_id: string }
        Returns: boolean
      }
      delete_conversation: { Args: { conv_id: string }; Returns: undefined }
      dispatch_scheduled_messages: { Args: never; Returns: number }
      emergency_add_threat_ip: {
        Args: { p_ip: unknown; p_reason?: string }
        Returns: undefined
      }
      emergency_audit: {
        Args: {
          p_action: string
          p_actor?: string
          p_details?: Json
          p_target_id?: string
          p_target_type?: string
        }
        Returns: undefined
      }
      emergency_check_rate_limit: {
        Args: { p_key: string }
        Returns: undefined
      }
      emergency_get_state: {
        Args: never
        Returns: {
          active_job: string | null
          blocked_attacks: number
          id: number
          last_backup_at: string | null
          locked_down_until: string | null
          mode: Database["public"]["Enums"]["emergency_mode"]
          triggered_by: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "emergency_state"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      emergency_register_attack: {
        Args: { p_ip: unknown; p_rule?: string; p_source?: string }
        Returns: undefined
      }
      emergency_send_alert: {
        Args: { p_event: string; p_payload?: Json }
        Returns: undefined
      }
      emergency_set_mode: {
        Args: { p_mode: Database["public"]["Enums"]["emergency_mode"] }
        Returns: undefined
      }
      emergency_setting: { Args: { p_key: string }; Returns: string }
      end_campaign: {
        Args: { p_campaign_id: string }
        Returns: {
          advertiser_id: string
          approved_at: string | null
          budget_type: Database["public"]["Enums"]["campaign_budget_type"]
          cost_per_impression_cents: number
          created_at: string
          cta: string | null
          cta_url: string | null
          currency: string
          daily_budget_cents: number | null
          description: string | null
          end_at: string
          ended_at: string | null
          estimated_impressions: number | null
          estimated_reach_max: number | null
          estimated_reach_min: number | null
          headline: string | null
          id: string
          impressions_delivered: number
          is_scheduled: boolean
          moderation_note: string | null
          name: string
          objective: Database["public"]["Enums"]["campaign_objective"]
          paid_at: string | null
          post_id: string | null
          rejection_reason: string | null
          spend_cents: number
          start_at: string
          status: Database["public"]["Enums"]["campaign_status"]
          total_budget_cents: number
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "campaigns"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      estimate_audience: {
        Args: {
          p_automatic?: boolean
          p_interests?: string[]
          p_languages?: string[]
          p_locations?: string[]
        }
        Returns: {
          estimated_impressions: number
          matched_users: number
          reach_max: number
          reach_min: number
          sufficient_data: boolean
          total_active_users: number
        }[]
      }
      get_account_change_usage: {
        Args: never
        Returns: {
          change_limit: number
          change_type: string
          remaining: number
          used: number
        }[]
      }
      get_active_ban: {
        Args: { _user_id: string }
        Returns: {
          expires_at: string
          reason: string
        }[]
      }
      get_ads_overview: { Args: never; Returns: Json }
      get_campaign_analytics: { Args: { p_campaign_id: string }; Returns: Json }
      get_campaign_or_null: {
        Args: { p_campaign_id: string }
        Returns: {
          advertiser_id: string
          approved_at: string | null
          budget_type: Database["public"]["Enums"]["campaign_budget_type"]
          cost_per_impression_cents: number
          created_at: string
          cta: string | null
          cta_url: string | null
          currency: string
          daily_budget_cents: number | null
          description: string | null
          end_at: string
          ended_at: string | null
          estimated_impressions: number | null
          estimated_reach_max: number | null
          estimated_reach_min: number | null
          headline: string | null
          id: string
          impressions_delivered: number
          is_scheduled: boolean
          moderation_note: string | null
          name: string
          objective: Database["public"]["Enums"]["campaign_objective"]
          paid_at: string | null
          post_id: string | null
          rejection_reason: string | null
          spend_cents: number
          start_at: string
          status: Database["public"]["Enums"]["campaign_status"]
          total_budget_cents: number
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "campaigns"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_feed_ads: {
        Args: { p_limit?: number; p_viewer_id: string }
        Returns: {
          advertisement_id: string
          advertiser_avatar_url: string
          advertiser_id: string
          advertiser_is_verified: boolean
          advertiser_name: string
          advertiser_type: Database["public"]["Enums"]["advertiser_account_type"]
          advertiser_user_id: string
          advertiser_username: string
          campaign_id: string
          cta: string
          cta_url: string
          description: string
          headline: string
          objective: Database["public"]["Enums"]["campaign_objective"]
          post_comment_count: number
          post_content: string
          post_created_at: string
          post_id: string
          post_media: Json
          post_star_count: number
          profile_privacy: Database["public"]["Enums"]["account_privacy"]
          profile_username: string
        }[]
      }
      get_follower_count: { Args: { _user_id: string }; Returns: number }
      get_following_count: { Args: { _user_id: string }; Returns: number }
      get_or_create_dm_conversation: {
        Args: { other_user_id: string }
        Returns: string
      }
      handle_verification_request: {
        Args: { approve: boolean; request_id: string }
        Returns: undefined
      }
      has_premium_access: { Args: { _user_id: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_reel_views: {
        Args: { reel_id_input: string }
        Returns: undefined
      }
      is_admin: { Args: never; Returns: boolean }
      is_admin_or_moderator: { Args: never; Returns: boolean }
      is_blocked: {
        Args: { check_user: string; other_user: string }
        Returns: boolean
      }
      is_conversation_participant: {
        Args: { _conversation_id: string; _user_id: string }
        Returns: boolean
      }
      is_following: {
        Args: { _follower_id: string; _following_id: string }
        Returns: boolean
      }
      is_group_member: { Args: { target_group_id: string }; Returns: boolean }
      is_group_moderator_or_above: {
        Args: { target_group_id: string }
        Returns: boolean
      }
      is_group_owner_or_admin: {
        Args: { target_group_id: string }
        Returns: boolean
      }
      is_moderator: { Args: never; Returns: boolean }
      is_muted: {
        Args: { check_user: string; other_user: string }
        Returns: boolean
      }
      is_post_visible: {
        Args: { post_row: Database["public"]["Tables"]["posts"]["Row"] }
        Returns: boolean
      }
      is_shadow_banned: { Args: { target?: string }; Returns: boolean }
      is_staff: { Args: never; Returns: boolean }
      is_super_admin: { Args: never; Returns: boolean }
      is_user_banned: { Args: { _user_id: string }; Returns: boolean }
      is_verified_author: { Args: { _user_id: string }; Returns: boolean }
      join_conversation_by_code: { Args: { code: string }; Returns: string }
      join_group: { Args: { target_group_id: string }; Returns: undefined }
      leave_conversation: { Args: { conv_id: string }; Returns: undefined }
      leave_group: { Args: { target_group_id: string }; Returns: undefined }
      mark_message_reads_up_to: {
        Args: { conv_id: string; read_until: string }
        Returns: undefined
      }
      mute_user: { Args: { target_user_id: string }; Returns: undefined }
      pause_campaign: {
        Args: { p_campaign_id: string }
        Returns: {
          advertiser_id: string
          approved_at: string | null
          budget_type: Database["public"]["Enums"]["campaign_budget_type"]
          cost_per_impression_cents: number
          created_at: string
          cta: string | null
          cta_url: string | null
          currency: string
          daily_budget_cents: number | null
          description: string | null
          end_at: string
          ended_at: string | null
          estimated_impressions: number | null
          estimated_reach_max: number | null
          estimated_reach_min: number | null
          headline: string | null
          id: string
          impressions_delivered: number
          is_scheduled: boolean
          moderation_note: string | null
          name: string
          objective: Database["public"]["Enums"]["campaign_objective"]
          paid_at: string | null
          post_id: string | null
          rejection_reason: string | null
          spend_cents: number
          start_at: string
          status: Database["public"]["Enums"]["campaign_status"]
          total_budget_cents: number
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "campaigns"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      pin_message: { Args: { message_id: string }; Returns: undefined }
      purge_expired_user_deletions: { Args: never; Returns: number }
      record_account_change: { Args: { p_type: string }; Returns: undefined }
      record_ad_event: {
        Args: {
          p_advertisement_id: string
          p_campaign_id: string
          p_event_id: string
          p_event_type: Database["public"]["Enums"]["ad_event_type"]
          p_placement?: Database["public"]["Enums"]["ad_placement"]
        }
        Returns: boolean
      }
      red_button_advance_job: { Args: { p_job_id: string }; Returns: boolean }
      red_button_set_step: {
        Args: {
          p_detail: string
          p_io_ref: number
          p_job_id: string
          p_key: string
          p_pct: number
          p_status: string
        }
        Returns: undefined
      }
      red_button_watchdog_tick: { Args: never; Returns: number }
      red_button_worker_tick: { Args: never; Returns: number }
      refresh_campaign_daily_stats: { Args: never; Returns: number }
      remove_group_member: {
        Args: { target_group_id: string; target_user_id: string }
        Returns: undefined
      }
      report_ad: {
        Args: {
          p_advertisement_id: string
          p_details?: string
          p_reason: string
        }
        Returns: {
          advertisement_id: string
          campaign_id: string
          created_at: string
          details: string | null
          id: string
          reason: string
          status: Database["public"]["Enums"]["ad_report_status"]
          user_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "ad_reports"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      report_content: {
        Args: {
          details?: string
          reason: string
          target_id: string
          target_type: string
        }
        Returns: undefined
      }
      repost_post: { Args: { target_post_id: string }; Returns: undefined }
      request_to_join_group: {
        Args: { target_group_id: string }
        Returns: string
      }
      request_verification: { Args: { message?: string }; Returns: undefined }
      resume_campaign: {
        Args: { p_campaign_id: string }
        Returns: {
          advertiser_id: string
          approved_at: string | null
          budget_type: Database["public"]["Enums"]["campaign_budget_type"]
          cost_per_impression_cents: number
          created_at: string
          cta: string | null
          cta_url: string | null
          currency: string
          daily_budget_cents: number | null
          description: string | null
          end_at: string
          ended_at: string | null
          estimated_impressions: number | null
          estimated_reach_max: number | null
          estimated_reach_min: number | null
          headline: string | null
          id: string
          impressions_delivered: number
          is_scheduled: boolean
          moderation_note: string | null
          name: string
          objective: Database["public"]["Enums"]["campaign_objective"]
          paid_at: string | null
          post_id: string | null
          rejection_reason: string | null
          spend_cents: number
          start_at: string
          status: Database["public"]["Enums"]["campaign_status"]
          total_budget_cents: number
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "campaigns"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      search_conversation_messages: {
        Args: { conv_id: string; max_results?: number; query: string }
        Returns: {
          client_id: string | null
          content: string
          conversation_id: string
          created_at: string
          effect: string | null
          forwarded_from_message_id: string | null
          id: string
          is_edited: boolean | null
          is_pinned: boolean
          location_session_id: string | null
          pinned_at: string | null
          reply_to_message_id: string | null
          sender_id: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "messages"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      set_conversation_wallpaper: {
        Args: { conv_id: string; wallpaper: string }
        Returns: undefined
      }
      set_group_member_role: {
        Args: {
          new_role: string
          target_group_id: string
          target_user_id: string
        }
        Returns: undefined
      }
      set_system_setting: {
        Args: { p_key: string; p_value: Json }
        Returns: undefined
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      soft_delete_user: {
        Args: {
          p_allow_self?: boolean
          p_reason?: string
          p_target_user_id: string
        }
        Returns: undefined
      }
      submit_campaign: {
        Args: { p_campaign_id: string }
        Returns: {
          advertiser_id: string
          approved_at: string | null
          budget_type: Database["public"]["Enums"]["campaign_budget_type"]
          cost_per_impression_cents: number
          created_at: string
          cta: string | null
          cta_url: string | null
          currency: string
          daily_budget_cents: number | null
          description: string | null
          end_at: string
          ended_at: string | null
          estimated_impressions: number | null
          estimated_reach_max: number | null
          estimated_reach_min: number | null
          headline: string | null
          id: string
          impressions_delivered: number
          is_scheduled: boolean
          moderation_note: string | null
          name: string
          objective: Database["public"]["Enums"]["campaign_objective"]
          paid_at: string | null
          post_id: string | null
          rejection_reason: string | null
          spend_cents: number
          start_at: string
          status: Database["public"]["Enums"]["campaign_status"]
          total_budget_cents: number
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "campaigns"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      unblock_user: { Args: { target_user_id: string }; Returns: undefined }
      unmute_user: { Args: { target_user_id: string }; Returns: undefined }
      unpin_message: { Args: { message_id: string }; Returns: undefined }
      unrepost_post: { Args: { target_post_id: string }; Returns: undefined }
      update_ad_report_status: {
        Args: {
          p_new_status: Database["public"]["Enums"]["ad_report_status"]
          p_report_id: string
        }
        Returns: {
          advertisement_id: string
          campaign_id: string
          created_at: string
          details: string | null
          id: string
          reason: string
          status: Database["public"]["Enums"]["ad_report_status"]
          user_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "ad_reports"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_advertiser_account: {
        Args: {
          p_account_id: string
          p_avatar_url?: string
          p_category?: string
          p_contact_email?: string
          p_contact_phone?: string
          p_cover_url?: string
          p_description?: string
          p_location?: string
          p_name?: string
          p_website?: string
        }
        Returns: {
          account_type: Database["public"]["Enums"]["advertiser_account_type"]
          avatar_url: string | null
          category: string | null
          contact_email: string | null
          contact_phone: string | null
          cover_url: string | null
          created_at: string
          description: string | null
          id: string
          location: string | null
          name: string
          status: Database["public"]["Enums"]["advertiser_status"]
          updated_at: string
          user_id: string
          username: string
          website: string | null
        }
        SetofOptions: {
          from: "*"
          to: "advertiser_accounts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_group: {
        Args: {
          group_avatar_url?: string
          group_cover_url?: string
          group_description?: string
          group_name: string
          group_privacy?: string
          target_group_id: string
        }
        Returns: {
          avatar_url: string | null
          cover_url: string | null
          created_at: string
          creator_id: string
          description: string
          id: string
          member_count: number
          name: string
          post_count: number
          privacy: string
          slug: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "groups"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_report_status: {
        Args: { new_status: string; report_id: string }
        Returns: undefined
      }
      user_delete_own_account: { Args: never; Returns: undefined }
      user_owns_book: {
        Args: { _book_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      account_privacy: "public" | "private"
      ad_event_type:
        | "impression"
        | "click"
        | "profile_visit"
        | "like"
        | "comment"
        | "share"
        | "save"
        | "follow"
        | "website_click"
        | "conversion"
      ad_placement: "feed" | "explore"
      ad_report_status: "open" | "reviewing" | "dismissed" | "actioned"
      advertiser_account_type: "personal" | "business" | "creator"
      advertiser_status: "active" | "suspended"
      app_role: "admin" | "moderator" | "user" | "super_admin" | "support"
      book_status: "draft" | "published" | "archived"
      campaign_budget_type: "daily" | "total"
      campaign_objective:
        | "reach"
        | "profile_visits"
        | "engagement"
        | "followers"
      campaign_status:
        | "draft"
        | "pending_payment"
        | "pending_review"
        | "scheduled"
        | "active"
        | "paused"
        | "completed"
        | "cancelled"
        | "rejected"
      emergency_mode:
        | "online"
        | "armed"
        | "backing_up"
        | "locked_down"
        | "counter_active"
        | "recovery"
      follow_status: "pending" | "accepted" | "blocked"
      notification_type:
        | "follow"
        | "follow_request"
        | "follow_accepted"
        | "star"
        | "mention"
        | "message"
        | "comment"
        | "system"
        | "missed_call"
      payment_provider: "stripe" | "manual"
      payment_status: "pending" | "succeeded" | "failed" | "refunded"
      plan_tier: "free" | "pro" | "premium"
      post_visibility: "public" | "followers" | "private"
      subscription_status:
        | "active"
        | "canceled"
        | "past_due"
        | "trialing"
        | "incomplete"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      account_privacy: ["public", "private"],
      ad_event_type: [
        "impression",
        "click",
        "profile_visit",
        "like",
        "comment",
        "share",
        "save",
        "follow",
        "website_click",
        "conversion",
      ],
      ad_placement: ["feed", "explore"],
      ad_report_status: ["open", "reviewing", "dismissed", "actioned"],
      advertiser_account_type: ["personal", "business", "creator"],
      advertiser_status: ["active", "suspended"],
      app_role: ["admin", "moderator", "user", "super_admin", "support"],
      book_status: ["draft", "published", "archived"],
      campaign_budget_type: ["daily", "total"],
      campaign_objective: [
        "reach",
        "profile_visits",
        "engagement",
        "followers",
      ],
      campaign_status: [
        "draft",
        "pending_payment",
        "pending_review",
        "scheduled",
        "active",
        "paused",
        "completed",
        "cancelled",
        "rejected",
      ],
      emergency_mode: [
        "online",
        "armed",
        "backing_up",
        "locked_down",
        "counter_active",
        "recovery",
      ],
      follow_status: ["pending", "accepted", "blocked"],
      notification_type: [
        "follow",
        "follow_request",
        "follow_accepted",
        "star",
        "mention",
        "message",
        "comment",
        "system",
        "missed_call",
      ],
      payment_provider: ["stripe", "manual"],
      payment_status: ["pending", "succeeded", "failed", "refunded"],
      plan_tier: ["free", "pro", "premium"],
      post_visibility: ["public", "followers", "private"],
      subscription_status: [
        "active",
        "canceled",
        "past_due",
        "trialing",
        "incomplete",
      ],
    },
  },
} as const
