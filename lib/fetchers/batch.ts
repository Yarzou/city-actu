/**
 * Découpe une liste en tranches de taille fixe.
 *
 * Deux usages dans les fetchers, tous deux contraints par un plafond externe :
 * - limiter la concurrence des requêtes HTTP vers un même site ;
 * - borner la longueur d'un `.in(...)` PostgREST, qui part en query string.
 */
export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}
