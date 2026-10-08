import { describe, expect, it } from 'vitest'
import { createDeckStore } from '../src/composables/useDeck'
import { createFavoritesStore, FAVORITES_STORAGE_KEY } from '../src/composables/useFavorites'
import { favoriteKeyForCard, favoriteKeyForLine, type FavoriteEntry } from '../src/lib/favorites'
import { parsePtcgl } from '../src/lib/parsePtcgl'
import type { ResolveUpdate } from '../src/services/tcgApi'
import type { DeckLine, TcgCard } from '../src/types'
import * as F from './fixtures'

class MemoryStorage implements Storage {
  private data = new Map<string, string>()
  failWrites = false
  get length() { return this.data.size }
  clear() { this.data.clear() }
  getItem(k: string) { return this.data.get(k) ?? null }
  key(i: number) { return [...this.data.keys()][i] ?? null }
  removeItem(k: string) { this.data.delete(k) }
  setItem(k: string, v: string) {
    if (this.failWrites) throw new Error('QuotaExceededError')
    this.data.set(k, v)
  }
}

const line = (text: string, card?: TcgCard, extra: Partial<DeckLine> = {}): DeckLine => ({
  ...parsePtcgl(text).lines[0],
  status: card ? 'resolved' : 'unresolved',
  card,
  ...extra,
})

describe('favorite keys', () => {
  it('groups basic energy by type, whatever the API name or art', () => {
    expect(favoriteKeyForCard(F.fireEnergySve, 'energy')).toBe('energy:R')
    expect(favoriteKeyForCard(F.fireEnergyOld, 'energy')).toBe('energy:R')
    expect(favoriteKeyForCard(F.fightingEnergySve, 'energy')).toBe('energy:F')
    // Unresolved MEE energy still has a key (from the letter).
    expect(favoriteKeyForLine(line('1 Basic {R} Energy MEE 10'))).toBe('energy:R')
  })

  it('groups trainers by exact name, regardless of text or era', () => {
    const key = favoriteKeyForCard(F.bossMeg, 'trainer')
    expect(favoriteKeyForCard(F.bossRcl, 'trainer')).toBe(key)
    expect(favoriteKeyForLine(line("2 Boss's Orders RCL 189", F.bossRcl))).toBe(key)
    expect(favoriteKeyForCard(F.ultraBallSvi, 'trainer')).not.toBe(key)
  })

  it('matches PTCGL energy symbols to API names (Telepathic {P} Energy)', () => {
    const fromCard = favoriteKeyForCard(F.telepathicPor, 'trainer')
    expect(favoriteKeyForLine(line('4 Telepathic {P} Energy POR 88', F.telepathicPor))).toBe(fromCard)
    // Unresolved: the section header says it is not a Pokémon, so the name is enough.
    expect(favoriteKeyForLine(line('Energy: 4\n4 Telepathic {P} Energy XYZ 1'))).toBe(fromCard)
  })

  it('groups Pokémon by name + effect', () => {
    const key = favoriteKeyForCard(F.charizardObf, 'pokemon')
    expect(favoriteKeyForCard(F.charizardPaf, 'pokemon')).toBe(key) // equivalent print
    expect(favoriteKeyForCard(F.charizardMew, 'pokemon')).not.toBe(key) // different attacks
    expect(favoriteKeyForLine(line('1 Charizard ex OBF 125', F.charizardObf))).toBe(key)
  })

  it('has no key for Pokémon whose exact print is unknown', () => {
    expect(favoriteKeyForLine(line('1 Charizard ex XYZ 1'))).toBeUndefined()
    expect(favoriteKeyForLine(line('1 Charizard ex XYZ 1', F.charizardObf, { approximate: true }))).toBeUndefined()
  })
})

describe('useFavorites', () => {
  const key = favoriteKeyForCard(F.bossRcl, 'trainer')!

  it('toggles a favorite and keeps one per group', () => {
    const favs = createFavoritesStore(new MemoryStorage())
    favs.toggle(key, F.bossLorTg, { setCode: 'LOR-TG', number: '24' })
    expect(favs.isFavorite(key, F.bossLorTg.id)).toBe(true)
    // Starring another print of the same group replaces it.
    favs.toggle(key, F.bossMeg, { setCode: 'MEG', number: '114' })
    expect(favs.isFavorite(key, F.bossLorTg.id)).toBe(false)
    expect(favs.isFavorite(key, F.bossMeg.id)).toBe(true)
    expect(favs.count.value).toBe(1)
    // Clicking the starred one again removes it.
    favs.toggle(key, F.bossMeg, { setCode: 'MEG', number: '114' })
    expect(favs.count.value).toBe(0)
  })

  it('persists in localStorage and reloads', () => {
    const storage = new MemoryStorage()
    createFavoritesStore(storage).toggle(key, F.bossLorTg, { setCode: 'LOR-TG', number: '24' })
    expect(JSON.parse(storage.getItem(FAVORITES_STORAGE_KEY)!)[key].exportId).toEqual({ setCode: 'LOR-TG', number: '24' })
    const reloaded = createFavoritesStore(storage)
    expect(reloaded.isFavorite(key, F.bossLorTg.id)).toBe(true)
  })

  it('survives corrupted, malformed or unavailable storage', () => {
    const storage = new MemoryStorage()
    storage.setItem(FAVORITES_STORAGE_KEY, '{not json')
    expect(createFavoritesStore(storage).count.value).toBe(0)
    storage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify({ good: { card: F.bossMeg, exportId: { setCode: 'MEG', number: '114' } }, bad: 42 }))
    expect(Object.keys(createFavoritesStore(storage).favorites.value)).toEqual(['good'])

    storage.failWrites = true
    const favs = createFavoritesStore(storage)
    favs.toggle(key, F.bossRcl, { setCode: 'RCL', number: '189' }) // must not throw
    expect(favs.isFavorite(key, F.bossRcl.id)).toBe(true)
    expect(createFavoritesStore(undefined).count.value).toBe(0)
  })
})

