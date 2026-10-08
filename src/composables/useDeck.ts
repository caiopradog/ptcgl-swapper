import { computed, ref, shallowRef } from 'vue'
import { basicEnergyName, letterFromApiName } from '../config/energyTypes'
import { applySwap, computeWarnings, printKey, sectionOf } from '../lib/deckOps'
import { favoriteKeyForLine, type FavoriteEntry, type FavoriteKey } from '../lib/favorites'
import { exportPtcgl } from '../lib/exportPtcgl'
import { parsePtcgl } from '../lib/parsePtcgl'
import { friendlyError } from '../services/http'
import { tcgApi, type ResolveUpdate } from '../services/tcgApi'
import type { ExportId } from '../lib/printId'
import { DEFAULT_FORMAT, type DeckLine, type ListFormat, type ParseIssue, type Section, type TcgCard } from '../types'

type Resolver = Pick<typeof tcgApi, 'resolveLines'>

export function createDeckStore(api: Resolver = tcgApi) {
  const lines = shallowRef<DeckLine[]>([])
  const issues = ref<ParseIssue[]>([])
  const format = shallowRef<ListFormat>(DEFAULT_FORMAT)
  const imported = ref(false)
  const resolving = ref(false)
  const resolveError = ref<string | null>(null)
  const history = shallowRef<DeckLine[][]>([])
  // Bumped on every import/reset so late API answers for an old deck are ignored.
  let generation = 0

  const bySection = computed(() => {
    const groups: Record<Section, DeckLine[]> = { pokemon: [], trainer: [], energy: [] }
    for (const line of lines.value) groups[sectionOf(line)].push(line)
    return groups
  })
  const totals = computed(() => {
    const sum = (ls: DeckLine[]) => ls.reduce((n, l) => n + l.qty, 0)
    const g = bySection.value
    return { pokemon: sum(g.pokemon), trainer: sum(g.trainer), energy: sum(g.energy), all: sum(lines.value) }
  })
  const exportText = computed(() => exportPtcgl(lines.value, format.value))
  const warnings = computed(() => computeWarnings(lines.value))
  const canUndo = computed(() => history.value.length > 0)
  const unresolvedCount = computed(() => lines.value.filter((l) => l.status === 'unresolved').length)

  function applyUpdates(updates: ResolveUpdate[]) {
    const byKey = new Map(updates.map((u) => [u.key, u]))
    lines.value = lines.value.map((line) => {
      const u = byKey.get(line.key)
      // Never overwrite a line the user already swapped while resolution was running.
      if (!u || line.status !== 'pending') return line
      return { ...line, status: u.status, card: u.card, approximate: u.approximate ?? false }
    })
    // Keep undo snapshots consistent with the freshly resolved data.
    history.value = history.value.map((snap) =>
      snap.map((line) => {
        const u = byKey.get(line.key)
        return u && line.status === 'pending'
          ? { ...line, status: u.status, card: u.card, approximate: u.approximate ?? false }
          : line
      }),
    )
  }

  async function resolve(targets: DeckLine[]) {
    if (!targets.length) return
    const gen = generation
    resolving.value = true
    resolveError.value = null
    try {
      const { error } = await api.resolveLines(targets, (updates) => {
        if (gen === generation) applyUpdates(updates)
      })
      if (gen === generation && error) resolveError.value = friendlyError(error)
    } catch (err) {
      if (gen === generation) resolveError.value = friendlyError(err)
    } finally {
      if (gen === generation) resolving.value = false
    }
  }

  function importText(text: string): Promise<void> {
    generation += 1
    const parsed = parsePtcgl(text)
    lines.value = parsed.lines
    issues.value = parsed.issues
    format.value = parsed.format
    history.value = []
    imported.value = true
    return resolve(parsed.lines)
  }

  /** Retries lines left unresolved (e.g. after a network error). */
  function retryUnresolved(): Promise<void> {
    const keys = new Set(lines.value.filter((l) => l.status === 'unresolved').map((l) => l.key))
    lines.value = lines.value.map((l) => (keys.has(l.key) ? { ...l, status: 'pending' } : l))
    return resolve(lines.value.filter((l) => keys.has(l.key)))
  }

  /**
   * Swaps every copy of the line to `card`, exported as `target` (PTCGL code + number).
   * The line keeps its original name: alternatives always share it, and PTCGL spells some
   * names differently from the API ("Telepathic {P} Energy" vs "Telepathic Psychic Energy").
   */
  function swap(key: string, card: TcgCard, target: ExportId) {
    const next = swapIn(lines.value, key, card, target)
    if (next === lines.value) return
    history.value = [...history.value, lines.value]
    lines.value = next
  }

  function swapIn(current: DeckLine[], key: string, card: TcgCard, target: ExportId): DeckLine[] {
    const line = current.find((l) => l.key === key)
    if (!line) return current
    const energyLetter = line.energyLetter ? (letterFromApiName(card.name) ?? line.energyLetter) : undefined
    return applySwap(current, key, {
      name: energyLetter ? basicEnergyName(energyLetter) : line.name,
      setCode: target.setCode,
      number: target.number,
      card,
      energyLetter,
    })
  }

  /**
   * Swaps every line that has a favorite in its group (see lib/favorites) to that favorite.
   * All swaps form a single undo step. Returns how many lines were swapped.
   */
  function applyFavorites(favorites: Record<FavoriteKey, FavoriteEntry>): number {
    let next = lines.value
    let swapped = 0
    for (const { key } of lines.value) {
      // Re-read: an earlier swap in this loop may have merged this line into another.
      const line = next.find((l) => l.key === key)
      const favKey = line && favoriteKeyForLine(line)
      const fav = favKey ? favorites[favKey] : undefined
      if (!line || !fav) continue
      if (printKey(line.setCode, line.number) === printKey(fav.exportId.setCode, fav.exportId.number)) continue
      next = swapIn(next, key, fav.card, fav.exportId)
      swapped += 1
    }
    if (swapped) {
      history.value = [...history.value, lines.value]
      lines.value = next
    }
    return swapped
  }

  function undo() {
    const prev = history.value[history.value.length - 1]
    if (!prev) return
    history.value = history.value.slice(0, -1)
    lines.value = prev
  }

  function reset() {
    generation += 1
    lines.value = []
    issues.value = []
    format.value = DEFAULT_FORMAT
    history.value = []
    imported.value = false
    resolving.value = false
    resolveError.value = null
  }

  return {
    lines, issues, format, imported, resolving, resolveError, bySection, totals, exportText, warnings,
    canUndo, unresolvedCount, importText, retryUnresolved, swap, applyFavorites, undo, reset,
  }
}

export type DeckStore = ReturnType<typeof createDeckStore>

let store: DeckStore | undefined

/** App-wide deck state (singleton). */
export function useDeck(): DeckStore {
  store ??= createDeckStore()
  return store
}
