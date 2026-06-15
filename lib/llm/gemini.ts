export interface ArticleSnippet {
  title: string
  content_preview?: string
}

/**
 * Summarizes a list of newly imported articles using Groq (llama-3.1-8b-instant).
 * Returns null if GROQ_API_KEY is not set or if the request fails.
 */
export async function summarizeArticles(articles: ArticleSnippet[]): Promise<string | null> {
  if (articles.length === 0) return null

  const articleList = articles
    .slice(0, 30)
    .map((a, i) => {
      const preview = a.content_preview?.trim() ? ` — ${a.content_preview.slice(0, 120)}` : ''
      return `${i + 1}. ${a.title}${preview}`
    })
    .join('\n')

  const prompt = `Tu es un assistant éditorial pour un journal local de La Chapelle-sur-Erdre (Loire-Atlantique, France).

Voici les ${articles.length} nouvel(s) article(s) importé(s) lors du dernier rafraîchissement des sources :

${articleList}

Rédige un court résumé synthétique en 3 à 5 phrases (en français, ton journalistique sobre), qui présente les grandes actualités du moment à La Chapelle-sur-Erdre. Ne liste pas les articles un par un : synthétise les thèmes et les informations clés.`

  return callLLM(prompt)
}

/**
 * Summarizes the N most recent articles already in the database using Groq.
 * Returns null if GROQ_API_KEY is not set or if the request fails.
 */
export async function summarizeRecentArticles(articles: ArticleSnippet[]): Promise<string | null> {
  if (articles.length === 0) return null

  const articleList = articles
    .map((a, i) => {
      const preview = a.content_preview?.trim() ? ` — ${a.content_preview.slice(0, 120)}` : ''
      return `${i + 1}. ${a.title}${preview}`
    })
    .join('\n')

  const prompt = `Tu es un assistant éditorial pour un journal local de La Chapelle-sur-Erdre (Loire-Atlantique, France).

Voici les ${articles.length} articles les plus récents actuellement en base de données :

${articleList}

Rédige un court résumé synthétique en 3 à 5 phrases (en français, ton journalistique sobre), qui présente les grandes actualités du moment à La Chapelle-sur-Erdre. Ne liste pas les articles un par un : synthétise les thèmes et les informations clés.`

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
        max_tokens: 300,
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

