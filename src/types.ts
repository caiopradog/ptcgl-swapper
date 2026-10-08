export type Section = 'pokemon' | 'trainer' | 'energy'

export type EnergyLetter = 'G' | 'R' | 'W' | 'L' | 'P' | 'F' | 'D' | 'M'

export interface TcgSet {
  id: string
  name: string
  series?: string
  ptcgoCode?: string
  releaseDate: string
}

export interface TcgAbility {
  name: string
  text?: string
  type?: string
}

export interface TcgAttack {
  name: string
  cost?: string[]
  convertedEnergyCost?: number
  damage?: string
  text?: string
}

export interface TcgTypeValue {
  type: string
  value: string
}

export interface TcgCard {
  id: string
  name: string
  supertype: string
  subtypes?: string[]
  hp?: string
  types?: string[]
  abilities?: TcgAbility[]
  attacks?: TcgAttack[]
  weaknesses?: TcgTypeValue[]
  resistances?: TcgTypeValue[]
  retreatCost?: string[]
  rules?: string[]
  regulationMark?: string
  number: string
  set: TcgSet
  images: { small: string; large?: string }
}

export type LineStatus = 'pending' | 'resolved' | 'unresolved'

export interface DeckLine {
  /** Stable identity of the line inside the deck (not exported). */
  key: string
  qty: number
  /** Name as it will be exported. */
  name: string
  setCode: string
  /** Number exactly as written (leading zeros preserved). */
  number: string
  /** Section from the imported header; only a hint, the API supertype wins. */
  sectionHint: Section
  energyLetter?: EnergyLetter
  status: LineStatus
  card?: TcgCard
  /** True when the exact print was not found and `card` is another print with the same name. */
  approximate?: boolean
}

export interface ParseIssue {
  lineNo: number
  text: string
  reason: string
}

/** How the list was written, so the export can reproduce it. */
export interface ListFormat {
  /** Header label per section, as written in the input (e.g. "Trainer" or "Treinador"). */
  headers: Record<Section, string>
  /** What the header number counts: total copies (PTCGL default) or number of lines. */
  countMode: 'cards' | 'lines'
  /** Label of a trailing total line ("Total Cards", "Total de cartas"), if the input had one. */
  totalLabel?: string
}

export const DEFAULT_FORMAT: ListFormat = {
  headers: { pokemon: 'Pokémon', trainer: 'Trainer', energy: 'Energy' },
  countMode: 'cards',
}

export interface ParseResult {
  lines: DeckLine[]
  issues: ParseIssue[]
  format: ListFormat
}

export type WarningKind = 'copies' | 'unresolved' | 'regulation' | 'approximate'

export interface DeckWarning {
  kind: WarningKind
  message: string
}
