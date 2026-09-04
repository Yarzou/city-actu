import { createClient } from '@supabase/supabase-js'
import { fetchRssFeed } from './rss'
import { fetchScrapingSource } from './scraper'
import { fetchOpenDataSource } from './opendata'
import { chunk } from './batch'
import type { FetchedItem } from './rss'
import type { Source } from '@/lib/types'

// Use service role to bypass RLS during cron writes
function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export interface InsertedArticle {
  title: string
  content_preview?: string
}

export interface FetchResult {
  sourceId: number
  fetched: number
  /** Articles réellement créés. Seuls ceux-là nourrissent `insertedArticles`. */
  inserted: number
  /** Articles déjà connus dont au moins un champ a changé à la source. */
  updated: number
  /** Articles déjà connus et identiques : aucune écriture. */
  unchanged: number
  /** Items sans URL, plus les insertions perdues à la course avec une autre source. */
  skipped: number
  errors: string[]
  insertedArticles: InsertedArticle[]
}

/**
 * Les seuls champs qu'un refetch a le droit de rafraîchir sur un article déjà connu.
 *
 * Sont volontairement absents, et doivent le rester :
 * - `fetched_at`   : c'est la date de PREMIÈRE vision. Elle sert de tri secondaire dans le
 *                    feed et de repli de `published_at` dans les digests. La rafraîchir
 *                    ferait remonter un vieil article sur un simple changement de titre, et
 *                    daterait « aujourd'hui » un article sans date de publication.
 * - `is_duplicate` : porte la décision d'un admin de masquer l'article. La rejouer
 *                    annulerait ce masquage à chaque passage du cron.
 * - `source_id` / `city_id` / `category_id` : quand deux sources exposent la même URL, la
 *                    plus anciennement déclarée gagne (cf. le tri par id ci-dessous). Les
 *                    réécrire ferait basculer propriété et catégorie à chaque cron. Elles
 *                    voyagent bien dans le payload d'une mise à jour (`IDENTITY`, contrainte
 *                    NOT NULL), mais recopiées depuis la ligne stockée, donc inchangées.
 * - `title_search` / `content_preview_search` : colonnes GENERATED, écriture interdite ;
 *                    Postgres les recalcule seul dès que `title` change.
 */
const REFRESHABLE = ['title', 'content_preview', 'image_url', 'published_at', 'event_end_date', 'location'] as const

type Refreshable = (typeof REFRESHABLE)[number]

/**
 * Colonnes NOT NULL sans DEFAULT sur `articles`, hors `title` et `url` que tout patch
 * porte déjà. Un patch doit les transporter — non pas pour les modifier, mais pour que le
 * tuple proposé à l'INSERT franchisse la validation NOT NULL. Voir `updateKnown`.
 */
const IDENTITY = ['source_id', 'city_id', 'category_id'] as const

type Identity = (typeof IDENTITY)[number]
type StoredArticle = { url: string } & Record<Identity, number> & Record<Refreshable, string | null>

const DATE_FIELDS = new Set<Refreshable>(['published_at', 'event_end_date'])

/** Borne la longueur d'un `.in('url', ...)`, qui voyage en query string. */
const URL_BATCH_SIZE = 50

/** Une chaîne vide ou blanche vaut absence : une source muette ne doit rien effacer. */
function present(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== ''
}

/**
 * Compare deux instants par valeur, jamais par texte : Postgres rend
 * "2026-01-05T18:00:00+00:00" là où les fetchers produisent "2026-01-05T18:00:00.000Z".
 * Comparer les chaînes classerait tout le lot en « modifié » à chaque exécution et
 * relancerait N écritures inutiles.
 */
function sameInstant(current: string | null, next: string): boolean {
  if (!current) return false
  const a = Date.parse(current)
  const b = Date.parse(next)
  return Number.isFinite(a) && Number.isFinite(b) && a === b
}

export async function fetchAllSources(citySlug?: string): Promise<FetchResult[]> {
  const supabase = getServiceClient()

  // Ordre explicite, et non celui que Postgres renvoie au hasard : plusieurs sources
  // peuvent exposer la même page (le flux RSS de la mairie et le scraping de /agenda
  // pointent sur les mêmes nodes). articles.url étant UNIQUE, la première passée gagne
  // et les suivantes sont comptées en doublons. Trier par id fait gagner la plus
  // anciennement déclarée — ici le scraping de /agenda, qui va chercher la vraie date
  // d'événement sur la page détail, là où le RSS ne porte que la date de publication.
  let query = supabase
    .from('sources')
    .select('*, city:cities(id,slug), category:categories(id,slug)')
    .eq('active', true)
    .order('id', { ascending: true })

  if (citySlug) {
    const { data: city } = await supabase.from('cities').select('id').eq('slug', citySlug).single()
    if (city) query = query.eq('city_id', city.id)
  }

  const { data: sources, error } = await query
  if (error || !sources) {
    console.error('[Orchestrator] Impossible de charger les sources:', error)
    return []
  }

  const results: FetchResult[] = []
  for (const source of sources as Source[]) {
    const result = await fetchSource(source)
    results.push(result)
    await sleep(500)
  }
  return results
}

