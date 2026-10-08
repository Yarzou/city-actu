'use client'

import { useCallback, useEffect, useState } from 'react'
import { Sparkles, RefreshCw, Trash2, ChevronDown, ChevronUp, Mail } from 'lucide-react'
import { cn, formatDigestHtml } from '@/lib/utils'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Notice } from '@/components/ui/Notice'
import { buttonClass } from '@/components/ui/Button'
import type { LatestDigest } from '@/lib/digest/latest'

interface AIDigestTabProps {
  citySlug: string
  /** Nom affiché de la ville : titre de la carte (« La semaine à … »). */
  cityName?: string
  /**
   * Le dernier résumé est visible de tous — c'est tout l'intérêt de l'onglet pour un
   * visiteur anonyme. Restent réservés à une session l'historique (`history` répond
   * 401) et l'envoi par mail (il part vers l'adresse du compte) : ils ne sont pas
   * *affichés en erreur* mais **absents**, sinon l'onglet accueillerait le visiteur
   * par un « Vous devez être connecté » alors que le contenu, lui, est bien là.
   */
  isAuthenticated?: boolean
  /** Suppression d'un résumé de l'historique. */
  canManageContent?: boolean
  /**
   * Déclenchement d'une génération, donc d'un appel au LLM facturé.
   * `GET /api/digest/[citySlug]` répond 403 aux non-administrateurs : c'est là qu'est
   * la vraie garde, celle-ci ne fait que ne pas proposer un bouton condamné.
   */
  canGenerate?: boolean
  /**
   * Dernier résumé préparé par le rendu serveur de la page (`?tab=ia` en URL directe).
   *
   * `undefined` = rien de préparé, l'onglet appelle `latest` lui-même — c'est le cas
   * d'un changement d'onglet côté client. `null` = le serveur a regardé, il n'y a pas
   * encore de résumé : il ne faut alors **pas** relancer la requête, sinon le gain est
   * perdu et le message « Aucun résumé » clignote.
   */
  initialDigest?: LatestDigest | null
}

/**
 * Une ligne d'historique. Elle ne porte plus le corps du résumé : la liste renvoyait
 * `summary_text` pour ses 20 lignes, soit ~50 ko de JSON téléchargés et rendus en entier
 * à chaque ouverture de l'onglet, alors que seuls la date et le compteur sont visibles
 * avant dépliage. Les corps arrivent à l'unité dans `bodies`.
 */
interface DigestSummary {
  id: number
  articleCount: number
  createdAt: string
}

interface DigestCacheEntry {
  /** Distingue « rien en cache » de « chargé, et il n'y a pas de résumé ». */
  latestLoaded: boolean
  latest: LatestDigest | null
  /** `null` = l'historique n'a jamais été déplié. */
  summaries: DigestSummary[] | null
  bodies: Record<number, string>
}

/**
 * Cache par ville, **hors du composant**.
 *
 * `CityHomePage` monte le corps de l'onglet en `{tab === 'ia' && <AIDigestTab …>}` : un
 * aller-retour Actus → IA → Actus → IA le démonte et le remonte, et refaisait donc tout le
 * chargement. Un state interne ne peut rien y faire, il part avec le composant ; il faut
 * que la mémoire survive au démontage, d'où un module.
 *
 * Il vit le temps de l'onglet du navigateur, ce qui est exactement la portée voulue : un
 * rechargement de page repart du résumé rendu par le serveur, plus frais par construction.
 * Le seul écart possible est un résumé régénéré **par quelqu'un d'autre** pendant la
 * session ; la génération faite ici met le cache à jour elle-même.
 */
const digestCache = new Map<string, DigestCacheEntry>()

