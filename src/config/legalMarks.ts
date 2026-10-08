// Regulation marks currently legal in Standard.
// TODO: confirm on the official Pokémon site (pokemon.com → Play! Pokémon rules)
// whenever a rotation happens — this list changes every year.
export const LEGAL_MARKS: readonly string[] = ['H', 'I', 'J']

export function isLegalMark(mark: string | undefined): boolean {
  return !!mark && LEGAL_MARKS.includes(mark.toUpperCase())
}
