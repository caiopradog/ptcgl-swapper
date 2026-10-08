import { computed, shallowRef } from 'vue'
import type { FavoriteEntry, FavoriteKey } from '../lib/favorites'
import type { ExportId } from '../lib/printId'
import type { TcgCard } from '../types'

export const FAVORITES_STORAGE_KEY = 'ptcgl-swapper:favorites:v1'

type FavoriteMap = Record<FavoriteKey, FavoriteEntry>

function defaultStorage(): Storage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage
  } catch {
    return undefined
  }
}

function isEntry(value: unknown): value is FavoriteEntry {
  const v = value as FavoriteEntry | null
  return !!v && typeof v.card?.id === 'string' && typeof v.exportId?.setCode === 'string'
}

export function createFavoritesStore(storage: Storage | undefined = defaultStorage()) {
  const favorites = shallowRef<FavoriteMap>(load())

  function load(): FavoriteMap {
    try {
      const raw = storage?.getItem(FAVORITES_STORAGE_KEY)
      const parsed: unknown = raw ? JSON.parse(raw) : {}
      if (!parsed || typeof parsed !== 'object') return {}
      // Drop anything malformed instead of failing the whole app.
      return Object.fromEntries(Object.entries(parsed).filter(([, v]) => isEntry(v))) as FavoriteMap
    } catch {
      return {}
    }
  }

  function save(next: FavoriteMap) {
    favorites.value = next
    try {
      storage?.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(next))
    } catch {
      // Storage full or blocked: favorites still work until the page is reloaded.
    }
  }

  function isFavorite(key: FavoriteKey | undefined, cardId: string): boolean {
    return !!key && favorites.value[key]?.card.id === cardId
  }

  /** Marks `card` as the favorite of its group (replacing any other), or unmarks it. */
  function toggle(key: FavoriteKey, card: TcgCard, exportId: ExportId) {
    const next = { ...favorites.value }
    if (next[key]?.card.id === card.id) delete next[key]
    else next[key] = { card, exportId }
    save(next)
  }

  const count = computed(() => Object.keys(favorites.value).length)

  return { favorites, count, isFavorite, toggle }
}

export type FavoritesStore = ReturnType<typeof createFavoritesStore>

let store: FavoritesStore | undefined

/** App-wide favorites (singleton). */
export function useFavorites(): FavoritesStore {
  store ??= createFavoritesStore()
  return store
}
