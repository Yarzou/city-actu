import type { InputHTMLAttributes, ReactNode } from 'react'
import { Newspaper } from 'lucide-react'
import { BackLink } from '@/components/ui/PageHeader'

/**
 * Coquille des écrans de connexion et d'inscription (refonte « Givre ») : un paysage de
 * bord d'Erdre dessiné aux couleurs de la palette en haut de l'écran, et un panneau de
 * verre qui monte par-dessus, l'icône de l'appli à cheval sur son bord. Sur ordinateur,
 * le panneau se centre et s'arrondit des quatre côtés.
 *
 * Le dessin n'est fait que de formes pleines aux couleurs des jetons : il suit le mode
 * sombre et la palette sans image à charger.
 */
export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children: ReactNode }) {
  return (
    <div className="relative min-h-dvh overflow-hidden">
      <ErdreLandscape className="absolute inset-x-0 top-0 h-[44vh] min-h-[300px] w-full" />
      <div className="absolute left-4 top-[calc(var(--sat)+12px)] z-10">
        <BackLink href="/la-chapelle-sur-erdre" label="Retour aux actus" />
      </div>

      <div className="relative mx-auto flex min-h-dvh max-w-md flex-col justify-end sm:justify-center sm:px-4 sm:py-10">
        <div className="glass glass-strong mt-[34vh] rounded-t-[34px] px-5 pb-[calc(var(--sab)+28px)] sm:mt-0 sm:rounded-[34px] sm:pb-7">
          <span className="mx-auto -mt-[38px] mb-3 flex size-[76px] items-center justify-center rounded-[22px] bg-accent-fill text-white shadow-[0_10px_24px_rgba(0,0,0,0.18),inset_0_1px_1px_rgba(255,255,255,0.35)]">
            <Newspaper className="size-[38px]" strokeWidth={1.8} aria-hidden="true" />
          </span>
          <div className="mb-5 text-center">
            <h1 className="text-[28px] font-bold leading-[34px] text-ink">{title}</h1>
            {subtitle && <p className="mt-1 text-subhead text-ink-muted">{subtitle}</p>}
          </div>
          <div className="flex flex-col gap-3">{children}</div>
        </div>
      </div>
    </div>
  )
}

/** Paysage stylisé : ciel, soleil corail, coteaux, la rivière en bande claire. */
function ErdreLandscape({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 390 380" preserveAspectRatio="xMidYMid slice" className={className} aria-hidden="true">
      <rect width="390" height="380" style={{ fill: 'var(--accent-soft)' }} />
      <circle cx="290" cy="118" r="46" style={{ fill: 'var(--hl)', opacity: 0.85 }} />
      <path d="M0 210 C 70 176 150 182 220 204 S 340 222 390 190 V380 H0Z" style={{ fill: 'var(--accent)', opacity: 0.32 }} />
      <path d="M0 252 C 90 220 170 232 250 252 S 350 266 390 242 V380 H0Z" style={{ fill: 'var(--accent)', opacity: 0.6 }} />
      <path d="M-10 300 C 80 278 160 300 230 290 S 340 270 400 286 L400 306 C 340 292 250 312 190 318 S 60 300 -10 322Z" style={{ fill: 'var(--card)', opacity: 0.55 }} />
      <path d="M0 318 C 100 298 190 318 280 312 S 360 300 390 306 V380 H0Z" style={{ fill: 'var(--accent)', opacity: 0.85 }} />
    </svg>
  )
}

/** Champs groupés façon Réglages : une carte, des lignes séparées en retrait. */
export function FieldGroup({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-[14px] bg-card">
      {children}
    </div>
  )
}

/**
 * Ligne de champ : libellé visible à gauche, saisie à droite. Un vrai `<label>`, pas un
 * placeholder qui disparaît à la frappe. 17 px : en dessous de 16, Safari iOS zoome
 * au focus.
 */
export function FieldRow({ label, ...input }: { label: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="ml-4 flex min-h-[52px] items-center gap-3 pr-4 [label+&]:border-t [label+&]:border-separator">
      <span className="w-[104px] shrink-0 text-body text-ink">{label}</span>
      <input {...input} className="min-w-0 flex-1 bg-transparent py-3 text-body text-ink outline-none" />
    </label>
  )
}
