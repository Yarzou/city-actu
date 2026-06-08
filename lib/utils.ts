import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { isToday, isYesterday, isTomorrow, format } from 'date-fns'
import { fr } from 'date-fns/locale'
import type { Article } from '@/lib/types'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  if (isToday(date)) return "Aujourd'hui"
  if (isYesterday(date)) return 'Hier'
  if (isTomorrow(date)) return 'Demain'
  return format(date, 'dd/MM/yyyy', { locale: fr })
}

export function formatEventDateRange(startStr: string, endStr: string | null): string {
  const start = new Date(startStr)
  if (!endStr) return formatDate(startStr)
  const end = new Date(endStr)
  // Same day
  if (format(start, 'yyyy-MM-dd') === format(end, 'yyyy-MM-dd')) return formatDate(startStr)
  // Same month+year
  if (format(start, 'MM/yyyy') === format(end, 'MM/yyyy')) {
    return `${format(start, 'd', { locale: fr })} - ${format(end, 'd MMM yyyy', { locale: fr })}`
  }
  // Different months
  return `${format(start, 'd MMM', { locale: fr })} - ${format(end, 'd MMM yyyy', { locale: fr })}`
}

export function formatDateShort(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength).trimEnd() + '…'
}

export function groupByDay(articles: Article[]): Map<string, Article[]> {
  const map = new Map<string, Article[]>()
  for (const article of articles) {
    const key = article.published_at
      ? format(new Date(article.published_at), 'yyyy-MM-dd')
      : 'unknown'
    const group = map.get(key) ?? []
    group.push(article)
    map.set(key, group)
  }
  return map
}

export function formatDayHeader(dateKey: string): string {
  if (dateKey === 'unknown') return 'Date inconnue'
  const date = new Date(dateKey + 'T12:00:00')
  if (isToday(date)) return `Aujourd'hui – ${format(date, 'EEEE d MMMM', { locale: fr })}`
  if (isYesterday(date)) return `Hier – ${format(date, 'EEEE d MMMM', { locale: fr })}`
  if (isTomorrow(date)) return `Demain – ${format(date, 'EEEE d MMMM', { locale: fr })}`
  return format(date, 'EEEE d MMMM yyyy', { locale: fr })
}
