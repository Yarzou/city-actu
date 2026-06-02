import { NextResponse } from 'next/server'
import { fetchAllSources } from '@/lib/fetchers'

export const runtime = 'nodejs'
export const maxDuration = 300 // 5 min max (Vercel Pro)

export async function GET(request: Request) {
  // Validate cron secret
  const authHeader = request.headers.get('authorization')
  const expected = `Bearer ${process.env.CRON_SECRET}`
  if (authHeader !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const results = await fetchAllSources()

    const summary = results.reduce(
      (acc, r) => ({
        sources: acc.sources + 1,
        fetched: acc.fetched + r.fetched,
        inserted: acc.inserted + r.inserted,
        skipped: acc.skipped + r.skipped,
        errors: acc.errors + r.errors.length,
      }),
      { sources: 0, fetched: 0, inserted: 0, skipped: 0, errors: 0 }
    )

    console.log('[Cron] fetch-news terminé:', summary)

    return NextResponse.json({ ok: true, summary, timestamp: new Date().toISOString() })
  } catch (err) {
    console.error('[Cron] fetch-news erreur:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
