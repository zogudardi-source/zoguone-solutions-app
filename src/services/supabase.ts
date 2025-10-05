// Fix: Added a triple-slash directive to include Vite's client types, which provides the necessary type definitions for `import.meta.env`.
/// <reference types="vite/client" />

import { createClient } from '@supabase/supabase-js';

// Securely get the Supabase URL and Key from environment variables.
// Vite requires environment variables exposed to the client to be prefixed with `VITE_`.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// This flag is used by the UI to show a friendly configuration message
// if the environment variables are not set.
export const isSupabaseConfigured = supabaseUrl && supabaseAnonKey;

// The client is initialized here. The app logic in `App.tsx` checks `isSupabaseConfigured`
// and will render a setup screen if the variables are missing, preventing runtime errors.
export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '');