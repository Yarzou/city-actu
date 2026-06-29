'use client'

import { useCallback, useEffect, useState } from 'react'
import { Sparkles, RefreshCw, Trash2 } from 'lucide-react'
import { cn, formatDigestHtml } from '@/lib/utils'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'

interface AIDigestTabProps {
  citySlug: string
  canManageContent?: boolean
}

interface DigestSummary {
  id: number
  digest: string
  articleCount: number
  createdAt: string
}

export function AIDigestTab({ citySlug, canManageContent = false }: AIDigestTabProps) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [sendingEmail, setSendingEmail] = useState(false)
  const [initialLoading, setInitialLoading] = useState(true)
  const [digest, setDigest] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [articleCount, setArticleCount] = useState<number | null>(null)
  const [createdAt, setCreatedAt] = useState<string | null>(null)
  const [summaries, setSummaries] = useState<DigestSummary[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [deletingSummaryId, setDeletingSummaryId] = useState<number | null>(null)
  const [summaryToDelete, setSummaryToDelete] = useState<DigestSummary | null>(null)

  const loadHistory = useCallback(async () => {
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
    } catch {
      setHistoryError('Erreur réseau. Veuillez réessayer.')
      setSummaries([])
    } finally {
      setHistoryLoading(false)
    }
  }, [citySlug])

  useEffect(() => {
    async function loadLatest() {
      setInitialLoading(true)
      setError(null)
      setInfo(null)
      try {
        const res = await fetch(`/api/digest/${citySlug}/latest`)
        const data = await res.json()

        if (res.status === 401) {
          setError('Vous devez être connecté pour consulter les résumés IA.')
          setStatus('error')
          return
        }
        if (!res.ok) {
          setError(data.error ?? 'Erreur lors du chargement du dernier résumé.')
          setStatus('error')
          return
        }

        if (data.digest) {
          setDigest(data.digest)
          setArticleCount(data.articleCount ?? null)
          setCreatedAt(data.createdAt ?? null)
          setStatus('done')
        } else {
          setDigest(null)
          setArticleCount(null)
          setCreatedAt(null)
          setStatus('idle')
          setInfo(data.message ?? 'Aucun résumé à la demande disponible.')
        }
      } catch {
        setError('Erreur réseau. Veuillez réessayer.')
        setStatus('error')
      } finally {
        setInitialLoading(false)
      }
    }

    queueMicrotask(() => {
      void Promise.all([loadLatest(), loadHistory()])
    })
  }, [citySlug, loadHistory])

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
      setStatus('done')

      if (data.id && data.createdAt && data.digest) {
        setSummaries((prev) => [{
          id: data.id,
          digest: data.digest,
          articleCount: data.articleCount ?? 0,
          createdAt: data.createdAt,
        }, ...prev.filter((summary) => summary.id !== data.id)])
      } else {
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

      setSummaries((prev) => {
        const updated = prev.filter((item) => item.id !== summary.id)
        if (createdAt === summary.createdAt && digest === summary.digest) {
          const nextSummary = updated[0] ?? null
          if (nextSummary) {
            setDigest(nextSummary.digest)
            setArticleCount(nextSummary.articleCount)
            setCreatedAt(nextSummary.createdAt)
            setStatus('done')
          } else {
            setDigest(null)
            setArticleCount(null)
            setCreatedAt(null)
            setStatus('idle')
            setInfo('Aucun résumé à la demande disponible.')
          }
        }
        return updated
      })
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
          Notre assistant IA affiche le dernier résumé enregistré et permet de le régénérer à la demande.
        </p>
        <div className="flex flex-wrap items-center gap-2">
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
          {status === 'done' && digest && (
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

      <div className="mt-6 rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
          <p className="text-sm font-medium text-gray-700">
            Historique des résumés IA ({summaries.length})
          </p>
        </div>

        {historyLoading ? (
          <div className="px-4 py-4 text-sm text-gray-500">Chargement de l’historique…</div>
        ) : historyError ? (
          <div className="px-4 py-4 text-sm text-red-700">❌ {historyError}</div>
        ) : summaries.length === 0 ? (
          <div className="px-4 py-4 text-sm text-gray-500">Aucun résumé IA disponible.</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {summaries.map((summary) => (
              <div key={summary.id} className="px-4 py-4">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="min-w-0">
                    <p className="text-xs text-gray-400">
                      {new Date(summary.createdAt).toLocaleDateString('fr-FR', {
                        day: '2-digit',
                        month: 'long',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                    <p className="text-xs text-gray-500">{summary.articleCount} article(s)</p>
                  </div>
                  {canManageContent && (
                    <button
                      onClick={() => setSummaryToDelete(summary)}
                      disabled={deletingSummaryId === summary.id}
                      className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-md border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50 transition-colors"
                      title="Supprimer ce résumé"
                    >
                      <Trash2 className={cn('size-3.5', deletingSummaryId === summary.id && 'animate-pulse')} />
                      Supprimer
                    </button>
                  )}
                </div>
                <div
                  className="text-sm text-gray-700 leading-relaxed space-y-3 [&_h3]:mt-3 [&_h3]:font-semibold [&_h3]:text-gray-900 [&_ul]:list-disc [&_ul]:pl-5 [&_li]:mb-1"
                  dangerouslySetInnerHTML={{ __html: formatDigestHtml(summary.digest) }}
                />
              </div>
            ))}
          </div>
        )}
      </div>

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
