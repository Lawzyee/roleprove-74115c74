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
  public: {
    Tables: {
      app_settings: {
        Row: {
          daily_generation_cap: number
          daily_grading_cap: number
          daily_interview_turns: number
          daily_interviews: number
          free_interview_prep: number
          free_regrades: number
          free_simulations: number
          id: boolean
          interview_answer_chars: number
          launch_free_until: string | null
          max_interview_turns: number
          max_upload_mb: number
          paywall_enforced: boolean
          paywall_enforced_since: string | null
          recruiter_visibility_enabled: boolean
          report_open_retention_days: number
          report_resolved_retention_days: number
          trial_days: number
        }
        Insert: {
          daily_generation_cap?: number
          daily_grading_cap?: number
          daily_interview_turns?: number
          daily_interviews?: number
          free_interview_prep?: number
          free_regrades?: number
          free_simulations?: number
          id?: boolean
          interview_answer_chars?: number
          launch_free_until?: string | null
          max_interview_turns?: number
          max_upload_mb?: number
          paywall_enforced?: boolean
          paywall_enforced_since?: string | null
          recruiter_visibility_enabled?: boolean
          report_open_retention_days?: number
          report_resolved_retention_days?: number
          trial_days?: number
        }
        Update: {
          daily_generation_cap?: number
          daily_grading_cap?: number
          daily_interview_turns?: number
          daily_interviews?: number
          free_interview_prep?: number
          free_regrades?: number
          free_simulations?: number
          id?: boolean
          interview_answer_chars?: number
          launch_free_until?: string | null
          max_interview_turns?: number
          max_upload_mb?: number
          paywall_enforced?: boolean
          paywall_enforced_since?: string | null
          recruiter_visibility_enabled?: boolean
          report_open_retention_days?: number
          report_resolved_retention_days?: number
          trial_days?: number
        }
        Relationships: []
      }
      attempt_deliverables: {
        Row: {
          attempt_id: string
          criteria: Json
          extracted_text: string | null
          extraction_preview: Json | null
          failure_reason: string | null
          feedback: string | null
          file_name: string
          file_path: string
          file_size: number | null
          file_type: string
          graded_at: string | null
          grading_started_at: string | null
          grading_status: string
          id: string
          status: string
          task_id: string | null
          uploaded_at: string
          user_id: string
        }
        Insert: {
          attempt_id: string
          criteria?: Json
          extracted_text?: string | null
          extraction_preview?: Json | null
          failure_reason?: string | null
          feedback?: string | null
          file_name: string
          file_path: string
          file_size?: number | null
          file_type: string
          graded_at?: string | null
          grading_started_at?: string | null
          grading_status?: string
          id?: string
          status?: string
          task_id?: string | null
          uploaded_at?: string
          user_id: string
        }
        Update: {
          attempt_id?: string
          criteria?: Json
          extracted_text?: string | null
          extraction_preview?: Json | null
          failure_reason?: string | null
          feedback?: string | null
          file_name?: string
          file_path?: string
          file_size?: number | null
          file_type?: string
          graded_at?: string | null
          grading_started_at?: string | null
          grading_status?: string
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
      billing_trial_history: {
        Row: {
          email_hash: string
          first_signup_at: string
          trial_ends_at: string | null
        }
        Insert: {
          email_hash: string
          first_signup_at: string
          trial_ends_at?: string | null
        }
        Update: {
          email_hash?: string
          first_signup_at?: string
          trial_ends_at?: string | null
        }
        Relationships: []
      }
      billing_usage: {
        Row: {
          environment: string
          expires_at: string
          id: string
          kind: string
          resource_id: string | null
          started_at: string
          status: string
          user_id: string
        }
        Insert: {
          environment: string
          expires_at?: string
          id?: string
          kind: string
          resource_id?: string | null
          started_at?: string
          status?: string
          user_id: string
        }
        Update: {
          environment?: string
          expires_at?: string
          id?: string
          kind?: string
          resource_id?: string | null
          started_at?: string
          status?: string
          user_id?: string
        }
        Relationships: []
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
      data_exports: {
        Row: {
          created_at: string
          downloaded_at: string | null
          expires_at: string
          failed_section: string | null
          file_path: string | null
          id: string
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          downloaded_at?: string | null
          expires_at?: string
          failed_section?: string | null
          file_path?: string | null
          id?: string
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          downloaded_at?: string | null
          expires_at?: string
          failed_section?: string | null
          file_path?: string | null
          id?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      deliverable_flags: {
        Row: {
          attempt_id: string
          created_at: string
          deliverable_id: string
          excerpt: string | null
          id: string
          reason: string
          user_id: string
        }
        Insert: {
          attempt_id: string
          created_at?: string
          deliverable_id: string
          excerpt?: string | null
          id?: string
          reason: string
          user_id: string
        }
        Update: {
          attempt_id?: string
          created_at?: string
          deliverable_id?: string
          excerpt?: string | null
          id?: string
          reason?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deliverable_flags_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "simulation_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliverable_flags_deliverable_id_fkey"
            columns: ["deliverable_id"]
            isOneToOne: false
            referencedRelation: "attempt_deliverables"
            referencedColumns: ["id"]
          },
        ]
      }
      deliverable_gradings: {
        Row: {
          attempt_id: string
          created_at: string
          id: string
          task_id: string | null
          user_id: string
        }
        Insert: {
          attempt_id: string
          created_at?: string
          id?: string
          task_id?: string | null
          user_id: string
        }
        Update: {
          attempt_id?: string
          created_at?: string
          id?: string
          task_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deliverable_gradings_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "simulation_attempts"
            referencedColumns: ["id"]
          },
        ]
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
      job_center_jobs: {
        Row: {
          apply_url: string
          arrangement: string
          city: string
          company: string
          company_website: string | null
          country: string
          created_at: string
          deleted_at: string | null
          employment: string
          expires_date: string
          id: string
          other_role: string
          posted_date: string
          role_key: string
          salary_currency: string | null
          salary_max: number | null
          salary_min: number | null
          salary_period: string | null
          seniority: string
          status: string
          summary: string
          title: string
          updated_at: string
        }
        Insert: {
          apply_url: string
          arrangement: string
          city?: string
          company: string
          company_website?: string | null
          country?: string
          created_at?: string
          deleted_at?: string | null
          employment: string
          expires_date?: string
          id?: string
          other_role?: string
          posted_date?: string
          role_key: string
          salary_currency?: string | null
          salary_max?: number | null
          salary_min?: number | null
          salary_period?: string | null
          seniority: string
          status?: string
          summary: string
          title: string
          updated_at?: string
        }
        Update: {
          apply_url?: string
          arrangement?: string
          city?: string
          company?: string
          company_website?: string | null
          country?: string
          created_at?: string
          deleted_at?: string | null
          employment?: string
          expires_date?: string
          id?: string
          other_role?: string
          posted_date?: string
          role_key?: string
          salary_currency?: string | null
          salary_max?: number | null
          salary_min?: number | null
          salary_period?: string | null
          seniority?: string
          status?: string
          summary?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      job_center_private: {
        Row: {
          apply_clicks: number
          check_started_at: string | null
          consecutive_failures: number
          job_id: string
          last_checked_at: string | null
          link_broken: boolean
          practice_text: string
          source_note: string
          staff_notes: string
        }
        Insert: {
          apply_clicks?: number
          check_started_at?: string | null
          consecutive_failures?: number
          job_id: string
          last_checked_at?: string | null
          link_broken?: boolean
          practice_text?: string
          source_note?: string
          staff_notes?: string
        }
        Update: {
          apply_clicks?: number
          check_started_at?: string | null
          consecutive_failures?: number
          job_id?: string
          last_checked_at?: string | null
          link_broken?: boolean
          practice_text?: string
          source_note?: string
          staff_notes?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_center_private_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: true
            referencedRelation: "job_center_jobs"
            referencedColumns: ["id"]
          },
        ]
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
      job_preferences: {
        Row: {
          arrangements: string[]
          countries: string[]
          employment_types: string[]
          roles: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          arrangements?: string[]
          countries?: string[]
          employment_types?: string[]
          roles?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          arrangements?: string[]
          countries?: string[]
          employment_types?: string[]
          roles?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      job_tracker: {
        Row: {
          created_at: string
          id: string
          job_id: string
          notes: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          job_id: string
          notes?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          job_id?: string
          notes?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_tracker_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "job_center_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      legal_acceptances: {
        Row: {
          accepted_at: string
          id: string
          privacy_version: string
          source: string
          terms_version: string
          user_id: string
        }
        Insert: {
          accepted_at?: string
          id?: string
          privacy_version: string
          source?: string
          terms_version: string
          user_id: string
        }
        Update: {
          accepted_at?: string
          id?: string
          privacy_version?: string
          source?: string
          terms_version?: string
          user_id?: string
        }
        Relationships: []
      }
      live_interview_flags: {
        Row: {
          created_at: string
          excerpt: string | null
          id: string
          interview_id: string
          reason: string
          user_id: string
        }
        Insert: {
          created_at?: string
          excerpt?: string | null
          id?: string
          interview_id: string
          reason: string
          user_id: string
        }
        Update: {
          created_at?: string
          excerpt?: string | null
          id?: string
          interview_id?: string
          reason?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_interview_flags_interview_id_fkey"
            columns: ["interview_id"]
            isOneToOne: false
            referencedRelation: "live_interviews"
            referencedColumns: ["id"]
          },
        ]
      }
      live_interview_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          interview_id: string
          msg_type: string
          pillar: string | null
          question_index: number | null
          role: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          interview_id: string
          msg_type: string
          pillar?: string | null
          question_index?: number | null
          role: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          interview_id?: string
          msg_type?: string
          pillar?: string | null
          question_index?: number | null
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_interview_messages_interview_id_fkey"
            columns: ["interview_id"]
            isOneToOne: false
            referencedRelation: "live_interviews"
            referencedColumns: ["id"]
          },
        ]
      }
      live_interviews: {
        Row: {
          completed_at: string | null
          created_at: string
          current_index: number
          followups_used: number
          id: string
          length: string
          plan: Json
          prep_session_id: string | null
          role_key: string | null
          scorecard: Json | null
          status: string
          title: string | null
          turn_count: number
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          current_index?: number
          followups_used?: number
          id?: string
          length?: string
          plan?: Json
          prep_session_id?: string | null
          role_key?: string | null
          scorecard?: Json | null
          status?: string
          title?: string | null
          turn_count?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          current_index?: number
          followups_used?: number
          id?: string
          length?: string
          plan?: Json
          prep_session_id?: string | null
          role_key?: string | null
          scorecard?: Json | null
          status?: string
          title?: string | null
          turn_count?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_interviews_prep_session_id_fkey"
            columns: ["prep_session_id"]
            isOneToOne: false
            referencedRelation: "interview_prep_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      portfolio_projects: {
        Row: {
          attempt_id: string
          created_at: string
          id: string
          insight: string | null
          insight_generations: number
          stage_settings: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          attempt_id: string
          created_at?: string
          id?: string
          insight?: string | null
          insight_generations?: number
          stage_settings?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          attempt_id?: string
          created_at?: string
          id?: string
          insight?: string | null
          insight_generations?: number
          stage_settings?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "portfolio_projects_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: true
            referencedRelation: "simulation_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portfolio_projects_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["user_id"]
          },
        ]
      }
      portfolio_rate: {
        Row: {
          hits: number
          rate_key: string
          window_start: string
        }
        Insert: {
          hits?: number
          rate_key: string
          window_start: string
        }
        Update: {
          hits?: number
          rate_key?: string
          window_start?: string
        }
        Relationships: []
      }
      portfolio_reports: {
        Row: {
          contact_email: string | null
          created_at: string
          details: string | null
          id: string
          ip_hash: string
          reason: string
          resolved_at: string | null
          slug: string
          status: string
        }
        Insert: {
          contact_email?: string | null
          created_at?: string
          details?: string | null
          id?: string
          ip_hash: string
          reason: string
          resolved_at?: string | null
          slug: string
          status?: string
        }
        Update: {
          contact_email?: string | null
          created_at?: string
          details?: string | null
          id?: string
          ip_hash?: string
          reason?: string
          resolved_at?: string | null
          slug?: string
          status?: string
        }
        Relationships: []
      }
      portfolios: {
        Row: {
          allow_indexing: boolean
          bio: string | null
          city: string | null
          consented_at: string | null
          country: string | null
          created_at: string
          credly_url: string | null
          display_name: string | null
          is_public: boolean
          photo_path: string | null
          photo_version: number
          show_credentials: boolean
          show_credly: boolean
          show_github: boolean
          show_linkedin: boolean
          show_links: boolean
          show_location: boolean
          show_other: boolean
          show_scores: boolean
          slug: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          allow_indexing?: boolean
          bio?: string | null
          city?: string | null
          consented_at?: string | null
          country?: string | null
          created_at?: string
          credly_url?: string | null
          display_name?: string | null
          is_public?: boolean
          photo_path?: string | null
          photo_version?: number
          show_credentials?: boolean
          show_credly?: boolean
          show_github?: boolean
          show_linkedin?: boolean
          show_links?: boolean
          show_location?: boolean
          show_other?: boolean
          show_scores?: boolean
          slug?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          allow_indexing?: boolean
          bio?: string | null
          city?: string | null
          consented_at?: string | null
          country?: string | null
          created_at?: string
          credly_url?: string | null
          display_name?: string | null
          is_public?: boolean
          photo_path?: string | null
          photo_version?: number
          show_credentials?: boolean
          show_credly?: boolean
          show_github?: boolean
          show_linkedin?: boolean
          show_links?: boolean
          show_location?: boolean
          show_other?: boolean
          show_scores?: boolean
          slug?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "portfolios_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          email_notifications: boolean
          github_url: string | null
          headline: string | null
          id: string
          is_support_staff: boolean
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
          is_support_staff?: boolean
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
          is_support_staff?: boolean
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
          job_center_id: string | null
          job_posting_id: string | null
          overall_score: number | null
          pillar_scores: Json
          proctoring_mode: string | null
          recording_consent_given_at: string | null
          recording_file_path: string | null
          simulation_id: string
          simulation_type: string
          started_at: string
          status: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          id?: string
          job_center_id?: string | null
          job_posting_id?: string | null
          overall_score?: number | null
          pillar_scores?: Json
          proctoring_mode?: string | null
          recording_consent_given_at?: string | null
          recording_file_path?: string | null
          simulation_id: string
          simulation_type?: string
          started_at?: string
          status?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          id?: string
          job_center_id?: string | null
          job_posting_id?: string | null
          overall_score?: number | null
          pillar_scores?: Json
          proctoring_mode?: string | null
          recording_consent_given_at?: string | null
          recording_file_path?: string | null
          simulation_id?: string
          simulation_type?: string
          started_at?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "simulation_attempts_job_center_id_fkey"
            columns: ["job_center_id"]
            isOneToOne: false
            referencedRelation: "job_center_jobs"
            referencedColumns: ["id"]
          },
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
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean
          created_at: string
          current_period_end: string | null
          environment: string
          id: string
          past_due_since: string | null
          price_id: string
          status: string
          stripe_customer_id: string
          stripe_subscription_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          environment: string
          id?: string
          past_due_since?: string | null
          price_id: string
          status: string
          stripe_customer_id: string
          stripe_subscription_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          environment?: string
          id?: string
          past_due_since?: string | null
          price_id?: string
          status?: string
          stripe_customer_id?: string
          stripe_subscription_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      support_attachments: {
        Row: {
          created_at: string
          file_name: string
          file_path: string
          id: string
          message_id: string
        }
        Insert: {
          created_at?: string
          file_name: string
          file_path: string
          id?: string
          message_id: string
        }
        Update: {
          created_at?: string
          file_name?: string
          file_path?: string
          id?: string
          message_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_attachments_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "support_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      support_messages: {
        Row: {
          body: string
          created_at: string
          id: string
          sender: string
          ticket_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          sender: string
          ticket_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          sender?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          attempt_id: string | null
          category: string
          created_at: string
          data_request: string | null
          id: string
          job_center_id: string | null
          staff_last_read_at: string | null
          status: string
          subject: string
          tags: string[]
          updated_at: string
          user_id: string
          user_last_read_at: string
        }
        Insert: {
          attempt_id?: string | null
          category: string
          created_at?: string
          data_request?: string | null
          id?: string
          job_center_id?: string | null
          staff_last_read_at?: string | null
          status?: string
          subject: string
          tags?: string[]
          updated_at?: string
          user_id: string
          user_last_read_at?: string
        }
        Update: {
          attempt_id?: string | null
          category?: string
          created_at?: string
          data_request?: string | null
          id?: string
          job_center_id?: string | null
          staff_last_read_at?: string | null
          status?: string
          subject?: string
          tags?: string[]
          updated_at?: string
          user_id?: string
          user_last_read_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "simulation_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_job_center_id_fkey"
            columns: ["job_center_id"]
            isOneToOne: false
            referencedRelation: "job_center_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      billing_access_for: {
        Args: { p_env: string; p_user: string }
        Returns: Json
      }
      billing_email_hash: { Args: { p_email: string }; Returns: string }
      billing_hmac_of_md5: { Args: { p_md5: string }; Returns: string }
      get_billing_access: { Args: { p_env: string }; Returns: Json }
      increment_job_apply: { Args: { p_job: string }; Returns: undefined }
      is_support_staff: { Args: { _user_id: string }; Returns: boolean }
      portfolio_rate_hit: {
        Args: { p_key: string; p_limit: number }
        Returns: boolean
      }
      portfolio_report_ip_hash: { Args: { p_ip: string }; Returns: string }
      report_job_center: {
        Args: { p_details: string; p_job: string; p_reason: string }
        Returns: string
      }
      reserve_billing_usage: {
        Args: { p_env: string; p_kind: string; p_user: string }
        Returns: Json
      }
      reserve_generation: {
        Args: { p_env: string; p_kind: string; p_user: string }
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
