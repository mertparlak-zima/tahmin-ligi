// Server-side Supabase client. Service role key varsa tam yetkili; yoksa
// anon key'e düşer (salt-okunur — RLS policy'ler yazmayı engeller, #7).

import { createClient } from '@supabase/supabase-js'

let client = null
let readonlyMode = false

export function getSupabase() {
  if (client) return client
  const url = process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url) {
    throw new Error('SUPABASE_URL ortam değişkeni tanımlı değil.')
  }
  if (serviceKey) {
    client = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  } else if (anonKey) {
    // #7: key'siz geliştirici — anon client ile salt-okunur (RLS korur).
    readonlyMode = true
    client = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  } else {
    throw new Error(
      'SUPABASE_URL tanımlı ama anahtar yok. ' +
      'Tam yığın için SUPABASE_SERVICE_ROLE_KEY, salt-okunur için SUPABASE_ANON_KEY gerekir. ' +
      'Demo mod için: npm run demo',
    )
  }
  return client
}

/** true = anon key ile bağlandık (yazma uçları 503 dönmeli). */
export function isReadonly() {
  getSupabase() // client'ı kur (henüz kurılmadıysa)
  return readonlyMode
}
