const PARIS_TZ = 'Europe/Paris'

function getParisNowParts(now: Date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: PARIS_TZ,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)

  const map: Record<string, string> = {}
  for (const part of parts) {
    if (part.type !== 'literal') map[part.type] = part.value
  }

  return {
    weekday: map.weekday,
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
  }
}

function parisMidnightToUtc(year: number, month: number, day: number) {
  const utcGuess = new Date(Date.UTC(year, month - 1, day, 0, 0, 0))
  const sameMomentInParis = new Date(utcGuess.toLocaleString('en-US', { timeZone: PARIS_TZ }))
  const sameMomentInUtc = new Date(utcGuess.toLocaleString('en-US', { timeZone: 'UTC' }))
  const offsetMs = sameMomentInUtc.getTime() - sameMomentInParis.getTime()
  return new Date(utcGuess.getTime() + offsetMs)
}

export function getCurrentParisWeekMondayUtcIso(now = new Date()): string {
  const { weekday, year, month, day } = getParisNowParts(now)
  const weekdayIndex: Record<string, number> = {
    Mon: 0,
    Tue: 1,
    Wed: 2,
    Thu: 3,
    Fri: 4,
    Sat: 5,
    Sun: 6,
  }

  const currentDay = new Date(Date.UTC(year, month - 1, day, 0, 0, 0))
  const daysSinceMonday = weekdayIndex[weekday] ?? 0
  currentDay.setUTCDate(currentDay.getUTCDate() - daysSinceMonday)

  const mondayYear = currentDay.getUTCFullYear()
  const mondayMonth = currentDay.getUTCMonth() + 1
  const mondayDay = currentDay.getUTCDate()
  return parisMidnightToUtc(mondayYear, mondayMonth, mondayDay).toISOString()
}
