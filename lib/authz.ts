import type { SupabaseClient } from '@supabase/supabase-js'

export async function isAdminUser(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', userId)
    .maybeSingle()

  if (error || !data) return false
  return Boolean((data as { is_admin?: boolean }).is_admin)
}
