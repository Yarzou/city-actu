import { Notice } from '@/components/ui/Notice'
import type { PasskeyFailure } from '@/lib/auth/passkey'

/**
 * Retour d'une cérémonie passkey. Une annulation n'est pas une erreur — l'utilisateur
 * a refermé l'invite, ou n'a pas encore activé cet appareil — d'où le ton neutre, en
 * gris et non en rouge.
 */
export function PasskeyNotice({ failure, className }: { failure: PasskeyFailure; className?: string }) {
  return (
    <Notice tone={failure.kind === 'error' ? 'danger' : 'neutral'} className={className}>
      {failure.message}
    </Notice>
  )
}
