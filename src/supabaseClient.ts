import { createClient } from '@supabase/supabase-js';

const supabaseUrl: string = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey: string = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase environment variables. Check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

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
          username: string;
          avatar_url: string | null;
          total_xp: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          username: string;
          avatar_url?: string | null;
          total_xp?: number;
        };
        Update: {
          username?: string;
          avatar_url?: string | null;
          total_xp?: number;
        };
      };
      test_sources: {
        Row: {
          id: number;
          name: string;
          is_book: boolean;
          created_at: string;
        };
      };
      ielts_tests: {
        Row: {
          id: string;
          source_id: number;
          section: 'listening' | 'reading';
          test_number: number | null;
          part_number: number;
          title: string;
          audio_url: string | null;
          passage_text: string | null;
          created_at: string;
        };
      };
      questions: {
        Row: {
          id: string;
          test_id: string;
          question_number: number;
          prompt: string;
          question_type: string;
          correct_answer: string;
          grammar_hint: string;
          shorthand_variants: string[];
          distractor_options: string[];
          word_limit: number;
          created_at: string;
        };
      };
      user_progress: {
        Row: {
          id: string;
          user_id: string;
          test_id: string;
          section: 'listening' | 'reading';
          score: number;
          total_items: number;
          band_score: number;
          time_spent_secs: number;
          completed_at: string;
        };
        Insert: {
          user_id: string;
          test_id: string;
          section: 'listening' | 'reading';
          score: number;
          total_items: number;
          band_score: number;
          time_spent_secs: number;
        };
      };
    };
  };
}