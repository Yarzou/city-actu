import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { isAdminUser } from '@/lib/authz'

export const runtime = 'nodejs'

// `cities` y figure depuis la gestion multi-villes. Attention : `sources.city_id` et
// `articles.city_id` sont en ON DELETE CASCADE, donc supprimer une ville efface ses
// sources et ses articles. L'interface ne propose le bouton que sur une ville dépubliée
// et énonce le décompte avant confirmation.
const ALLOWED_TABLES = ['categories', 'sources', 'articles', 'import_summaries', 'cities'] as const
type AllowedTable = typeof ALLOWED_TABLES[number]

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }
  if (!(await isAdminUser(supabase, user.id))) {
    return NextResponse.json({ error: 'Accès administrateur requis' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const { table, id } = body as { table?: string; id?: number }

  if (!table || !ALLOWED_TABLES.includes(table as AllowedTable)) {
    return NextResponse.json({ error: 'Table non autorisée' }, { status: 400 })
  }

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Écarter UN article n'est pas une suppression mais un masquage. Un DELETE ne tiendrait
  // pas : l'ingestion est en upsert, et le prochain cron recréerait la ligne tant que l'URL
  // reste dans le flux source. `is_duplicate` est exclu de la liste blanche des champs
  // rafraîchissables (lib/fetchers/index.ts), donc le cron ne le remet jamais à false ; et
  // il masque déjà l'article partout — politique RLS « Public read articles », feed, digest
  // et export .ics filtrent tous sur NOT is_duplicate.
  //
  // La purge de masse (pas d'`id`) reste un vrai DELETE : c'est une remise à zéro assumée,
  // qui efface donc aussi les masquages.
  const query =
    id !== undefined
      ? table === 'articles'
        ? admin.from(table).update({ is_duplicate: true }).eq('id', id)
        : admin.from(table).delete().eq('id', id)
      : admin.from(table).delete().neq('id', 0)

  const { error } = await query

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