describe('useDeck.applyFavorites', () => {
  const BY_PRINT: Record<string, TcgCard> = {
    'RCL|189': F.bossRcl, 'MEG|114': F.bossMeg, 'OBF|125': F.charizardObf, 'MEW|6': F.charizardMew,
    'POR|88': F.telepathicPor,
  }
  const fakeApi = {
    async resolveLines(lines: DeckLine[], onUpdate: (u: ResolveUpdate[]) => void) {
      onUpdate(lines.map((l) => {
        const card = BY_PRINT[`${l.setCode}|${l.number}`]
        return card ? { key: l.key, status: 'resolved' as const, card } : { key: l.key, status: 'unresolved' as const }
      }))
      return {}
    },
  }
  const DECK = `Pokémon: 2
1 Charizard ex OBF 125
1 Charizard ex MEW 6

Trainer: 3
2 Boss's Orders RCL 189
1 Boss's Orders MEG 114

Energy: 7
3 Basic {R} Energy MEE 10
4 Telepathic {P} Energy POR 88`

  const fav = (card: TcgCard, setCode: string, number = card.number): [string, FavoriteEntry] => {
    const kind = card.supertype === 'Pokémon' ? 'pokemon' : card.subtypes?.includes('Basic') ? 'energy' : 'trainer'
    return [favoriteKeyForCard(card, kind)!, { card, exportId: { setCode, number } }]
  }

  async function load() {
    const deck = createDeckStore(fakeApi)
    await deck.importText(DECK)
    return deck
  }

  it('swaps every line of a favorite group, merging duplicates, as a single undo step', async () => {
    const deck = await load()
    const original = deck.exportText.value
    const swapped = deck.applyFavorites(Object.fromEntries([
      fav(F.bossLorTg, 'LOR-TG', '24'),
      fav(F.fireEnergySveHolo, 'SVE'),
      fav(F.charizardPaf, 'PAF'),
    ]))
    // RCL 189 + MEG 114 → LOR-TG 24 (merged), MEE 10 → SVE 10, OBF 125 → PAF 54.
    expect(swapped).toBe(4)
    expect(deck.exportText.value).toBe(`Pokémon: 2
1 Charizard ex PAF 54
1 Charizard ex MEW 6

Trainer: 3
3 Boss's Orders LOR-TG 24

Energy: 7
3 Basic {R} Energy SVE 10
4 Telepathic {P} Energy POR 88
`)
    deck.undo()
    expect(deck.exportText.value).toBe(original)
    expect(deck.canUndo.value).toBe(false)
  })

  it('never swaps a Pokémon into a version with a different effect', async () => {
    const deck = await load()
    // Favorite is the Darkness Charizard: the Fire one (MEW 6, different attacks) must stay.
    deck.applyFavorites(Object.fromEntries([fav(F.charizardPaf, 'PAF')]))
    expect(deck.exportText.value).toContain('1 Charizard ex MEW 6')
  })

  it('keeps the PTCGL name when applying a special energy favorite', async () => {
    const deck = await load()
    const other = { ...F.telepathicPor, id: 'me3-200', number: '200' }
    expect(deck.applyFavorites(Object.fromEntries([fav(other, 'POR')]))).toBe(1)
    expect(deck.exportText.value).toContain('4 Telepathic {P} Energy POR 200')
  })

  it('does nothing (and adds no undo step) when the deck already uses the favorites', async () => {
    const deck = await load()
    expect(deck.applyFavorites(Object.fromEntries([fav(F.bossMeg, 'MEG')]))).toBe(1) // RCL → MEG (merge)
    expect(deck.applyFavorites(Object.fromEntries([fav(F.bossMeg, 'MEG')]))).toBe(0)
    expect(deck.applyFavorites({})).toBe(0)
    deck.undo()
    expect(deck.canUndo.value).toBe(false)
  })
})
