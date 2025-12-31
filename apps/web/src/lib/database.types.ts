export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          display_name: string | null;
          silence_threshold_ms: number;
          retake_markers: Json;
          intro_transition_enabled: boolean;
          default_language_code: string | null;
          default_location_code: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          display_name?: string | null;
          silence_threshold_ms?: number;
          retake_markers?: Json;
          intro_transition_enabled?: boolean;
          default_language_code?: string | null;
          default_location_code?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          display_name?: string | null;
          silence_threshold_ms?: number;
          retake_markers?: Json;
          intro_transition_enabled?: boolean;
          default_language_code?: string | null;
          default_location_code?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      channels: {
        Row: {
          id: string;
          user_id: string;
          channel_identifier: string;
          baseline_video_ids: Json;
          baseline_summary: string | null;
          baseline_keywords: Json;
          avg_views: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          channel_identifier: string;
          baseline_video_ids?: Json;
          baseline_summary?: string | null;
          baseline_keywords?: Json;
          avg_views?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          channel_identifier?: string;
          baseline_video_ids?: Json;
          baseline_summary?: string | null;
          baseline_keywords?: Json;
          avg_views?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      videos: {
        Row: {
          id: string;
          user_id: string;
          source: string;
          youtube_video_id: string | null;
          title: string;
          thumbnail_url: string | null;
          published_at: string | null;
          views_count: number | null;
          channel_name: string | null;
          raw_provider_payload: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          source: string;
          youtube_video_id?: string | null;
          title: string;
          thumbnail_url?: string | null;
          published_at?: string | null;
          views_count?: number | null;
          channel_name?: string | null;
          raw_provider_payload?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          source?: string;
          youtube_video_id?: string | null;
          title?: string;
          thumbnail_url?: string | null;
          published_at?: string | null;
          views_count?: number | null;
          channel_name?: string | null;
          raw_provider_payload?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      ideas: {
        Row: {
          id: string;
          user_id: string;
          source_video_id: string | null;
          score: number;
          score_breakdown: Json;
          ai_summary: string | null;
          title_variants: Json;
          hook_options: Json;
          status: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          source_video_id?: string | null;
          score?: number;
          score_breakdown?: Json;
          ai_summary?: string | null;
          title_variants?: Json;
          hook_options?: Json;
          status?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          source_video_id?: string | null;
          score?: number;
          score_breakdown?: Json;
          ai_summary?: string | null;
          title_variants?: Json;
          hook_options?: Json;
          status?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      projects: {
        Row: {
          id: string;
          user_id: string;
          idea_id: string | null;
          title: string;
          status: string;
          outline: Json | null;
          title_variants: Json | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          idea_id?: string | null;
          title: string;
          status?: string;
          outline?: Json | null;
          title_variants?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          idea_id?: string | null;
          title?: string;
          status?: string;
          outline?: Json | null;
          title_variants?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      project_assets: {
        Row: {
          id: string;
          user_id: string;
          project_id: string;
          type: string;
          bucket: string;
          path: string;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          project_id: string;
          type: string;
          bucket: string;
          path: string;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          project_id?: string;
          type?: string;
          bucket?: string;
          path?: string;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      jobs: {
        Row: {
          id: string;
          user_id: string;
          project_id: string | null;
          type: string;
          status: string;
          input: Json;
          output: Json | null;
          error: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          project_id?: string | null;
          type: string;
          status?: string;
          input?: Json;
          output?: Json | null;
          error?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          project_id?: string | null;
          type?: string;
          status?: string;
          input?: Json;
          output?: Json | null;
          error?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      tool_runs: {
        Row: {
          id: string;
          user_id: string;
          tool_name: string;
          tool_version: string;
          status: string;
          input: Json;
          output: Json | null;
          logs: string | null;
          duration_ms: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          tool_name: string;
          tool_version: string;
          status?: string;
          input?: Json;
          output?: Json | null;
          logs?: string | null;
          duration_ms?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          tool_name?: string;
          tool_version?: string;
          status?: string;
          input?: Json;
          output?: Json | null;
          logs?: string | null;
          duration_ms?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      headshots: {
        Row: {
          id: string;
          user_id: string;
          bucket: string;
          path: string;
          pose_yaw: number | null;
          pose_pitch: number | null;
          pose_bucket: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          bucket: string;
          path: string;
          pose_yaw?: number | null;
          pose_pitch?: number | null;
          pose_bucket?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          bucket?: string;
          path?: string;
          pose_yaw?: number | null;
          pose_pitch?: number | null;
          pose_bucket?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

