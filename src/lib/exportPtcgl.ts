import { basicEnergyName } from '../config/energyTypes'
import { DEFAULT_FORMAT, type DeckLine, type ListFormat, type Section } from '../types'
import { sectionOf } from './deckOps'

const SECTION_ORDER: Section[] = ['pokemon', 'trainer', 'energy']

export function formatLine(line: DeckLine): string {
  // Basic energy names are always rebuilt from the letter, never taken from the API.
  const name = line.energyLetter ? basicEnergyName(line.energyLetter) : line.name
  return `${line.qty} ${name} ${line.setCode} ${line.number}`
}

/**
 * Builds the PTCGL text, reusing the input's header labels, count convention and
 * total line (see ListFormat). Empty sections are omitted.
 */
export function exportPtcgl(lines: DeckLine[], format: ListFormat = DEFAULT_FORMAT): string {
  const blocks: string[] = []
  for (const section of SECTION_ORDER) {
    const inSection = lines.filter((l) => sectionOf(l) === section)
    if (!inSection.length) continue
    const count = format.countMode === 'lines' ? inSection.length : inSection.reduce((sum, l) => sum + l.qty, 0)
    blocks.push([`${format.headers[section]}: ${count}`, ...inSection.map(formatLine)].join('\n'))
  }
  if (format.totalLabel) {
    blocks.push(`${format.totalLabel}: ${lines.reduce((sum, l) => sum + l.qty, 0)}`)
  }
  return blocks.join('\n\n') + '\n'
}
