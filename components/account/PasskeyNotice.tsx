import { cn } from '@/lib/utils'
import type { PasskeyFailure } from '@/lib/auth/passkey'

/**
 * Retour d'une cérémonie passkey. Une annulation n'est pas une erreur — l'utilisateur
 * a refermé l'invite, ou n'a pas encore activé cet appareil — d'où le ton neutre, en
 * gris et non en rouge.
 */
export function PasskeyNotice({ failure, className }: { failure: PasskeyFailure; className?: string }) {
  const isError = failure.kind === 'error'
  return (
    <p
      role={isError ? 'alert' : 'status'}
      className={cn(
        'mt-3 rounded-lg border px-3 py-2 text-sm',
        isError ? 'border-red-200 bg-red-50 text-red-700' : 'border-gray-200 bg-gray-50 text-gray-600',
        className
      )}
    >
      {failure.message}
    </p>
  )
}
