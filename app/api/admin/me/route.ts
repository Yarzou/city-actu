import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isAdminUser } from '@/lib/authz'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ isAuthenticated: false, isAdmin: false }, { status: 200 })
  }

  return NextResponse.json({
    isAuthenticated: true,
    isAdmin: await isAdminUser(supabase, user.id),
  })
}
