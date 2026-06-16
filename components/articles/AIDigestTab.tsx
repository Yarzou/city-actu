'use client'

import { useState } from 'react'
import { Sparkles, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'

interface AIDigestTabProps {
  citySlug: string
}

export function AIDigestTab({ citySlug }: AIDigestTabProps) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [digest, setDigest] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [articleCount, setArticleCount] = useState<number | null>(null)

  async function generate() {
    setStatus('loading')
    setError(null)
    setDigest(null)

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
      setStatus('done')
    } catch {
      setError('Erreur réseau. Veuillez réessayer.')
      setStatus('error')
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
            <p className="text-xs text-gray-500">Généré à partir des 7 derniers jours d&apos;actualité</p>
          </div>
        </div>
        <p className="text-sm text-gray-600 leading-relaxed mb-4">
          Notre assistant IA analyse les derniers articles et vous propose une synthèse des grandes actualités locales.
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
      </div>

      {/* Result */}
      {status === 'error' && error && (
        <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
          ❌ {error}
        </div>
      )}

      {status === 'done' && digest && (
        <div className="rounded-2xl border border-gray-100 bg-white shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-700 bg-brand-50 px-3 py-1 rounded-full">
              <Sparkles className="size-3" />
              Résumé IA
            </span>
            {articleCount !== null && (
              <span className="text-xs text-gray-400">{articleCount} articles analysés</span>
            )}
          </div>
          <p className="text-gray-800 text-sm leading-relaxed whitespace-pre-wrap">{digest}</p>
        </div>
      )}
    </div>
  )
}
