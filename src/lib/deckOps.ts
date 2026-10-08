import { isLegalMark } from '../config/legalMarks'
import type { DeckLine, DeckWarning, EnergyLetter, Section, TcgCard } from '../types'
import type { SwapKind } from './equivalence'
import { normalizeNumber, normalizeText } from './normalize'

export function sectionFromSupertype(supertype: string | undefined): Section | undefined {
  const s = normalizeText(supertype)
  if (s === 'pokemon') return 'pokemon'
  if (s === 'trainer') return 'trainer'
  if (s === 'energy') return 'energy'
  return undefined
}

export function sectionOf(line: DeckLine): Section {
  if (line.energyLetter) return 'energy'
  return sectionFromSupertype(line.card?.supertype) ?? line.sectionHint
}

/** How alternatives are chosen for a line (special energies count as trainers). */
export function swapKindOf(line: DeckLine): SwapKind {
  if (line.energyLetter) return 'energy'
  if (line.card) return sectionOf(line) === 'pokemon' ? 'pokemon' : 'trainer'
  return line.sectionHint === 'pokemon' ? 'pokemon' : 'trainer'
}

/** Identity of a printing as exported: same code + same number = same line. */
export function printKey(setCode: string, number: string): string {
  return `${setCode.toUpperCase()}|${normalizeNumber(number)}`
}

export interface SwapTarget {
  name: string
  setCode: string
  number: string
  card: TcgCard
  energyLetter?: EnergyLetter
}

/**
 * Replaces every copy of `key` by `target`, keeping the quantity.
 * If the target printing already exists in another line, both are merged
 * (quantities summed) at the position of the swapped line.
 */
export function applySwap(lines: DeckLine[], key: string, target: SwapTarget): DeckLine[] {
  const index = lines.findIndex((l) => l.key === key)
  if (index < 0) return lines
  const source = lines[index]
  const targetKey = printKey(target.setCode, target.number)
  const duplicate = lines.find((l) => l.key !== key && printKey(l.setCode, l.number) === targetKey)

  const swapped: DeckLine = {
    ...source,
    name: target.name,
    setCode: target.setCode,
    number: target.number,
    card: target.card,
    energyLetter: target.energyLetter ?? source.energyLetter,
    status: 'resolved',
    approximate: false,
    qty: source.qty + (duplicate?.qty ?? 0),
  }

  return lines
    .map((l) => (l.key === key ? swapped : l))
    .filter((l) => l !== duplicate)
}

export function computeWarnings(lines: DeckLine[]): DeckWarning[] {
  const warnings: DeckWarning[] = []

  const copies = new Map<string, { name: string; qty: number }>()
  for (const line of lines) {
    if (line.energyLetter) continue
    const k = normalizeText(line.name)
    const entry = copies.get(k) ?? { name: line.name, qty: 0 }
    entry.qty += line.qty
    copies.set(k, entry)
  }
  for (const { name, qty } of copies.values()) {
    if (qty > 4) warnings.push({ kind: 'copies', message: `${name}: ${qty} cópias (máximo 4 por nome).` })
  }

  for (const line of lines) {
    const label = `${line.name} ${line.setCode} ${line.number}`
    if (line.status === 'unresolved') {
      warnings.push({ kind: 'unresolved', message: `${label}: não encontrada na API (será exportada como veio).` })
    } else if (line.approximate) {
      warnings.push({ kind: 'approximate', message: `${label}: impressão exata não encontrada; exibindo outra versão de mesmo nome.` })
    }
    // Basic energy is always legal regardless of its mark.
    if (line.card && !line.energyLetter && !line.approximate && !isLegalMark(line.card.regulationMark)) {
      warnings.push({
        kind: 'regulation',
        message: `${label}: marca de regulamento ${line.card.regulationMark ?? '—'} fora da lista de legais.`,
      })
    }
  }

  return warnings
}
