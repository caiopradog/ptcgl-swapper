import { expandEnergySymbols } from '../config/energyTypes'
import type { DeckLine, EnergyLetter, TcgCard } from '../types'
import { swapKindOf } from './deckOps'
import { energyLetterOf, pokemonFingerprint, type SwapKind } from './equivalence'
import { normalizeText } from './normalize'
import type { ExportId } from './printId'

/**
 * A favorite is stored per "group" of interchangeable cards, using the same rules as the
 * swap modal: basic energy by type, trainers (incl. special energy) by exact name, and
 * Pokémon by exact name + gameplay fingerprint (so a favorite never changes how a card plays).
 */
export type FavoriteKey = string

export interface FavoriteEntry {
  card: TcgCard
  exportId: ExportId
}

// FNV-1a: keeps Pokémon keys short; the full fingerprint can be several KB.
function hash(text: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

function energyKey(letter: EnergyLetter): FavoriteKey {
  return `energy:${letter}`
}

function trainerKey(name: string): FavoriteKey {
  // PTCGL writes "Telepathic {P} Energy", the API "Telepathic Psychic Energy".
  return `trainer:${normalizeText(expandEnergySymbols(name))}`
}

function pokemonKey(card: TcgCard): FavoriteKey {
  return `pokemon:${normalizeText(card.name)}:${hash(pokemonFingerprint(card))}`
}

/** Key of a card listed in the swap modal of the given kind. */
export function favoriteKeyForCard(card: TcgCard, kind: SwapKind): FavoriteKey | undefined {
  if (kind === 'energy') {
    const letter = energyLetterOf(card)
    return letter && energyKey(letter)
  }
  return kind === 'pokemon' ? pokemonKey(card) : trainerKey(card.name)
}

/**
 * Key of a deck line. Unresolved basic energy still works (the letter is known);
 * Pokémon need the exact print, so unresolved/approximate ones have no key.
 */
export function favoriteKeyForLine(line: DeckLine): FavoriteKey | undefined {
  const kind = swapKindOf(line)
  if (kind === 'energy') return line.energyLetter && energyKey(line.energyLetter)
  if (kind === 'trainer') return trainerKey(line.card?.name ?? line.name)
  if (!line.card || line.approximate) return undefined
  return pokemonKey(line.card)
}
