/**
 * Retour OAuth (échange du code PKCE contre une session).
 *
 * La confirmation d'adresse email ne passe plus par ici mais par `/auth/confirm` : le
 * `code_verifier` du flux PKCE vit dans un cookie du navigateur d'origine, ce qui rend
 * l'échange impossible quand le lien du mail est ouvert sur un autre appareil. Le retour
 * OAuth, lui, revient toujours dans le navigateur qui est parti — le flux y est légitime.
 */

import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/** Voir `app/auth/confirm/route.ts` : `next` vient de l'URL, il ne doit pas pouvoir
 *  désigner un hôte externe. */
function safeNext(value: string | null): string {
  if (!value) return '/'
  if (!value.startsWith('/') || value.startsWith('//')) return '/'
  return value
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = safeNext(searchParams.get('next'))

  if (!code) {
    return NextResponse.redirect(`${origin}/auth/login?erreur=session`)
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)

  // L'erreur était ignorée : l'utilisateur atterrissait sur l'accueil, déconnecté, sans
  // rien pour comprendre. Elle est maintenant dite sur la page de connexion.
  if (error) {
    return NextResponse.redirect(`${origin}/auth/login?erreur=session`)
  }

  return NextResponse.redirect(`${origin}${next}`)
}
