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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
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
      interest_posts: {
        Row: {
          category_id: string
          comment_count: number
          content: string
          created_at: string
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
      messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          is_edited: boolean | null
          location_session_id: string | null
          reply_to_message_id: string | null
          sender_id: string
          updated_at: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          is_edited?: boolean | null
          location_session_id?: string | null
          reply_to_message_id?: string | null
          sender_id: string
          updated_at?: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          is_edited?: boolean | null
          location_session_id?: string | null
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
            foreignKeyName: "messages_location_session_id_fkey"
            columns: ["location_session_id"]
            isOneToOne: false
            referencedRelation: "live_location_sessions"
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
        ]
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
          id: string
          is_edited: boolean
          is_pinned: boolean | null
          star_count: number | null
          updated_at: string
          user_id: string
          visibility: Database["public"]["Enums"]["post_visibility"] | null
        }
        Insert: {
          comment_count?: number | null
          content: string
          created_at?: string
          id?: string
          is_edited?: boolean
          is_pinned?: boolean | null
          star_count?: number | null
          updated_at?: string
          user_id: string
          visibility?: Database["public"]["Enums"]["post_visibility"] | null
        }
        Update: {
          comment_count?: number | null
          content?: string
          created_at?: string
          id?: string
          is_edited?: boolean
          is_pinned?: boolean | null
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_conversation_members: {
        Args: { conv_id: string; member_ids: string[] }
        Returns: undefined
      }
      admin_delete_user: {
        Args: { target_user_id: string }
        Returns: undefined
      }
      admin_purge_all_users: {
        Args: { keep_user_id?: string }
        Returns: number
      }
      create_community: {
        Args: {
          community_name: string
          community_description?: string
          community_avatar_url?: string
        }
        Returns: string
      }
      create_group_conversation: {
        Args: {
          group_name: string
          member_ids: string[]
          group_avatar_url?: string
        }
        Returns: string
      }
      get_active_ban: {
        Args: { _user_id: string }
        Returns: {
          expires_at: string
          reason: string
        }[]
      }
      get_follower_count: { Args: { _user_id: string }; Returns: number }
      get_following_count: { Args: { _user_id: string }; Returns: number }
      get_or_create_dm_conversation: {
        Args: { other_user_id: string }
        Returns: string
      }
      has_premium_access: { Args: { _user_id: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: never; Returns: boolean }
      is_admin_or_moderator: { Args: never; Returns: boolean }
      is_conversation_participant: {
        Args: { _conversation_id: string; _user_id: string }
        Returns: boolean
      }
      is_following: {
        Args: { _follower_id: string; _following_id: string }
        Returns: boolean
      }
      is_post_visible: {
        Args: { post_row: Database["public"]["Tables"]["posts"]["Row"] }
        Returns: boolean
      }
      is_user_banned: { Args: { _user_id: string }; Returns: boolean }
      is_verified_author: { Args: { _user_id: string }; Returns: boolean }
      join_conversation_by_code: {
        Args: { code: string }
        Returns: string
      }
      leave_conversation: {
        Args: { conv_id: string }
        Returns: undefined
      }
      delete_conversation: {
        Args: { conv_id: string }
        Returns: undefined
      }
      set_conversation_wallpaper: {
        Args: { conv_id: string; wallpaper?: string | null }
        Returns: undefined
      }
      user_owns_book: {
        Args: { _book_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      account_privacy: "public" | "private"
      app_role: "admin" | "moderator" | "user"
      book_status: "draft" | "published" | "archived"
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
  public: {
    Enums: {
      account_privacy: ["public", "private"],
      app_role: ["admin", "moderator", "user"],
      book_status: ["draft", "published", "archived"],
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
