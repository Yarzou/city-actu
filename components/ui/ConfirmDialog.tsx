'use client'

import { useEffect } from 'react'
import { buttonClass } from '@/components/ui/Button'

interface ConfirmDialogProps {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/**
 * Alerte de confirmation façon iOS : carte de verre dense au centre, fond assombri,
 * deux boutons capsule. Échap annule.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirmer',
  cancelLabel = 'Annuler',
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onCancel])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-6">
      <div className="absolute inset-0 bg-scrim" onClick={onCancel} aria-hidden="true" />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-message"
        className="glass glass-strong relative w-full max-w-xs rounded-[26px] p-5 text-center"
      >
        <h2 id="confirm-title" className="text-headline text-ink">{title}</h2>
        <p id="confirm-message" className="mt-1.5 text-subhead text-ink-muted">{message}</p>
        <div className="mt-5 flex gap-2">
          <button type="button" onClick={onCancel} className={buttonClass('tinted', 'md', 'flex-1')}>
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={buttonClass('primary', 'md', destructive ? 'flex-1 bg-danger-fill' : 'flex-1')}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
