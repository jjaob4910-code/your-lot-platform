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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      budgets: {
        Row: {
          admin_fund_total: number
          allocation_method: string
          created_at: string
          financial_year: string
          id: string
          levy_due_date: string
          maintenance_fund_total: number
          scheme_id: string
        }
        Insert: {
          admin_fund_total?: number
          allocation_method?: string
          created_at?: string
          financial_year: string
          id?: string
          levy_due_date?: string
          maintenance_fund_total?: number
          scheme_id: string
        }
        Update: {
          admin_fund_total?: number
          allocation_method?: string
          created_at?: string
          financial_year?: string
          id?: string
          levy_due_date?: string
          maintenance_fund_total?: number
          scheme_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "budgets_scheme_id_fkey"
            columns: ["scheme_id"]
            isOneToOne: false
            referencedRelation: "schemes"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_events: {
        Row: {
          created_at: string
          event_date: string
          id: string
          kind: string
          notes: string | null
          scheme_id: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          event_date: string
          id?: string
          kind?: string
          notes?: string | null
          scheme_id: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          event_date?: string
          id?: string
          kind?: string
          notes?: string | null
          scheme_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_events_scheme_id_fkey"
            columns: ["scheme_id"]
            isOneToOne: false
            referencedRelation: "schemes"
            referencedColumns: ["id"]
          },
        ]
      }
      committee_roles: {
        Row: {
          id: string
          lot_id: string
          role: string
        }
        Insert: {
          id?: string
          lot_id: string
          role: string
        }
        Update: {
          id?: string
          lot_id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "committee_roles_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "lots"
            referencedColumns: ["id"]
          },
        ]
      }
      compliance_tasks: {
        Row: {
          created_at: string
          detail: string | null
          due_date: string
          id: string
          scheme_id: string
          status: Database["public"]["Enums"]["compliance_status"]
          task_name: string
        }
        Insert: {
          created_at?: string
          detail?: string | null
          due_date: string
          id?: string
          scheme_id: string
          status?: Database["public"]["Enums"]["compliance_status"]
          task_name: string
        }
        Update: {
          created_at?: string
          detail?: string | null
          due_date?: string
          id?: string
          scheme_id?: string
          status?: Database["public"]["Enums"]["compliance_status"]
          task_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "compliance_tasks_scheme_id_fkey"
            columns: ["scheme_id"]
            isOneToOne: false
            referencedRelation: "schemes"
            referencedColumns: ["id"]
          },
        ]
      }
      document_folders: {
        Row: {
          color: string
          created_at: string
          icon: string
          id: string
          name: string
          parent_id: string | null
          scheme_id: string
          updated_at: string
        }
        Insert: {
          color?: string
          created_at?: string
          icon?: string
          id?: string
          name: string
          parent_id?: string | null
          scheme_id: string
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          icon?: string
          id?: string
          name?: string
          parent_id?: string | null
          scheme_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_folders_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "document_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_folders_scheme_id_fkey"
            columns: ["scheme_id"]
            isOneToOne: false
            referencedRelation: "schemes"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          category: string | null
          compliance_task_id: string | null
          file_size: number | null
          finance_transaction_id: string | null
          folder_id: string | null
          id: string
          insurance_policy_id: string | null
          mime_type: string | null
          name: string
          scheme_id: string
          shared_with_owners: boolean
          storage_path: string | null
          updated_at: string
          uploaded_at: string
        }
        Insert: {
          category?: string | null
          compliance_task_id?: string | null
          file_size?: number | null
          finance_transaction_id?: string | null
          folder_id?: string | null
          id?: string
          insurance_policy_id?: string | null
          mime_type?: string | null
          name: string
          scheme_id: string
          shared_with_owners?: boolean
          storage_path?: string | null
          updated_at?: string
          uploaded_at?: string
        }
        Update: {
          category?: string | null
          compliance_task_id?: string | null
          file_size?: number | null
          finance_transaction_id?: string | null
          folder_id?: string | null
          id?: string
          insurance_policy_id?: string | null
          mime_type?: string | null
          name?: string
          scheme_id?: string
          shared_with_owners?: boolean
          storage_path?: string | null
          updated_at?: string
          uploaded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_compliance_task_id_fkey"
            columns: ["compliance_task_id"]
            isOneToOne: false
            referencedRelation: "compliance_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_finance_transaction_id_fkey"
            columns: ["finance_transaction_id"]
            isOneToOne: false
            referencedRelation: "finance_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "document_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_insurance_policy_id_fkey"
            columns: ["insurance_policy_id"]
            isOneToOne: false
            referencedRelation: "insurance_policies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_scheme_id_fkey"
            columns: ["scheme_id"]
            isOneToOne: false
            referencedRelation: "schemes"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_transactions: {
        Row: {
          amount: number
          category: string | null
          created_at: string
          description: string
          direction: string
          fund: string
          id: string
          notes: string | null
          occurred_on: string
          scheme_id: string
          status: string
          supplier: string | null
          updated_at: string
          work_order_id: string | null
        }
        Insert: {
          amount?: number
          category?: string | null
          created_at?: string
          description: string
          direction?: string
          fund?: string
          id?: string
          notes?: string | null
          occurred_on?: string
          scheme_id: string
          status?: string
          supplier?: string | null
          updated_at?: string
          work_order_id?: string | null
        }
        Update: {
          amount?: number
          category?: string | null
          created_at?: string
          description?: string
          direction?: string
          fund?: string
          id?: string
          notes?: string | null
          occurred_on?: string
          scheme_id?: string
          status?: string
          supplier?: string | null
          updated_at?: string
          work_order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "finance_transactions_scheme_id_fkey"
            columns: ["scheme_id"]
            isOneToOne: false
            referencedRelation: "schemes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_transactions_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "maintenance_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      insurance_policies: {
        Row: {
          broker: string | null
          broker_contact: string | null
          created_at: string
          excess: number | null
          id: string
          insurer: string | null
          notes: string | null
          policy_number: string | null
          policy_type: string
          premium: number | null
          renewal_date: string | null
          scheme_id: string
          start_date: string | null
          sum_insured: number | null
          updated_at: string
        }
        Insert: {
          broker?: string | null
          broker_contact?: string | null
          created_at?: string
          excess?: number | null
          id?: string
          insurer?: string | null
          notes?: string | null
          policy_number?: string | null
          policy_type?: string
          premium?: number | null
          renewal_date?: string | null
          scheme_id: string
          start_date?: string | null
          sum_insured?: number | null
          updated_at?: string
        }
        Update: {
          broker?: string | null
          broker_contact?: string | null
          created_at?: string
          excess?: number | null
          id?: string
          insurer?: string | null
          notes?: string | null
          policy_number?: string | null
          policy_type?: string
          premium?: number | null
          renewal_date?: string | null
          scheme_id?: string
          start_date?: string | null
          sum_insured?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "insurance_policies_scheme_id_fkey"
            columns: ["scheme_id"]
            isOneToOne: false
            referencedRelation: "schemes"
            referencedColumns: ["id"]
          },
        ]
      }
      levies: {
        Row: {
          amount: number
          budget_id: string
          created_at: string
          due_date: string
          id: string
          lot_id: string
          paid_at: string | null
          status: Database["public"]["Enums"]["levy_status"]
        }
        Insert: {
          amount?: number
          budget_id: string
          created_at?: string
          due_date: string
          id?: string
          lot_id: string
          paid_at?: string | null
          status?: Database["public"]["Enums"]["levy_status"]
        }
        Update: {
          amount?: number
          budget_id?: string
          created_at?: string
          due_date?: string
          id?: string
          lot_id?: string
          paid_at?: string | null
          status?: Database["public"]["Enums"]["levy_status"]
        }
        Relationships: [
          {
            foreignKeyName: "levies_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "budgets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "levies_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "lots"
            referencedColumns: ["id"]
          },
        ]
      }
      lots: {
        Row: {
          created_at: string
          entitlement_percent: number
          id: string
          lot_number: number
          occupied_status: string
          owner_email: string | null
          owner_name: string | null
          owner_user_id: string | null
          scheme_id: string
        }
        Insert: {
          created_at?: string
          entitlement_percent?: number
          id?: string
          lot_number: number
          occupied_status?: string
          owner_email?: string | null
          owner_name?: string | null
          owner_user_id?: string | null
          scheme_id: string
        }
        Update: {
          created_at?: string
          entitlement_percent?: number
          id?: string
          lot_number?: number
          occupied_status?: string
          owner_email?: string | null
          owner_name?: string | null
          owner_user_id?: string | null
          scheme_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lots_scheme_id_fkey"
            columns: ["scheme_id"]
            isOneToOne: false
            referencedRelation: "schemes"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_requests: {
        Row: {
          approval_required: boolean
          closed_at: string | null
          created_at: string
          description: string | null
          estimated_cost: number | null
          id: string
          kind: string
          location: string | null
          outcome: string | null
          priority: string
          scheme_id: string
          status: Database["public"]["Enums"]["maintenance_status"]
          submitted_by_lot_id: string | null
          target_date: string | null
          title: string
          updated_at: string
        }
        Insert: {
          approval_required?: boolean
          closed_at?: string | null
          created_at?: string
          description?: string | null
          estimated_cost?: number | null
          id?: string
          kind?: string
          location?: string | null
          outcome?: string | null
          priority?: string
          scheme_id: string
          status?: Database["public"]["Enums"]["maintenance_status"]
          submitted_by_lot_id?: string | null
          target_date?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          approval_required?: boolean
          closed_at?: string | null
          created_at?: string
          description?: string | null
          estimated_cost?: number | null
          id?: string
          kind?: string
          location?: string | null
          outcome?: string | null
          priority?: string
          scheme_id?: string
          status?: Database["public"]["Enums"]["maintenance_status"]
          submitted_by_lot_id?: string | null
          target_date?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_requests_scheme_id_fkey"
            columns: ["scheme_id"]
            isOneToOne: false
            referencedRelation: "schemes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_requests_submitted_by_lot_id_fkey"
            columns: ["submitted_by_lot_id"]
            isOneToOne: false
            referencedRelation: "lots"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          email: string | null
          id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
        }
        Relationships: []
      }
      schemes: {
        Row: {
          address: string
          created_at: string
          id: string
          name: string
          next_agm_date: string | null
          tier: string | null
          total_lots: number
        }
        Insert: {
          address: string
          created_at?: string
          id?: string
          name: string
          next_agm_date?: string | null
          tier?: string | null
          total_lots?: number
        }
        Update: {
          address?: string
          created_at?: string
          id?: string
          name?: string
          next_agm_date?: string | null
          tier?: string | null
          total_lots?: number
        }
        Relationships: []
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
      work_order_approvals: {
        Row: {
          comment: string | null
          created_at: string
          decided_at: string | null
          decision: string
          id: string
          lot_id: string
          work_order_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          decided_at?: string | null
          decision?: string
          id?: string
          lot_id: string
          work_order_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          decided_at?: string | null
          decision?: string
          id?: string
          lot_id?: string
          work_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_order_approvals_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_order_approvals_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "maintenance_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      work_order_photos: {
        Row: {
          caption: string | null
          created_at: string
          id: string
          storage_path: string
          work_order_id: string
        }
        Insert: {
          caption?: string | null
          created_at?: string
          id?: string
          storage_path: string
          work_order_id: string
        }
        Update: {
          caption?: string | null
          created_at?: string
          id?: string
          storage_path?: string
          work_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_order_photos_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "maintenance_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      work_order_updates: {
        Row: {
          author_label: string | null
          created_at: string
          id: string
          note: string
          status_at_time: string | null
          work_order_id: string
        }
        Insert: {
          author_label?: string | null
          created_at?: string
          id?: string
          note: string
          status_at_time?: string | null
          work_order_id: string
        }
        Update: {
          author_label?: string | null
          created_at?: string
          id?: string
          note?: string
          status_at_time?: string | null
          work_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_order_updates_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "maintenance_requests"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      owns_lot: { Args: { _lot_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "Owner" | "Committee"
      compliance_status: "Not Started" | "In Progress" | "Complete"
      levy_status: "Pending" | "Paid" | "Overdue"
      maintenance_status:
        | "Requested"
        | "Awaiting approval"
        | "Quoted"
        | "Approved"
        | "In progress"
        | "Complete"
        | "Closed"
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
      app_role: ["Owner", "Committee"],
      compliance_status: ["Not Started", "In Progress", "Complete"],
      levy_status: ["Pending", "Paid", "Overdue"],
      maintenance_status: [
        "Requested",
        "Awaiting approval",
        "Quoted",
        "Approved",
        "In progress",
        "Complete",
        "Closed",
      ],
    },
  },
} as const
