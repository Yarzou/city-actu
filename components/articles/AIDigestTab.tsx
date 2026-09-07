'use client'

import { useCallback, useEffect, useState } from 'react'
import { Sparkles, RefreshCw, Trash2, ChevronDown, ChevronUp } from 'lucide-react'
import { cn, formatDigestHtml } from '@/lib/utils'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import type { LatestDigest } from '@/lib/digest/latest'

interface AIDigestTabProps {
  citySlug: string
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

export function AIDigestTab({
  citySlug,
  isAuthenticated = false,
  canManageContent = false,
  canGenerate = false,
  initialDigest,
}: AIDigestTabProps) {
  // Le serveur a préparé quelque chose (résumé ou absence constatée) : on démarre à
  // l'état final, sans « Chargement… » ni requête au montage.
  const hasServerDigest = initialDigest !== undefined

  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>(
    initialDigest ? 'done' : 'idle'
  )
  const [sendingEmail, setSendingEmail] = useState(false)
  const [initialLoading, setInitialLoading] = useState(!hasServerDigest)
  const [digest, setDigest] = useState<string | null>(initialDigest?.digest ?? null)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(
    hasServerDigest && !initialDigest ? 'Aucun résumé à la demande disponible.' : null
  )
  const [articleCount, setArticleCount] = useState<number | null>(initialDigest?.articleCount ?? null)
  const [createdAt, setCreatedAt] = useState<string | null>(initialDigest?.createdAt ?? null)
  // Identifie la ligne d'historique correspondant au résumé affiché : c'est ce qui permet
  // de savoir, après une suppression, s'il faut remplacer l'affichage principal.
  const [latestId, setLatestId] = useState<number | null>(initialDigest?.id ?? null)
  const [summaries, setSummaries] = useState<DigestSummary[]>([])
  const [historyLoaded, setHistoryLoaded] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState<string | null>(null)
  // Replié par défaut, et rien n'est chargé avant le premier dépliage : un administrateur
  // qui ouvre l'onglet ne déclenche plus aucune requête. Il était ouvert d'emblée, ce qui
  // rendait vingt résumés que personne n'avait demandés.
  const [historyOpen, setHistoryOpen] = useState(false)
  const [deletingSummaryId, setDeletingSummaryId] = useState<number | null>(null)
  const [summaryToDelete, setSummaryToDelete] = useState<DigestSummary | null>(null)
  // Corps des résumés de l'historique, chargés à l'unité au dépliage d'une ligne.
  const [bodies, setBodies] = useState<Record<number, string>>({})
  const [expandedSummaryId, setExpandedSummaryId] = useState<number | null>(null)
  const [bodyLoadingId, setBodyLoadingId] = useState<number | null>(null)
  const [bodyError, setBodyError] = useState<string | null>(null)

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
      setSummaries(Array.isArray(data.summaries) ? data.summaries : [])
      setHistoryLoaded(true)
    } catch {
      setHistoryError('Erreur réseau. Veuillez réessayer.')
      setSummaries([])
    } finally {
      setHistoryLoading(false)
    }
  }, [citySlug, isAuthenticated])

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
      } else {
        setDigest(null)
        setArticleCount(null)
        setCreatedAt(null)
        setLatestId(null)
        setStatus('idle')
        setInfo(data.message ?? 'Aucun résumé à la demande disponible.')
      }
    } catch {
      setError('Erreur réseau. Veuillez réessayer.')
      setStatus('error')
    } finally {
      setInitialLoading(false)
    }
  }, [citySlug])

  useEffect(() => {
    // Le résumé est déjà dans le HTML : aucune requête au montage. C'est tout l'intérêt
    // de la prop — l'historique, lui, attend son dépliage.
    if (hasServerDigest) return
    queueMicrotask(() => void loadLatest())
  }, [hasServerDigest, loadLatest])

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
      setBodies((prev) => ({ ...prev, [summaryId]: data.summary.digest }))
    } catch {
      setBodyError('Erreur réseau. Veuillez réessayer.')
      setExpandedSummaryId(null)
    } finally {
      setBodyLoadingId(null)
    }
  }, [bodies, citySlug, expandedSummaryId])

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

      // L'historique n'est mis à jour que s'il a déjà été chargé : y insérer une ligne
      // seule alors qu'il n'a jamais été ouvert afficherait « Historique (1) » avec un
      // compteur faux. Non chargé, il partira chercher la liste complète au dépliage.
      if (historyLoaded && data.id && data.createdAt && data.digest) {
        setSummaries((prev) => [{
          id: data.id,
          articleCount: data.articleCount ?? 0,
          createdAt: data.createdAt,
        }, ...prev.filter((summary) => summary.id !== data.id)])
        // Le corps vient d'arriver dans la réponse : le mémoriser évite un aller-retour
        // si l'utilisateur déplie la ligne qu'il vient de générer.
        setBodies((prev) => ({ ...prev, [data.id]: data.digest }))
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

      setSummaries((prev) => prev.filter((item) => item.id !== summary.id))
      setBodies((prev) => {
        if (prev[summary.id] === undefined) return prev
        const next = { ...prev }
        delete next[summary.id]
        return next
      })
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

  return (
    <div className="max-w-2xl mx-auto px-1 py-6">
      <div className="rounded-2xl border border-brand-100 bg-gradient-to-br from-brand-50 to-white p-6 mb-6">
        <div className="flex items-center gap-3 mb-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-100">
            <Sparkles className="size-5 text-brand-700" />
          </div>
          <div>
            <h2 className="font-semibold text-gray-900">Résumé hebdomadaire IA</h2>
            <p className="text-xs text-gray-500">Dernier résumé à la demande, généré sur la semaine en cours (lundi à dimanche)</p>
          </div>
        </div>
        <p className="text-sm text-gray-600 leading-relaxed mb-4">
          {canGenerate
            ? 'Notre assistant IA affiche le dernier résumé enregistré et permet de le régénérer à la demande.'
            : 'Notre assistant IA affiche le dernier résumé enregistré. Sa génération est réservée aux administrateurs.'}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {canGenerate && (
            <button
              onClick={generate}
              disabled={status === 'loading'}
              className={cn(
                'inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-colors',
                status === 'loading'
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-brand-600 text-white hover:bg-brand-700'
              )}
            >
              <RefreshCw className={cn('size-4', status === 'loading' && 'animate-spin')} />
              {status === 'loading' ? 'Génération en cours…' : status === 'done' ? 'Régénérer' : 'Générer le résumé'}
            </button>
          )}
          {status === 'done' && digest && isAuthenticated && (
            <button
              onClick={sendByEmail}
              disabled={sendingEmail}
              className={cn(
                'inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-colors',
                sendingEmail
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-white text-brand-700 border border-brand-200 hover:bg-brand-50'
              )}
            >
              {sendingEmail ? 'Envoi…' : 'Envoyer par mail'}
            </button>
          )}
        </div>
      </div>

      {initialLoading && (
        <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm text-gray-600">
          Chargement du dernier résumé…
        </div>
      )}

      {status === 'error' && error && (
        <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
          ❌ {error}
        </div>
      )}

      {!initialLoading && status === 'idle' && info && (
        <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm text-gray-600">
          {info}
          {/* Sans ce complément, un lecteur non-admin voit « Aucun résumé disponible »
              sans aucun bouton, donc sans savoir quoi en attendre. */}
          {!canGenerate && ' Un administrateur doit le générer.'}
        </div>
      )}

      {status === 'done' && digest && (
        <div className="rounded-2xl border border-gray-100 bg-white shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-700 bg-brand-50 px-3 py-1 rounded-full">
              <Sparkles className="size-3" />
              Résumé IA
            </span>
            <div className="text-right">
              {articleCount !== null && (
                <p className="text-xs text-gray-400">{articleCount} articles analysés</p>
              )}
              {createdAt && (
                <p className="text-xs text-gray-400">
                  {new Date(createdAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}
                </p>
              )}
            </div>
          </div>
          <div
            className="text-gray-800 text-sm leading-relaxed space-y-3 [&_h3]:mt-3 [&_h3]:font-semibold [&_h3]:text-gray-900 [&_ul]:list-disc [&_ul]:pl-5 [&_li]:mb-1"
            dangerouslySetInnerHTML={{ __html: formatDigestHtml(digest) }}
          />
        </div>
      )}

      {/* Historique : réservé aux connectés (`history` répond 401), et absent plutôt
          qu'affiché en erreur. Le bloc n'est pas ré-indenté pour garder le diff lisible. */}
      {isAuthenticated && (
      <div className="mt-6 rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <button
          onClick={() => {
            const opening = !historyOpen
            setHistoryOpen(opening)
            // Chargé au premier dépliage seulement : les ouvertures suivantes réutilisent
            // la liste déjà en mémoire.
            if (opening && !historyLoaded && !historyLoading) void loadHistory()
          }}
          aria-expanded={historyOpen}
          className="w-full flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50 hover:bg-gray-100 transition-colors"
        >
          <p className="text-sm font-medium text-gray-700 text-left">
            {/* Le compteur n'apparaît qu'une fois la liste chargée : sinon il annoncerait
                « (0) » avant même d'avoir regardé. */}
            Historique des résumés IA{historyLoaded ? ` (${summaries.length})` : ''}
          </p>
          {historyOpen ? (
            <ChevronUp className="size-4 text-gray-500" />
          ) : (
            <ChevronDown className="size-4 text-gray-500" />
          )}
        </button>

        {historyOpen && (
          <>
            {historyLoading ? (
              <div className="px-4 py-4 text-sm text-gray-500">Chargement de l’historique…</div>
            ) : historyError ? (
              <div className="px-4 py-4 text-sm text-red-700">❌ {historyError}</div>
            ) : summaries.length === 0 ? (
              <div className="px-4 py-4 text-sm text-gray-500">Aucun résumé IA disponible.</div>
            ) : (
              <div className="divide-y divide-gray-100">
                {bodyError && (
                  <div className="px-4 py-3 text-sm text-red-700">❌ {bodyError}</div>
                )}
                {summaries.map((summary) => {
                  const expanded = expandedSummaryId === summary.id
                  const body = bodies[summary.id]
                  return (
                  <div key={summary.id} className="px-4 py-4">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      {/*
                        L'en-tête de ligne est devenu un bouton : le corps du résumé n'est
                        plus dans la liste, il se demande à l'unité. Un seul résumé rendu
                        à la fois, au lieu des vingt d'avant.
                      */}
                      <button
                        onClick={() => void toggleSummary(summary.id)}
                        aria-expanded={expanded}
                        className="min-w-0 flex items-start gap-2 text-left focus-ring rounded-md"
                      >
                        {expanded
                          ? <ChevronUp className="size-4 shrink-0 mt-0.5 text-gray-400" />
                          : <ChevronDown className="size-4 shrink-0 mt-0.5 text-gray-400" />
                        }
                        <span className="min-w-0">
                          <span className="block text-xs text-gray-400">
                            {new Date(summary.createdAt).toLocaleDateString('fr-FR', {
                              day: '2-digit',
                              month: 'long',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                          <span className="block text-xs text-gray-500">
                            {summary.articleCount} article(s)
                            {bodyLoadingId === summary.id && ' — chargement…'}
                          </span>
                        </span>
                      </button>
                      {canManageContent && (
                        <button
                          onClick={() => setSummaryToDelete(summary)}
                          disabled={deletingSummaryId === summary.id}
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-md border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50 transition-colors shrink-0"
                          title="Supprimer ce résumé"
                        >
                          <Trash2 className={cn('size-3.5', deletingSummaryId === summary.id && 'animate-pulse')} />
                          Supprimer
                        </button>
                      )}
                    </div>
                    {expanded && body && (
                      <div
                        className="text-sm text-gray-700 leading-relaxed space-y-3 [&_h3]:mt-3 [&_h3]:font-semibold [&_h3]:text-gray-900 [&_ul]:list-disc [&_ul]:pl-5 [&_li]:mb-1"
                        dangerouslySetInnerHTML={{ __html: formatDigestHtml(body) }}
                      />
                    )}
                  </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>
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