export function AIDigestTab({
  citySlug,
  cityName = 'La Chap’',
  isAuthenticated = false,
  canManageContent = false,
  canGenerate = false,
  initialDigest,
}: AIDigestTabProps) {
  const cached = digestCache.get(citySlug)

  // On démarre à l'état final — sans « Chargement… » ni requête au montage — si le serveur
  // a préparé quelque chose (résumé, ou absence constatée) **ou** si un montage précédent
  // de cet onglet l'a déjà chargé. La prop du serveur gagne : elle vient d'un rendu plus
  // récent que le cache.
  const seeded = initialDigest !== undefined || (cached?.latestLoaded ?? false)
  const seed = initialDigest !== undefined ? initialDigest : (cached?.latest ?? null)

  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>(
    seed ? 'done' : 'idle'
  )
  const [sendingEmail, setSendingEmail] = useState(false)
  const [initialLoading, setInitialLoading] = useState(!seeded)
  const [digest, setDigest] = useState<string | null>(seed?.digest ?? null)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(
    seeded && !seed ? 'Aucun résumé à la demande disponible.' : null
  )
  const [articleCount, setArticleCount] = useState<number | null>(seed?.articleCount ?? null)
  const [createdAt, setCreatedAt] = useState<string | null>(seed?.createdAt ?? null)
  // Identifie la ligne d'historique correspondant au résumé affiché : c'est ce qui permet
  // de savoir, après une suppression, s'il faut remplacer l'affichage principal.
  const [latestId, setLatestId] = useState<number | null>(seed?.id ?? null)
  const [summaries, setSummaries] = useState<DigestSummary[]>(cached?.summaries ?? [])
  const [historyLoaded, setHistoryLoaded] = useState(cached?.summaries != null)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState<string | null>(null)
  // Replié par défaut, et rien n'est chargé avant le premier dépliage : un administrateur
  // qui ouvre l'onglet ne déclenche plus aucune requête. Il était ouvert d'emblée, ce qui
  // rendait vingt résumés que personne n'avait demandés.
  const [historyOpen, setHistoryOpen] = useState(false)
  const [deletingSummaryId, setDeletingSummaryId] = useState<number | null>(null)
  const [summaryToDelete, setSummaryToDelete] = useState<DigestSummary | null>(null)
  // Corps des résumés de l'historique, chargés à l'unité au dépliage d'une ligne.
  const [bodies, setBodies] = useState<Record<number, string>>(cached?.bodies ?? {})
  const [expandedSummaryId, setExpandedSummaryId] = useState<number | null>(null)
  const [bodyLoadingId, setBodyLoadingId] = useState<number | null>(null)
  const [bodyError, setBodyError] = useState<string | null>(null)

  /**
   * Fusionne dans l'entrée de cache de la ville. Un seul point d'écriture : les six
   * endroits qui font évoluer l'état (chargement, dépliage, génération, suppression)
   * doivent tous s'y refléter, sinon un remontage ressort une version périmée.
   */
  const remember = useCallback((patch: Partial<DigestCacheEntry>) => {
    const current = digestCache.get(citySlug) ?? {
      latestLoaded: false,
      latest: null,
      summaries: null,
      bodies: {},
    }
    digestCache.set(citySlug, { ...current, ...patch })
  }, [citySlug])

  const loadHistory = useCallback(async () => {
    if (!isAuthenticated) return
    setHistoryLoading(true)
    setHistoryError(null)
    try {
      const res = await fetch(`/api/digest/${citySlug}/history?limit=20`)
      const data = await res.json()
      if (res.status === 401) {
        setHistoryError('Vous devez être connecté pour consulter l’historique des résumés.')
        setSummaries([])
        return
      }
      if (!res.ok) {
        setHistoryError(data.error ?? 'Erreur lors du chargement de l’historique.')
        setSummaries([])
        return
      }
      const rows = Array.isArray(data.summaries) ? data.summaries : []
      setSummaries(rows)
      setHistoryLoaded(true)
      remember({ summaries: rows })
    } catch {
      setHistoryError('Erreur réseau. Veuillez réessayer.')
      setSummaries([])
    } finally {
      setHistoryLoading(false)
    }
  }, [citySlug, isAuthenticated, remember])

  const loadLatest = useCallback(async () => {
    setInitialLoading(true)
    setError(null)
    setInfo(null)
    try {
      const res = await fetch(`/api/digest/${citySlug}/latest`)
      const data = await res.json()

      // Plus de cas 401 : `latest` est ouverte aux visiteurs anonymes.
      if (!res.ok) {
        setError(data.error ?? 'Erreur lors du chargement du dernier résumé.')
        setStatus('error')
        return
      }

      if (data.digest) {
        setDigest(data.digest)
        setArticleCount(data.articleCount ?? null)
        setCreatedAt(data.createdAt ?? null)
        setLatestId(data.id ?? null)
        setStatus('done')
        remember({
          latestLoaded: true,
          latest: {
            id: data.id,
            digest: data.digest,
            articleCount: data.articleCount ?? 0,
            source: data.source ?? 'on_demand',
            createdAt: data.createdAt,
          },
        })
      } else {
        setDigest(null)
        setArticleCount(null)
        setCreatedAt(null)
        setLatestId(null)
        setStatus('idle')
        setInfo(data.message ?? 'Aucun résumé à la demande disponible.')
        remember({ latestLoaded: true, latest: null })
      }
    } catch {
      setError('Erreur réseau. Veuillez réessayer.')
      setStatus('error')
      // Rien mis en cache : une panne réseau ne doit pas figer l'onglet sur son erreur
      // pour le reste de la session.
    } finally {
      setInitialLoading(false)
    }
  }, [citySlug, remember])

  useEffect(() => {
    // Déjà dans le HTML (prop du serveur) ou déjà chargé par un montage précédent :
    // aucune requête. C'est tout l'intérêt de la prop et du cache — l'historique, lui,
    // attend son dépliage.
    if (seeded) {
      // La prop du serveur est plus fraîche que le cache : on l'y verse pour que le
      // prochain montage en profite sans requête.
      if (initialDigest !== undefined) remember({ latestLoaded: true, latest: initialDigest })
      return
    }
    queueMicrotask(() => void loadLatest())
    // `initialDigest` est volontairement hors des dépendances : c'est une valeur figée du
    // rendu serveur, la relire ne changerait rien et la comparaison d'objet relancerait
    // l'effet à chaque rendu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seeded, loadLatest, remember])

  /** Déplie une ligne d'historique, en chargeant son corps au premier passage. */
  const toggleSummary = useCallback(async (summaryId: number) => {
    setBodyError(null)
    if (expandedSummaryId === summaryId) {
      setExpandedSummaryId(null)
      return
    }
    setExpandedSummaryId(summaryId)
    if (bodies[summaryId] !== undefined) return

    setBodyLoadingId(summaryId)
    try {
      const res = await fetch(`/api/digest/${citySlug}/history?id=${summaryId}`)
      const data = await res.json()
      if (!res.ok || !data.summary?.digest) {
        setBodyError(data.error ?? 'Erreur lors du chargement de ce résumé.')
        setExpandedSummaryId(null)
        return
      }
      // Calculé hors de l'updater : un updater de `setState` doit rester pur (React peut
      // le rejouer), et `bodies` est déjà dans les dépendances de ce callback.
      const nextBodies = { ...bodies, [summaryId]: data.summary.digest as string }
      setBodies(nextBodies)
      remember({ bodies: nextBodies })
    } catch {
      setBodyError('Erreur réseau. Veuillez réessayer.')
      setExpandedSummaryId(null)
    } finally {
      setBodyLoadingId(null)
    }
  }, [bodies, citySlug, expandedSummaryId, remember])

  async function generate() {
    setStatus('loading')
    setError(null)
    setInfo(null)

    try {
      const res = await fetch(`/api/digest/${citySlug}`)
      const data = await res.json()

      if (res.status === 401) {
        setError('Vous devez être connecté pour générer un résumé.')
        setStatus('error')
        return
      }
      if (res.status === 403) {
        setError('Seuls les administrateurs peuvent générer un résumé IA.')
        setStatus('error')
        return
      }
      if (!res.ok) {
        setError(data.error ?? 'Erreur lors de la génération.')
        setStatus('error')
        return
      }
      if (data.message) {
        setError(data.message)
        setStatus('error')
        return
      }

      setDigest(data.digest)
      setArticleCount(data.articleCount ?? null)
      setCreatedAt(data.createdAt ?? null)
      setLatestId(data.id ?? null)
      setStatus('done')
      // Le cache doit suivre la génération, sinon un aller-retour entre onglets
      // ressortirait le résumé d'avant.
      remember({
        latestLoaded: true,
        latest: {
          id: data.id,
          digest: data.digest,
          articleCount: data.articleCount ?? 0,
          source: 'on_demand',
          createdAt: data.createdAt,
        },
      })

      // L'historique n'est mis à jour que s'il a déjà été chargé : y insérer une ligne
      // seule alors qu'il n'a jamais été ouvert afficherait « Historique (1) » avec un
      // compteur faux. Non chargé, il partira chercher la liste complète au dépliage.
      if (historyLoaded && data.id && data.createdAt && data.digest) {
        const nextSummaries = [{
          id: data.id as number,
          articleCount: (data.articleCount ?? 0) as number,
          createdAt: data.createdAt as string,
        }, ...summaries.filter((summary) => summary.id !== data.id)]
        setSummaries(nextSummaries)
        // Le corps vient d'arriver dans la réponse : le mémoriser évite un aller-retour
        // si l'utilisateur déplie la ligne qu'il vient de générer.
        const nextBodies = { ...bodies, [data.id]: data.digest as string }
        setBodies(nextBodies)
        remember({ summaries: nextSummaries, bodies: nextBodies })
      } else if (historyLoaded) {
        void loadHistory()
      }
    } catch {
      setError('Erreur réseau. Veuillez réessayer.')
      setStatus('error')
    }
  }

  async function sendByEmail() {
    if (!digest) return
    setSendingEmail(true)
    setInfo(null)
    setError(null)

    try {
      const res = await fetch(`/api/digest/${citySlug}/send-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          digest,
          articleCount,
          createdAt,
        }),
      })
      const data = await res.json()

      if (res.status === 401) {
        setError('Vous devez être connecté pour envoyer le résumé par email.')
        return
      }
      if (!res.ok) {
        setError(data.error ?? 'Erreur lors de l’envoi email.')
        return
      }

      setInfo('Résumé IA envoyé par email.')
    } catch {
      setError('Erreur réseau. Veuillez réessayer.')
    } finally {
      setSendingEmail(false)
    }
  }

  async function deleteSummary(summary: DigestSummary) {
    setDeletingSummaryId(summary.id)
    setHistoryError(null)
    try {
      const res = await fetch('/api/admin/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table: 'import_summaries', id: summary.id }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        setHistoryError(data.error ?? 'Erreur lors de la suppression du résumé.')
        return
      }

      const nextSummaries = summaries.filter((item) => item.id !== summary.id)
      const nextBodies = { ...bodies }
      delete nextBodies[summary.id]
      setSummaries(nextSummaries)
      setBodies(nextBodies)
      remember({ summaries: nextSummaries, bodies: nextBodies })
      if (expandedSummaryId === summary.id) setExpandedSummaryId(null)

      // Le résumé supprimé était celui affiché en haut : on redemande le dernier au
      // serveur plutôt que de promouvoir la ligne suivante de l'historique — elle ne
      // porte plus son corps depuis que la liste ne renvoie que des métadonnées.
      // Comparaison par `id` et non plus par couple (date, corps), maintenant que
      // `latest` renvoie l'identifiant de la ligne.
      if (latestId === summary.id) {
        void loadLatest()
      }
    } catch {
      setHistoryError('Erreur réseau. Veuillez réessayer.')
    } finally {
      setDeletingSummaryId(null)
      setSummaryToDelete(null)
    }
  }

  // Corps d'un résumé (HTML assaini par `formatDigestHtml`) : intertitres de jour dans
  // l'accent, listes à puces, texte courant à 17 px — c'est un texte à lire.
  const DIGEST_BODY =
    'space-y-3 text-body text-ink [&_h3]:mt-4 [&_h3]:text-subhead [&_h3]:font-bold [&_h3]:text-accent [&_h3:first-child]:mt-0 [&_li]:mb-1 [&_strong]:font-semibold [&_ul]:list-disc [&_ul]:pl-5'

  const generatedLabel = createdAt
    ? new Date(createdAt).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', weekday: 'long', hour: '2-digit', minute: '2-digit' })
    : null

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <article className="overflow-hidden rounded-[22px] bg-card shadow-lift">
        <header className="flex items-center gap-3 p-4">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-fill text-white">
            <Sparkles className="size-[22px]" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 className="text-headline text-ink">La semaine à {cityName}</h2>
            <p className="text-footnote text-ink-muted">
              {status === 'done' && generatedLabel
                ? `Généré ${generatedLabel}${articleCount !== null ? ` · ${articleCount} actus` : ''}`
                : 'Les actus de la semaine, du lundi au dimanche'}
            </p>
          </div>
        </header>

        <div className="px-4 pb-5">
          {initialLoading && (
            <p className="text-subhead text-ink-muted">Chargement du dernier résumé…</p>
          )}
          {!initialLoading && status === 'idle' && info && (
            <p className="text-subhead text-ink-muted">
              {info}
              {/* Sans ce complément, un lecteur non-admin voit « Aucun résumé disponible »
                  sans aucun bouton, donc sans savoir quoi en attendre. */}
              {!canGenerate && ' Un administrateur doit le générer.'}
            </p>
          )}
          {status === 'loading' && (
            <p className="text-subhead text-ink-muted">L’IA lit les actus de la semaine…</p>
          )}
          {status === 'done' && digest && (
            <div className={DIGEST_BODY} dangerouslySetInnerHTML={{ __html: formatDigestHtml(digest) }} />
          )}
        </div>
      </article>

      {/* L'erreur s'affiche quel que soit l'état : un envoi par mail raté laissait le
          statut à « done », et son message n'apparaissait nulle part. */}
      {error && <Notice tone="danger">{error}</Notice>}
      {status === 'done' && info && <Notice tone="success">{info}</Notice>}

      {(canGenerate || (status === 'done' && digest && isAuthenticated)) && (
        <div className="flex flex-wrap gap-2.5">
          {status === 'done' && digest && isAuthenticated && (
            <button type="button" onClick={sendByEmail} disabled={sendingEmail} className={buttonClass('secondary', 'md', 'flex-1')}>
              <Mail className="size-[18px]" aria-hidden="true" />
              {sendingEmail ? 'Envoi…' : 'Recevoir par e-mail'}
            </button>
          )}
          {canGenerate && (
            <button type="button" onClick={generate} disabled={status === 'loading'} className={buttonClass('tinted', 'md', 'flex-1')}>
              <RefreshCw className={cn('size-[18px]', status === 'loading' && 'animate-spin')} aria-hidden="true" />
              {status === 'loading' ? 'Génération…' : status === 'done' ? 'Régénérer' : 'Générer le résumé'}
            </button>
          )}
        </div>
      )}

      {/* Historique : réservé aux connectés (`history` répond 401), et absent plutôt
          qu'affiché en erreur. Liste groupée façon Réglages, repliée par défaut. */}
      {isAuthenticated && (
        <section className="mt-2 flex flex-col">
          <h2 className="mb-2 ml-4 text-footnote uppercase tracking-[0.3px] text-ink-muted">Historique</h2>
          <div className="overflow-hidden rounded-[14px] bg-card">
            <button
              type="button"
              onClick={() => {
                const opening = !historyOpen
                setHistoryOpen(opening)
                // Chargé au premier dépliage seulement : les ouvertures suivantes
                // réutilisent la liste déjà en mémoire.
                if (opening && !historyLoaded && !historyLoading) void loadHistory()
              }}
              aria-expanded={historyOpen}
              className="flex min-h-[52px] w-full items-center justify-between gap-3 px-4 text-left active:bg-fill-soft focus-ring"
            >
              <span className="text-body text-ink">
                {/* Le compteur n'apparaît qu'une fois la liste chargée : sinon il
                    annoncerait « (0) » avant même d'avoir regardé. */}
                Résumés précédents{historyLoaded ? ` (${summaries.length})` : ''}
              </span>
              {historyOpen
                ? <ChevronUp className="size-[18px] text-ink-faint" strokeWidth={2.4} />
                : <ChevronDown className="size-[18px] text-ink-faint" strokeWidth={2.4} />}
            </button>

            {historyOpen && (
              <div className="border-t border-separator">
                {historyLoading ? (
                  <p className="px-4 py-4 text-subhead text-ink-muted">Chargement de l’historique…</p>
                ) : historyError ? (
                  <p role="alert" className="px-4 py-4 text-subhead text-danger">{historyError}</p>
                ) : summaries.length === 0 ? (
                  <p className="px-4 py-4 text-subhead text-ink-muted">Aucun résumé IA disponible.</p>
                ) : (
                  <ul>
                    {bodyError && (
                      <li role="alert" className="px-4 py-3 text-subhead text-danger">{bodyError}</li>
                    )}
                    {summaries.map((summary) => {
                      const expanded = expandedSummaryId === summary.id
                      const body = bodies[summary.id]
                      return (
                        <li key={summary.id} className="border-t border-separator first:border-t-0">
                          <div className="flex items-center gap-2 pr-2">
                            {/*
                              L'en-tête de ligne est un bouton : le corps du résumé n'est
                              pas dans la liste, il se demande à l'unité. Un seul résumé
                              rendu à la fois.
                            */}
                            <button
                              type="button"
                              onClick={() => void toggleSummary(summary.id)}
                              aria-expanded={expanded}
                              className="flex min-h-[56px] min-w-0 flex-1 items-center gap-3 px-4 py-2 text-left active:bg-fill-soft focus-ring"
                            >
                              <span className="flex min-w-0 flex-1 flex-col">
                                <span className="text-body text-ink">
                                  {new Date(summary.createdAt).toLocaleDateString('fr-FR', {
                                    timeZone: 'Europe/Paris',
                                    day: 'numeric',
                                    month: 'long',
                                    year: 'numeric',
                                  })}
                                </span>
                                <span className="text-footnote text-ink-muted">
                                  {summary.articleCount} {summary.articleCount > 1 ? 'actus' : 'actu'}
                                  {bodyLoadingId === summary.id && ' · chargement…'}
                                </span>
                              </span>
                              {expanded
                                ? <ChevronUp className="size-[18px] shrink-0 text-ink-faint" strokeWidth={2.4} />
                                : <ChevronDown className="size-[18px] shrink-0 text-ink-faint" strokeWidth={2.4} />}
                            </button>
                            {canManageContent && (
                              <button
                                type="button"
                                onClick={() => setSummaryToDelete(summary)}
                                disabled={deletingSummaryId === summary.id}
                                className="inline-flex size-10 shrink-0 items-center justify-center rounded-full text-danger disabled:opacity-50 focus-ring"
                                aria-label="Supprimer ce résumé"
                              >
                                <Trash2 className={cn('size-[18px]', deletingSummaryId === summary.id && 'animate-pulse')} />
                              </button>
                            )}
                          </div>
                          {expanded && body && (
                            <div
                              className={cn(DIGEST_BODY, 'px-4 pb-4 text-subhead')}
                              dangerouslySetInnerHTML={{ __html: formatDigestHtml(body) }}
                            />
                          )}
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      <ConfirmDialog
        open={Boolean(summaryToDelete)}
        title="Supprimer le résumé IA"
        message="Supprimer ce résumé de l’historique ? Cette action est irréversible."
        confirmLabel="Supprimer"
        destructive
        onCancel={() => setSummaryToDelete(null)}
        onConfirm={() => {
          if (summaryToDelete) {
            void deleteSummary(summaryToDelete)
          }
        }}
      />
    </div>
  )
}
