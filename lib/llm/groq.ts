/**
 * Modèle Groq. **Surchargeable par variable d'environnement** parce que Groq
 * décommissionne ses modèles sans préavis : `llama-3.1-8b-instant`, câblé ici en dur, a
 * disparu du catalogue (vérifié le 04/09/2026 — `GET /openai/v1/models` ne le liste plus)
 * et toute génération de résumé échouait. `GROQ_MODEL` permet de rebasculer sans
 * redéploiement le jour où celui-ci disparaîtra à son tour.
 */
const GROQ_MODEL = process.env.GROQ_MODEL ?? 'openai/gpt-oss-120b'

/**
 * Budget de sortie. **3000 et non 700** : les modèles `gpt-oss` sont des modèles à
 * raisonnement, et leurs jetons de réflexion se comptent dans `max_tokens`. À 700, le
 * résumé jour par jour consommait la totalité du budget en raisonnement et revenait avec
 * un contenu **vide** et `finish_reason: 'length'` — soit exactement la même erreur
 * générique que le modèle disparu, pour une cause différente. Mesuré sur un lot de 20
 * articles : 1355 jetons de complétion, d'où cette marge.
 */
const MAX_TOKENS = 3000

/** Cause d'échec de la génération, pour que l'appelant dise autre chose que « échec ». */
export type LlmFailure =
  | 'missing_api_key'
  | 'no_articles'
  | 'http_error'
  | 'timeout'
  | 'truncated'
  | 'empty_response'

export type LlmResult =
  | { ok: true; text: string }
  | { ok: false; reason: LlmFailure; status?: number }

/**
 * Message en français destiné à l'utilisateur du panneau d'administration.
 *
 * Centralisé ici, et non réinventé dans chacune des trois routes appelantes : c'est
 * l'opacité du « Échec de la génération du résumé. » d'origine qui a rendu nécessaire de
 * lister les modèles de Groq à la main pour comprendre qu'il n'y avait aucun rapport avec
 * la clé d'API.
 */
export function describeLlmFailure(reason: LlmFailure, status?: number): string {
  switch (reason) {
    case 'missing_api_key':
      return 'GROQ_API_KEY n’est pas configurée.'
    case 'no_articles':
      return 'Aucun article à résumer.'
    case 'http_error':
      return status === 401 || status === 403
        ? 'GROQ_API_KEY refusée par Groq.'
        : `Groq a refusé la requête (HTTP ${status ?? '?'}) pour le modèle « ${GROQ_MODEL} ». `
          + 'Si le modèle a été décommissionné, changer GROQ_MODEL.'
    case 'timeout':
      return 'Groq n’a pas répondu dans le délai imparti.'
    case 'truncated':
      return `Le modèle « ${GROQ_MODEL} » a épuisé son budget de jetons avant de produire du texte.`
    case 'empty_response':
      return 'Groq a répondu sans contenu.'
  }
}

export interface ArticleSnippet {
  title: string
  content_preview?: string
  published_at?: string
}

interface SummaryOptions {
  cityName?: string
  todayDateLabel?: string
}

/**
 * Résume les articles fraîchement importés. Voir `LlmResult` : l'échec porte sa cause.
 */
export async function summarizeArticles(articles: ArticleSnippet[], options: SummaryOptions = {}): Promise<LlmResult> {
  if (articles.length === 0) return { ok: false, reason: 'no_articles' }
  const cityName = options.cityName ?? 'la ville concernée'

  const articleList = articles
    .slice(0, 30)
    .map((a, i) => {
      const preview = a.content_preview?.trim() ? ` — ${a.content_preview.slice(0, 120)}` : ''
      return `${i + 1}. ${a.title}${preview}`
    })
    .join('\n')

  const prompt = `Tu es un assistant éditorial pour un journal local de ${cityName} (France).

Voici les ${articles.length} nouvel(s) article(s) importé(s) lors du dernier rafraîchissement des sources :

${articleList}

Rédige un résumé structuré, en français et ton journalistique sobre, en respectant exactement ce format HTML :
- <h3>Résumé IA — ${cityName}</h3>
- Un paragraphe <p> de "Vue d'ensemble" (2 à 3 phrases).
- Une section "Points clés" sous forme de liste <ul> avec 3 à 6 éléments avec date et heure éventuellement<li>.

Contraintes :
- Retourne uniquement un fragment HTML valide (pas de Markdown, pas de blocs de code).
- Utilise uniquement les balises suivantes : <h3>, <p>, <ul>, <li>, <strong>.
- Ne liste pas les articles un par un : synthétise les thèmes et les informations clés.`

  return callLLM(prompt)
}

