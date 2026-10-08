import { sectionOf } from '../lib/deckOps'
import { pokemonAlternatives, trainerAlternatives, energyAlternatives, type Alternatives, type SwapKind } from '../lib/equivalence'
import type { ExportId } from '../lib/printId'
import type { DeckLine, TcgCard } from '../types'
import { tcgApi, type TcgApi } from './tcgApi'

export interface AlternativesResult extends Alternatives {
  /** PTCGL code + number per card id; cards from sets without a PTCGL code are left out (they could not be exported). */
  exportIds: Map<string, ExportId>
  /** Set when there is nothing to compare against (unresolved non-energy line). */
  notice?: string
}

export function swapKindOf(line: DeckLine): SwapKind {
  if (line.energyLetter) return 'energy'
  if (line.card) return sectionOf(line) === 'pokemon' ? 'pokemon' : 'trainer'
  return line.sectionHint === 'pokemon' ? 'pokemon' : 'trainer'
}

export async function findAlternatives(
  line: DeckLine,
  api: Pick<TcgApi, 'getSetIndex' | 'exportIdOf' | 'getBasicEnergies' | 'searchByExactName'> = tcgApi,
): Promise<AlternativesResult> {
  const index = await api.getSetIndex()
  const kind = swapKindOf(line)
  const current = line.card

  let alts: Alternatives
  if (kind === 'energy') {
    alts = energyAlternatives(await api.getBasicEnergies(), line.energyLetter!, current)
  } else if (!current) {
    return {
      kind,
      equivalent: [],
      nonEquivalent: [],
      exportIds: new Map(),
      notice: 'Esta carta não foi encontrada na API, então não é possível comparar versões.',
    }
  } else {
    const candidates = await api.searchByExactName(current.name)
    alts = kind === 'pokemon' ? pokemonAlternatives(current, candidates) : trainerAlternatives(current, candidates)
  }

  const exportIds = new Map<string, ExportId>()
  const exportable = (c: TcgCard) => {
    const id = api.exportIdOf(c, index)
    if (id) exportIds.set(c.id, id)
    return !!id || c.id === current?.id
  }
  return {
    ...alts,
    equivalent: alts.equivalent.filter(exportable),
    nonEquivalent: alts.nonEquivalent.filter(exportable),
    exportIds,
  }
}
