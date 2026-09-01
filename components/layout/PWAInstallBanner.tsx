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

export default function PWAInstallBanner() {
  const [platform, setPlatform] = useState<Platform>(null)
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [visible, setVisible] = useState(false)
  const [iosHint, setIosHint] = useState(false)

  useEffect(() => {
    // Already installed — don't show
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true
    if (isStandalone) return

    // User dismissed recently
    const until = localStorage.getItem(DISMISSED_KEY)
    if (until && Date.now() < Number(until)) return

    const ua = navigator.userAgent
    const isIos = /iphone|ipad|ipod/i.test(ua) && !/crios|fxios/i.test(ua)
    const isAndroidChrome = /android/i.test(ua) && /chrome/i.test(ua) && !/edg/i.test(ua)

    if (isIos) {
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
    const until = Date.now() + DISMISS_DAYS * 24 * 60 * 60 * 1000
    localStorage.setItem(DISMISSED_KEY, String(until))
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
    <div className="fixed bottom-0 left-0 right-0 z-40 flex justify-center px-4 pb-safe pointer-events-none">
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
                  en bas de Safari
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