export async function fetchSourceById(sourceId: number): Promise<FetchResult[]> {
  const supabase = getServiceClient()

  const { data: source, error } = await supabase
    .from('sources')
    .select('*, city:cities(id,slug), category:categories(id,slug)')
    .eq('id', sourceId)
    .single()

  if (error || !source) {
    console.error('[Orchestrator] Source introuvable:', sourceId, error)
    return []
  }

  return [await fetchSource(source as Source)]
}

async function fetchSource(source: Source): Promise<FetchResult> {
  const result: FetchResult = {
    sourceId: source.id,
    fetched: 0,
    inserted: 0,
    updated: 0,
    unchanged: 0,
    skipped: 0,
    errors: [],
    insertedArticles: [],
  }

  // Persists the health of this fetch on the source row before returning.
  // Every exit path goes through here so a broken source stops failing silently.
  const finish = async (): Promise<FetchResult> => {
    await recordFetchHealth(source, result)
    return result
  }

  // Guard: scraping sources without config can't be fetched
  if (source.type === 'scraping' && !source.scraping_config) {
    result.errors.push(`Config scraping manquante pour "${source.name}" — ajoutez les sélecteurs CSS dans l'admin`)
    return finish()
  }

  const items =
    source.type === 'rss'      ? await fetchRssFeed(source)      :
    source.type === 'opendata' ? await fetchOpenDataSource(source) :
                                 await fetchScrapingSource(source)

  result.fetched = items.length
  if (items.length === 0) {
    if (!result.errors.length) {
      const hint = source.type === 'scraping'
        ? "vérifiez l'URL et les sélecteurs"
        : "vérifiez l'URL de la source"
      result.errors.push(`Aucun article récupéré pour "${source.name}" — ${hint}`)
    }
    return finish()
  }

  await persistItems(source, items, result)

  return finish()
}

/**
 * Écrit le lot en base : ce qui est nouveau est créé, ce qui existe est corrigé, le reste
 * n'est pas touché. Trois requêtes par source (lecture, insertion, mise à jour) au lieu
 * d'un aller-retour par article — le budget du cron est de 60 s sur le plan Hobby, dont
 * l'essentiel part déjà en réseau vers les sites sources.
 */
async function persistItems(source: Source, items: FetchedItem[], result: FetchResult): Promise<void> {
  const supabase = getServiceClient()

  // Dédoublonnage intra-lot : un flux peut exposer deux fois la même URL, et ON CONFLICT
  // ne protège pas d'un doublon interne à la même commande ("cannot affect row a second
  // time", Postgres 21000). Le premier vu gagne, comme entre deux sources.
  const byUrl = new Map<string, FetchedItem>()
  for (const item of items) {
    // Les items sans URL et les doublons internes tombent tous deux en `skipped`, pour que
    // fetched = inserted + updated + unchanged + skipped reste vrai.
    if (!item.url || byUrl.has(item.url)) { result.skipped++; continue }
    byUrl.set(item.url, item)
  }
  const batch = [...byUrl.values()]
  if (batch.length === 0) return

  // Une lecture pour tout le lot. Découpée : un .in() de quelques centaines d'URLs longues
  // dépasserait la longueur de query string acceptée (414).
  const existing = new Map<string, StoredArticle>()
  for (const urls of chunk([...byUrl.keys()], URL_BATCH_SIZE)) {
    const { data, error } = await supabase
      .from('articles')
      // Une seule chaîne littérale : PostgREST type le retour en analysant ce texte, une
      // concaténation le dégrade en `GenericStringError`.
      .select('url, source_id, city_id, category_id, title, content_preview, image_url, published_at, event_end_date, location')
      .in('url', urls)

    if (error) {
      result.errors.push(`Lecture des articles existants : ${error.message}`)
      return
    }
    for (const row of (data ?? []) as StoredArticle[]) existing.set(row.url, row)
  }

  await insertNew(supabase, source, batch.filter((i) => !existing.has(i.url)), result)
  await updateKnown(supabase, batch, existing, result)
}

