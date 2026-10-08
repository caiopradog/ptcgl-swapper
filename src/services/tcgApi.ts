import { expandEnergySymbols } from '../config/energyTypes'
import { SETS_SNAPSHOT } from '../config/setsSnapshot'
import { apiNumberFor, exportIdFor, galleryOf, type ExportId } from '../lib/printId'
import type { DeckLine, TcgCard, TcgSet } from '../types'
import { sortByRelease } from '../lib/equivalence'
import { escapeLucenePhrase, escapeLuceneTerm, normalizeNumber, normalizeText } from '../lib/normalize'
import { cacheGet, cacheSet } from './cache'
import { createLimiter, fetchJsonWithRetry, type RetryOptions } from './http'

export const API_BASE = 'https://api.pokemontcg.io/v2'

// Only the fields the app uses; keeps responses (and the localStorage cache) small.
const CARD_FIELDS = [
  'id', 'name', 'supertype', 'subtypes', 'hp', 'types', 'abilities', 'attacks', 'weaknesses',
  'resistances', 'retreatCost', 'rules', 'regulationMark', 'set', 'number', 'images',
].join(',')
const SET_FIELDS = 'id,name,series,ptcgoCode,releaseDate'

const PAGE_SIZE = 250
const MAX_PAGES = 4
// ~30 chars per clause; 40 clauses keep the URL around 1.5 KB (a 60-card deck has at most 60 lines).
const CLAUSES_PER_QUERY = 40
const SETS_TTL_MS = 7 * 24 * 60 * 60 * 1000

interface ListResponse<T> {
  data: T[]
  page: number
  pageSize: number
  count: number
  totalCount: number
}

export interface SetIndex {
  byId: Map<string, TcgSet>
  /** One PTCGL code may map to several API sets (e.g. SIT → swsh12 + swsh12tg). */
  idsByCode: Map<string, string[]>
}

export interface ResolveUpdate {
  key: string
  status: 'resolved' | 'unresolved'
  card?: TcgCard
  approximate?: boolean
}

export interface TcgApiOptions {
  baseUrl?: string
  apiKey?: string
  concurrency?: number
  fetchImpl?: typeof fetch
  retry?: Omit<RetryOptions, 'fetchImpl'>
  useCache?: boolean
  /** Used when GET /sets fails. Defaults to the bundled snapshot. */
  setsFallback?: TcgSet[]
}

export function digitsOf(value: string): string {
  return (value.match(/\d+/g) ?? []).join('').replace(/^0+(?=\d)/, '')
}

