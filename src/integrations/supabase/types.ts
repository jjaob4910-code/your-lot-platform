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
      action_drafts: {
        Row: {
          content: string
          id: string
          scheme_id: string
          standard_key: string
          updated_at: string
        }
        Insert: {
          content?: string
          id?: string
          scheme_id: string
          standard_key: string
          updated_at?: string
        }
        Update: {
          content?: string
          id?: string
          scheme_id?: string
          standard_key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "action_drafts_scheme_id_fkey"
            columns: ["scheme_id"]
            isOneToOne: false
            referencedRelation: "schemes"
            referencedColumns: ["id"]
          },
        ]
      }
      agm_item_attachments: {
        Row: { created_at: string; document_id: string; id: string; item_id: string; meeting_id: string }
        Insert: { created_at?: string; document_id: string; id?: string; item_id: string; meeting_id: string }
        Update: { created_at?: string; document_id?: string; id?: string; item_id?: string; meeting_id?: string }
        Relationships: []
      }
      agm_meetings: {
        Row: {
          agenda: Json
          attendance: Json
          attendance_confirmed_at: string | null
          created_at: string
          id: string
          location: string | null
          meeting_date: string | null
          meeting_time: string | null
          minutes_document_id: string | null
          notes: string
          notice_document_id: string | null
          notice_sent_at: string | null
          published_at: string | null
          scheme_id: string
          sort_order: number | null
          stage: string
          status: string
          title: string
          updated_at: string
          video_link: string | null
        }
        Insert: {
          agenda?: Json
          attendance?: Json
          attendance_confirmed_at?: string | null
          created_at?: string
          id?: string
          location?: string | null
          meeting_date?: string | null
          meeting_time?: string | null
          minutes_document_id?: string | null
          notes?: string
          notice_document_id?: string | null
          notice_sent_at?: string | null
          published_at?: string | null
          scheme_id: string
          sort_order?: number | null
          stage?: string
          status?: string
          title: string
          updated_at?: string
          video_link?: string | null
        }
        Update: {
          agenda?: Json
          attendance?: Json
          attendance_confirmed_at?: string | null
          created_at?: string
          id?: string
          location?: string | null
          meeting_date?: string | null
          meeting_time?: string | null
          minutes_document_id?: string | null
          notes?: string
          notice_document_id?: string | null
          notice_sent_at?: string | null
          published_at?: string | null
          scheme_id?: string
          sort_order?: number | null
          stage?: string
          status?: string
          title?: string
          updated_at?: string
          video_link?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agm_meetings_minutes_document_id_fkey"
            columns: ["minutes_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agm_meetings_notice_document_id_fkey"
            columns: ["notice_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agm_meetings_scheme_id_fkey"
            columns: ["scheme_id"]
            isOneToOne: false
            referencedRelation: "schemes"
            referencedColumns: ["id"]
          },
        ]
      }
      agm_suggestions: {
        Row: {
          created_at: string
          details: string | null
          id: string
          lot_id: string | null
          meeting_id: string
          status: string
          title: string
        }
        Insert: {
          created_at?: string
          details?: string | null
          id?: string
          lot_id?: string | null
          meeting_id: string
          status?: string
          title: string
        }
        Update: {
          created_at?: string
          details?: string | null
          id?: string
          lot_id?: string | null
          meeting_id?: string
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "agm_suggestions_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agm_suggestions_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "agm_meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_fund_totals: {
        Row: {
          budget_id: string
          fund_id: string
          id: string
          total: number
        }
        Insert: {
          budget_id: string
          fund_id: string
          id?: string
          total?: number
        }
        Update: {
          budget_id?: string
          fund_id?: string
          id?: string
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "budget_fund_totals_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "budgets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_fund_totals_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "budget_funds"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_funds: {
        Row: {
          created_at: string
          id: string
          name: string
          scheme_id: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          scheme_id: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          scheme_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "budget_funds_scheme_id_fkey"
            columns: ["scheme_id"]
            isOneToOne: false
            referencedRelation: "schemes"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_line_items: {
        Row: {
          amount: number
          budget_id: string
          cost_type: string
          created_at: string
          description: string
          expected_date: string | null
          expected_month: number | null
          fund_id: string
          id: string
          occurrence: string
          scheme_id: string
          updated_at: string
        }
        Insert: {
          amount?: number
          budget_id: string
          cost_type?: string
          created_at?: string
          description: string
          expected_date?: string | null
          expected_month?: number | null
          fund_id: string
          id?: string
          occurrence?: string
          scheme_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          budget_id?: string
          cost_type?: string
          created_at?: string
          description?: string
          expected_date?: string | null
          expected_month?: number | null
          fund_id?: string
          id?: string
          occurrence?: string
          scheme_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "budget_line_items_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "budgets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_line_items_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "budget_funds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_line_items_scheme_id_fkey"
            columns: ["scheme_id"]
            isOneToOne: false
            referencedRelation: "schemes"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_revisions: {
        Row: {
          budget_id: string
          created_at: string
          created_by: string | null
          id: string
          levies_recalculated: boolean
          new_allocation_method: string
          new_fund_totals: Json
          new_levy_due_date: string
          new_line_items: Json
          new_total: number
          previous_allocation_method: string
          previous_fund_totals: Json
          previous_levy_due_date: string
          previous_line_items: Json
          previous_total: number
          reason: string
          scheme_id: string
        }
        Insert: {
          budget_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          levies_recalculated?: boolean
          new_allocation_method: string
          new_fund_totals?: Json
          new_levy_due_date: string
          new_line_items?: Json
          new_total: number
          previous_allocation_method: string
          previous_fund_totals?: Json
          previous_levy_due_date: string
          previous_line_items?: Json
          previous_total: number
          reason: string
          scheme_id: string
        }
        Update: {
          budget_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          levies_recalculated?: boolean
          new_allocation_method?: string
          new_fund_totals?: Json
          new_levy_due_date?: string
          new_line_items?: Json
          new_total?: number
          previous_allocation_method?: string
          previous_fund_totals?: Json
          previous_levy_due_date?: string
          previous_line_items?: Json
          previous_total?: number
          reason?: string
          scheme_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "budget_revisions_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "budgets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_revisions_scheme_id_fkey"
            columns: ["scheme_id"]
            isOneToOne: false
            referencedRelation: "schemes"
            referencedColumns: ["id"]
          },
        ]
      }
      budgets: {
        Row: {
          allocation_method: string
          created_at: string
          financial_year: string
          id: string
          levy_due_date: string
          scheme_id: string
          total_amount: number
        }
        Insert: {
          allocation_method?: string
          created_at?: string
          financial_year: string
          id?: string
          levy_due_date?: string
          scheme_id: string
          total_amount?: number
        }
        Update: {
          allocation_method?: string
          created_at?: string
          financial_year?: string
          id?: string
          levy_due_date?: string
          scheme_id?: string
          total_amount?: number
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
          widget_id: string | null
        }
        Insert: {
          created_at?: string
          detail?: string | null
          due_date: string
          id?: string
          scheme_id: string
          status?: Database["public"]["Enums"]["compliance_status"]
          task_name: string
          widget_id?: string | null
        }
        Update: {
          created_at?: string
          detail?: string | null
          due_date?: string
          id?: string
          scheme_id?: string
          status?: Database["public"]["Enums"]["compliance_status"]
          task_name?: string
          widget_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "compliance_tasks_scheme_id_fkey"
            columns: ["scheme_id"]
            isOneToOne: false
            referencedRelation: "schemes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_tasks_widget_id_fkey"
            columns: ["widget_id"]
            isOneToOne: false
            referencedRelation: "compliance_widgets"
            referencedColumns: ["id"]
          },
        ]
      }
      compliance_widgets: {
        Row: {
          created_at: string
          default_detail: string | null
          enabled: boolean
          id: string
          is_standard: boolean
          label: string
          scheme_id: string
          sort_order: number
          standard_key: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_detail?: string | null
          enabled?: boolean
          id?: string
          is_standard?: boolean
          label: string
          scheme_id: string
          sort_order?: number
          standard_key?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_detail?: string | null
          enabled?: boolean
          id?: string
          is_standard?: boolean
          label?: string
          scheme_id?: string
          sort_order?: number
          standard_key?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "compliance_widgets_scheme_id_fkey"
            columns: ["scheme_id"]
            isOneToOne: false
            referencedRelation: "schemes"
            referencedColumns: ["id"]
          },
        ]
      }
      contractors: {
        Row: {
          abn: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          scheme_id: string
          trade: string | null
        }
        Insert: {
          abn?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          scheme_id: string
          trade?: string | null
        }
        Update: {
          abn?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          scheme_id?: string
          trade?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contractors_scheme_id_fkey"
            columns: ["scheme_id"]
            isOneToOne: false
            referencedRelation: "schemes"
            referencedColumns: ["id"]
          },
        ]
      }
      dashboard_widgets: {
        Row: {
          config: Json
          created_at: string
          id: string
          scheme_id: string
          size: string
          sort_order: number
          updated_at: string
          user_id: string | null
          widget_type: string
        }
        Insert: {
          config?: Json
          created_at?: string
          id?: string
          scheme_id: string
          size?: string
          sort_order?: number
          updated_at?: string
          user_id?: string | null
          widget_type: string
        }
        Update: {
          config?: Json
          created_at?: string
          id?: string
          scheme_id?: string
          size?: string
          sort_order?: number
          updated_at?: string
          user_id?: string | null
          widget_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "dashboard_widgets_scheme_id_fkey"
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
          budget_line_item_id: string | null
          category: string | null
          compliance_task_id: string | null
          file_size: number | null
          finance_transaction_id: string | null
          folder_id: string | null
          id: string
          insurance_claim_id: string | null
          insurance_policy_id: string | null
          levy_id: string | null
          mime_type: string | null
          name: string
          scheme_id: string
          shared_with_owners: boolean
          storage_path: string | null
          updated_at: string
          uploaded_at: string
          work_order_id: string | null
          work_order_quote_id: string | null
        }
        Insert: {
          budget_line_item_id?: string | null
          category?: string | null
          compliance_task_id?: string | null
          file_size?: number | null
          finance_transaction_id?: string | null
          folder_id?: string | null
          id?: string
          insurance_claim_id?: string | null
          insurance_policy_id?: string | null
          levy_id?: string | null
          mime_type?: string | null
          name: string
          scheme_id: string
          shared_with_owners?: boolean
          storage_path?: string | null
          updated_at?: string
          uploaded_at?: string
          work_order_id?: string | null
          work_order_quote_id?: string | null
        }
        Update: {
          budget_line_item_id?: string | null
          category?: string | null
          compliance_task_id?: string | null
          file_size?: number | null
          finance_transaction_id?: string | null
          folder_id?: string | null
          id?: string
          insurance_claim_id?: string | null
          insurance_policy_id?: string | null
          levy_id?: string | null
          mime_type?: string | null
          name?: string
          scheme_id?: string
          shared_with_owners?: boolean
          storage_path?: string | null
          updated_at?: string
          uploaded_at?: string
          work_order_id?: string | null
          work_order_quote_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_budget_line_item_id_fkey"
            columns: ["budget_line_item_id"]
            isOneToOne: false
            referencedRelation: "budget_line_items"
            referencedColumns: ["id"]
          },
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
            foreignKeyName: "documents_insurance_claim_id_fkey"
            columns: ["insurance_claim_id"]
            isOneToOne: false
            referencedRelation: "insurance_claims"
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
            foreignKeyName: "documents_levy_id_fkey"
            columns: ["levy_id"]
            isOneToOne: false
            referencedRelation: "levies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_scheme_id_fkey"
            columns: ["scheme_id"]
            isOneToOne: false
            referencedRelation: "schemes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "maintenance_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_work_order_quote_id_fkey"
            columns: ["work_order_quote_id"]
            isOneToOne: false
            referencedRelation: "work_order_quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_transaction_history: {
        Row: {
          action: string
          actor_label: string | null
          actor_user_id: string | null
          changes: Json
          created_at: string
          id: string
          reason: string | null
          scheme_id: string
          transaction_id: string
        }
        Insert: {
          action: string
          actor_label?: string | null
          actor_user_id?: string | null
          changes?: Json
          created_at?: string
          id?: string
          reason?: string | null
          scheme_id: string
          transaction_id: string
        }
        Update: {
          action?: string
          actor_label?: string | null
          actor_user_id?: string | null
          changes?: Json
          created_at?: string
          id?: string
          reason?: string | null
          scheme_id?: string
          transaction_id?: string
        }
        Relationships: []
      }
      finance_transactions: {
        Row: {
          amount: number
          budget_line_item_id: string | null
          category: string | null
          change_reason: string | null
          created_at: string
          created_by: string | null
          description: string
          direction: string
          fund_id: string
          id: string
          insurance_claim_id: string | null
          levy_id: string | null
          notes: string | null
          occurred_on: string
          recurring_id: string | null
          scheme_id: string
          status: string
          supplier: string | null
          updated_at: string
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
          work_order_id: string | null
        }
        Insert: {
          amount?: number
          budget_line_item_id?: string | null
          category?: string | null
          change_reason?: string | null
          created_at?: string
          created_by?: string | null
          description: string
          direction?: string
          fund_id: string
          id?: string
          insurance_claim_id?: string | null
          levy_id?: string | null
          notes?: string | null
          occurred_on?: string
          recurring_id?: string | null
          scheme_id: string
          status?: string
          supplier?: string | null
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
          work_order_id?: string | null
        }
        Update: {
          amount?: number
          budget_line_item_id?: string | null
          category?: string | null
          change_reason?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          direction?: string
          fund_id?: string
          id?: string
          insurance_claim_id?: string | null
          levy_id?: string | null
          notes?: string | null
          occurred_on?: string
          recurring_id?: string | null
          scheme_id?: string
          status?: string
          supplier?: string | null
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
          work_order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "finance_transactions_budget_line_item_id_fkey"
            columns: ["budget_line_item_id"]
            isOneToOne: false
            referencedRelation: "budget_line_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_transactions_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "budget_funds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_transactions_insurance_claim_id_fkey"
            columns: ["insurance_claim_id"]
            isOneToOne: false
            referencedRelation: "insurance_claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_transactions_levy_id_fkey"
            columns: ["levy_id"]
            isOneToOne: false
            referencedRelation: "levies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_transactions_recurring_id_fkey"
            columns: ["recurring_id"]
            isOneToOne: false
            referencedRelation: "recurring_transactions"
            referencedColumns: ["id"]
          },
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
      financial_years: {
        Row: {
          created_at: string
          id: string
          scheme_id: string
          start_year: number
        }
        Insert: {
          created_at?: string
          id?: string
          scheme_id: string
          start_year: number
        }
        Update: {
          created_at?: string
          id?: string
          scheme_id?: string
          start_year?: number
        }
        Relationships: [
          {
            foreignKeyName: "financial_years_scheme_id_fkey"
            columns: ["scheme_id"]
            isOneToOne: false
            referencedRelation: "schemes"
            referencedColumns: ["id"]
          },
        ]
      }
      insurance_claim_updates: {
        Row: {
          author_label: string | null
          claim_id: string
          created_at: string
          id: string
          note: string
          status_at_time: string | null
        }
        Insert: {
          author_label?: string | null
          claim_id: string
          created_at?: string
          id?: string
          note: string
          status_at_time?: string | null
        }
        Update: {
          author_label?: string | null
          claim_id?: string
          created_at?: string
          id?: string
          note?: string
          status_at_time?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "insurance_claim_updates_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "insurance_claims"
            referencedColumns: ["id"]
          },
        ]
      }
      insurance_claims: {
        Row: {
          approved_amount: number | null
          claim_amount: number | null
          claim_number: string | null
          created_at: string
          decision_date: string | null
          decision_notes: string | null
          description: string | null
          excess: number | null
          finance_transaction_id: string | null
          id: string
          incident_date: string | null
          insurer_contact_email: string | null
          insurer_contact_name: string | null
          insurer_contact_phone: string | null
          lodged_date: string | null
          payout_received_at: string | null
          policy_id: string | null
          responsible_lot_id: string | null
          responsible_name: string | null
          scheme_id: string
          status: string
          title: string
          updated_at: string
          work_order_id: string | null
        }
        Insert: {
          approved_amount?: number | null
          claim_amount?: number | null
          claim_number?: string | null
          created_at?: string
          decision_date?: string | null
          decision_notes?: string | null
          description?: string | null
          excess?: number | null
          finance_transaction_id?: string | null
          id?: string
          incident_date?: string | null
          insurer_contact_email?: string | null
          insurer_contact_name?: string | null
          insurer_contact_phone?: string | null
          lodged_date?: string | null
          payout_received_at?: string | null
          policy_id?: string | null
          responsible_lot_id?: string | null
          responsible_name?: string | null
          scheme_id: string
          status?: string
          title: string
          updated_at?: string
          work_order_id?: string | null
        }
        Update: {
          approved_amount?: number | null
          claim_amount?: number | null
          claim_number?: string | null
          created_at?: string
          decision_date?: string | null
          decision_notes?: string | null
          description?: string | null
          excess?: number | null
          finance_transaction_id?: string | null
          id?: string
          incident_date?: string | null
          insurer_contact_email?: string | null
          insurer_contact_name?: string | null
          insurer_contact_phone?: string | null
          lodged_date?: string | null
          payout_received_at?: string | null
          policy_id?: string | null
          responsible_lot_id?: string | null
          responsible_name?: string | null
          scheme_id?: string
          status?: string
          title?: string
          updated_at?: string
          work_order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "insurance_claims_finance_transaction_id_fkey"
            columns: ["finance_transaction_id"]
            isOneToOne: false
            referencedRelation: "finance_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "insurance_claims_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "insurance_policies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "insurance_claims_responsible_lot_id_fkey"
            columns: ["responsible_lot_id"]
            isOneToOne: false
            referencedRelation: "lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "insurance_claims_scheme_id_fkey"
            columns: ["scheme_id"]
            isOneToOne: false
            referencedRelation: "schemes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "insurance_claims_work_order_id_fkey"
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
          fund_id: string | null
          id: string
          label: string | null
          lot_id: string
          notified_amount: number | null
          notified_at: string | null
          paid_at: string | null
          status: Database["public"]["Enums"]["levy_status"]
        }
        Insert: {
          amount?: number
          budget_id: string
          created_at?: string
          due_date: string
          fund_id?: string | null
          id?: string
          label?: string | null
          lot_id: string
          notified_amount?: number | null
          notified_at?: string | null
          paid_at?: string | null
          status?: Database["public"]["Enums"]["levy_status"]
        }
        Update: {
          amount?: number
          budget_id?: string
          created_at?: string
          due_date?: string
          fund_id?: string | null
          id?: string
          label?: string | null
          lot_id?: string
          notified_amount?: number | null
          notified_at?: string | null
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
            foreignKeyName: "levies_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "budget_funds"
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
      levy_payment_reversals: {
        Row: {
          actor_label: string | null
          actor_user_id: string | null
          created_at: string
          id: string
          levy_id: string
          previous_paid_at: string | null
          reason: string
        }
        Insert: {
          actor_label?: string | null
          actor_user_id?: string | null
          created_at?: string
          id?: string
          levy_id: string
          previous_paid_at?: string | null
          reason: string
        }
        Update: {
          actor_label?: string | null
          actor_user_id?: string | null
          created_at?: string
          id?: string
          levy_id?: string
          previous_paid_at?: string | null
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "levy_payment_reversals_levy_id_fkey"
            columns: ["levy_id"]
            isOneToOne: false
            referencedRelation: "levies"
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
          owner_phone: string | null
          owner_user_id: string | null
          scheme_id: string
          street_address: string | null
        }
        Insert: {
          created_at?: string
          entitlement_percent?: number
          id?: string
          lot_number: number
          occupied_status?: string
          owner_email?: string | null
          owner_name?: string | null
          owner_phone?: string | null
          owner_user_id?: string | null
          scheme_id: string
          street_address?: string | null
        }
        Update: {
          created_at?: string
          entitlement_percent?: number
          id?: string
          lot_number?: number
          occupied_status?: string
          owner_email?: string | null
          owner_name?: string | null
          owner_phone?: string | null
          owner_user_id?: string | null
          scheme_id?: string
          street_address?: string | null
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
          lot_ids: string[]
          outcome: string | null
          priority: string
          scheme_id: string
          scope_of_works: string | null
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
          lot_ids?: string[]
          outcome?: string | null
          priority?: string
          scheme_id: string
          scope_of_works?: string | null
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
          lot_ids?: string[]
          outcome?: string | null
          priority?: string
          scheme_id?: string
          scope_of_works?: string | null
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
      notice_comments: {
        Row: {
          author_name: string | null
          created_at: string
          id: string
          message: string
          notice_id: string
          scheme_id: string
        }
        Insert: {
          author_name?: string | null
          created_at?: string
          id?: string
          message: string
          notice_id: string
          scheme_id: string
        }
        Update: {
          author_name?: string | null
          created_at?: string
          id?: string
          message?: string
          notice_id?: string
          scheme_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notice_comments_notice_id_fkey"
            columns: ["notice_id"]
            isOneToOne: false
            referencedRelation: "notices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notice_comments_scheme_id_fkey"
            columns: ["scheme_id"]
            isOneToOne: false
            referencedRelation: "schemes"
            referencedColumns: ["id"]
          },
        ]
      }
      notices: {
        Row: {
          created_at: string
          id: string
          levy_id: string | null
          lot_id: string | null
          message: string
          pinned: boolean
          scheme_id: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          levy_id?: string | null
          lot_id?: string | null
          message: string
          pinned?: boolean
          scheme_id: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          levy_id?: string | null
          lot_id?: string | null
          message?: string
          pinned?: boolean
          scheme_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notices_levy_id_fkey"
            columns: ["levy_id"]
            isOneToOne: false
            referencedRelation: "levies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notices_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notices_scheme_id_fkey"
            columns: ["scheme_id"]
            isOneToOne: false
            referencedRelation: "schemes"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_reads: {
        Row: {
          last_read_at: string
          user_id: string
        }
        Insert: {
          last_read_at?: string
          user_id: string
        }
        Update: {
          last_read_at?: string
          user_id?: string
        }
        Relationships: []
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
      recurring_transactions: {
        Row: {
          active: boolean
          amount: number
          budget_line_item_id: string | null
          category: string | null
          created_at: string
          created_by: string | null
          description: string
          direction: string
          end_date: string | null
          frequency: string
          fund_id: string
          id: string
          next_date: string
          scheme_id: string
          supplier: string | null
        }
        Insert: {
          active?: boolean
          amount: number
          budget_line_item_id?: string | null
          category?: string | null
          created_at?: string
          created_by?: string | null
          description: string
          direction: string
          end_date?: string | null
          frequency: string
          fund_id: string
          id?: string
          next_date: string
          scheme_id: string
          supplier?: string | null
        }
        Update: {
          active?: boolean
          amount?: number
          budget_line_item_id?: string | null
          category?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          direction?: string
          end_date?: string | null
          frequency?: string
          fund_id?: string
          id?: string
          next_date?: string
          scheme_id?: string
          supplier?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recurring_transactions_budget_line_item_id_fkey"
            columns: ["budget_line_item_id"]
            isOneToOne: false
            referencedRelation: "budget_line_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_transactions_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "budget_funds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_transactions_scheme_id_fkey"
            columns: ["scheme_id"]
            isOneToOne: false
            referencedRelation: "schemes"
            referencedColumns: ["id"]
          },
        ]
      }
      scheme_settings: {
        Row: {
          created_at: string
          currency_code: string
          date_format: string
          id: string
          notify_levy_due: boolean
          notify_new_document: boolean
          notify_new_work_order: boolean
          pay_account_name: string | null
          pay_account_number: string | null
          pay_bsb: string | null
          pay_other: string | null
          pay_reference: string
          scheme_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency_code?: string
          date_format?: string
          id?: string
          notify_levy_due?: boolean
          notify_new_document?: boolean
          notify_new_work_order?: boolean
          pay_account_name?: string | null
          pay_account_number?: string | null
          pay_bsb?: string | null
          pay_other?: string | null
          pay_reference?: string
          scheme_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency_code?: string
          date_format?: string
          id?: string
          notify_levy_due?: boolean
          notify_new_document?: boolean
          notify_new_work_order?: boolean
          pay_account_name?: string | null
          pay_account_number?: string | null
          pay_bsb?: string | null
          pay_other?: string | null
          pay_reference?: string
          scheme_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheme_settings_scheme_id_fkey"
            columns: ["scheme_id"]
            isOneToOne: true
            referencedRelation: "schemes"
            referencedColumns: ["id"]
          },
        ]
      }
      scheme_invites: {
        Row: { created_at: string; created_by: string | null; expires_at: string; id: string; lot_id: string | null; role: string; scheme_id: string; token: string; used_at: string | null; used_by: string | null }
        Insert: { created_at?: string; created_by?: string | null; expires_at?: string; id?: string; lot_id?: string | null; role: string; scheme_id: string; token: string; used_at?: string | null; used_by?: string | null }
        Update: { created_at?: string; created_by?: string | null; expires_at?: string; id?: string; lot_id?: string | null; role?: string; scheme_id?: string; token?: string; used_at?: string | null; used_by?: string | null }
        Relationships: []
      }
      scheme_members: {
        Row: { created_at: string; id: string; lot_id: string | null; role: string; scheme_id: string; user_id: string }
        Insert: { created_at?: string; id?: string; lot_id?: string | null; role: string; scheme_id: string; user_id: string }
        Update: { created_at?: string; id?: string; lot_id?: string | null; role?: string; scheme_id?: string; user_id?: string }
        Relationships: [
          { foreignKeyName: "scheme_members_scheme_id_fkey"; columns: ["scheme_id"]; isOneToOne: false; referencedRelation: "schemes"; referencedColumns: ["id"] },
        ]
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
      user_preferences: {
        Row: {
          notify_fund_overdrawn: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          notify_fund_overdrawn?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          notify_fund_overdrawn?: boolean
          updated_at?: string
          user_id?: string
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
      work_order_quotes: {
        Row: {
          amount: number
          contractor_id: string | null
          created_at: string
          finance_transaction_id: string | null
          id: string
          notes: string | null
          paid_at: string | null
          status: string
          work_order_id: string
        }
        Insert: {
          amount?: number
          contractor_id?: string | null
          created_at?: string
          finance_transaction_id?: string | null
          id?: string
          notes?: string | null
          paid_at?: string | null
          status?: string
          work_order_id: string
        }
        Update: {
          amount?: number
          contractor_id?: string | null
          created_at?: string
          finance_transaction_id?: string | null
          id?: string
          notes?: string | null
          paid_at?: string | null
          status?: string
          work_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_order_quotes_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "contractors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_order_quotes_finance_transaction_id_fkey"
            columns: ["finance_transaction_id"]
            isOneToOne: false
            referencedRelation: "finance_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_order_quotes_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "maintenance_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      work_order_steps: {
        Row: {
          created_at: string
          done_at: string | null
          id: string
          label: string
          position: number
          step_type: string
          work_order_id: string
        }
        Insert: {
          created_at?: string
          done_at?: string | null
          id?: string
          label: string
          position: number
          step_type?: string
          work_order_id: string
        }
        Update: {
          created_at?: string
          done_at?: string | null
          id?: string
          label?: string
          position?: number
          step_type?: string
          work_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_order_steps_work_order_id_fkey"
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
      accept_invite: { Args: { _token: string }; Returns: string }
      building_finance_summary: { Args: { _scheme: string }; Returns: Json }
      committee_contacts: { Args: { _scheme: string }; Returns: { name: string | null; committee_role: string | null; email: string | null; phone: string | null }[] }
      create_building: { Args: { _name: string; _address: string; _total_lots: number }; Returns: string }
      create_invite: { Args: { _scheme: string; _role: string; _lot?: string | null }; Returns: string }
      can_manage_paid_finance: {
        Args: { _scheme: string; _user: string }
        Returns: boolean
      }
      finance_actor_label: { Args: { _user: string }; Returns: string }
      generate_recurring_transactions: {
        Args: { _scheme: string }
        Returns: number
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      owns_lot: { Args: { _lot_id: string }; Returns: boolean }
      recurring_step: { Args: { _d: string; _freq: string }; Returns: string }
      reverse_levy_payment: {
        Args: { _levy: string; _reason: string }
        Returns: undefined
      }
      scheme_has_treasurer: { Args: { _scheme: string }; Returns: boolean }
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
