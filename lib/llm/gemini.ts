export interface ArticleSnippet {
  title: string
  content_preview?: string
  published_at?: string
}

interface SummaryOptions {
  cityName?: string
}

/**
 * Summarizes a list of newly imported articles using Groq (llama-3.1-8b-instant).
 * Returns null if GROQ_API_KEY is not set or if the request fails.
 */
export async function summarizeArticles(articles: ArticleSnippet[], options: SummaryOptions = {}): Promise<string | null> {
  if (articles.length === 0) return null
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

Rédige un résumé structuré, en français et ton journalistique sobre, en respectant exactement ce format :
- Un titre "Résumé IA — ${cityName}".
- Une section "Vue d'ensemble" (2 à 3 phrases).
- Une section "Points clés" avec 3 à 6 puces synthétiques avec dates et heures.

Ne liste pas les articles un par un : synthétise les thèmes et les informations clés.`

  return callLLM(prompt)
}

/**
 * Summarizes the N most recent articles already in the database using Groq.
 * Returns null if GROQ_API_KEY is not set or if the request fails.
 */
export async function summarizeRecentArticles(articles: ArticleSnippet[], options: SummaryOptions = {}): Promise<string | null> {
  if (articles.length === 0) return null
  const cityName = options.cityName ?? 'la ville concernée'

  const articleList = articles
    .map((a, i) => {
      const preview = a.content_preview?.trim() ? ` — ${a.content_preview.slice(0, 120)}` : ''
      const day = a.published_at ? new Date(a.published_at).toLocaleDateString('fr-FR') : 'Date non précisée'
      return `${i + 1}. [${day}] ${a.title}${preview}`
    })
    .join('\n')

  const prompt = `Tu es un assistant éditorial pour un journal local de ${cityName} (France).

Voici les ${articles.length} articles les plus récents actuellement en base de données :

${articleList}

Rédige un résumé détaillé jour par jour, en français et ton journalistique sobre, en respectant exactement ce format :
- Un titre "Résumé IA quotidien — ${cityName}".
- Une section "Vue d'ensemble" (3 à 5 phrases).
- Une section "Jour par jour" avec un sous-titre pour chaque date présente dans les données (format JJ/MM/AAAA), du plus ancien au plus récent, et 1 à 3 puces par date.
- Une section finale "À retenir" (2 à 4 puces) qui synthétise les tendances de la semaine.

Contraintes :
- Ne pas inventer d'information absente des données fournies.
- Regrouper les sujets similaires par journée au lieu de répéter des titres d'articles.
- Si une date n'a qu'un seul article, garder une synthèse concise mais factuelle.`

  return callLLM(prompt)
}

async function callLLM(prompt: string): Promise<string | null> {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) return null

  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.4,
        max_tokens: 700,
      }),
      signal: AbortSignal.timeout(15_000),
    })

    if (!res.ok) {
      console.error('[Groq] Erreur HTTP:', res.status, await res.text())
      return null
    }

    const json = await res.json()
    const text: string | undefined = json?.choices?.[0]?.message?.content
    return text?.trim() ?? null
  } catch (err) {
    console.error('[Groq] Erreur lors de la génération du résumé:', err)
    return null
  }
}
