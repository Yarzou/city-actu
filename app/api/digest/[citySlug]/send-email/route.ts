import { createClient } from '@/lib/supabase/server'
import { sendDigestEmail } from '@/lib/email-notifications'

interface RouteParams {
  params: Promise<{ citySlug: string }>
}

interface SendDigestBody {
  digest?: string
  articleCount?: number | null
  createdAt?: string | null
}

export async function POST(request: Request, { params }: RouteParams) {
  const { citySlug } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return Response.json({ error: 'Non autorisé' }, { status: 401 })
  }

  if (!user.email) {
    return Response.json({ error: 'Adresse email introuvable sur votre compte.' }, { status: 400 })
  }

  const { data: city } = await supabase
    .from('cities')
    .select('name')
    .eq('slug', citySlug)
    .single()

  if (!city) {
    return Response.json({ error: 'Ville introuvable' }, { status: 404 })
  }

  const body = await request.json().catch(() => null) as SendDigestBody | null
  if (!body?.digest?.trim()) {
    return Response.json({ error: 'Résumé IA manquant.' }, { status: 400 })
  }

  try {
    await sendDigestEmail(
      user.email,
      city.name,
      body.digest,
      body.articleCount ?? null,
      body.createdAt ?? null
    )
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'Erreur lors de l’envoi email.' },
      { status: 500 }
    )
  }

  return Response.json({ ok: true })
}
