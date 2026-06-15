export interface ArticleSnippet {
  title: string
  content_preview?: string
}

/**
 * Summarizes a list of newly imported articles using Google Gemini 1.5 Flash.
 * Returns null if GEMINI_API_KEY is not set or if the request fails.
 */
export async function summarizeArticles(articles: ArticleSnippet[]): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey || articles.length === 0) return null

  const articleList = articles
    .slice(0, 30) // Cap to avoid huge prompts
    .map((a, i) => {
      const preview = a.content_preview?.trim() ? ` — ${a.content_preview.slice(0, 120)}` : ''
      return `${i + 1}. ${a.title}${preview}`
    })
    .join('\n')

  const prompt = `Tu es un assistant éditorial pour un journal local de La Chapelle-sur-Erdre (Loire-Atlantique, France).

Voici les ${articles.length} nouvel(s) article(s) importé(s) lors du dernier rafraîchissement des sources :

${articleList}

Rédige un court résumé synthétique en 3 à 5 phrases (en français, ton journalistique sobre), qui présente les grandes actualités du moment à La Chapelle-sur-Erdre. Ne liste pas les articles un par un : synthétise les thèmes et les informations clés.`

  return callGemini(prompt)
}

/**
 * Summarizes the N most recent articles already in the database.
 * Returns null if GEMINI_API_KEY is not set or if the request fails.
 */
export async function summarizeRecentArticles(articles: ArticleSnippet[]): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey || articles.length === 0) return null

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

  return callGemini(prompt)
}

async function callGemini(prompt: string): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return null

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.4, maxOutputTokens: 300 },
        }),
        signal: AbortSignal.timeout(15_000),
      }
    )

    if (!res.ok) {
      console.error('[Gemini] Erreur HTTP:', res.status, await res.text())
      return null
    }

    const json = await res.json()
    const text: string | undefined = json?.candidates?.[0]?.content?.parts?.[0]?.text
    return text?.trim() ?? null
  } catch (err) {
    console.error('[Gemini] Erreur lors de la génération du résumé:', err)
    return null
  }
}
