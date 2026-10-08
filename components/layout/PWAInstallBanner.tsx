'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { X, Download, Share } from 'lucide-react'
import { buttonClass } from '@/components/ui/Button'

const DISMISSED_KEY = 'pwa_install_dismissed_until'
const DISMISS_DAYS = 7

type Platform = 'android' | 'ios' | null

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

// Safari throws a SecurityError on localStorage when cookies are fully blocked;
// an uncaught throw here would silently kill the whole detection effect.
function readDismissedUntil(): number {
  try {
    return Number(localStorage.getItem(DISMISSED_KEY)) || 0
  } catch {
    return 0
  }
}

function writeDismissedUntil(value: number) {
  try {
    localStorage.setItem(DISMISSED_KEY, String(value))
  } catch {
    /* ignore — the banner just reappears on the next visit */
  }
}

export default function PWAInstallBanner() {
  const [platform, setPlatform] = useState<Platform>(null)
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [visible, setVisible] = useState(false)
  const [iosHint, setIosHint] = useState(false)
  const [isSafari, setIsSafari] = useState(true)

  useEffect(() => {
    // ?install=1 forces the banner — bypasses the standalone and snooze checks.
    const forced = new URLSearchParams(window.location.search).get('install') === '1'

    // Already installed — don't show
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true
    if (isStandalone && !forced) return

    // User dismissed recently
    if (!forced && Date.now() < readDismissedUntil()) return

    const ua = navigator.userAgent
    // iPadOS 13+ ships a desktop Safari user agent; only maxTouchPoints gives it away.
    const isIpadOs = /macintosh/i.test(ua) && navigator.maxTouchPoints > 1
    // Chrome and Firefox on iOS also install through the share menu, so they stay in.
    const isIos = /iphone|ipad|ipod/i.test(ua) || isIpadOs
    const isAndroidChrome = /android/i.test(ua) && /chrome/i.test(ua) && !/edg/i.test(ua)

    setIsSafari(!/crios|fxios|edgios|opt\//i.test(ua))

    if (isIos || (forced && !isAndroidChrome)) {
      setPlatform('ios')
      setVisible(true)
    } else if (isAndroidChrome) {
      // Wait for the native prompt event — if it fires, we're eligible
      const handler = (e: Event) => {
        e.preventDefault()
        setDeferredPrompt(e as BeforeInstallPromptEvent)
        setPlatform('android')
        setVisible(true)
      }
      window.addEventListener('beforeinstallprompt', handler)
      return () => window.removeEventListener('beforeinstallprompt', handler)
    }
  }, [])

  const dismiss = () => {
    writeDismissedUntil(Date.now() + DISMISS_DAYS * 24 * 60 * 60 * 1000)
    setVisible(false)
  }

  const handleInstall = async () => {
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') {
      setVisible(false)
    } else {
      // Dismissed in native dialog → snooze our banner too
      dismiss()
    }
    setDeferredPrompt(null)
  }

  if (!visible) return null

  return (
    // Feuille de verre posée juste au-dessus de la barre d'onglets flottante.
    <div className="bottom-toast pointer-events-none fixed inset-x-0 z-40 flex justify-center px-4">
      <div className="glass glass-strong pointer-events-auto w-full max-w-sm overflow-hidden rounded-[28px]">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 pt-4 pb-3">
          <Image
            src="/icons/icon.svg"
            alt="Icône Ville Actu"
            width={44}
            height={44}
            unoptimized
            className="rounded-xl shrink-0"
          />
          <div className="flex-1 min-w-0">
            <p className="truncate text-headline text-ink">Ville Actu</p>
            <p className="text-footnote text-ink-muted">Ajouter à l&apos;écran d&apos;accueil</p>
          </div>
          <button
            onClick={dismiss}
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-fill text-ink-muted focus-ring"
            aria-label="Fermer"
          >
            <X size={16} strokeWidth={2.6} />
          </button>
        </div>

        {/* Android: one-click install */}
        {platform === 'android' && (
          <div className="px-4 pb-4 flex flex-col gap-1">
            <button onClick={handleInstall} className={buttonClass('primary', 'lg')}>
              <Download size={18} />
              Installer l&apos;application
            </button>
            <button onClick={dismiss} className={buttonClass('plain', 'md', 'w-full')}>
              Non merci
            </button>
          </div>
        )}

        {/* iOS: instructions */}
        {platform === 'ios' && (
          <div className="px-4 pb-4 flex flex-col gap-1">
            {!iosHint ? (
              <button onClick={() => setIosHint(true)} className={buttonClass('primary', 'lg')}>
                <Share size={18} />
                Voir comment installer
              </button>
            ) : (
              <div className="space-y-1.5 rounded-2xl bg-accent-soft p-3 text-subhead text-ink">
                <p className="font-semibold">Pour installer :</p>
                <p>
                  1. Appuyez sur{' '}
                  <span className="inline-flex items-center gap-0.5 font-medium text-accent">
                    <Share size={13} className="inline" /> Partager
                  </span>{' '}
                  {isSafari ? 'en bas de Safari' : 'dans la barre du navigateur'}
                </p>
                <p>2. Puis <strong>« Sur l&apos;écran d&apos;accueil »</strong></p>
              </div>
            )}
            <button onClick={dismiss} className={buttonClass('plain', 'md', 'w-full')}>
              Non merci
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
