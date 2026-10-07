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
      campaigns: {
        Row: {
          created_at: string
          ends_on: string
          id: string
          name: string
          slug: string
          starts_on: string
          time_zone: string
        }
        Insert: {
          created_at?: string
          ends_on: string
          id?: string
          name: string
          slug: string
          starts_on: string
          time_zone?: string
        }
        Update: {
          created_at?: string
          ends_on?: string
          id?: string
          name?: string
          slug?: string
          starts_on?: string
          time_zone?: string
        }
        Relationships: []
      }
      case_update_history: {
        Row: {
          campaign_id: string
          changed_at: string
          changed_by: string | null
          id: number
          month: string
          new_count: number
          old_count: number
          squad_member_id: string
        }
        Insert: {
          campaign_id: string
          changed_at?: string
          changed_by?: string | null
          id?: never
          month: string
          new_count: number
          old_count: number
          squad_member_id: string
        }
        Update: {
          campaign_id?: string
          changed_at?: string
          changed_by?: string | null
          id?: never
          month?: string
          new_count?: number
          old_count?: number
          squad_member_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_update_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_update_history_squad_member_id_fkey"
            columns: ["squad_member_id"]
            isOneToOne: false
            referencedRelation: "squad_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_update_history_target_fk"
            columns: ["campaign_id", "month"]
            isOneToOne: false
            referencedRelation: "monthly_targets"
            referencedColumns: ["campaign_id", "month"]
          },
          {
            foreignKeyName: "case_update_history_target_fk"
            columns: ["campaign_id", "month"]
            isOneToOne: false
            referencedRelation: "squad_monthly_progress"
            referencedColumns: ["campaign_id", "month"]
          },
        ]
      }
      member_case_counts: {
        Row: {
          campaign_id: string
          case_count: number
          id: string
          month: string
          squad_member_id: string
          updated_at: string
        }
        Insert: {
          campaign_id: string
          case_count?: number
          id?: string
          month: string
          squad_member_id: string
          updated_at?: string
        }
        Update: {
          campaign_id?: string
          case_count?: number
          id?: string
          month?: string
          squad_member_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_case_counts_squad_member_id_fkey"
            columns: ["squad_member_id"]
            isOneToOne: false
            referencedRelation: "squad_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_case_counts_target_fk"
            columns: ["campaign_id", "month"]
            isOneToOne: false
            referencedRelation: "monthly_targets"
            referencedColumns: ["campaign_id", "month"]
          },
          {
            foreignKeyName: "member_case_counts_target_fk"
            columns: ["campaign_id", "month"]
            isOneToOne: false
            referencedRelation: "squad_monthly_progress"
            referencedColumns: ["campaign_id", "month"]
          },
        ]
      }
      members: {
        Row: {
          created_at: string
          display_name: string
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name: string
          id?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      monthly_targets: {
        Row: {
          campaign_id: string
          month: string
          target_cases: number
        }
        Insert: {
          campaign_id: string
          month: string
          target_cases: number
        }
        Update: {
          campaign_id?: string
          month?: string
          target_cases?: number
        }
        Relationships: [
          {
            foreignKeyName: "monthly_targets_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          last_seen_at: string
          p256dh: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          last_seen_at?: string
          p256dh: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          last_seen_at?: string
          p256dh?: string
        }
        Relationships: []
      }
      squad_members: {
        Row: {
          id: string
          joined_at: string
          member_id: string
          squad_id: string
        }
        Insert: {
          id?: string
          joined_at?: string
          member_id: string
          squad_id: string
        }
        Update: {
          id?: string
          joined_at?: string
          member_id?: string
          squad_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "squad_members_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: true
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "squad_members_squad_id_fkey"
            columns: ["squad_id"]
            isOneToOne: false
            referencedRelation: "squad_monthly_progress"
            referencedColumns: ["squad_id"]
          },
          {
            foreignKeyName: "squad_members_squad_id_fkey"
            columns: ["squad_id"]
            isOneToOne: false
            referencedRelation: "squads"
            referencedColumns: ["id"]
          },
        ]
      }
      squads: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
    }
    Views: {
      squad_monthly_progress: {
        Row: {
          campaign_id: string | null
          month: string | null
          squad_id: string | null
          squad_name: string | null
          target_cases: number | null
          total_cases: number | null
        }
        Relationships: [
          {
            foreignKeyName: "monthly_targets_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      forget_push_devices: {
        Args: { p_endpoints: string[]; p_secret: string }
        Returns: number
      }
      member_recent_updates: {
        Args: { p_limit?: number; p_squad_member_id: string }
        Returns: {
          changed_at: string
          month: string
          new_count: number
          old_count: number
        }[]
      }
      push_devices: {
        Args: { p_secret: string }
        Returns: {
          auth: string
          endpoint: string
          p256dh: string
        }[]
      }
      register_push_device: {
        Args: { p_auth: string; p_endpoint: string; p_p256dh: string }
        Returns: undefined
      }
      squad_member_momentum: {
        Args: { p_squad_id: string }
        Returns: {
          squad_member_id: string
          this_week: number
          today: number
        }[]
      }
      squad_momentum: {
        Args: { p_squad_id: string }
        Returns: {
          last_change_at: string
          this_week: number
          today: number
        }[]
      }
      submit_case_count: {
        Args: {
          p_case_count: number
          p_expected_count?: number
          p_squad_member_id: string
        }
        Returns: {
          case_count: number
          month: string
          previous_count: number
          status: string
        }[]
      }
      unregister_push_device: {
        Args: { p_endpoint: string }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
