'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { X, Download, Share } from 'lucide-react'

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
    // `bottom-16` sur mobile : la barre de navigation basse occupe désormais le bas
    // de l'écran, le bandeau se posait par-dessus.
    <div className="fixed bottom-16 sm:bottom-0 left-0 right-0 z-40 flex justify-center px-4 pb-safe pointer-events-none">
      <div className="pointer-events-auto w-full max-w-sm bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
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
            <p className="text-sm font-semibold text-gray-900 truncate">Ville Actu</p>
            <p className="text-xs text-gray-500">Ajouter à l&apos;écran d&apos;accueil</p>
          </div>
          <button
            onClick={dismiss}
            className="p-1.5 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors shrink-0"
            aria-label="Fermer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Android: one-click install */}
        {platform === 'android' && (
          <div className="px-4 pb-4 flex flex-col gap-2">
            <button
              onClick={handleInstall}
              className="w-full flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-700 active:bg-brand-800 text-white text-sm font-semibold py-3 rounded-xl transition-colors"
            >
              <Download size={16} />
              Installer l&apos;application
            </button>
            <button
              onClick={dismiss}
              className="w-full text-center text-sm text-gray-400 hover:text-gray-600 py-1.5 transition-colors"
            >
              Non merci
            </button>
          </div>
        )}

        {/* iOS: instructions */}
        {platform === 'ios' && (
          <div className="px-4 pb-4 flex flex-col gap-2">
            {!iosHint ? (
              <button
                onClick={() => setIosHint(true)}
                className="w-full flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-700 active:bg-brand-800 text-white text-sm font-semibold py-3 rounded-xl transition-colors"
              >
                <Share size={16} />
                Voir comment installer
              </button>
            ) : (
              <div className="bg-brand-50 rounded-xl p-3 text-sm text-brand-800 space-y-1.5">
                <p className="font-semibold">Pour installer :</p>
                <p>
                  1. Appuyez sur{' '}
                  <span className="inline-flex items-center gap-0.5 font-medium">
                    <Share size={13} className="inline" /> Partager
                  </span>{' '}
                  {isSafari ? 'en bas de Safari' : 'dans la barre du navigateur'}
                </p>
                <p>2. Puis <strong>« Sur l&apos;écran d&apos;accueil »</strong></p>
              </div>
            )}
            <button
              onClick={dismiss}
              className="w-full text-center text-sm text-gray-400 hover:text-gray-600 py-1.5 transition-colors"
            >
              Non merci
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