/**
 * Résume les articles déjà en base sur la semaine en cours, jour par jour.
 */
export async function summarizeRecentArticles(articles: ArticleSnippet[], options: SummaryOptions = {}): Promise<LlmResult> {
  if (articles.length === 0) return { ok: false, reason: 'no_articles' }
  const cityName = options.cityName ?? 'la ville concernée'
  const todayDateLabel = options.todayDateLabel ?? new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date())

  const articleList = articles
    .map((a, i) => {
      const preview = a.content_preview?.trim() ? ` — ${a.content_preview.slice(0, 120)}` : ''
      const day = a.published_at
        ? new Date(a.published_at).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' })
        : 'Date non précisée'
      return `${i + 1}. [${day}] ${a.title}${preview}`
    })
    .join('\n')

  const prompt = `Tu es un assistant éditorial pour un journal local de ${cityName} (France).
Date de référence (aujourd'hui, fuseau Europe/Paris) : ${todayDateLabel}.

Voici les ${articles.length} articles de la semaine calendaire en cours actuellement en base de données :

${articleList}

Rédige un résumé détaillé jour par jour, en français et ton journalistique sobre, en respectant exactement ce format HTML :
- <h3>Résumé IA quotidien — ${cityName}</h3>
- Un paragraphe <p> de "Vue d'ensemble" (3 à 5 phrases).
- Une section jour par jour avec une date en <h3> (format JJ/MM/AAAA) puis une liste <ul> de 1 à 3 éléments <li> pour cette date, du plus récent au plus ancien (date la plus proche d'abord).
- Une section finale "À retenir" en <h3> suivie d'une liste <ul> de 2 à 4 éléments <li>.

Contraintes :
- Retourne uniquement un fragment HTML valide (pas de Markdown, pas de blocs de code).
- Utilise uniquement les balises suivantes : <h3>, <p>, <ul>, <li>, <strong>.
- Ne pas inventer d'information absente des données fournies.
- Regrouper les sujets similaires par journée au lieu de répéter des titres d'articles.
- Si une date n'a qu'un seul article, garder une synthèse concise mais factuelle.
- Si l'information concerne la date ${todayDateLabel}, privilégie la formulation "aujourd'hui" dans le texte au lieu de répéter la date littérale.`

  return callLLM(prompt)
}

async function callLLM(prompt: string): Promise<LlmResult> {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) {
    // Ne journalisait rien du tout : une clé absente était indistinguable d'une panne.
    console.error('[Groq] GROQ_API_KEY absente, génération abandonnée.')
    return { ok: false, reason: 'missing_api_key' }
  }

  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.4,
        max_tokens: MAX_TOKENS,
      }),
      // 30 s et non 15 : le résumé jour par jour est un prompt long sur un modèle à
      // raisonnement. Reste sous le `maxDuration` des routes appelantes.
      signal: AbortSignal.timeout(30_000),
    })

    if (!res.ok) {
      // Le corps de la réponse va dans le journal, pas dans la réponse HTTP : il est
      // verbeux et la route n'est gardée que par « utilisateur authentifié ».
      console.error(`[Groq] HTTP ${res.status} sur le modèle "${GROQ_MODEL}":`, await res.text())
      return { ok: false, reason: 'http_error', status: res.status }
    }

    const json = await res.json()
    const choice = json?.choices?.[0]
    const text: string = (choice?.message?.content ?? '').trim()

    if (!text) {
      // Un modèle à raisonnement qui bute sur `max_tokens` répond `finish_reason:
      // 'length'` avec un contenu vide : à distinguer d'une réponse réellement vide.
      const truncated = choice?.finish_reason === 'length'
      console.error(
        `[Groq] Réponse sans contenu (finish_reason: ${choice?.finish_reason ?? 'inconnu'}, `
        + `jetons: ${json?.usage?.completion_tokens ?? '?'}/${MAX_TOKENS}).`
      )
      return { ok: false, reason: truncated ? 'truncated' : 'empty_response' }
    }

    return { ok: true, text }
  } catch (err) {
    const timedOut = err instanceof Error && err.name === 'TimeoutError'
    console.error('[Groq] Erreur lors de la génération du résumé:', err)
    return { ok: false, reason: timedOut ? 'timeout' : 'http_error' }
  }
}
