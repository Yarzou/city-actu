import type { ButtonHTMLAttributes } from 'react'
import { LoaderCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

export type ButtonVariant = 'primary' | 'secondary' | 'tinted' | 'plain' | 'danger'

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-accent-fill text-white',
  secondary: 'bg-accent-soft text-accent',
  tinted: 'bg-fill text-ink',
  plain: 'bg-transparent text-accent',
  danger: 'bg-danger-soft text-danger',
}

const SIZES = {
  lg: 'h-[50px] px-5 text-body',
  md: 'h-11 px-4 text-subhead',
}

/**
 * Classes d'un bouton capsule iOS 26, réutilisables sur un `<Link>` ou un `<a>`.
 * `lg` (50 px, pleine largeur par défaut) pour les actions principales d'un écran,
 * `md` (44 px) pour les actions secondaires en ligne.
 */
export function buttonClass(variant: ButtonVariant = 'primary', size: keyof typeof SIZES = 'lg', className?: string) {
  return cn(
    'inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-opacity active:opacity-80 disabled:opacity-50 focus-ring',
    SIZES[size],
    size === 'lg' && 'w-full',
    VARIANTS[variant],
    className
  )
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: keyof typeof SIZES
  loading?: boolean
}

export function Button({ variant = 'primary', size = 'lg', loading, className, children, disabled, type = 'button', ...props }: ButtonProps) {
  return (
    <button {...props} type={type} disabled={disabled || loading} className={buttonClass(variant, size, className)}>
      {loading && <LoaderCircle size={18} className="animate-spin" aria-hidden="true" />}
      {children}
    </button>
  )
}
