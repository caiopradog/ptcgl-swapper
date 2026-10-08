import type { EnergyLetter } from '../types'

export const ENERGY_LETTER_TO_TYPE: Record<EnergyLetter, string> = {
  G: 'Grass',
  R: 'Fire',
  W: 'Water',
  L: 'Lightning',
  P: 'Psychic',
  F: 'Fighting',
  D: 'Darkness',
  M: 'Metal',
}

/** Portuguese labels for the UI. */
export const ENERGY_TYPE_LABEL_PT: Record<EnergyLetter, string> = {
  G: 'Planta',
  R: 'Fogo',
  W: 'Água',
  L: 'Elétrico',
  P: 'Psíquico',
  F: 'Lutador',
  D: 'Escuridão',
  M: 'Metal',
}

/**
 * Alternative words the API (or older prints) may use for each type.
 * Confirmed in the API: "Fire Energy" (older sets) and "Basic Fire Energy" (SV era).
 * "Dark"/"Steel" are kept as a tolerance for nicknames, not seen in the API.
 */
const TYPE_ALIASES: Record<EnergyLetter, string[]> = {
  G: ['grass'],
  R: ['fire'],
  W: ['water'],
  L: ['lightning'],
  P: ['psychic'],
  F: ['fighting'],
  D: ['darkness', 'dark'],
  M: ['metal', 'steel'],
}

export const BASIC_ENERGY_NAME_RE = /^Basic \{([RGWLPFDM])\} Energy$/

export function isEnergyLetter(value: string): value is EnergyLetter {
  return value in ENERGY_LETTER_TO_TYPE
}

export function basicEnergyName(letter: EnergyLetter): string {
  return `Basic {${letter}} Energy`
}

export function letterFromPtcglName(name: string): EnergyLetter | undefined {
  const m = BASIC_ENERGY_NAME_RE.exec(name.trim())
  return m && isEnergyLetter(m[1]) ? m[1] : undefined
}

/** Maps an API basic-energy name ("Fire Energy", "Basic Fire Energy", ...) to its letter. */
export function letterFromApiName(name: string): EnergyLetter | undefined {
  const m = /^(?:basic\s+)?([a-z]+)\s+energy$/.exec(name.trim().toLowerCase())
  if (!m) return undefined
  const word = m[1]
  for (const [letter, aliases] of Object.entries(TYPE_ALIASES) as [EnergyLetter, string[]][]) {
    if (aliases.includes(word)) return letter
  }
  return undefined
}

/** "Telepathic {P} Energy" → "Telepathic Psychic Energy" (PTCGL uses symbols, the API uses words). */
export function expandEnergySymbols(name: string): string {
  return name.replace(/\{([GRWLPFDM])\}/g, (_, letter: EnergyLetter) => ENERGY_LETTER_TO_TYPE[letter])
}
