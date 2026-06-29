'use client'

import { useEffect, useState } from 'react'
import { Sparkles, RefreshCw } from 'lucide-react'
import { cn, formatDigestHtml } from '@/lib/utils'

interface AIDigestTabProps {
  citySlug: string
}

export function AIDigestTab({ citySlug }: AIDigestTabProps) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [sendingEmail, setSendingEmail] = useState(false)
  const [initialLoading, setInitialLoading] = useState(true)
  const [digest, setDigest] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [articleCount, setArticleCount] = useState<number | null>(null)
  const [createdAt, setCreatedAt] = useState<string | null>(null)

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

    void loadLatest()
  }, [citySlug])

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

  return (
    <div className="max-w-2xl mx-auto px-1 py-6">
      {/* Intro card */}
      <div className="rounded-2xl border border-brand-100 bg-gradient-to-br from-brand-50 to-white p-6 mb-6">
        <div className="flex items-center gap-3 mb-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-100">
            <Sparkles className="size-5 text-brand-700" />
          </div>
          <div>
            <h2 className="font-semibold text-gray-900">Résumé hebdomadaire IA</h2>
            <p className="text-xs text-gray-500">Dernier résumé à la demande, généré depuis les 7 derniers jours d&apos;actualité</p>
          </div>
        </div>
        <p className="text-sm text-gray-600 leading-relaxed mb-4">
          Notre assistant IA affiche le dernier résumé enregistré et permet de le régénérer à la demande.
        </p>
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
              'ml-2 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-colors',
              sendingEmail
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-white text-brand-700 border border-brand-200 hover:bg-brand-50'
            )}
          >
            {sendingEmail ? 'Envoi…' : 'Envoyer par mail'}
          </button>
        )}
      </div>

      {/* Result */}
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
    </div>
  )
}
