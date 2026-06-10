/* ============================================================
   SUPABASE CONFIG — shared/js/supabase.js
   ⚠️  Ganti SUPABASE_URL dan SUPABASE_KEY dengan milik lu!
   Jangan share file ini ke publik / upload ke GitHub
   ============================================================ */

const SUPABASE_URL = 'https://cbohctaafmiudbqabjpt.supabase.co';
const SUPABASE_KEY = 'sb_publishable_L9Y4W_VJTFVWNrYPx_4HUw_mEdLVhsA';

// Import Supabase dari CDN
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
