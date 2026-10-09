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
      avatar_frames: {
        Row: {
          active: boolean
          created_at: string
          id: string
          image_url: string
          name: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          image_url: string
          name: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          image_url?: string
          name?: string
        }
        Relationships: []
      }
      badge_events: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          ends_at: string | null
          id: string
          image_url: string
          name: string
          required_chapters: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          ends_at?: string | null
          id?: string
          image_url: string
          name: string
          required_chapters?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          ends_at?: string | null
          id?: string
          image_url?: string
          name?: string
          required_chapters?: number
        }
        Relationships: []
      }
      chapter_reads: {
        Row: {
          chapter_id: string
          created_at: string
          user_id: string
        }
        Insert: {
          chapter_id: string
          created_at?: string
          user_id: string
        }
        Update: {
          chapter_id?: string
          created_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chapter_reads_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
        ]
      }
      chapters: {
        Row: {
          content: string | null
          created_at: string
          id: string
          number: number
          pages: Json
          published: boolean
          series_id: string
          title: string | null
        }
        Insert: {
          content?: string | null
          created_at?: string
          id?: string
          number: number
          pages?: Json
          published?: boolean
          series_id: string
          title?: string | null
        }
        Update: {
          content?: string | null
          created_at?: string
          id?: string
          number?: number
          pages?: Json
          published?: boolean
          series_id?: string
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chapters_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "series"
            referencedColumns: ["id"]
          },
        ]
      }
      comment_likes: {
        Row: {
          comment_id: string
          created_at: string
          user_id: string
          value: number
        }
        Insert: {
          comment_id: string
          created_at?: string
          user_id: string
          value?: number
        }
        Update: {
          comment_id?: string
          created_at?: string
          user_id?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "comment_likes_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
        ]
      }
      comments: {
        Row: {
          body: string
          chapter_id: string | null
          created_at: string
          id: string
          image_url: string | null
          is_spoiler: boolean
          parent_id: string | null
          series_id: string
          user_id: string
        }
        Insert: {
          body: string
          chapter_id?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          is_spoiler?: boolean
          parent_id?: string | null
          series_id: string
          user_id: string
        }
        Update: {
          body?: string
          chapter_id?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          is_spoiler?: boolean
          parent_id?: string | null
          series_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comments_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "series"
            referencedColumns: ["id"]
          },
        ]
      }
      favorites: {
        Row: {
          created_at: string
          series_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          series_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          series_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "favorites_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "series"
            referencedColumns: ["id"]
          },
        ]
      }
      home_sections: {
        Row: {
          created_at: string
          mode: string
          section: string
          series_ids: string[]
          updated_at: string
        }
        Insert: {
          created_at?: string
          mode?: string
          section: string
          series_ids?: string[]
          updated_at?: string
        }
        Update: {
          created_at?: string
          mode?: string
          section?: string
          series_ids?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      list_follows: {
        Row: {
          created_at: string
          list_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          list_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          list_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "list_follows_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "lists"
            referencedColumns: ["id"]
          },
        ]
      }
      list_items: {
        Row: {
          created_at: string
          list_id: string
          series_id: string
        }
        Insert: {
          created_at?: string
          list_id: string
          series_id: string
        }
        Update: {
          created_at?: string
          list_id?: string
          series_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "list_items_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "list_items_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "series"
            referencedColumns: ["id"]
          },
        ]
      }
      lists: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_public: boolean
          title: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_public?: boolean
          title: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_public?: boolean
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      maintenance_settings: {
        Row: {
          enabled: boolean
          id: number
          media_kind: string
          media_path: string
          message: string
          title: string
          updated_at: string
        }
        Insert: {
          enabled?: boolean
          id?: number
          media_kind?: string
          media_path?: string
          message?: string
          title?: string
          updated_at?: string
        }
        Update: {
          enabled?: boolean
          id?: number
          media_kind?: string
          media_path?: string
          message?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      media_settings: {
        Row: {
          api_key: string | null
          api_secret: string | null
          cloud_name: string | null
          folder: string | null
          id: number
          updated_at: string
        }
        Insert: {
          api_key?: string | null
          api_secret?: string | null
          cloud_name?: string | null
          folder?: string | null
          id?: number
          updated_at?: string
        }
        Update: {
          api_key?: string | null
          api_secret?: string | null
          cloud_name?: string | null
          folder?: string | null
          id?: number
          updated_at?: string
        }
        Relationships: []
      }
      profile_badges: {
        Row: {
          created_at: string
          event_id: string | null
          id: string
          image_url: string
          name: string
          position: number
          user_id: string
        }
        Insert: {
          created_at?: string
          event_id?: string | null
          id?: string
          image_url: string
          name: string
          position?: number
          user_id: string
        }
        Update: {
          created_at?: string
          event_id?: string | null
          id?: string
          image_url?: string
          name?: string
          position?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_badges_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "badge_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_badges_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_comments: {
        Row: {
          author_id: string
          body: string
          created_at: string
          id: string
          profile_id: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          id?: string
          profile_id: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_comments_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          accent_color: string | null
          avatar_frame: string | null
          avatar_url: string | null
          banned: boolean
          banner_url: string | null
          bio: string | null
          comment_bg: string | null
          created_at: string
          display_name: string | null
          id: string
          is_private: boolean
          level: number
          subscription_tier: string
          username: string
          xp: number
        }
        Insert: {
          accent_color?: string | null
          avatar_frame?: string | null
          avatar_url?: string | null
          banned?: boolean
          banner_url?: string | null
          bio?: string | null
          comment_bg?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          is_private?: boolean
          level?: number
          subscription_tier?: string
          username: string
          xp?: number
        }
        Update: {
          accent_color?: string | null
          avatar_frame?: string | null
          avatar_url?: string | null
          banned?: boolean
          banner_url?: string | null
          bio?: string | null
          comment_bg?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          is_private?: boolean
          level?: number
          subscription_tier?: string
          username?: string
          xp?: number
        }
        Relationships: []
      }
      ratings: {
        Row: {
          created_at: string
          score: number
          series_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          score: number
          series_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          score?: number
          series_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ratings_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "series"
            referencedColumns: ["id"]
          },
        ]
      }
      reading_history: {
        Row: {
          chapter_id: string | null
          progress: number
          scroll_pos: number
          series_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          chapter_id?: string | null
          progress?: number
          scroll_pos?: number
          series_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          chapter_id?: string | null
          progress?: number
          scroll_pos?: number
          series_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reading_history_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reading_history_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "series"
            referencedColumns: ["id"]
          },
        ]
      }
      reading_status: {
        Row: {
          series_id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          series_id: string
          status: string
          updated_at?: string
          user_id: string
        }
        Update: {
          series_id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reading_status_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "series"
            referencedColumns: ["id"]
          },
        ]
      }
      series: {
        Row: {
          alt_titles: string | null
          anilist_id: number | null
          anilist_popularity: number
          anilist_trending: number
          artist: string | null
          author: string | null
          banner_url: string | null
          cover_url: string | null
          created_at: string
          created_by: string | null
          genres: string[]
          id: string
          in_slider: boolean
          kind: string
          pinned: boolean
          published: boolean
          rating: number
          slug: string
          status: string
          synopsis: string | null
          title: string
          updated_at: string
          views: number
        }
        Insert: {
          alt_titles?: string | null
          anilist_id?: number | null
          anilist_popularity?: number
          anilist_trending?: number
          artist?: string | null
          author?: string | null
          banner_url?: string | null
          cover_url?: string | null
          created_at?: string
          created_by?: string | null
          genres?: string[]
          id?: string
          in_slider?: boolean
          kind?: string
          pinned?: boolean
          published?: boolean
          rating?: number
          slug: string
          status?: string
          synopsis?: string | null
          title: string
          updated_at?: string
          views?: number
        }
        Update: {
          alt_titles?: string | null
          anilist_id?: number | null
          anilist_popularity?: number
          anilist_trending?: number
          artist?: string | null
          author?: string | null
          banner_url?: string | null
          cover_url?: string | null
          created_at?: string
          created_by?: string | null
          genres?: string[]
          id?: string
          in_slider?: boolean
          kind?: string
          pinned?: boolean
          published?: boolean
          rating?: number
          slug?: string
          status?: string
          synopsis?: string | null
          title?: string
          updated_at?: string
          views?: number
        }
        Relationships: []
      }
      support_messages: {
        Row: {
          body: string
          created_at: string
          from_staff: boolean
          id: string
          sender_id: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          from_staff?: boolean
          id?: string
          sender_id?: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          from_staff?: boolean
          id?: string
          sender_id?: string
          user_id?: string
        }
        Relationships: []
      }
      user_follows: {
        Row: {
          created_at: string
          follower_id: string
          following_id: string
        }
        Insert: {
          created_at?: string
          follower_id: string
          following_id: string
        }
        Update: {
          created_at?: string
          follower_id?: string
          following_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_follows_following_id_fkey"
            columns: ["following_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      work_notifications: {
        Row: {
          created_at: string
          id: string
          read_at: string | null
          request_id: string
          series_id: string
          title: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          read_at?: string | null
          request_id: string
          series_id: string
          title: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          read_at?: string | null
          request_id?: string
          series_id?: string
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_notifications_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: true
            referencedRelation: "work_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_notifications_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "series"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      work_requests: {
        Row: {
          admin_note: string
          created_at: string
          id: string
          kind: string
          notes: string
          series_id: string | null
          status: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_note?: string
          created_at?: string
          id?: string
          kind?: string
          notes?: string
          series_id?: string | null
          status?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_note?: string
          created_at?: string
          id?: string
          kind?: string
          notes?: string
          series_id?: string | null
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_requests_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "series"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      xp_events: {
        Row: {
          amount: number
          created_at: string
          id: string
          reason: string
          ref_id: string | null
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          reason: string
          ref_id?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          reason?: string
          ref_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      award_xp: {
        Args: { _amount: number; _reason: string; _ref: string; _user: string }
        Returns: undefined
      }
      claim_event_badge: { Args: { _event: string }; Returns: undefined }
      comment_vote_counts: {
        Args: { _comment_id: string }
        Returns: {
          dislikes: number
          likes: number
        }[]
      }
      event_badge_progress: { Args: { _event: string }; Returns: number }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_series_views: {
        Args: { _series_id: string }
        Returns: undefined
      }
      maintenance_access_allowed: { Args: never; Returns: boolean }
      maintenance_media_upload_valid: {
        Args: { object_metadata: Json; object_name: string }
        Returns: boolean
      }
      obra_ranking: {
        Args: { _metric: string }
        Returns: {
          cover_url: string
          id: string
          rating: number
          slug: string
          title: string
          total: number
        }[]
      }
      resolve_work_request: {
        Args: { _note?: string; _request: string; _series?: string }
        Returns: undefined
      }
      xp_ranking: {
        Args: { _period: string }
        Returns: {
          avatar_url: string
          id: string
          level: number
          username: string
          xp: number
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "uploader" | "user"
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
      app_role: ["admin", "uploader", "user"],
    },
  },
} as const
