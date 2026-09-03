import { createClient } from '@/lib/supabase/server'
import { buildEventIcs, buildIcsFilename } from '@/lib/calendar/ics'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * Sert un événement au format iCalendar, pour le bouton « Ajouter au calendrier ».
 *
 * Route publique : les articles sont déjà en lecture publique (policy
 * « Public read articles » avec `USING (NOT is_duplicate)`), donc le client serveur
 * ordinaire suffit — la RLS écarte d'elle-même les doublons, sans filtre explicite
 * ni clé de service.
 */
export async function GET(request: Request, { params }: RouteParams) {
  const { id: rawId } = await params

  // Le lien pointe sur /api/calendar/123.ics : l'extension aide iOS à reconnaître
  // le type avant même de lire les en-têtes.
  //
  // Contrôle sur les chiffres plutôt qu'un simple Number() : celui-ci accepte
  // l'hexadécimal, la notation exponentielle et les espaces, si bien que
  // « 0x10.ics » servirait l'article 16. Sans danger — la donnée est publique — mais
  // un même article accessible par plusieurs URL n'a aucune raison d'être.
  const idPart = rawId.replace(/\.ics$/, '')
  if (!/^[1-9]\d*$/.test(idPart)) {
    return new Response('Identifiant invalide', { status: 400 })
  }
  const id = Number(idPart)

  const supabase = await createClient()
  const { data: article } = await supabase
    .from('articles')
    .select('id, title, content_preview, url, published_at, event_end_date, location, city:cities(name)')
    .eq('id', id)
    .single()

  if (!article) {
    return new Response('Article introuvable', { status: 404 })
  }

  // Sans date de début, il n'y a pas d'événement à créer. Le bouton est masqué dans
  // ce cas côté carte, mais la route reste appelable directement.
  if (!article.published_at) {
    return new Response("Cet article n'a pas de date", { status: 422 })
  }

  const city = article.city as unknown as { name: string } | null

  const ics = buildEventIcs(
    {
      id: article.id,
      title: article.title,
      description: article.content_preview,
      // Repli sur la ville : les articles collectés avant la migration 015 et les
      // sources RSS n'ont pas de lieu, autant situer au moins la commune.
      location: article.location ?? city?.name ?? null,
      url: article.url,
      start: new Date(article.published_at),
      end: article.event_end_date ? new Date(article.event_end_date) : null,
    },
    new URL(request.url).host
  )

  return new Response(ics, {
    headers: {
      // Déclaration explicite obligatoire : `X-Content-Type-Options: nosniff` est posé
      // sur tout le site, sans ce type correct les applis d'agenda ignoreraient le fichier.
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="${buildIcsFilename(article.title, article.id)}"`,
      'Cache-Control': 'no-store',
    },
  })
}
