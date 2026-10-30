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
      consultation_availability: {
        Row: { id: string; host_id: string; weekday: number; start_time: string; end_time: string; slot_minutes: number; mode: string; meeting_url: string | null; location: string | null; audience: string; active: boolean; created_at: string; updated_at: string }
        Insert: { host_id?: string; weekday: number; start_time: string; end_time: string; slot_minutes?: number; mode?: string; meeting_url?: string | null; location?: string | null; audience?: string; active?: boolean }
        Update: { weekday?: number; start_time?: string; end_time?: string; slot_minutes?: number; mode?: string; meeting_url?: string | null; location?: string | null; audience?: string; active?: boolean }
        Relationships: [{ foreignKeyName: "consultation_availability_host_id_fkey"; columns: ["host_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] }]
      }
      consultation_bookings: {
        Row: {
          id: string; host_id: string; guest_id: string; student_id: string | null; starts_at: string; ends_at: string; mode: string; topic: string; status: string
          meeting_url: string | null; location: string | null; host_note: string | null; cancel_reason: string | null; cancelled_by: string | null; created_by: string | null
          decided_at: string | null; reminder_sent_at: string | null; created_at: string
        }
        Insert: never
        Update: never
        Relationships: [{ foreignKeyName: "consultation_bookings_host_id_fkey"; columns: ["host_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] }, { foreignKeyName: "consultation_bookings_guest_id_fkey"; columns: ["guest_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] }, { foreignKeyName: "consultation_bookings_student_id_fkey"; columns: ["student_id"]; isOneToOne: false; referencedRelation: "students"; referencedColumns: ["id"] }]
      }
      achievement_badges: {
        Row: { id: string; code: string; name: string; emoji: string; description: string | null; tone: string; sort_order: number; active: boolean; created_at: string }
        Insert: { code: string; name: string; emoji?: string; description?: string | null; tone?: string; sort_order?: number; active?: boolean }
        Update: { name?: string; emoji?: string; description?: string | null; tone?: string; sort_order?: number; active?: boolean }
        Relationships: []
      }
      student_star_awards: {
        Row: { id: string; student_id: string; award_date: string; stars: number; note: string | null; awarded_by: string | null; created_at: string; updated_at: string }
        Insert: { student_id: string; award_date?: string; stars: number; note?: string | null }
        Update: { stars?: number; note?: string | null }
        Relationships: [{ foreignKeyName: "student_star_awards_student_id_fkey"; columns: ["student_id"]; isOneToOne: false; referencedRelation: "students"; referencedColumns: ["id"] }]
      }
      student_badge_awards: {
        Row: { id: string; student_id: string; badge_id: string; award_date: string; note: string | null; awarded_by: string | null; created_at: string }
        Insert: { student_id: string; badge_id: string; award_date?: string; note?: string | null }
        Update: { note?: string | null }
        Relationships: [{ foreignKeyName: "student_badge_awards_student_id_fkey"; columns: ["student_id"]; isOneToOne: false; referencedRelation: "students"; referencedColumns: ["id"] }, { foreignKeyName: "student_badge_awards_badge_id_fkey"; columns: ["badge_id"]; isOneToOne: false; referencedRelation: "achievement_badges"; referencedColumns: ["id"] }]
      }
      reward_milestones: {
        Row: { id: string; stars_required: number; title: string; emoji: string; description: string | null; active: boolean; created_at: string }
        Insert: { stars_required: number; title: string; emoji?: string; description?: string | null; active?: boolean }
        Update: { stars_required?: number; title?: string; emoji?: string; description?: string | null; active?: boolean }
        Relationships: []
      }
      reward_redemptions: {
        Row: { id: string; student_id: string; milestone_id: string; given_at: string; given_by: string | null }
        Insert: { student_id: string; milestone_id: string; given_by?: string }
        Update: never
        Relationships: [{ foreignKeyName: "reward_redemptions_student_id_fkey"; columns: ["student_id"]; isOneToOne: false; referencedRelation: "students"; referencedColumns: ["id"] }, { foreignKeyName: "reward_redemptions_milestone_id_fkey"; columns: ["milestone_id"]; isOneToOne: false; referencedRelation: "reward_milestones"; referencedColumns: ["id"] }]
      }
      campus_profiles: {
        Row: {
          address: string
          campus: Database["public"]["Enums"]["campus"]
          contacts: Json
          google_maps_url: string | null
          lat: number
          lng: number
          location_verified: boolean
          name: string
          opening_hours: string
          photo_url: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: never
        Update: {
          address?: string
          contacts?: Json
          google_maps_url?: string | null
          lat?: number
          lng?: number
          location_verified?: boolean
          name?: string
          opening_hours?: string
          photo_url?: string | null
          updated_by?: string | null
        }
        Relationships: []
      }
      campus_transfer_requests: {
        Row: {
          admin_note: string | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          distance_from_km: number | null
          distance_to_km: number | null
          from_campus: Database["public"]["Enums"]["campus"]
          id: string
          new_class_name: string | null
          parent_id: string
          reason: string | null
          status: string
          student_id: string
          to_campus: Database["public"]["Enums"]["campus"]
        }
        Insert: {
          distance_from_km?: number | null
          distance_to_km?: number | null
          from_campus: Database["public"]["Enums"]["campus"]
          reason?: string | null
          student_id: string
          to_campus: Database["public"]["Enums"]["campus"]
        }
        Update: {
          admin_note?: string | null
          decided_at?: string | null
          decided_by?: string | null
          new_class_name?: string | null
          status?: string
        }
        Relationships: [
          { foreignKeyName: "campus_transfer_requests_student_id_fkey"; columns: ["student_id"]; isOneToOne: false; referencedRelation: "students"; referencedColumns: ["id"] },
          { foreignKeyName: "campus_transfer_requests_parent_id_fkey"; columns: ["parent_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
        ]
      }
      teacher_pay_rates: {
        Row: { id: string; subject: string; teacher_id: string | null; rate: number; updated_at: string }
        Insert: { id?: string; subject: string; teacher_id?: string | null; rate: number }
        Update: { subject?: string; teacher_id?: string | null; rate?: number }
        Relationships: [
          { foreignKeyName: "teacher_pay_rates_teacher_id_fkey"; columns: ["teacher_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
        ]
      }
      teaching_sessions: {
        Row: {
          adjusted_by: string | null
          campus: Database["public"]["Enums"]["campus"]
          checked_in_at: string | null
          checked_out_at: string | null
          class_id: string | null
          class_name: string
          created_at: string
          date: string
          id: string
          note: string | null
          off_schedule: boolean
          rate: number | null
          scheduled_end: string | null
          scheduled_start: string | null
          status: string
          subject: string
          teacher_id: string
          updated_at: string
        }
        Insert: {
          adjusted_by?: string | null
          campus: Database["public"]["Enums"]["campus"]
          checked_in_at?: string | null
          checked_out_at?: string | null
          class_id?: string | null
          class_name: string
          date: string
          note?: string | null
          off_schedule?: boolean
          rate?: number | null
          scheduled_end?: string | null
          scheduled_start?: string | null
          status?: string
          subject?: string
          teacher_id: string
        }
        Update: {
          adjusted_by?: string | null
          checked_in_at?: string | null
          checked_out_at?: string | null
          note?: string | null
          rate?: number | null
          status?: string
          subject?: string
        }
        Relationships: [
          { foreignKeyName: "teaching_sessions_teacher_id_fkey"; columns: ["teacher_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
          { foreignKeyName: "teaching_sessions_class_id_fkey"; columns: ["class_id"]; isOneToOne: false; referencedRelation: "classes"; referencedColumns: ["id"] },
        ]
      }
      leads: {
        Row: {
          assigned_to: string | null
          campus: Database["public"]["Enums"]["campus"]
          converted_at: string | null
          converted_student_id: string | null
          created_at: string
          created_by: string | null
          dob: string | null
          follow_up_on: string | null
          full_name: string
          id: string
          lost_reason: string | null
          notes: string | null
          parent_name: string
          phone: string
          source: string
          status: string
          status_changed_at: string
          target_program: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          campus: Database["public"]["Enums"]["campus"]
          dob?: string | null
          follow_up_on?: string | null
          full_name: string
          id?: string
          lost_reason?: string | null
          notes?: string | null
          parent_name: string
          phone: string
          source?: string
          status?: string
          target_program: string
        }
        Update: {
          assigned_to?: string | null
          campus?: Database["public"]["Enums"]["campus"]
          dob?: string | null
          follow_up_on?: string | null
          full_name?: string
          lost_reason?: string | null
          notes?: string | null
          parent_name?: string
          phone?: string
          source?: string
          status?: string
          target_program?: string
        }
        Relationships: [
          { foreignKeyName: "leads_assigned_to_fkey"; columns: ["assigned_to"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
          { foreignKeyName: "leads_converted_student_id_fkey"; columns: ["converted_student_id"]; isOneToOne: false; referencedRelation: "students"; referencedColumns: ["id"] },
        ]
      }
      trial_classes: {
        Row: {
          assessed_at: string | null
          assessed_by: string | null
          assessment_level: number | null
          assessment_skills: Json
          campus: Database["public"]["Enums"]["campus"]
          class_id: string | null
          confirmation_status: string
          confirmed_at: string | null
          created_at: string
          created_by: string | null
          duration_minutes: number
          id: string
          improvements: string | null
          lead_id: string
          note_for_teacher: string | null
          program: string
          recommendation: string | null
          scheduled_at: string
          status: string
          strengths: string | null
          teacher_id: string | null
          updated_at: string
        }
        Insert: {
          campus: Database["public"]["Enums"]["campus"]
          class_id?: string | null
          duration_minutes?: number
          id?: string
          lead_id: string
          note_for_teacher?: string | null
          program: string
          scheduled_at: string
          status?: string
          teacher_id?: string | null
        }
        Update: {
          campus?: Database["public"]["Enums"]["campus"]
          class_id?: string | null
          confirmation_status?: string
          confirmed_at?: string | null
          duration_minutes?: number
          note_for_teacher?: string | null
          program?: string
          scheduled_at?: string
          status?: string
          teacher_id?: string | null
        }
        Relationships: [
          { foreignKeyName: "trial_classes_lead_id_fkey"; columns: ["lead_id"]; isOneToOne: false; referencedRelation: "leads"; referencedColumns: ["id"] },
          { foreignKeyName: "trial_classes_class_id_fkey"; columns: ["class_id"]; isOneToOne: false; referencedRelation: "classes"; referencedColumns: ["id"] },
          { foreignKeyName: "trial_classes_teacher_id_fkey"; columns: ["teacher_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
        ]
      }
      satisfaction_surveys: {
        Row: {
          campuses: string[]
          class_names: string[]
          comment: string | null
          created_at: string
          id: string
          parent_id: string
          period: string
          rating: number | null
          status: string
          subject_ratings: Json
        }
        Insert: {
          comment?: string | null
          id?: string
          parent_id: string
          period: string
          rating?: number | null
          status?: string
          subject_ratings?: Json
        }
        Update: never
        Relationships: []
      }
      feedback_anonymous_owners: {
        Row: { feedback_id: string; parent_id: string }
        Insert: never
        Update: never
        Relationships: []
      }
      error_events: {
        Row: {
          area: string | null
          category: string
          context: Json
          created_at: string
          digest: string | null
          fingerprint: string
          id: number
          level: string
          message: string
          path: string | null
          release: string | null
          source: string
          stack: string | null
          user_agent: string | null
          user_id: string | null
          user_role: string | null
        }
        Insert: {
          area?: string | null
          category?: string
          context?: Json
          digest?: string | null
          fingerprint: string
          level?: string
          message: string
          path?: string | null
          release?: string | null
          source: string
          stack?: string | null
          user_agent?: string | null
          user_id?: string | null
          user_role?: string | null
        }
        Update: never
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          actor_name: string | null
          actor_role: string
          changed_fields: string[] | null
          created_at: string
          id: number
          new_data: Json | null
          old_data: Json | null
          record_id: string | null
          student_id: string | null
          table_name: string
          user_id: string | null
        }
        Insert: never
        Update: never
        Relationships: []
      }
      rate_limits: {
        Row: {
          hit_count: number
          key: string
          window_seconds: number
          window_start: string
        }
        Insert: never
        Update: never
        Relationships: []
      }
      moments: {
        Row: {
          author_id: string | null
          author_name: string
          campus: Database["public"]["Enums"]["campus"]
          caption: string
          category: string
          class_name: string
          created_at: string
          id: string
          published: boolean
          published_at: string | null
          updated_at: string
          visibility: string
        }
        Insert: {
          author_id?: string | null
          author_name?: string
          campus: Database["public"]["Enums"]["campus"]
          caption?: string
          category?: string
          class_name: string
          created_at?: string
          id?: string
          published?: boolean
          published_at?: string | null
          updated_at?: string
          visibility?: string
        }
        Update: {
          author_id?: string | null
          author_name?: string
          campus?: Database["public"]["Enums"]["campus"]
          caption?: string
          category?: string
          class_name?: string
          created_at?: string
          id?: string
          published?: boolean
          published_at?: string | null
          updated_at?: string
          visibility?: string
        }
        Relationships: []
      }
      moment_media: {
        Row: {
          created_at: string
          id: string
          kind: string
          moment_id: string
          path: string
          position: number
        }
        Insert: {
          created_at?: string
          id?: string
          kind?: string
          moment_id: string
          path: string
          position?: number
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          moment_id?: string
          path?: string
          position?: number
        }
        Relationships: []
      }
      moment_media_tags: {
        Row: {
          media_id: string
          student_id: string
        }
        Insert: {
          media_id: string
          student_id: string
        }
        Update: {
          media_id?: string
          student_id?: string
        }
        Relationships: []
      }
      moment_reactions: {
        Row: {
          created_at: string
          kind: string
          moment_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          kind: string
          moment_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          kind?: string
          moment_id?: string
          user_id?: string
        }
        Relationships: []
      }
      moment_comments: {
        Row: {
          author_id: string
          author_label: string
          author_role: string
          body: string
          created_at: string
          id: string
          moment_id: string
        }
        Insert: {
          author_id?: string
          author_label?: string
          author_role?: string
          body: string
          created_at?: string
          id?: string
          moment_id: string
        }
        Update: {
          author_id?: string
          author_label?: string
          author_role?: string
          body?: string
          created_at?: string
          id?: string
          moment_id?: string
        }
        Relationships: []
      }
      bank_transactions: {
        Row: {
          account_no: string | null
          amount: number
          applied_amount: number
          content: string
          created_at: string
          handled_by: string | null
          id: string
          matched_fee_ids: string[]
          note: string | null
          provider: string
          provider_txn_id: string
          raw: Json | null
          status: string
          student_id: string | null
          txn_at: string | null
          updated_at: string
        }
        Insert: {
          account_no?: string | null
          amount: number
          applied_amount?: number
          content?: string
          created_at?: string
          handled_by?: string | null
          id?: string
          matched_fee_ids?: string[]
          note?: string | null
          provider: string
          provider_txn_id: string
          raw?: Json | null
          status?: string
          student_id?: string | null
          txn_at?: string | null
          updated_at?: string
        }
        Update: {
          account_no?: string | null
          amount?: number
          applied_amount?: number
          content?: string
          created_at?: string
          handled_by?: string | null
          id?: string
          matched_fee_ids?: string[]
          note?: string | null
          provider?: string
          provider_txn_id?: string
          raw?: Json | null
          status?: string
          student_id?: string | null
          txn_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      payment_config: {
        Row: {
          account_name: string
          account_no: string
          bank_bin: string
          bank_name: string
          id: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          account_name: string
          account_no: string
          bank_bin: string
          bank_name: string
          id?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          account_name?: string
          account_no?: string
          bank_bin?: string
          bank_name?: string
          id?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      fee_reminder_runs: {
        Row: {
          created_at: string
          due_soon: number
          id: string
          overdue: number
          run_date: string
          triggered_by: string | null
        }
        Insert: {
          created_at?: string
          due_soon?: number
          id?: string
          overdue?: number
          run_date: string
          triggered_by?: string | null
        }
        Update: {
          created_at?: string
          due_soon?: number
          id?: string
          overdue?: number
          run_date?: string
          triggered_by?: string | null
        }
        Relationships: []
      }
      admin_notification_reads: {
        Row: {
          admin_id: string
          notification_id: string
          read_at: string
        }
        Insert: {
          admin_id: string
          notification_id: string
          read_at?: string
        }
        Update: {
          admin_id?: string
          notification_id?: string
          read_at?: string
        }
        Relationships: []
      }
      admin_notifications: {
        Row: {
          actor_id: string | null
          actor_name: string
          actor_role: string
          body: string
          category: string
          created_at: string
          event_count: number
          group_key: string | null
          href: string
          id: string
          title: string
          updated_at: string
        }
        Insert: {
          actor_id?: string | null
          actor_name?: string
          actor_role: string
          body?: string
          category: string
          created_at?: string
          event_count?: number
          group_key?: string | null
          href?: string
          id?: string
          title: string
          updated_at?: string
        }
        Update: {
          actor_id?: string | null
          actor_name?: string
          actor_role?: string
          body?: string
          category?: string
          created_at?: string
          event_count?: number
          group_key?: string | null
          href?: string
          id?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      admin_notification_state: {
        Row: {
          admin_id: string
          last_seen_at: string
        }
        Insert: {
          admin_id: string
          last_seen_at?: string
        }
        Update: {
          admin_id?: string
          last_seen_at?: string
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: string
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value: string
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: string
        }
        Relationships: []
      }
      announcements: {
        Row: {
          audience: string
          body: string
          campus: Database["public"]["Enums"]["campus"] | null
          category: string
          class_ids: string[]
          created_at: string
          created_by: string | null
          id: string
          recipient_count: number
          title: string
        }
        Insert: {
          audience?: string
          body: string
          campus?: Database["public"]["Enums"]["campus"] | null
          category?: string
          class_ids?: string[]
          created_at?: string
          created_by?: string | null
          id?: string
          recipient_count?: number
          title: string
        }
        Update: {
          audience?: string
          body?: string
          campus?: Database["public"]["Enums"]["campus"] | null
          category?: string
          class_ids?: string[]
          created_at?: string
          created_by?: string | null
          id?: string
          recipient_count?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance: {
        Row: {
          created_at: string
          date: string
          id: string
          note: string | null
          status: Database["public"]["Enums"]["attendance_status"]
          student_id: string
        }
        Insert: {
          created_at?: string
          date?: string
          id?: string
          note?: string | null
          status?: Database["public"]["Enums"]["attendance_status"]
          student_id: string
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          note?: string | null
          status?: Database["public"]["Enums"]["attendance_status"]
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      class_shifts: {
        Row: {
          created_at: string
          end_time: string
          id: string
          is_active: boolean
          name: string
          start_time: string
          weekdays: number[]
        }
        Insert: {
          created_at?: string
          end_time: string
          id?: string
          is_active?: boolean
          name: string
          start_time: string
          weekdays?: number[]
        }
        Update: {
          created_at?: string
          end_time?: string
          id?: string
          is_active?: boolean
          name?: string
          start_time?: string
          weekdays?: number[]
        }
        Relationships: []
      }
      chat_conversations: {
        Row: {
          created_at: string
          id: string
          last_message_at: string | null
          last_message_preview: string | null
          last_sender_id: string | null
          parent_id: string
          parent_last_read_at: string | null
          teacher_id: string
          teacher_last_read_at: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          last_message_at?: string | null
          last_message_preview?: string | null
          last_sender_id?: string | null
          parent_id: string
          parent_last_read_at?: string | null
          teacher_id: string
          teacher_last_read_at?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          last_message_at?: string | null
          last_message_preview?: string | null
          last_sender_id?: string | null
          parent_id?: string
          parent_last_read_at?: string | null
          teacher_id?: string
          teacher_last_read_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_conversations_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_conversations_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          body: string | null
          conversation_id: string
          created_at: string
          id: string
          image_path: string | null
          sender_id: string
          removed_at: string | null
          removed_by: string | null
        }
        Insert: {
          body?: string | null
          conversation_id: string
          created_at?: string
          id?: string
          image_path?: string | null
          sender_id?: string
          removed_at?: string | null
          removed_by?: string | null
        }
        Update: {
          body?: string | null
          conversation_id?: string
          created_at?: string
          id?: string
          image_path?: string | null
          sender_id?: string
          removed_at?: string | null
          removed_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "chat_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      classes: {
        Row: {
          campus: Database["public"]["Enums"]["campus"]
          created_at: string
          id: string
          name: string
          shift_id: string | null
          monthly_fee: number | null
          /** Có sau apply-teaching-payroll.sql */
          subject?: string | null
          room?: string | null
          /** Có sau apply-analytics.sql */
          capacity?: number | null
        }
        Insert: {
          campus: Database["public"]["Enums"]["campus"]
          created_at?: string
          id?: string
          name: string
          shift_id?: string | null
          monthly_fee?: number | null
          subject?: string | null
          room?: string | null
        }
        Update: {
          campus?: Database["public"]["Enums"]["campus"]
          created_at?: string
          id?: string
          name?: string
          shift_id?: string | null
          monthly_fee?: number | null
          subject?: string | null
          room?: string | null
          capacity?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "classes_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "class_shifts"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_reports: {
        Row: {
          created_at: string
          date: string
          id: string
          media_urls: string[]
          mood: Database["public"]["Enums"]["mood"] | null
          student_id: string
          subjects_summary: Json
          teacher_id: string | null
          teacher_note: string | null
        }
        Insert: {
          created_at?: string
          date?: string
          id?: string
          media_urls?: string[]
          mood?: Database["public"]["Enums"]["mood"] | null
          student_id: string
          subjects_summary?: Json
          teacher_id?: string | null
          teacher_note?: string | null
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          media_urls?: string[]
          mood?: Database["public"]["Enums"]["mood"] | null
          student_id?: string
          subjects_summary?: Json
          teacher_id?: string | null
          teacher_note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "daily_reports_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_reports_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback: {
        Row: {
          contact_name: string | null
          contact_phone: string | null
          is_anonymous: boolean
          kind: string
          status_changed_at: string | null
          wants_callback: boolean
          admin_reply: string | null
          category: string
          content: string
          created_at: string
          id: string
          parent_id: string | null
          replied_at: string | null
          replied_by: string | null
          status: Database["public"]["Enums"]["feedback_status"]
          student_id: string | null
        }
        Insert: {
          contact_name?: string | null
          contact_phone?: string | null
          is_anonymous?: boolean
          kind?: string
          status_changed_at?: string | null
          wants_callback?: boolean
          admin_reply?: string | null
          category: string
          content: string
          created_at?: string
          id?: string
          parent_id?: string | null
          replied_at?: string | null
          replied_by?: string | null
          status?: Database["public"]["Enums"]["feedback_status"]
          student_id?: string | null
        }
        Update: {
          contact_name?: string | null
          contact_phone?: string | null
          is_anonymous?: boolean
          kind?: string
          status_changed_at?: string | null
          wants_callback?: boolean
          admin_reply?: string | null
          category?: string
          content?: string
          created_at?: string
          id?: string
          parent_id?: string | null
          replied_at?: string | null
          replied_by?: string | null
          status?: Database["public"]["Enums"]["feedback_status"]
          student_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "feedback_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_replied_by_fkey"
            columns: ["replied_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      fee_payments: {
        Row: {
          amount: number
          fee_id: string
          id: string
          paid_at: string
          recorded_by: string | null
        }
        Insert: {
          amount: number
          fee_id: string
          id?: string
          paid_at?: string
          recorded_by?: string | null
        }
        Update: {
          amount?: number
          fee_id?: string
          id?: string
          paid_at?: string
          recorded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fee_payments_fee_id_fkey"
            columns: ["fee_id"]
            isOneToOne: false
            referencedRelation: "fees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_payments_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      fees: {
        Row: {
          amount: number
          created_at: string
          due_date: string | null
          id: string
          paid_amount: number
          status: Database["public"]["Enums"]["fee_status"]
          student_id: string
          title: string
          period: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          due_date?: string | null
          id?: string
          paid_amount?: number
          status?: Database["public"]["Enums"]["fee_status"]
          student_id: string
          title: string
          period?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          due_date?: string | null
          id?: string
          paid_amount?: number
          status?: Database["public"]["Enums"]["fee_status"]
          student_id?: string
          title?: string
          period?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fees_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      homework_assignments: {
        Row: {
          campus: Database["public"]["Enums"]["campus"]
          class_name: string
          created_at: string
          due_date: string | null
          id: string
          instructions: string
          subject: string | null
          submission_type: string
          teacher_id: string | null
          title: string
        }
        Insert: {
          campus: Database["public"]["Enums"]["campus"]
          class_name: string
          created_at?: string
          due_date?: string | null
          id?: string
          instructions?: string
          subject?: string | null
          submission_type?: string
          teacher_id?: string | null
          title: string
        }
        Update: {
          campus?: Database["public"]["Enums"]["campus"]
          class_name?: string
          created_at?: string
          due_date?: string | null
          id?: string
          instructions?: string
          subject?: string | null
          submission_type?: string
          teacher_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "homework_assignments_class_fkey"
            columns: ["campus","class_name"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["campus","name"]
          },
          {
            foreignKeyName: "homework_assignments_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      homework_submissions: {
        Row: {
          assignment_id: string
          graded_at: string | null
          graded_by: string | null
          hearted: boolean
          id: string
          media_paths: string[]
          parent_id: string | null
          parent_note: string | null
          stars: number | null
          status: string
          student_id: string
          submitted_at: string
          teacher_comment: string | null
          updated_at: string
          voice_path: string | null
        }
        Insert: {
          assignment_id: string
          graded_at?: string | null
          graded_by?: string | null
          hearted?: boolean
          id?: string
          media_paths?: string[]
          parent_id?: string | null
          parent_note?: string | null
          stars?: number | null
          status?: string
          student_id: string
          submitted_at?: string
          teacher_comment?: string | null
          updated_at?: string
          voice_path?: string | null
        }
        Update: {
          assignment_id?: string
          graded_at?: string | null
          graded_by?: string | null
          hearted?: boolean
          id?: string
          media_paths?: string[]
          parent_id?: string | null
          parent_note?: string | null
          stars?: number | null
          status?: string
          student_id?: string
          submitted_at?: string
          teacher_comment?: string | null
          updated_at?: string
          voice_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "homework_submissions_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "homework_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "homework_submissions_graded_by_fkey"
            columns: ["graded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "homework_submissions_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "homework_submissions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_requests: {
        Row: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          end_date: string
          id: string
          note: string | null
          parent_id: string | null
          reason: string
          start_date: string
          status: string
          student_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          end_date: string
          id?: string
          note?: string | null
          parent_id?: string | null
          reason?: string
          start_date: string
          status?: string
          student_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          end_date?: string
          id?: string
          note?: string | null
          parent_id?: string | null
          reason?: string
          start_date?: string
          status?: string
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leave_requests_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      monthly_summaries: {
        Row: {
          ai_generated: boolean
          content: string
          created_at: string
          id: string
          month: string
          sent_at: string | null
          status: string
          student_id: string
          teacher_id: string | null
          updated_at: string
        }
        Insert: {
          ai_generated?: boolean
          content: string
          created_at?: string
          id?: string
          month: string
          sent_at?: string | null
          status?: string
          student_id: string
          teacher_id?: string | null
          updated_at?: string
        }
        Update: {
          ai_generated?: boolean
          content?: string
          created_at?: string
          id?: string
          month?: string
          sent_at?: string | null
          status?: string
          student_id?: string
          teacher_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "monthly_summaries_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monthly_summaries_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string
          created_at: string
          feedback_id: string | null
          id: string
          read_at: string | null
          recipient_id: string
          ref_date: string
          student_id: string | null
          title: string
          type: Database["public"]["Enums"]["notification_type"]
          ref_id: string | null
          pushed_at: string | null
        }
        Insert: {
          body?: string
          created_at?: string
          feedback_id?: string | null
          id?: string
          read_at?: string | null
          recipient_id: string
          ref_date: string
          student_id?: string | null
          title: string
          type: Database["public"]["Enums"]["notification_type"]
          ref_id?: string | null
          pushed_at?: string | null
        }
        Update: {
          body?: string
          created_at?: string
          feedback_id?: string | null
          id?: string
          read_at?: string | null
          recipient_id?: string
          ref_date?: string
          student_id?: string | null
          title?: string
          type?: Database["public"]["Enums"]["notification_type"]
          ref_id?: string | null
          pushed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_feedback_id_fkey"
            columns: ["feedback_id"]
            isOneToOne: false
            referencedRelation: "feedback"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          campus: Database["public"]["Enums"]["campus"] | null
          created_at: string
          full_name: string
          id: string
          phone: string | null
          role: Database["public"]["Enums"]["roles"]
        }
        Insert: {
          avatar_url?: string | null
          campus?: Database["public"]["Enums"]["campus"] | null
          created_at?: string
          full_name?: string
          id: string
          phone?: string | null
          role?: Database["public"]["Enums"]["roles"]
        }
        Update: {
          avatar_url?: string | null
          campus?: Database["public"]["Enums"]["campus"] | null
          created_at?: string
          full_name?: string
          id?: string
          phone?: string | null
          role?: Database["public"]["Enums"]["roles"]
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          last_used_at: string | null
          p256dh: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          last_used_at?: string | null
          p256dh: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          last_used_at?: string | null
          p256dh?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      students: {
        Row: {
          avatar_url: string | null
          campus: Database["public"]["Enums"]["campus"]
          class_name: string
          created_at: string
          dob: string | null
          full_name: string
          id: string
          parent_id: string | null
          subjects: string[]
          student_code: string | null
        }
        Insert: {
          avatar_url?: string | null
          campus: Database["public"]["Enums"]["campus"]
          class_name: string
          created_at?: string
          dob?: string | null
          full_name: string
          id?: string
          parent_id?: string | null
          subjects?: string[]
          student_code?: string | null
        }
        Update: {
          avatar_url?: string | null
          campus?: Database["public"]["Enums"]["campus"]
          class_name?: string
          created_at?: string
          dob?: string | null
          full_name?: string
          id?: string
          parent_id?: string | null
          subjects?: string[]
          student_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "students_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      teacher_assignments: {
        Row: {
          campus: Database["public"]["Enums"]["campus"]
          class_name: string | null
          created_at: string
          id: string
          teacher_id: string
        }
        Insert: {
          campus: Database["public"]["Enums"]["campus"]
          class_name?: string | null
          created_at?: string
          id?: string
          teacher_id: string
        }
        Update: {
          campus?: Database["public"]["Enums"]["campus"]
          class_name?: string | null
          created_at?: string
          id?: string
          teacher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "teacher_assignments_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      teacher_attendance: {
        Row: {
          created_at: string
          date: string
          id: string
          note: string | null
          recorded_by: string | null
          status: Database["public"]["Enums"]["attendance_status"]
          teacher_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          date?: string
          id?: string
          note?: string | null
          recorded_by?: string | null
          status?: Database["public"]["Enums"]["attendance_status"]
          teacher_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          note?: string | null
          recorded_by?: string | null
          status?: Database["public"]["Enums"]["attendance_status"]
          teacher_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "teacher_attendance_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teacher_attendance_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      analytics_report: { Args: { p_months?: number; p_weeks?: number }; Returns: Json }
      health_ping: { Args: never; Returns: string }
      purge_error_events: { Args: { p_keep_days?: number }; Returns: number }
      integrity_report: { Args: never; Returns: { check_key: string; severity: string; label: string; total: number }[] }
      storage_orphans: { Args: { p_limit?: number }; Returns: { bucket_id: string; name: string; created_at: string }[] }
      teaching_check_in: { Args: { p_class: string; p_note?: string | null }; Returns: string }
      teaching_check_out: { Args: { p_session: string }; Returns: undefined }
      teaching_rate_for: { Args: { p_teacher: string; p_subject: string }; Returns: number | null }
      teacher_trial_classes: {
        Args: never
        Returns: {
          id: string
          scheduled_at: string
          duration_minutes: number
          program: string
          status: string
          campus: Database["public"]["Enums"]["campus"]
          class_name: string | null
          child_name: string
          child_dob: string | null
          note_for_teacher: string | null
          assessment_level: number | null
          assessment_skills: Json
          strengths: string | null
          improvements: string | null
          recommendation: string | null
          assessed_at: string | null
        }[]
      }
      submit_trial_assessment: {
        Args: {
          p_trial: string
          p_attended: boolean
          p_level?: number | null
          p_skills?: Json
          p_strengths?: string | null
          p_improvements?: string | null
          p_recommendation?: string | null
        }
        Returns: undefined
      }
      convert_lead_to_student: {
        Args: {
          p_lead: string
          p_parent: string
          p_class: string
          p_full_name: string
          p_dob: string | null
          p_subjects: string[]
          p_fee_title: string
          p_fee_amount: number
          p_fee_due: string | null
        }
        Returns: { student_id: string; fee_id: string }[]
      }
      moment_tag_names: { Args: { p_moment_ids: string[] }; Returns: { moment_id: string; media_id: string; student_id: string; given_name: string }[] }
      send_fee_reminders: { Args: { p_today?: string }; Returns: { due_soon: number; overdue: number }[] }
      submit_feedback: {
        Args: {
          p_kind: string
          p_category: string
          p_content: string
          p_student_id?: string | null
          p_anonymous?: boolean
          p_contact_name?: string | null
          p_contact_phone?: string | null
          p_wants_callback?: boolean
        }
        Returns: string
      }
      rate_limit_hit: { Args: { p_key: string; p_window_seconds: number; p_increment?: boolean }; Returns: { hit_count: number; ttl_seconds: number }[] }
      rate_limit_reset: { Args: { p_key: string }; Returns: undefined }
      security_audit_report: { Args: never; Returns: { severity: string; category: string; object_name: string; detail: string }[] }
      admin_feed_unread_count: { Args: never; Returns: number }
      chat_contacts: {
        Args: never
        Returns: {
          children: string[]
          classes: string[]
          contact_id: string
          full_name: string
          role: string
        }[]
      }
      chat_mark_read: {
        Args: { p_conversation: string }
        Returns: undefined
      }
      consultation_slots: {
        Args: { p_host_id: string; p_from: string; p_to: string }
        Returns: { starts_at: string; ends_at: string; mode: string; available: boolean }[]
      }
      consultation_parties: {
        Args: { p_booking_ids: string[] }
        Returns: { booking_id: string; host_name: string; host_role: string; guest_name: string; guest_role: string; creator_role: string | null }[]
      }
      consultation_hosts: {
        Args: { p_student_id?: string | null }
        Returns: { host_id: string; full_name: string; host_role: string; has_availability: boolean }[]
      }
      book_consultation: {
        Args: { p_host_id: string; p_starts_at: string; p_topic: string; p_student_id?: string | null }
        Returns: string
      }
      admin_schedule_consultation: {
        Args: {
          p_host_id: string; p_guest_id: string; p_student_id: string | null; p_starts_at: string; p_minutes: number
          p_mode: string; p_topic: string; p_meeting_url?: string | null; p_location?: string | null
        }
        Returns: string
      }
      decide_consultation: {
        Args: { p_id: string; p_confirm: boolean; p_note?: string | null; p_meeting_url?: string | null }
        Returns: undefined
      }
      cancel_consultation: {
        Args: { p_id: string; p_reason?: string | null }
        Returns: undefined
      }
      send_consultation_reminders: { Args: never; Returns: number }
      student_star_totals: {
        Args: { p_student_ids: string[] }
        Returns: { student_id: string; session_stars: number; homework_stars: number; total_stars: number }[]
      }
      class_achievement_leaderboard: {
        Args: { p_campus: Database["public"]["Enums"]["campus"]; p_class: string; p_from: string; p_to: string }
        Returns: { display_name: string; badges: number; is_mine: boolean; stars: number; student_id: string | null }[]
      }
      homework_star_leaderboard: {
        Args: { p_campus: Database["public"]["Enums"]["campus"]; p_class: string; p_from: string; p_to: string }
        Returns: { display_name: string; graded_count: number; is_mine: boolean; stars: number; student_id: string | null }[]
      }
      current_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["roles"]
      }
      is_admin: { Args: never; Returns: boolean }
      is_parent_of: { Args: { p_student_id: string }; Returns: boolean }
      parent_can_view_profile: {
        Args: { p_profile_id: string }
        Returns: boolean
      }
      safe_uuid: { Args: { p: string }; Returns: string }
      teacher_can_access_student: {
        Args: { p_student_id: string }
        Returns: boolean
      }
      teacher_can_view_profile: {
        Args: { p_profile_id: string }
        Returns: boolean
      }
      teacher_manages: {
        Args: {
          p_campus: Database["public"]["Enums"]["campus"]
          p_class_name: string
        }
        Returns: boolean
      }
    }
    Enums: {
      attendance_status: "present" | "absent" | "late" | "absent_with_permission"
      campus: "CS1_XALA" | "CS2_NGOTHINHAM"
      fee_status: "unpaid" | "partial" | "paid"
      feedback_status: "new" | "in_progress" | "resolved"
      mood: "happy" | "neutral" | "focused" | "tired"
      notification_type:
        | "daily_report"
        | "attendance"
        | "feedback"
        | "monthly_summary"
        | "homework_assigned"
        | "homework_graded"
        | "announcement"
        | "fee_issued"
        | "leave_request"
        | "leave_decided"
        | "fee_reminder"
        | "fee_paid"
        | "moment_posted"
        | "moment_comment"
        | "trial_assigned"
        | "campus_transfer"
        | "achievement"
        | "booking_requested"
        | "booking_decided"
        | "booking_reminder"
      roles: "admin" | "teacher" | "parent"
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
      attendance_status: ["present", "absent", "late", "absent_with_permission"],
      campus: ["CS1_XALA", "CS2_NGOTHINHAM"],
      fee_status: ["unpaid", "partial", "paid"],
      feedback_status: ["new", "in_progress", "resolved"],
      mood: ["happy", "neutral", "focused", "tired"],
      notification_type: ["daily_report", "attendance", "feedback", "monthly_summary", "homework_assigned", "homework_graded", "announcement", "fee_issued", "leave_request", "leave_decided", "fee_reminder", "fee_paid", "moment_posted", "moment_comment", "trial_assigned", "campus_transfer", "achievement", "booking_requested", "booking_decided", "booking_reminder"],
      roles: ["admin", "teacher", "parent"],
    },
  },
} as const
