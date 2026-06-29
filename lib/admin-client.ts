import type { SupabaseClient } from '@supabase/supabase-js'

interface AdminMeResponse {
  isAdmin?: boolean
}

export async function resolveAdminStatusClient(supabase: SupabaseClient, userId: string): Promise<boolean> {
  let adminFromApi = false

  try {
    const res = await fetch('/api/admin/me', { cache: 'no-store' })
    if (res.ok) {
      const data = await res.json() as AdminMeResponse
      adminFromApi = Boolean(data.isAdmin)
      if (adminFromApi) return true
    }
  } catch (error) {
    console.error('[Admin] impossible de vérifier /api/admin/me:', error)
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', userId)
    .maybeSingle()

  if (error) {
    console.error('[Admin] impossible de lire profiles.is_admin:', error)
    return adminFromApi
  }

  return Boolean((data as { is_admin?: boolean } | null)?.is_admin) || adminFromApi
}
