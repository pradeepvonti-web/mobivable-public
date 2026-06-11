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
      admin_login_audit: {
        Row: {
          created_at: string
          email: string
          id: string
          ip: string | null
          reason: string | null
          success: boolean
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          ip?: string | null
          reason?: string | null
          success: boolean
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          ip?: string | null
          reason?: string | null
          success?: boolean
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      agent_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          project_id: string
          role: string
          run_id: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          project_id: string
          role: string
          run_id: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          project_id?: string
          role?: string
          run_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_messages_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_messages_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_runs: {
        Row: {
          created_at: string
          id: string
          project_id: string
          selected_roles: string[]
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          project_id: string
          selected_roles?: string[]
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          project_id?: string
          selected_roles?: string[]
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_runs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_tasks: {
        Row: {
          created_at: string
          error_text: string | null
          id: string
          ordinal: number
          output: string | null
          project_id: string
          role: string
          run_id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          error_text?: string | null
          id?: string
          ordinal?: number
          output?: string | null
          project_id: string
          role: string
          run_id: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          error_text?: string | null
          id?: string
          ordinal?: number
          output?: string | null
          project_id?: string
          role?: string
          run_id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_tasks_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_credit_balances: {
        Row: {
          daily_granted: number
          daily_remaining: number
          last_daily_reset: string
          monthly_granted: number
          monthly_remaining: number
          period_start: string
          updated_at: string
          user_id: string
        }
        Insert: {
          daily_granted?: number
          daily_remaining?: number
          last_daily_reset?: string
          monthly_granted?: number
          monthly_remaining?: number
          period_start?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          daily_granted?: number
          daily_remaining?: number
          last_daily_reset?: string
          monthly_granted?: number
          monthly_remaining?: number
          period_start?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_credit_ledger: {
        Row: {
          amount: number
          created_at: string
          daily_after: number
          id: string
          monthly_after: number
          project_id: string | null
          reason: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          daily_after?: number
          id?: string
          monthly_after?: number
          project_id?: string | null
          reason: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          daily_after?: number
          id?: string
          monthly_after?: number
          project_id?: string | null
          reason?: string
          user_id?: string
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      app_templates: {
        Row: {
          author_id: string | null
          category: string
          created_at: string
          description: string | null
          feature_list: string[] | null
          id: string
          is_community: boolean | null
          is_featured: boolean | null
          name: string
          preview_image_url: string | null
          schema: Json
          tags: string[] | null
          use_count: number | null
        }
        Insert: {
          author_id?: string | null
          category: string
          created_at?: string
          description?: string | null
          feature_list?: string[] | null
          id?: string
          is_community?: boolean | null
          is_featured?: boolean | null
          name: string
          preview_image_url?: string | null
          schema: Json
          tags?: string[] | null
          use_count?: number | null
        }
        Update: {
          author_id?: string | null
          category?: string
          created_at?: string
          description?: string | null
          feature_list?: string[] | null
          id?: string
          is_community?: boolean | null
          is_featured?: boolean | null
          name?: string
          preview_image_url?: string | null
          schema?: Json
          tags?: string[] | null
          use_count?: number | null
        }
        Relationships: []
      }
      eas_apps: {
        Row: {
          created_at: string
          eas_account_name: string
          eas_app_id: string
          eas_github_repo_id: string | null
          eas_slug: string
          expo_username: string | null
          github_default_branch: string | null
          github_repo_db_id: string | null
          github_repo_name: string | null
          github_repo_node_id: string | null
          github_repo_owner: string | null
          id: string
          project_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          eas_account_name: string
          eas_app_id: string
          eas_github_repo_id?: string | null
          eas_slug: string
          expo_username?: string | null
          github_default_branch?: string | null
          github_repo_db_id?: string | null
          github_repo_name?: string | null
          github_repo_node_id?: string | null
          github_repo_owner?: string | null
          id?: string
          project_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          eas_account_name?: string
          eas_app_id?: string
          eas_github_repo_id?: string | null
          eas_slug?: string
          expo_username?: string | null
          github_default_branch?: string | null
          github_repo_db_id?: string | null
          github_repo_name?: string | null
          github_repo_node_id?: string | null
          github_repo_owner?: string | null
          id?: string
          project_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "eas_apps_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      eas_builds: {
        Row: {
          archive_url: string | null
          artifact_url: string | null
          created_at: string
          eas_app_id: string
          eas_build_id: string | null
          error_text: string | null
          git_ref: string | null
          id: string
          logs_url: string | null
          platform: string
          profile: string
          project_id: string
          raw_response: Json | null
          receipt_id: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          archive_url?: string | null
          artifact_url?: string | null
          created_at?: string
          eas_app_id: string
          eas_build_id?: string | null
          error_text?: string | null
          git_ref?: string | null
          id?: string
          logs_url?: string | null
          platform: string
          profile?: string
          project_id: string
          raw_response?: Json | null
          receipt_id?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          archive_url?: string | null
          artifact_url?: string | null
          created_at?: string
          eas_app_id?: string
          eas_build_id?: string | null
          error_text?: string | null
          git_ref?: string | null
          id?: string
          logs_url?: string | null
          platform?: string
          profile?: string
          project_id?: string
          raw_response?: Json | null
          receipt_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "eas_builds_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      eas_test_runs: {
        Row: {
          build_id: string | null
          created_at: string
          error_text: string | null
          finished_at: string | null
          github_workflow_run_id: string | null
          id: string
          logs: string
          maestro_upload_id: string | null
          project_id: string
          queued_at: string | null
          screenshots: string[]
          status: string
          updated_at: string
          user_id: string
          yaml_flow: string
        }
        Insert: {
          build_id?: string | null
          created_at?: string
          error_text?: string | null
          finished_at?: string | null
          github_workflow_run_id?: string | null
          id?: string
          logs?: string
          maestro_upload_id?: string | null
          project_id: string
          queued_at?: string | null
          screenshots?: string[]
          status?: string
          updated_at?: string
          user_id: string
          yaml_flow?: string
        }
        Update: {
          build_id?: string | null
          created_at?: string
          error_text?: string | null
          finished_at?: string | null
          github_workflow_run_id?: string | null
          id?: string
          logs?: string
          maestro_upload_id?: string | null
          project_id?: string
          queued_at?: string | null
          screenshots?: string[]
          status?: string
          updated_at?: string
          user_id?: string
          yaml_flow?: string
        }
        Relationships: []
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      github_connections: {
        Row: {
          access_token: string
          created_at: string
          github_user_id: number
          github_username: string
          scopes: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token: string
          created_at?: string
          github_user_id: number
          github_username: string
          scopes?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string
          created_at?: string
          github_user_id?: number
          github_username?: string
          scopes?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      knowledge_items: {
        Row: {
          content: string
          created_at: string
          file_name: string | null
          file_url: string | null
          id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content?: string
          created_at?: string
          file_name?: string | null
          file_url?: string | null
          id?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          file_name?: string | null
          file_url?: string | null
          id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      oauth_states: {
        Row: {
          created_at: string
          expires_at: string
          provider: string
          redirect_to: string | null
          state: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          provider: string
          redirect_to?: string | null
          state: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          provider?: string
          redirect_to?: string | null
          state?: string
          user_id?: string
        }
        Relationships: []
      }
      password_reset_audit: {
        Row: {
          created_at: string
          email: string
          event: string
          id: string
          ip: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email: string
          event: string
          id?: string
          ip?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          event?: string
          id?: string
          ip?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          plan: Database["public"]["Enums"]["plan_tier"]
          theme_preference: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id: string
          plan?: Database["public"]["Enums"]["plan_tier"]
          theme_preference?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          plan?: Database["public"]["Enums"]["plan_tier"]
          theme_preference?: string
          updated_at?: string
        }
        Relationships: []
      }
      project_backends: {
        Row: {
          created_at: string
          error_text: string | null
          id: string
          last_synced_at: string | null
          project_id: string
          region: string
          status: string
          supabase_anon_key_enc: string | null
          supabase_project_ref: string | null
          supabase_service_role_key_enc: string | null
          supabase_url: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          error_text?: string | null
          id?: string
          last_synced_at?: string | null
          project_id: string
          region?: string
          status?: string
          supabase_anon_key_enc?: string | null
          supabase_project_ref?: string | null
          supabase_service_role_key_enc?: string | null
          supabase_url?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          error_text?: string | null
          id?: string
          last_synced_at?: string | null
          project_id?: string
          region?: string
          status?: string
          supabase_anon_key_enc?: string | null
          supabase_project_ref?: string | null
          supabase_service_role_key_enc?: string | null
          supabase_url?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      project_env_vars: {
        Row: {
          created_at: string
          id: string
          name: string
          project_id: string
          updated_at: string
          user_id: string
          value: string
          visible: boolean
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          project_id: string
          updated_at?: string
          user_id: string
          value?: string
          visible?: boolean
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          project_id?: string
          updated_at?: string
          user_id?: string
          value?: string
          visible?: boolean
        }
        Relationships: []
      }
      project_file_overrides: {
        Row: {
          content: string
          file_path: string
          id: string
          project_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content: string
          file_path: string
          id?: string
          project_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          file_path?: string
          id?: string
          project_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      project_integrations: {
        Row: {
          connected_at: string | null
          created_at: string
          id: string
          project_id: string
          supabase_anon_key: string | null
          supabase_project_ref: string | null
          supabase_url: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          connected_at?: string | null
          created_at?: string
          id?: string
          project_id: string
          supabase_anon_key?: string | null
          supabase_project_ref?: string | null
          supabase_url?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          connected_at?: string | null
          created_at?: string
          id?: string
          project_id?: string
          supabase_anon_key?: string | null
          supabase_project_ref?: string | null
          supabase_url?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      project_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          project_id: string
          role: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          project_id: string
          role: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          project_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_messages_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_migrations: {
        Row: {
          applied_at: string | null
          created_at: string
          error_text: string | null
          id: string
          name: string
          project_id: string
          sql: string
          user_id: string
          version: number
        }
        Insert: {
          applied_at?: string | null
          created_at?: string
          error_text?: string | null
          id?: string
          name: string
          project_id: string
          sql: string
          user_id: string
          version: number
        }
        Update: {
          applied_at?: string | null
          created_at?: string
          error_text?: string | null
          id?: string
          name?: string
          project_id?: string
          sql?: string
          user_id?: string
          version?: number
        }
        Relationships: []
      }
      project_monetization: {
        Row: {
          admob_android_app_id: string | null
          admob_banner_android: string | null
          admob_banner_ios: string | null
          admob_interstitial_android: string | null
          admob_interstitial_ios: string | null
          admob_ios_app_id: string | null
          admob_rewarded_android: string | null
          admob_rewarded_ios: string | null
          created_at: string
          extra: Json
          id: string
          project_id: string
          provider: string
          updated_at: string
          user_id: string
        }
        Insert: {
          admob_android_app_id?: string | null
          admob_banner_android?: string | null
          admob_banner_ios?: string | null
          admob_interstitial_android?: string | null
          admob_interstitial_ios?: string | null
          admob_ios_app_id?: string | null
          admob_rewarded_android?: string | null
          admob_rewarded_ios?: string | null
          created_at?: string
          extra?: Json
          id?: string
          project_id: string
          provider?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          admob_android_app_id?: string | null
          admob_banner_android?: string | null
          admob_banner_ios?: string | null
          admob_interstitial_android?: string | null
          admob_interstitial_ios?: string | null
          admob_ios_app_id?: string | null
          admob_rewarded_android?: string | null
          admob_rewarded_ios?: string | null
          created_at?: string
          extra?: Json
          id?: string
          project_id?: string
          provider?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_monetization_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_phases: {
        Row: {
          completed_at: string | null
          created_at: string
          id: string
          phase: string
          project_id: string
          started_at: string | null
          status: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          id?: string
          phase: string
          project_id: string
          started_at?: string | null
          status?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          id?: string
          phase?: string
          project_id?: string
          started_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_phases_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_secrets: {
        Row: {
          category: string
          created_at: string
          encrypted_value: string
          id: string
          key_name: string
          project_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          category?: string
          created_at?: string
          encrypted_value: string
          id?: string
          key_name: string
          project_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string
          created_at?: string
          encrypted_value?: string
          id?: string
          key_name?: string
          project_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      project_snapshots: {
        Row: {
          created_at: string
          element_count: number | null
          id: string
          label: string
          project_id: string
          schema: Json
          screen_count: number | null
          source: string
          user_id: string
          visual_edits: Json | null
        }
        Insert: {
          created_at?: string
          element_count?: number | null
          id?: string
          label?: string
          project_id: string
          schema: Json
          screen_count?: number | null
          source?: string
          user_id: string
          visual_edits?: Json | null
        }
        Update: {
          created_at?: string
          element_count?: number | null
          id?: string
          label?: string
          project_id?: string
          schema?: Json
          screen_count?: number | null
          source?: string
          user_id?: string
          visual_edits?: Json | null
        }
        Relationships: []
      }
      projects: {
        Row: {
          agents_md: string | null
          attachments: Json
          backend_spec: Json
          created_at: string
          current_phase: string | null
          error_text: string | null
          figma_tokens: Json | null
          id: string
          model: string
          name: string
          prompt: string
          result: string | null
          status: string
          updated_at: string
          user_id: string
          visual_edits: Json
        }
        Insert: {
          agents_md?: string | null
          attachments?: Json
          backend_spec?: Json
          created_at?: string
          current_phase?: string | null
          error_text?: string | null
          figma_tokens?: Json | null
          id?: string
          model: string
          name: string
          prompt: string
          result?: string | null
          status?: string
          updated_at?: string
          user_id: string
          visual_edits?: Json
        }
        Update: {
          agents_md?: string | null
          attachments?: Json
          backend_spec?: Json
          created_at?: string
          current_phase?: string | null
          error_text?: string | null
          figma_tokens?: Json | null
          id?: string
          model?: string
          name?: string
          prompt?: string
          result?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          visual_edits?: Json
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean | null
          created_at: string | null
          current_period_end: string | null
          current_period_start: string | null
          environment: string
          id: string
          price_id: string
          product_id: string
          status: string
          stripe_customer_id: string
          stripe_subscription_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          cancel_at_period_end?: boolean | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          environment?: string
          id?: string
          price_id: string
          product_id: string
          status?: string
          stripe_customer_id: string
          stripe_subscription_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          cancel_at_period_end?: boolean | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          environment?: string
          id?: string
          price_id?: string
          product_id?: string
          status?: string
          stripe_customer_id?: string
          stripe_subscription_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      user_api_keys: {
        Row: {
          created_at: string
          id: string
          name: string
          updated_at: string
          user_id: string
          value: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          updated_at?: string
          user_id: string
          value?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
          value?: string
        }
        Relationships: []
      }
      user_connectors: {
        Row: {
          account: string | null
          created_at: string
          id: string
          label: string
          metadata: Json
          provider: string
          token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account?: string | null
          created_at?: string
          id?: string
          label: string
          metadata?: Json
          provider: string
          token?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account?: string | null
          created_at?: string
          id?: string
          label?: string
          metadata?: Json
          provider?: string
          token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_project_prefs: {
        Row: {
          id: string
          project_id: string
          selected_agent: string
          updated_at: string
          user_id: string
        }
        Insert: {
          id?: string
          project_id: string
          selected_agent: string
          updated_at?: string
          user_id: string
        }
        Update: {
          id?: string
          project_id?: string
          selected_agent?: string
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
          role: Database["public"]["Enums"]["app_role"]
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
      ai_credit_plan_grant: {
        Args: { p_plan: string }
        Returns: {
          daily: number
          monthly: number
        }[]
      }
      consume_ai_credits: {
        Args: {
          p_amount: number
          p_project?: string
          p_reason: string
          p_user: string
        }
        Returns: Json
      }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      get_user_id_by_email: { Args: { p_email: string }; Returns: string }
      grant_ai_credits: { Args: { p_user: string }; Returns: undefined }
      has_active_subscription: {
        Args: { check_env?: string; user_uuid: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      plan_from_price: {
        Args: { p_price_id: string }
        Returns: Database["public"]["Enums"]["plan_tier"]
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      sweep_expired_subscriptions: { Args: never; Returns: undefined }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
      plan_tier: "free_beta" | "starter" | "pro" | "scale" | "business"
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
      app_role: ["admin", "moderator", "user"],
      plan_tier: ["free_beta", "starter", "pro", "scale", "business"],
    },
  },
} as const
