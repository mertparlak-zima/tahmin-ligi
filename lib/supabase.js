// Server-side Supabase client (service role). Sadece API fonksiyonlarında kullanılır.

import { createClient } from '@supabase/supabase-js'

let client = null

export function getSupabase() {
  if (client) return client
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY ortam değişkenleri tanımlı değil.')
  }
  client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return client
}
