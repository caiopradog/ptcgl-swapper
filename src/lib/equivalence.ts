import { letterFromApiName } from '../config/energyTypes'
import type { EnergyLetter, TcgCard } from '../types'
import { normalizeText } from './normalize'

export type SwapKind = 'energy' | 'trainer' | 'pokemon'

/** Newest set first; ties broken by set id then card number. */
export function sortByRelease(cards: TcgCard[]): TcgCard[] {
  return [...cards].sort((a, b) => {
    const byDate = (b.set.releaseDate ?? '').localeCompare(a.set.releaseDate ?? '')
    if (byDate) return byDate
    const bySet = a.set.id.localeCompare(b.set.id)
    if (bySet) return bySet
    return a.number.localeCompare(b.number, undefined, { numeric: true })
  })
}

export function sameName(a: string, b: string): boolean {
  return normalizeText(a) === normalizeText(b)
}

export function isPokemon(card: TcgCard): boolean {
  return normalizeText(card.supertype) === 'pokemon'
}

export function isBasicEnergy(card: TcgCard): boolean {
  return normalizeText(card.supertype) === 'energy' && (card.subtypes ?? []).some((s) => normalizeText(s) === 'basic')
}

/** Letter of an API basic energy card, tolerant to "Fire Energy" / "Basic Fire Energy". */
export function energyLetterOf(card: TcgCard): EnergyLetter | undefined {
  return isBasicEnergy(card) ? letterFromApiName(card.name) : undefined
}

function sortedNormalized(values: string[] | undefined): string[] {
  return (values ?? []).map(normalizeText).sort()
}

// Extra normalization for game text: the multiplication sign varies between "×" and "x".
function gameText(value: string | undefined): string {
  return normalizeText(value).replace(/×/g, 'x')
}

/** Everything that defines how a Pokémon plays, normalized. */
export function pokemonFingerprint(card: TcgCard): string {
  return JSON.stringify({
    hp: (card.hp ?? '').trim(),
    types: sortedNormalized(card.types),
    subtypes: sortedNormalized(card.subtypes),
    abilities: (card.abilities ?? []).map((a) => [gameText(a.name), gameText(a.type), gameText(a.text)]),
    attacks: (card.attacks ?? []).map((a) => [
      gameText(a.name),
      sortedNormalized(a.cost),
      gameText(a.damage),
      gameText(a.text),
    ]),
    weaknesses: (card.weaknesses ?? []).map((w) => [normalizeText(w.type), gameText(w.value)]).sort(),
    resistances: (card.resistances ?? []).map((r) => [normalizeText(r.type), gameText(r.value)]).sort(),
    retreat: (card.retreatCost ?? []).length,
  })
}

export function isPokemonEquivalent(a: TcgCard, b: TcgCard): boolean {
  return sameName(a.name, b.name) && pokemonFingerprint(a) === pokemonFingerprint(b)
}

export interface Alternatives {
  kind: SwapKind
  equivalent: TcgCard[]
  /** Only used for Pokémon: same name, different effect. */
  nonEquivalent: TcgCard[]
}

function withCurrent(cards: TcgCard[], current: TcgCard | undefined): TcgCard[] {
  if (!current || cards.some((c) => c.id === current.id)) return cards
  return [current, ...cards]
}

/** Other arts of the same basic energy type (works even when the current card is unknown). */
export function energyAlternatives(allBasic: TcgCard[], letter: EnergyLetter, current?: TcgCard): Alternatives {
  const equivalent = allBasic.filter((c) => energyLetterOf(c) === letter)
  return {
    kind: 'energy',
    equivalent: sortByRelease(withCurrent(equivalent, current)),
    nonEquivalent: [],
  }
}

/**
 * Every print with the same exact name. Text is not compared: wording often changes
 * between eras for the same effect (e.g. Boss's Orders RCL vs MEG).
 */
export function trainerAlternatives(current: TcgCard, candidates: TcgCard[]): Alternatives {
  const all = withCurrent(candidates.filter((c) => sameName(c.name, current.name)), current)
  return { kind: 'trainer', equivalent: sortByRelease(all), nonEquivalent: [] }
}

/** Same exact name, split by gameplay fingerprint. */
export function pokemonAlternatives(current: TcgCard, candidates: TcgCard[]): Alternatives {
  const all = withCurrent(candidates.filter((c) => sameName(c.name, current.name) && isPokemon(c)), current)
  const fp = pokemonFingerprint(current)
  return {
    kind: 'pokemon',
    equivalent: sortByRelease(all.filter((c) => pokemonFingerprint(c) === fp)),
    nonEquivalent: sortByRelease(all.filter((c) => pokemonFingerprint(c) !== fp)),
  }
}
