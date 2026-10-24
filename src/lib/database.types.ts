// Generado desde las migraciones: node scripts/generate-db-types.mjs
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];
export type Database = {
  public: {
    Tables: {
      accounts: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          type: "cash" | "debit" | "credit" | "savings";
          initial_balance_cents: number;
          is_active: boolean;
          created_at: string;
          in_emergency_fund: boolean;
        };
        Insert: {
          id?: string;
          user_id?: string;
          name: string;
          type: "cash" | "debit" | "credit" | "savings";
          initial_balance_cents?: number;
          is_active?: boolean;
          created_at?: string;
          in_emergency_fund?: boolean;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          type?: "cash" | "debit" | "credit" | "savings";
          initial_balance_cents?: number;
          is_active?: boolean;
          created_at?: string;
          in_emergency_fund?: boolean;
        };
        Relationships: [];
      };
      budget_allocations: {
        Row: {
          id: string;
          user_id: string;
          plan_id: string;
          category_id: string;
          percentage_bps: number;
        };
        Insert: {
          id?: string;
          user_id?: string;
          plan_id: string;
          category_id: string;
          percentage_bps: number;
        };
        Update: {
          id?: string;
          user_id?: string;
          plan_id?: string;
          category_id?: string;
          percentage_bps?: number;
        };
        Relationships: [];
      };
      budget_plans: {
        Row: {
          id: string;
          user_id: string;
          month: string;
          total_cents: number;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string;
          month: string;
          total_cents: number;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          month?: string;
          total_cents?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      budgets: {
        Row: {
          id: string;
          user_id: string;
          category_id: string;
          month: string;
          amount_cents: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string;
          category_id: string;
          month: string;
          amount_cents: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          category_id?: string;
          month?: string;
          amount_cents?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      categories: {
        Row: {
          id: string;
          user_id: string;
          parent_id: string | null;
          name: string;
          kind: "expense" | "income" | "investment";
          color: string | null;
          icon: string | null;
          is_active: boolean;
          created_at: string;
          seed_key: string | null;
        };
        Insert: {
          id?: string;
          user_id?: string;
          parent_id?: string | null;
          name: string;
          kind: "expense" | "income" | "investment";
          color?: string | null;
          icon?: string | null;
          is_active?: boolean;
          created_at?: string;
          seed_key?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          parent_id?: string | null;
          name?: string;
          kind?: "expense" | "income" | "investment";
          color?: string | null;
          icon?: string | null;
          is_active?: boolean;
          created_at?: string;
          seed_key?: string | null;
        };
        Relationships: [];
      };
      financial_targets: {
        Row: {
          id: string;
          user_id: string;
          effective_month: string;
          savings_rate_bps: number;
          monthly_investment_cents: number;
          emergency_months: number;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string;
          effective_month: string;
          savings_rate_bps?: number;
          monthly_investment_cents?: number;
          emergency_months?: number;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          effective_month?: string;
          savings_rate_bps?: number;
          monthly_investment_cents?: number;
          emergency_months?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      goal_contributions: {
        Row: {
          id: string;
          user_id: string;
          goal_id: string;
          amount_cents: number;
          occurred_on: string;
          note: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string;
          goal_id: string;
          amount_cents: number;
          occurred_on?: string;
          note?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          goal_id?: string;
          amount_cents?: number;
          occurred_on?: string;
          note?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      investment_valuations: {
        Row: {
          id: string;
          user_id: string;
          investment_id: string;
          valued_on: string;
          value_cents: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string;
          investment_id: string;
          valued_on?: string;
          value_cents: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          investment_id?: string;
          valued_on?: string;
          value_cents?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      investments: {
        Row: {
          id: string;
          user_id: string;
          category_id: string;
          name: string;
          platform: string | null;
          is_active: boolean;
          created_at: string;
          initial_capital_cents: number | null;
          opened_on: string | null;
          request_id: string | null;
        };
        Insert: {
          id?: string;
          user_id?: string;
          category_id: string;
          name: string;
          platform?: string | null;
          is_active?: boolean;
          created_at?: string;
          initial_capital_cents?: number | null;
          opened_on?: string | null;
          request_id?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          category_id?: string;
          name?: string;
          platform?: string | null;
          is_active?: boolean;
          created_at?: string;
          initial_capital_cents?: number | null;
          opened_on?: string | null;
          request_id?: string | null;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          display_name: string | null;
          currency: string;
          timezone: string;
          default_account_id: string | null;
          created_at: string;
          theme: string;
        };
        Insert: {
          id: string;
          display_name?: string | null;
          currency?: string;
          timezone?: string;
          default_account_id?: string | null;
          created_at?: string;
          theme?: string;
        };
        Update: {
          id?: string;
          display_name?: string | null;
          currency?: string;
          timezone?: string;
          default_account_id?: string | null;
          created_at?: string;
          theme?: string;
        };
        Relationships: [];
      };
      recurring_rules: {
        Row: {
          id: string;
          user_id: string;
          type: "expense" | "income" | "transfer" | "invest" | "divest";
          amount_cents: number;
          description: string;
          account_id: string | null;
          to_account_id: string | null;
          category_id: string | null;
          investment_id: string | null;
          frequency: "weekly" | "monthly" | "yearly";
          start_on: string;
          end_on: string | null;
          next_run_on: string;
          is_active: boolean;
          created_at: string;
          occurrence_index: number;
          last_error: string | null;
        };
        Insert: {
          id?: string;
          user_id?: string;
          type: "expense" | "income" | "transfer" | "invest" | "divest";
          amount_cents: number;
          description: string;
          account_id?: string | null;
          to_account_id?: string | null;
          category_id?: string | null;
          investment_id?: string | null;
          frequency?: "weekly" | "monthly" | "yearly";
          start_on: string;
          end_on?: string | null;
          next_run_on: string;
          is_active?: boolean;
          created_at?: string;
          occurrence_index?: number;
          last_error?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          type?: "expense" | "income" | "transfer" | "invest" | "divest";
          amount_cents?: number;
          description?: string;
          account_id?: string | null;
          to_account_id?: string | null;
          category_id?: string | null;
          investment_id?: string | null;
          frequency?: "weekly" | "monthly" | "yearly";
          start_on?: string;
          end_on?: string | null;
          next_run_on?: string;
          is_active?: boolean;
          created_at?: string;
          occurrence_index?: number;
          last_error?: string | null;
        };
        Relationships: [];
      };
      savings_goals: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          target_cents: number;
          target_date: string | null;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string;
          name: string;
          target_cents: number;
          target_date?: string | null;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          target_cents?: number;
          target_date?: string | null;
          is_active?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      transactions: {
        Row: {
          id: string;
          user_id: string;
          type: "expense" | "income" | "transfer" | "invest" | "divest";
          amount_cents: number;
          occurred_on: string;
          description: string | null;
          notes: string | null;
          account_id: string;
          to_account_id: string | null;
          category_id: string | null;
          investment_id: string | null;
          recurring_rule_id: string | null;
          created_at: string;
          updated_at: string;
          request_id: string | null;
        };
        Insert: {
          id?: string;
          user_id?: string;
          type: "expense" | "income" | "transfer" | "invest" | "divest";
          amount_cents: number;
          occurred_on?: string;
          description?: string | null;
          notes?: string | null;
          account_id?: string | null;
          to_account_id?: string | null;
          category_id?: string | null;
          investment_id?: string | null;
          recurring_rule_id?: string | null;
          created_at?: string;
          updated_at?: string;
          request_id?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          type?: "expense" | "income" | "transfer" | "invest" | "divest";
          amount_cents?: number;
          occurred_on?: string;
          description?: string | null;
          notes?: string | null;
          account_id?: string | null;
          to_account_id?: string | null;
          category_id?: string | null;
          investment_id?: string | null;
          recurring_rule_id?: string | null;
          created_at?: string;
          updated_at?: string;
          request_id?: string | null;
        };
        Relationships: [];
      };
    };
    Views: {
      account_balances: {
        Row: {
          account_id: string | null;
          user_id: string | null;
          name: string | null;
          type: "cash" | "debit" | "credit" | "savings" | null;
          is_active: boolean | null;
          balance_cents: number | null;
        };
        Relationships: [];
      };
      budget_plan_progress: {
        Row: {
          id: string | null;
          user_id: string | null;
          plan_id: string | null;
          month: string | null;
          total_cents: number | null;
          category_id: string | null;
          category_name: string | null;
          category_kind: "expense" | "income" | "investment" | null;
          category_color: string | null;
          category_is_active: boolean | null;
          percentage_bps: number | null;
          budget_cents: number | null;
          spent_cents: number | null;
        };
        Relationships: [];
      };
      budget_progress: {
        Row: {
          budget_id: string | null;
          user_id: string | null;
          month: string | null;
          category_id: string | null;
          category_name: string | null;
          category_kind: "expense" | "income" | "investment" | null;
          budget_cents: number | null;
          spent_cents: number | null;
          used_pct: number | null;
        };
        Relationships: [];
      };
      categorized_movements: {
        Row: {
          id: string | null;
          user_id: string | null;
          type: "expense" | "income" | "transfer" | "invest" | "divest" | null;
          amount_cents: number | null;
          occurred_on: string | null;
          month: string | null;
          description: string | null;
          account_id: string | null;
          investment_id: string | null;
          category_id: string | null;
          category_name: string | null;
          category_kind: "expense" | "income" | "investment" | null;
          category_color: string | null;
          category_is_active: boolean | null;
        };
        Relationships: [];
      };
      goal_progress: {
        Row: {
          goal_id: string | null;
          user_id: string | null;
          name: string | null;
          target_cents: number | null;
          target_date: string | null;
          is_active: boolean | null;
          saved_cents: number | null;
          progress_pct: number | null;
        };
        Relationships: [];
      };
      monthly_summary: {
        Row: {
          user_id: string | null;
          month: string | null;
          income_cents: number | null;
          expense_cents: number | null;
          invested_cents: number | null;
          divested_cents: number | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      save_budget_plan: {
        Args: { p_month: string; p_total: number; p_allocations: Json };
        Returns: string;
      };
      save_investment_entry: {
        Args: {
          p_operation: string;
          p_amount: number;
          p_request: string;
          p_investment?: string | null;
          p_category?: string | null;
          p_name?: string | null;
          p_platform?: string | null;
          p_account?: string | null;
          p_date?: string | null;
          p_description?: string | null;
          p_entry?: string | null;
          p_initial_capital?: number | null;
        };
        Returns: string;
      };
      generate_recurring_transactions: {
        Args: { p_until?: string; p_user?: string };
        Returns: number;
      };
      suggest_descriptions: {
        Args: {
          p_query: string;
          p_limit?: number;
          p_type?: Database["public"]["Enums"]["transaction_type"];
        };
        Returns: {
          description: string;
          type: Database["public"]["Enums"]["transaction_type"];
          category_id: string | null;
          account_id: string | null;
          amount_cents: number;
          uses: number;
        }[];
      };
    };
    Enums: {
      account_type: "cash" | "debit" | "credit" | "savings";
      category_kind: "expense" | "income" | "investment";
      recurrence_frequency: "weekly" | "monthly" | "yearly";
      transaction_type: "expense" | "income" | "transfer" | "invest" | "divest";
    };
    CompositeTypes: Record<never, never>;
  };
};