export function createTcgApi(options: TcgApiOptions = {}) {
  const baseUrl = options.baseUrl ?? API_BASE
  const apiKey = options.apiKey
  const useCache = options.useCache ?? true
  const limit = createLimiter(options.concurrency ?? 3)
  let setIndexPromise: Promise<SetIndex> | undefined

  function headers(): HeadersInit {
    return apiKey ? { 'X-Api-Key': apiKey } : {}
  }

  async function getJson<T>(
    path: string,
    params: Record<string, string>,
    ttlMs?: number,
    retries?: number,
  ): Promise<T> {
    const url = `${baseUrl}${path}?${new URLSearchParams(params).toString()}`
    if (useCache) {
      const hit = cacheGet<T>(url)
      if (hit !== undefined) return hit
    }
    const data = await limit(() =>
      fetchJsonWithRetry<T>(
        url,
        { headers: headers() },
        { ...options.retry, ...(retries !== undefined && { retries }), fetchImpl: options.fetchImpl },
      ),
    )
    if (useCache) cacheSet(url, data, ttlMs)
    return data
  }

  async function searchCards(q: string): Promise<TcgCard[]> {
    const cards: TcgCard[] = []
    for (let page = 1; page <= MAX_PAGES; page++) {
      const res = await getJson<ListResponse<TcgCard>>('/cards', {
        q,
        select: CARD_FIELDS,
        pageSize: String(PAGE_SIZE),
        page: String(page),
      })
      cards.push(...res.data)
      if (cards.length >= res.totalCount || res.data.length < PAGE_SIZE) break
    }
    return cards
  }

  function buildSetIndex(sets: TcgSet[]): SetIndex {
    const byId = new Map<string, TcgSet>()
    const idsByCode = new Map<string, string[]>()
    for (const set of sets) {
      byId.set(set.id, set)
      if (!set.ptcgoCode) continue
      const code = set.ptcgoCode.toUpperCase()
      idsByCode.set(code, [...(idsByCode.get(code) ?? []), set.id])
    }
    return { byId, idsByCode }
  }

  /**
   * Loaded once per session (and cached for a week). Only one retry: if the live
   * request fails, the bundled snapshot is used right away instead of making the user
   * wait through the full backoff; the live list is tried again on the next call.
   */
  function getSetIndex(): Promise<SetIndex> {
    setIndexPromise ??= getJson<ListResponse<TcgSet>>(
      '/sets',
      { select: SET_FIELDS, pageSize: String(PAGE_SIZE) },
      SETS_TTL_MS,
      1,
    )
      .then((res) => buildSetIndex(res.data))
      .catch(() => {
        setIndexPromise = undefined
        return buildSetIndex(options.setsFallback ?? SETS_SNAPSHOT)
      })
    return setIndexPromise
  }

  /**
   * PTCGL code + number of a card, or undefined if its set has no PTCGL code.
   * The code comes from /sets because the `set` object embedded in cards sometimes
   * lacks `ptcgoCode` (confirmed e.g. on sv1/sv3 energies).
   */
  function exportIdOf(card: TcgCard, index: SetIndex): ExportId | undefined {
    const code = index.byId.get(card.set.id)?.ptcgoCode ?? card.set.ptcgoCode
    return code ? exportIdFor(card.set.id, code, card.number) : undefined
  }

  /** API set ids behind a PTCGL code ("LOR-TG" → only the Trainer Gallery set of LOR). */
  function setIdsFor(setCode: string, index: SetIndex): string[] {
    const gallery = galleryOf(setCode)
    if (!gallery) return index.idsByCode.get(setCode.toUpperCase()) ?? []
    const suffix = gallery.prefix.toLowerCase()
    return (index.idsByCode.get(gallery.base) ?? []).filter((id) => id.toLowerCase().endsWith(suffix))
  }

  /** Cards whose normalized name is exactly `name` (the API phrase query is looser). */
  async function searchByExactName(name: string): Promise<TcgCard[]> {
    const cards = await searchCards(`name:"${escapeLucenePhrase(name)}"`)
    const wanted = normalizeText(name)
    return cards.filter((c) => normalizeText(c.name) === wanted)
  }

  /** All basic energy cards (supertype:Energy subtypes:Basic), cached. */
  function getBasicEnergies(): Promise<TcgCard[]> {
    return searchCards('supertype:Energy subtypes:Basic')
  }

  /** Splits OR-clauses into queries small enough to keep the URL short. */
  async function searchOr(clauses: string[]): Promise<TcgCard[]> {
    const chunks: string[][] = []
    for (let i = 0; i < clauses.length; i += CLAUSES_PER_QUERY) chunks.push(clauses.slice(i, i + CLAUSES_PER_QUERY))
    const results = await Promise.all(chunks.map((chunk) => searchCards(chunk.join(' OR '))))
    return results.flat()
  }

  /** Key of one printing in the per-card cache, so later imports skip cards already seen. */
  function printCacheKey(setIds: string[], apiNumber: string): string {
    return `print:${setIds.join('+')}|${normalizeNumber(apiNumber)}`
  }

  /**
   * Resolves deck lines to API cards with as few requests as possible:
   * 1. every printing not in the per-card cache goes into a single OR query
   *    ("((set.id:sv3) number:125) OR ((set.id:svp) number:85) OR ...");
   * 2. lines still missing go into a single OR query by name, keeping exact-name matches.
   * Basic energies never fall back to name (their PTCGL name is not an API name).
   * `onUpdate` is called after each step; the first API error (if any) is returned so
   * the UI can offer a retry.
   */
  async function resolveLines(
    lines: DeckLine[],
    onUpdate: (updates: ResolveUpdate[]) => void,
  ): Promise<{ error?: unknown }> {
    let firstError: unknown
    const index = await getSetIndex()

    const targets = lines.map((line) => ({
      line,
      setIds: setIdsFor(line.setCode, index),
      apiNumber: apiNumberFor(line.setCode, line.number),
    }))

    // Step 1: by set + number.
    const found = new Map<string, TcgCard>()
    const toFetch = new Map<string, { setIds: string[]; apiNumber: string }>()
    for (const t of targets) {
      if (!t.setIds.length) continue
      const key = printCacheKey(t.setIds, t.apiNumber)
      const cached = useCache ? cacheGet<TcgCard>(key) : undefined
      if (cached) found.set(t.line.key, cached)
      else toFetch.set(key, t)
    }
    if (toFetch.size) {
      const clauses = [...toFetch.values()].map(({ setIds, apiNumber }) => {
        const sets = setIds.map((id) => `set.id:${escapeLuceneTerm(id)}`).join(' OR ')
        return `((${sets}) number:${escapeLuceneTerm(apiNumber)})`
      })
      try {
        const cards = await searchOr(clauses)
        for (const t of targets) {
          const match = cards.find(
            (c) => t.setIds.includes(c.set.id) && normalizeNumber(c.number) === normalizeNumber(t.apiNumber),
          )
          if (!match) continue
          found.set(t.line.key, match)
          if (useCache) cacheSet(printCacheKey(t.setIds, t.apiNumber), match)
        }
      } catch (err) {
        firstError ??= err
      }
    }
    onUpdate([...found].map(([key, card]) => ({ key, status: 'resolved' as const, card })))

    // Step 2: by exact name, for whatever is still missing.
    const missing = targets.filter((t) => !found.has(t.line.key))
    if (!missing.length) return { error: firstError }
    const byName = missing.filter((t) => !t.line.energyLetter)
    const updates: ResolveUpdate[] = missing
      .filter((t) => t.line.energyLetter)
      .map((t) => ({ key: t.line.key, status: 'unresolved' as const }))

    if (byName.length) {
      const names = [...new Set(byName.map((t) => expandEnergySymbols(t.line.name)))]
      let candidates: TcgCard[] | undefined
      try {
        candidates = sortByRelease(await searchOr(names.map((n) => `name:"${escapeLucenePhrase(n)}"`)))
      } catch (err) {
        firstError ??= err
      }
      for (const { line, setIds } of byName) {
        const wanted = normalizeText(expandEnergySymbols(line.name))
        const sameName = (candidates ?? []).filter((c) => normalizeText(c.name) === wanted)
        // Same set + same digits (e.g. PTCGL "PR-SW 251" vs API "SWSH251") counts as exact.
        const exact = sameName.find((c) => setIds.includes(c.set.id) && digitsOf(c.number) === digitsOf(line.number))
        if (exact) updates.push({ key: line.key, status: 'resolved', card: exact })
        else if (sameName.length) updates.push({ key: line.key, status: 'resolved', card: sameName[0], approximate: true })
        else updates.push({ key: line.key, status: 'unresolved' })
      }
    }
    onUpdate(updates)
    return { error: firstError }
  }

  return { getSetIndex, exportIdOf, searchCards, searchByExactName, getBasicEnergies, resolveLines }
}

export type TcgApi = ReturnType<typeof createTcgApi>

export const tcgApi = createTcgApi({ apiKey: import.meta.env.VITE_POKEMONTCG_API_KEY || undefined })
