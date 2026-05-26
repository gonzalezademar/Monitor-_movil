import { createClient } from '@supabase/supabase-js';
// Conexión principal del cliente Supabase actualizada en 2026-05-25

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://ntacbbhtryyhxpnpycxc.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_gjcB-WqKu-DVqT-maSPf3g_nFPh49lR';

if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
  console.log('Using default Supabase connection credentials.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