async function insertNew(
  supabase: ReturnType<typeof getServiceClient>,
  source: Source,
  fresh: FetchedItem[],
  result: FetchResult,
): Promise<void> {
  if (fresh.length === 0) return

  const { data: created, error } = await supabase
    .from('articles')
    .upsert(
      fresh.map((item) => ({
        source_id:       source.id,
        city_id:         source.city_id,
        category_id:     source.category_id,
        title:           item.title,
        content_preview: item.content_preview,
        url:             item.url,
        image_url:       item.image_url,
        published_at:    item.published_at,
        event_end_date:  item.event_end_date ?? null,
        location:        item.location ?? null,
        // fetched_at et is_duplicate absents : ils prennent leur DEFAULT.
      })),
      // DO NOTHING : qu'une autre source ait pris l'URL entre notre lecture et notre
      // écriture ne doit ni faire échouer le lot entier, ni écraser la ligne gagnante.
      { onConflict: 'url', ignoreDuplicates: true }
    )
    .select('url')

  if (error) {
    result.errors.push(`Insertion du lot : ${error.message}`)
    return
  }

  // Le RETURNING d'un DO NOTHING ne rend que les lignes réellement insérées : le compteur
  // est exact, et insertedArticles — qui alimente le résumé Groq du rafraîchissement
  // manuel — ne reçoit que du vraiment nouveau.
  const insertedUrls = new Set((created ?? []).map((row) => row.url as string))
  for (const item of fresh) {
    if (insertedUrls.has(item.url)) {
      result.inserted++
      result.insertedArticles.push({ title: item.title, content_preview: item.content_preview ?? undefined })
    } else {
      result.skipped++
    }
  }
}

async function updateKnown(
  supabase: ReturnType<typeof getServiceClient>,
  batch: FetchedItem[],
  existing: Map<string, StoredArticle>,
  result: FetchResult,
): Promise<void> {
  // Payload reconstruit à partir de la ligne stockée, et non du seul fetch : toutes les
  // lignes du lot partagent ainsi le même jeu de clés — PostgREST refuse l'inverse
  // (PGRST102) — sans jamais réintroduire de NULL. Un champ que la source n'expose pas ce
  // jour-là est réécrit à sa valeur actuelle.
  const patches: Record<string, string | number | null>[] = []

  for (const item of batch) {
    const stored = existing.get(item.url)
    if (!stored) continue

    const merged: Record<string, string | number | null> = { url: item.url }
    // Recopiées telles quelles depuis la ligne existante, jamais depuis `source` : voir
    // le commentaire de l'upsert plus bas. C'est ce qui garde la propriété à la source la
    // plus anciennement déclarée quand deux sources exposent la même URL.
    for (const field of IDENTITY) merged[field] = stored[field]
    let changed = false

    for (const field of REFRESHABLE) {
      const next    = item[field] ?? null
      const current = stored[field]

      if (!present(next)) { merged[field] = current; continue }

      const same = DATE_FIELDS.has(field) ? sameInstant(current, next) : current === next
      merged[field] = same ? current : next
      if (!same) changed = true
    }

    if (changed) patches.push(merged)
    else result.unchanged++
  }

  if (patches.length === 0) return

  // `upsert` = `INSERT … ON CONFLICT (url) DO UPDATE SET …`, et Postgres valide les
  // contraintes NOT NULL du tuple proposé **avant** de détecter le conflit. Omettre une
  // colonne NOT NULL sans DEFAULT fait donc échouer le lot entier — « null value in
  // column "source_id" violates not-null constraint » — même quand la ligne existe et que
  // l'intention n'était qu'une mise à jour. D'où `IDENTITY` dans le payload.
  //
  // La protection ne vient donc plus de l'omission pour ces trois colonnes, mais de leur
  // **valeur** : elles sont recopiées depuis la ligne stockée, si bien que
  // `source_id = EXCLUDED.source_id` réécrit la valeur déjà en place. Ne jamais y mettre
  // `source.id` : la propriété et la catégorie basculeraient à chaque cron dès que deux
  // sources exposent la même URL.
  //
  // is_duplicate et fetched_at restent, eux, hors du payload : ils ont un DEFAULT, donc le
  // tuple proposé est valide sans eux, et leur absence du SET les laisse intacts. C'est ce
  // qui rend le masquage d'un article persistant face au cron.
  const { error } = await supabase.from('articles').upsert(patches, { onConflict: 'url' })

  if (error) result.errors.push(`Mise à jour du lot : ${error.message}`)
  else result.updated += patches.length
}

/**
 * Writes the outcome of a fetch onto the source row so the admin panel can show
 * a health badge. Never throws: a monitoring write must not break ingestion.
 */
async function recordFetchHealth(source: Source, result: FetchResult): Promise<void> {
  const ok = result.errors.length === 0 && result.fetched > 0

  try {
    await getServiceClient()
      .from('sources')
      .update({
        last_fetch_at:        new Date().toISOString(),
        last_fetch_status:    ok ? 'ok' : 'error',
        last_fetch_error:     ok ? null : (result.errors[0]?.slice(0, 500) ?? null),
        consecutive_failures: ok ? 0 : (source.consecutive_failures ?? 0) + 1,
      })
      .eq('id', source.id)
  } catch (err) {
    console.error(`[Orchestrator] Impossible d'enregistrer la santé de "${source.name}":`, err)
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
