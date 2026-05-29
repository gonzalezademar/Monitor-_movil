import { createClient } from '@supabase/supabase-js';
// Conexión principal del cliente Supabase actualizada en 2026-05-25

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || 'https://ntacbbhtryyhxpnpycxc.supabase.co').trim().replace(/\/$/, '');
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im50YWNiYmh0cnl5aHhwbnB5Y3hjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3NDUzMjYsImV4cCI6MjA5NTMyMTMyNn0.dq0udduiAFV-za3SEeLNgNPevtWnkhAM3daX1gY966o').trim();

if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
  console.log('Using default Supabase connection credentials.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
