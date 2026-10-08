// Two-level cache: in-memory Map + localStorage, both with a TTL.
// localStorage access is wrapped because it may be unavailable or full.

interface Entry<T> {
  value: T
  expiresAt: number
}

const PREFIX = 'ptcgl-swapper:v1:'
export const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000

const memory = new Map<string, Entry<unknown>>()

function storage(): Storage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage
  } catch {
    return undefined
  }
}

export function cacheGet<T>(key: string, now = Date.now()): T | undefined {
  const hit = memory.get(key) as Entry<T> | undefined
  if (hit) {
    if (hit.expiresAt > now) return hit.value
    memory.delete(key)
  }
  const store = storage()
  if (!store) return undefined
  try {
    const raw = store.getItem(PREFIX + key)
    if (!raw) return undefined
    const entry = JSON.parse(raw) as Entry<T>
    if (entry.expiresAt <= now) {
      store.removeItem(PREFIX + key)
      return undefined
    }
    memory.set(key, entry)
    return entry.value
  } catch {
    return undefined
  }
}

export function cacheSet<T>(key: string, value: T, ttlMs = DEFAULT_TTL_MS, now = Date.now()): void {
  const entry: Entry<T> = { value, expiresAt: now + ttlMs }
  memory.set(key, entry)
  const store = storage()
  if (!store) return
  try {
    store.setItem(PREFIX + key, JSON.stringify(entry))
  } catch {
    // Quota exceeded: drop expired/old entries of this app and try once more.
    pruneStorage(store, now)
    try {
      store.setItem(PREFIX + key, JSON.stringify(entry))
    } catch {
      /* memory cache only */
    }
  }
}

function pruneStorage(store: Storage, now: number): void {
  const keys: string[] = []
  for (let i = 0; i < store.length; i++) {
    const k = store.key(i)
    if (k?.startsWith(PREFIX)) keys.push(k)
  }
  for (const k of keys) {
    try {
      const entry = JSON.parse(store.getItem(k) ?? 'null') as Entry<unknown> | null
      if (!entry || entry.expiresAt <= now || keys.length > 200) store.removeItem(k)
    } catch {
      store.removeItem(k)
    }
  }
}

export function cacheClearMemory(): void {
  memory.clear()
}
