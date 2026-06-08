'use client'

import { AdminSourcesPanel } from '@/components/admin/AdminSourcesPanel'

export default function AdminSourcesPage() {
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Gestion des sources</h1>
      <AdminSourcesPanel />
    </div>
  )
}

