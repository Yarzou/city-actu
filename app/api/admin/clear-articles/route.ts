import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { isAdminUser } from '@/lib/authz'

export const runtime = 'nodejs'

const PARIS_TIMEZONE = 'Europe/Paris'

function getWeekdayIndex(weekday: string) {
  const map: Record<string, number> = {
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
    Sun: 7,
  }
  return map[weekday] ?? 1
}

function getTimezoneOffsetMinutes(instant: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'shortOffset',
  }).formatToParts(instant)
  const offsetPart = parts.find((part) => part.type === 'timeZoneName')?.value ?? 'GMT+0'
  const match = offsetPart.match(/^GMT([+-])(\d{1,2})(?::?(\d{2}))?$/)
  if (!match) return 0

  const sign = match[1] === '-' ? -1 : 1
  const hours = Number(match[2] ?? 0)
  const minutes = Number(match[3] ?? 0)
  return sign * (hours * 60 + minutes)
}

function getCurrentWeekStartParisIso(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: PARIS_TIMEZONE,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)

  const weekday = parts.find((part) => part.type === 'weekday')?.value ?? 'Mon'
  const year = Number(parts.find((part) => part.type === 'year')?.value ?? '1970')
  const month = Number(parts.find((part) => part.type === 'month')?.value ?? '01')
  const day = Number(parts.find((part) => part.type === 'day')?.value ?? '01')

  const weekdayIndex = getWeekdayIndex(weekday)
  const daysSinceMonday = weekdayIndex - 1

  const parisDateAsUtc = new Date(Date.UTC(year, month - 1, day))
  parisDateAsUtc.setUTCDate(parisDateAsUtc.getUTCDate() - daysSinceMonday)

  const mondayYear = parisDateAsUtc.getUTCFullYear()
  const mondayMonth = parisDateAsUtc.getUTCMonth()
  const mondayDay = parisDateAsUtc.getUTCDate()
  const mondayLocalMidnightAsUtc = new Date(Date.UTC(mondayYear, mondayMonth, mondayDay, 0, 0, 0))
  const offsetMinutes = getTimezoneOffsetMinutes(mondayLocalMidnightAsUtc, PARIS_TIMEZONE)

  return new Date(mondayLocalMidnightAsUtc.getTime() - offsetMinutes * 60_000).toISOString()
}

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }
  if (!(await isAdminUser(supabase, user.id))) {
    return NextResponse.json({ error: 'Accès administrateur requis' }, { status: 403 })
  }

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const threshold = getCurrentWeekStartParisIso()
  const { error, count } = await admin
    .from('articles')
    .delete({ count: 'exact' })
    .or(`event_end_date.lt.${threshold},and(event_end_date.is.null,published_at.lt.${threshold})`)

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, deleted: count ?? 0, threshold })
}
