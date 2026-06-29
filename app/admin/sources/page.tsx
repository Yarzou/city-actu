'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AdminSourcesPanel } from '@/components/admin/AdminSourcesPanel'
import { createClient } from '@/lib/supabase/client'
import { resolveAdminStatusClient } from '@/lib/admin-client'

export default function AdminSourcesPage() {
  const router = useRouter()
  const [canAccess, setCanAccess] = useState<boolean | null>(null)

  useEffect(() => {
    const supabase = createClient()

    async function checkAccess() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.replace('/auth/login')
        return
      }

      const isAdmin = await resolveAdminStatusClient(supabase, user.id)
      if (!isAdmin) {
        router.replace('/profil')
        return
      }
      setCanAccess(true)
    }
    void checkAccess()
  }, [router])

  if (canAccess !== true) return null

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Gestion des sources</h1>
      <AdminSourcesPanel />
    </div>
  )
}
