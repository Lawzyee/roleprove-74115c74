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
    PostgrestVersion: "14.17"
  }
  public: {
    Tables: {
      attempt_deliverables: {
        Row: {
          attempt_id: string
          feedback: string | null
          file_name: string
          file_path: string
          file_type: string
          id: string
          status: string
          task_id: string | null
          uploaded_at: string
          user_id: string
        }
        Insert: {
          attempt_id: string
          feedback?: string | null
          file_name: string
          file_path: string
          file_type: string
          id?: string
          status?: string
          task_id?: string | null
          uploaded_at?: string
          user_id: string
        }
        Update: {
          attempt_id?: string
          feedback?: string | null
          file_name?: string
          file_path?: string
          file_type?: string
          id?: string
          status?: string
          task_id?: string | null
          uploaded_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attempt_deliverables_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "simulation_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attempt_deliverables_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "simulation_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      attempt_task_results: {
        Row: {
          attempt_id: string
          created_at: string
          criteria_breakdown: Json
          feedback: string | null
          id: string
          max_score: number
          pillar: string | null
          response: Json
          score: number | null
          task_id: string
        }
        Insert: {
          attempt_id: string
          created_at?: string
          criteria_breakdown?: Json
          feedback?: string | null
          id?: string
          max_score?: number
          pillar?: string | null
          response?: Json
          score?: number | null
          task_id: string
        }
        Update: {
          attempt_id?: string
          created_at?: string
          criteria_breakdown?: Json
          feedback?: string | null
          id?: string
          max_score?: number
          pillar?: string | null
          response?: Json
          score?: number | null
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attempt_task_results_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "simulation_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attempt_task_results_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "simulation_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      credentials: {
        Row: {
          created_at: string
          credential_type: string
          file_path: string | null
          id: string
          issuer: string
          status: string
          title: string
          user_id: string
          verification_url: string | null
          year: number | null
        }
        Insert: {
          created_at?: string
          credential_type?: string
          file_path?: string | null
          id?: string
          issuer: string
          status?: string
          title: string
          user_id: string
          verification_url?: string | null
          year?: number | null
        }
        Update: {
          created_at?: string
          credential_type?: string
          file_path?: string | null
          id?: string
          issuer?: string
          status?: string
          title?: string
          user_id?: string
          verification_url?: string | null
          year?: number | null
        }
        Relationships: []
      }
      interview_prep_questions: {
        Row: {
          category: string
          created_at: string
          id: string
          order_index: number
          question_text: string
          session_id: string
        }
        Insert: {
          category: string
          created_at?: string
          id?: string
          order_index?: number
          question_text: string
          session_id: string
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          order_index?: number
          question_text?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "interview_prep_questions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "interview_prep_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      interview_prep_responses: {
        Row: {
          created_at: string
          feedback_text: string | null
          id: string
          question_id: string
          response_text: string
          rubric_scores: Json | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          feedback_text?: string | null
          id?: string
          question_id: string
          response_text?: string
          rubric_scores?: Json | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          feedback_text?: string | null
          id?: string
          question_id?: string
          response_text?: string
          rubric_scores?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "interview_prep_responses_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: true
            referencedRelation: "interview_prep_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      interview_prep_sessions: {
        Row: {
          created_at: string
          cv_extracted_text: string | null
          cv_file_path: string | null
          extracted_role_context: Json | null
          id: string
          source_jd_text: string
          source_url: string | null
          title: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          cv_extracted_text?: string | null
          cv_file_path?: string | null
          extracted_role_context?: Json | null
          id?: string
          source_jd_text: string
          source_url?: string | null
          title?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          cv_extracted_text?: string | null
          cv_file_path?: string | null
          extracted_role_context?: Json | null
          id?: string
          source_jd_text?: string
          source_url?: string | null
          title?: string | null
          user_id?: string
        }
        Relationships: []
      }
      job_postings: {
        Row: {
          company_context: string | null
          created_at: string
          extracted_responsibilities: Json
          extracted_role_type: string | null
          extracted_seniority: string | null
          extracted_skills: Json
          id: string
          matched: boolean
          raw_text: string
          source_url: string | null
          user_id: string
        }
        Insert: {
          company_context?: string | null
          created_at?: string
          extracted_responsibilities?: Json
          extracted_role_type?: string | null
          extracted_seniority?: string | null
          extracted_skills?: Json
          id?: string
          matched?: boolean
          raw_text: string
          source_url?: string | null
          user_id: string
        }
        Update: {
          company_context?: string | null
          created_at?: string
          extracted_responsibilities?: Json
          extracted_role_type?: string | null
          extracted_seniority?: string | null
          extracted_skills?: Json
          id?: string
          matched?: boolean
          raw_text?: string
          source_url?: string | null
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          email_notifications: boolean
          github_url: string | null
          headline: string | null
          id: string
          linkedin_url: string | null
          location: string | null
          name: string | null
          portfolio_url: string | null
          profile_visible: boolean
          target_role: string | null
          target_role_id: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          email_notifications?: boolean
          github_url?: string | null
          headline?: string | null
          id: string
          linkedin_url?: string | null
          location?: string | null
          name?: string | null
          portfolio_url?: string | null
          profile_visible?: boolean
          target_role?: string | null
          target_role_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          email_notifications?: boolean
          github_url?: string | null
          headline?: string | null
          id?: string
          linkedin_url?: string | null
          location?: string | null
          name?: string | null
          portfolio_url?: string | null
          profile_visible?: boolean
          target_role?: string | null
          target_role_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_target_role_id_fkey"
            columns: ["target_role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          category: string
          created_at: string
          description: string
          id: string
          name: string
        }
        Insert: {
          category: string
          created_at?: string
          description: string
          id?: string
          name: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      simulation_attempts: {
        Row: {
          completed_at: string | null
          id: string
          job_posting_id: string | null
          overall_score: number | null
          pillar_scores: Json
          simulation_id: string
          simulation_type: string
          started_at: string
          status: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          id?: string
          job_posting_id?: string | null
          overall_score?: number | null
          pillar_scores?: Json
          simulation_id: string
          simulation_type?: string
          started_at?: string
          status?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          id?: string
          job_posting_id?: string | null
          overall_score?: number | null
          pillar_scores?: Json
          simulation_id?: string
          simulation_type?: string
          started_at?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "simulation_attempts_job_posting_id_fkey"
            columns: ["job_posting_id"]
            isOneToOne: false
            referencedRelation: "job_postings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "simulation_attempts_simulation_id_fkey"
            columns: ["simulation_id"]
            isOneToOne: false
            referencedRelation: "simulations"
            referencedColumns: ["id"]
          },
        ]
      }
      simulation_tasks: {
        Row: {
          brief: string
          id: string
          order: number
          rubric_criteria: Json
          simulation_id: string
          task_type: string
          title: string
        }
        Insert: {
          brief: string
          id?: string
          order: number
          rubric_criteria?: Json
          simulation_id: string
          task_type: string
          title: string
        }
        Update: {
          brief?: string
          id?: string
          order?: number
          rubric_criteria?: Json
          simulation_id?: string
          task_type?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "simulation_tasks_simulation_id_fkey"
            columns: ["simulation_id"]
            isOneToOne: false
            referencedRelation: "simulations"
            referencedColumns: ["id"]
          },
        ]
      }
      simulations: {
        Row: {
          created_at: string
          description: string
          estimated_minutes: number
          id: string
          is_personalized: boolean
          owner_user_id: string | null
          role_id: string
          source_simulation_id: string | null
          title: string
        }
        Insert: {
          created_at?: string
          description: string
          estimated_minutes?: number
          id?: string
          is_personalized?: boolean
          owner_user_id?: string | null
          role_id: string
          source_simulation_id?: string | null
          title: string
        }
        Update: {
          created_at?: string
          description?: string
          estimated_minutes?: number
          id?: string
          is_personalized?: boolean
          owner_user_id?: string | null
          role_id?: string
          source_simulation_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "simulations_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "simulations_source_simulation_id_fkey"
            columns: ["source_simulation_id"]
            isOneToOne: false
            referencedRelation: "simulations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
